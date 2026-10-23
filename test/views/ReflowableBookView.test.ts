import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReflowableBookView from "../../src/views/ReflowableBookView";

vi.mock("../../src/utils/BrowserUtilities", () => ({
  getHeight: () => 828,
}));

describe("scrolling content resize", () => {
  let notifyResize: () => void;
  let contentHeight: number;
  let padding: number;
  let border: number;
  let margin: number;
  let rootHeight: number;
  let childMargin: number;

  beforeEach(() => {
    vi.useFakeTimers();
    contentHeight = 794;
    padding = 16;
    border = 0;
    margin = 40;
    rootHeight = 828;
    childMargin = 0;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(
          callback: (entries: { contentRect: { height: number } }[]) => void
        ) {
          notifyResize = () =>
            callback([{ contentRect: { height: contentHeight } }]);
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

  function setup() {
    const content = {
      getBoundingClientRect: () => ({
        bottom:
          Math.max(margin, childMargin) +
          contentHeight +
          padding * 2 +
          border * 2,
      }),
    };
    const body = {
      children: [content],
      get scrollHeight() {
        return Math.ceil(contentHeight + padding * 2);
      },
      get offsetHeight() {
        return Math.ceil(contentHeight + padding * 2 + border * 2);
      },
      getBoundingClientRect: () => ({
        top: Math.max(margin, childMargin),
        bottom:
          Math.max(margin, childMargin) +
          contentHeight +
          padding * 2 +
          border * 2,
        height: contentHeight + padding * 2 + border * 2,
      }),
      querySelectorAll: () => [],
    };
    const html = {
      getBoundingClientRect: () => ({ top: 0 }),
      get offsetHeight() {
        return rootHeight;
      },
      get clientHeight() {
        return rootHeight;
      },
      get scrollHeight() {
        return Math.max(rootHeight, body.offsetHeight + margin * 2);
      },
    };
    const doc = {
      body,
      documentElement: html,
      querySelector: (selector: string) => (selector === "body" ? body : null),
    };
    const iframe = {
      height: "828px",
      contentDocument: doc,
      contentWindow: {
        document: doc,
        getComputedStyle: (element: object) => ({
          marginTop: `${element === body ? margin : childMargin}px`,
          marginBottom: `${element === body ? margin : childMargin}px`,
          paddingTop: "0px",
          paddingBottom: "0px",
          borderTopWidth: `${element === body ? border : 0}px`,
          borderBottomWidth: `${element === body ? border : 0}px`,
        }),
      },
    } as unknown as HTMLIFrameElement;
    const view = new ReflowableBookView({
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    });
    view.iframe = iframe;
    view.setIframeHeight(iframe);
    vi.runAllTimers();
    return { view, iframe };
  }

  it("includes current margins and padding after styles load", () => {
    margin = 0;
    padding = 0;
    const { iframe } = setup();
    margin = 40;
    padding = 16;
    notifyResize();
    vi.runAllTimers();
    expect(iframe.height).toBe("906px");
  });

  it("includes borders without losing padding from the observed content box", () => {
    border = 2;
    const { iframe } = setup();
    notifyResize();
    vi.runAllTimers();
    expect(iframe.height).toBe("910px");
  });

  it("shrinks when content collapses instead of retaining the root viewport height", () => {
    contentHeight = 1500;
    const { iframe } = setup();
    rootHeight = 1612;
    contentHeight = 500;
    notifyResize();
    vi.runAllTimers();
    expect(iframe.height).toBe("828px");
  });

  it("rounds fractional content height up to avoid clipping the last pixel", () => {
    contentHeight = 794.25;
    const { iframe } = setup();
    notifyResize();
    vi.runAllTimers();
    expect(iframe.height).toBe("907px");
  });

  it("includes child margins that collapse through the body after details expand", () => {
    margin = 8;
    padding = 0;
    childMargin = 50;
    const { iframe } = setup();
    contentHeight = 1800;
    notifyResize();
    vi.runAllTimers();
    expect(iframe.height).toBe("1900px");

    rootHeight = 1900;
    contentHeight = 500;
    notifyResize();
    vi.runAllTimers();
    expect(iframe.height).toBe("828px");
  });

  it("ignores a queued resize after the view stops", () => {
    const { view, iframe } = setup();
    notifyResize();
    view.stop();
    vi.runAllTimers();
    expect(iframe.height).toBe("0");
  });
});
