import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReflowableBookView from "../../src/views/ReflowableBookView";

vi.mock("../../src/utils/BrowserUtilities", () => ({
  getHeight: () => 828,
}));

describe("scrolling content resize", () => {
  let notifyResize: () => void;
  let contentHeight: number;

  beforeEach(() => {
    vi.useFakeTimers();
    contentHeight = 100;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          notifyResize = callback;
        }
        observe() {}
        disconnect() {}
      }
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      setTimeout(() => callback(0), 0)
    );
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function setup(constraints: Record<string, string> = {}) {
    function style() {
      const properties = new Map<string, { value: string; priority: string }>();
      return {
        get cssText() {
          return JSON.stringify([...properties]);
        },
        set cssText(value: string) {
          properties.clear();
          if (value.startsWith("[")) {
            for (const [key, entry] of JSON.parse(value))
              properties.set(key, entry);
          }
        },
        getPropertyValue: (key: string) => properties.get(key)?.value ?? "",
        getPropertyPriority: (key: string) =>
          properties.get(key)?.priority ?? "",
        setProperty: (key: string, value: string, priority = "") =>
          properties.set(key, { value, priority }),
        removeProperty: (key: string) => properties.delete(key),
      };
    }
    const bodyStyle = style();
    const htmlStyle = style();
    htmlStyle.setProperty("--USER__scroll", "readium-scroll-on");
    htmlStyle.setProperty("height", "100vh", "important");
    for (const [key, value] of Object.entries(constraints)) {
      bodyStyle.setProperty(key, value, "important");
    }
    const computedConstraint = (
      key: string,
      source = bodyStyle,
      viewport = parseFloat(iframe.height)
    ) => {
      const value = source.getPropertyValue(key);
      return value.endsWith("vh")
        ? `${(parseFloat(value) / 100) * viewport}px`
        : value || ({ height: "auto", "max-height": "none" }[key] ?? "0px");
    };
    const bodyHeight = () =>
      Math.max(
        Math.min(
          parseFloat(computedConstraint("height")) || contentHeight,
          parseFloat(computedConstraint("max-height")) || Infinity
        ),
        parseFloat(computedConstraint("min-height")) || 0
      );
    const events = new EventTarget();
    const body = {
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      dispatchEvent: events.dispatchEvent.bind(events),
      style: bodyStyle,
      children: [
        {
          getBoundingClientRect: () => ({ bottom: 40 + contentHeight + 32 }),
        },
      ],
      get scrollHeight() {
        return Math.ceil(Math.max(contentHeight, bodyHeight()) + 32);
      },
      getBoundingClientRect: () => ({ top: 40, height: bodyHeight() + 32 }),
      querySelectorAll: () => [],
    };
    let probeBodyStyle = style();
    const html = {
      style: htmlStyle,
      // A stale root viewport must not prevent the chapter from shrinking.
      offsetHeight: 2000,
      clientHeight: 2000,
      scrollHeight: 2000,
      getBoundingClientRect: () => ({ top: 0 }),
      cloneNode: () => {
        probeBodyStyle = style();
        return {
          querySelectorAll: () => [],
          querySelector: (selector: string) =>
            selector === "body" ? { style: probeBodyStyle } : { prepend() {} },
          outerHTML: "<html><head></head><body></body></html>",
        };
      },
    };
    const doc = Object.assign(new EventTarget(), {
      body,
      documentElement: html,
      querySelector: (selector: string) =>
        selector === "html" ? html : selector === "body" ? body : null,
    });
    Object.assign(body, { ownerDocument: doc });
    const probe = {
      style: style(),
      isConnected: false,
      onload: undefined as (() => void) | undefined,
      setAttribute() {},
      remove() {
        probe.isConnected = false;
      },
      set srcdoc(_value: string) {
        setTimeout(() => probe.onload?.(), 0);
      },
      contentDocument: { body: {}, documentElement: { style: style() } },
      contentWindow: {
        getComputedStyle: () => ({
          getPropertyValue: (key: string) =>
            computedConstraint(
              key,
              probeBodyStyle,
              parseFloat(probe.style.getPropertyValue("height"))
            ),
        }),
      },
    };
    const heightWrites: string[] = [];
    let height = "828px";
    const iframe = {
      get height() {
        return height;
      },
      set height(value: string) {
        height = value;
        heightWrites.push(value);
      },
      ownerDocument: {
        createElement: (tag: string) =>
          tag === "iframe" ? probe : { href: "" },
        body: {
          appendChild: () => {
            probe.isConnected = true;
          },
        },
      },
      contentDocument: doc,
      contentWindow: {
        getComputedStyle: (element: object) => ({
          marginBottom: element === body ? "40px" : "0px",
          paddingTop: element === body ? "16px" : "0px",
          paddingBottom: element === body ? "16px" : "0px",
          borderTopWidth: "0px",
          borderBottomWidth: "0px",
          boxSizing: "content-box",
        }),
      },
    } as unknown as HTMLIFrameElement;
    const view = new ReflowableBookView({
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    });
    Object.assign(view, { navigator: { rights: {} } });
    view.iframe = iframe;
    view.bindContentResizeObserver(iframe);
    vi.runAllTimers();
    return { view, iframe, body, bodyStyle, htmlStyle, probe, heightWrites };
  }

  it("fills unconstrained short chapters and resizes details without intermediate height writes", () => {
    const { iframe, body, bodyStyle, heightWrites } = setup();
    expect(bodyStyle.getPropertyValue("min-height")).toBe("716px");
    expect(iframe.height).toBe("828px");
    heightWrites.length = 0;

    contentHeight = 1800.25;
    body.dispatchEvent(new Event("toggle"));
    vi.runAllTimers();
    expect(iframe.height).toBe("1913px");

    contentHeight = 100;
    body.dispatchEvent(new Event("toggle"));
    vi.runAllTimers();
    notifyResize();
    vi.runAllTimers();
    expect(heightWrites).toEqual(["1913px", "828px"]);
  });

  it.each([
    ["height", "100vh", 828, "940px"],
    ["min-height", "80vh", 662.4, "828px"],
    ["min-height", "120vh", 993.6, "1106px"],
  ])(
    "resolves %s: %s against the reader rather than the growing iframe",
    (property, value, resolved, collapsed) => {
      const { iframe, bodyStyle } = setup({ [property]: value });
      for (const height of [1800, 100, 100]) {
        contentHeight = height;
        notifyResize();
        vi.runAllTimers();
        expect(iframe.height).toBe(height === 1800 ? "1912px" : collapsed);
        expect(parseFloat(bodyStyle.getPropertyValue(property))).toBeCloseTo(
          resolved
        );
      }
    }
  );

  it.each([
    ["height", "400px", "828px"],
    ["min-height", "1000px", "1112px"],
    ["max-height", "400px", "828px"],
  ])("preserves fixed publication %s", (property, value, expected) => {
    const { iframe, bodyStyle } = setup({ [property]: value });
    expect(bodyStyle.getPropertyValue(property)).toBe(value);
    expect(bodyStyle.getPropertyValue("min-height")).toBe(
      property === "min-height" ? value : ""
    );
    expect(iframe.height).toBe(expected);
  });

  it("refreshes a pending resize when rebinding or loading styles", () => {
    const { view, iframe, body } = setup();
    contentHeight = 1800;
    body.dispatchEvent(new Event("toggle"));
    view.bindContentResizeObserver(iframe);
    iframe.contentDocument!.dispatchEvent(new Event("load"));
    vi.runAllTimers();
    expect(iframe.height).toBe("1912px");
  });

  it("restores publication styles and ignores pending work after stopping", () => {
    const { view, iframe, body, bodyStyle, htmlStyle, probe } = setup({
      "min-height": "100vh",
    });
    notifyResize();
    view.stop();
    probe.onload?.();
    vi.runAllTimers();
    expect(iframe.height).toBe("0");
    expect(probe.isConnected).toBe(false);
    for (const [style, property] of [
      [bodyStyle, "min-height"],
      [htmlStyle, "height"],
    ] as const) {
      expect(style.getPropertyValue(property)).toBe("100vh");
      expect(style.getPropertyPriority(property)).toBe("important");
    }
    body.dispatchEvent(new Event("toggle"));
    expect(vi.getTimerCount()).toBe(0);
  });
});
