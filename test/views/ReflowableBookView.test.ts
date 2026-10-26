import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReflowableBookView from "../../src/views/ReflowableBookView";

vi.mock("../../src/utils/BrowserUtilities", () => ({
  getHeight: () => 828,
  getWidth: () => 600,
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
      viewport = parseFloat(
        iframe.style.getPropertyValue("height") || iframe.height
      )
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
    const measurement = { style: style(), remove: vi.fn() };
    const html = {
      style: htmlStyle,
      // A stale root viewport must not prevent the chapter from shrinking.
      offsetHeight: 2000,
      clientHeight: 2000,
      scrollHeight: 2000,
      getBoundingClientRect: () => ({ top: 0 }),
      appendChild: vi.fn(),
    };
    const doc = Object.assign(new EventTarget(), {
      body,
      documentElement: html,
      createElement: () => measurement,
      querySelector: (selector: string) =>
        selector === "html" ? html : selector === "body" ? body : null,
    });
    Object.assign(body, { ownerDocument: doc });
    const iframe = {
      style: style(),
      getBoundingClientRect: () => ({ top: 0 }),
      height: "828px",
      contentDocument: doc,
      contentWindow: {
        document: doc,
        getComputedStyle: (element: object) => ({
          get height() {
            if (element !== measurement) return "auto";
            const value = measurement.style.getPropertyValue("height");
            const viewport = parseFloat(
              iframe.style.getPropertyValue("height") || iframe.height
            );
            const percentage = /^([\d.]+)%$/.exec(value);
            if (percentage) {
              return `${(Number(percentage[1]) * viewport) / 100}px`;
            }
            throw new Error(`Unexpected measurement height: ${value}`);
          },
          getPropertyValue: (key: string) => computedConstraint(key),
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
    Object.assign(view, { navigator: { rights: {} }, scrollMode: true });
    view.iframe = iframe;
    view.bindContentResizeObserver(iframe);
    vi.runAllTimers();
    return {
      view,
      iframe,
      body,
      bodyStyle,
      htmlStyle,
    };
  }

  it("fills short chapters and grows and shrinks with expanded details", () => {
    const { iframe, body } = setup();
    expect(iframe.height).toBe("828px");

    contentHeight = 1800.25;
    body.dispatchEvent(new Event("toggle"));
    vi.runAllTimers();
    expect(iframe.height).toBe("1913px");

    contentHeight = 100;
    body.dispatchEvent(new Event("toggle"));
    vi.runAllTimers();
    expect(iframe.height).toBe("828px");
  });

  it.each([
    ["height", "100vh", "940px"],
    ["min-height", "120%", "1106px"],
    ["max-height", "400px", "828px"],
  ])(
    "keeps chapter sizing stable with %s: %s",
    (property, value, collapsed) => {
      const { iframe } = setup({ [property]: value });
      for (const height of [100, 1800, 100]) {
        contentHeight = height;
        notifyResize();
        vi.runAllTimers();
        expect(iframe.height).toBe(height === 1800 ? "1912px" : collapsed);
      }
    }
  );

  it("fits overflowing images after they load", () => {
    const { iframe } = setup({ height: "400px" });
    contentHeight = 1800;
    const event = new Event("load");
    Object.defineProperty(event, "target", { value: { localName: "img" } });
    iframe.contentDocument!.dispatchEvent(event);
    vi.runAllTimers();
    expect(iframe.height).toBe("1912px");
  });

  it("finishes sizing before restoring a saved progression", async () => {
    const { view, iframe } = setup();
    let scrollTop = 0;
    const wrapper = {
      get scrollTop() {
        return scrollTop;
      },
      set scrollTop(value: number) {
        scrollTop = Math.min(
          value,
          Math.max(0, parseFloat(iframe.height) - 828)
        );
      },
    };
    vi.stubGlobal("document", { querySelector: () => wrapper });
    vi.stubGlobal("HTMLElement", Object);
    Object.assign(iframe.contentDocument!, {
      scrollingElement: {
        get scrollHeight() {
          return parseFloat(iframe.height);
        },
      },
    });
    contentHeight = 3000;
    let restored = false;
    const restoration = view.setSize().then(() => {
      view.goToProgression(0.5);
      restored = true;
    });
    await Promise.resolve();
    expect(restored).toBe(false);
    expect(scrollTop).toBe(0);

    await vi.runAllTimersAsync();
    await restoration;

    expect(iframe.height).toBe("3112px");
    expect(scrollTop).toBe(1556);
  });

  it("settles pending sizing and restores publication styles on stop", async () => {
    const { view, iframe, body, bodyStyle, htmlStyle } = setup({
      "min-height": "100vh",
    });
    const sizing = view.setSize();
    view.stop();
    await sizing;

    await view.setSize();
    contentHeight = 1800;
    body.dispatchEvent(new Event("toggle"));
    vi.runAllTimers();
    expect(iframe.height).toBe("0");
    for (const [style, property] of [
      [bodyStyle, "min-height"],
      [htmlStyle, "height"],
    ] as const) {
      expect(style.getPropertyValue(property)).toBe("100vh");
      expect(style.getPropertyPriority(property)).toBe("important");
    }
  });

  it("restores body CSS and stops scroll sizing when switching to pagination", async () => {
    const { view, iframe, body, bodyStyle } = setup({ "min-height": "100vh" });
    Object.assign(iframe.contentDocument!, { getElementById: () => null });

    await view.setMode(false);
    expect(bodyStyle.getPropertyValue("min-height")).toBe("100vh");
    expect(iframe.height).toBe("788px");

    contentHeight = 1800;
    body.dispatchEvent(new Event("toggle"));
    await vi.runAllTimersAsync();
    expect(iframe.height).toBe("788px");
  });
});
