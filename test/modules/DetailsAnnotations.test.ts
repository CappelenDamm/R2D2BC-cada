import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnotationMarker } from "../../src/model/Locator";
import { Publication } from "../../src/model/Publication";
import { AnnotationModule } from "../../src/modules/AnnotationModule";
import {
  TextHighlighter,
  _highlights,
} from "../../src/modules/highlight/TextHighlighter";
import {
  HighlightType,
  IHighlight,
} from "../../src/modules/highlight/common/highlight";
import { convertRangeInfo } from "../../src/modules/highlight/renderer/iframe/selection";
import LocalAnnotator from "../../src/store/LocalAnnotator";
import MemoryStore from "../../src/store/MemoryStore";
import log from "loglevel";

vi.mock("../../src/modules/highlight/renderer/iframe/selection", () => ({
  convertRangeInfo: vi.fn(),
}));
vi.mock("../../src/modules/highlight/common/rect-utils", () => ({
  getClientRectsNoOverlap: () => [],
}));

interface ContentNode {
  nodeType: number;
  parentElement: ContentElement | null;
}

interface ContentElement extends ContentNode {
  localName: string;
  open: boolean;
  children: ContentElement[];
  hasAttribute: (name: string) => boolean;
  contains: (node: ContentNode) => boolean;
}

function element(
  localName: string,
  parentElement: ContentElement | null = null
) {
  const result: ContentElement = {
    nodeType: 1,
    localName,
    parentElement,
    open: false,
    children: [],
    hasAttribute: (name) => name === "open" && result.open,
    contains: (node) => {
      for (
        let current: ContentNode | null = node;
        current;
        current = current.parentElement
      ) {
        if (current === result) return true;
      }
      return false;
    },
  };
  parentElement?.children.push(result);
  return result;
}

function overlay() {
  const children: { style: { top: string } }[] = [];
  return {
    childNodes: children,
    hasChildNodes: () => children.length > 0,
    style: {
      display: "",
      top: "",
      left: "",
      width: "",
      height: "",
      setProperty: vi.fn(),
    },
    setAttribute: vi.fn(),
    addEventListener: vi.fn(),
    append: (child: { style: { top: string } }) => children.push(child),
  };
}

function documentFixture() {
  return {
    fonts: { ready: Promise.resolve() },
    body: {
      style: {},
      getBoundingClientRect: () => ({ top: 0, left: 0 }),
    },
    querySelector: () => null,
    createElement: overlay,
    getElementById: () => overlay(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

const highlight: IHighlight = {
  id: "details-highlight",
  color: "#fce300",
  marker: AnnotationMarker.Highlight,
  type: HighlightType.Annotation,
  pointerInteraction: false,
  selectionInfo: {
    rangeInfo: {
      startContainerElementCssSelector: "#content",
      startContainerChildTextNodeIndex: 0,
      startOffset: 0,
      endContainerElementCssSelector: "#content",
      endContainerChildTextNodeIndex: 0,
      endOffset: 4,
    },
  },
};

describe("annotations in details", () => {
  let doc: ReturnType<typeof documentFixture>;
  let highlighter: TextHighlighter;

  beforeEach(() => {
    vi.useFakeTimers();
    doc = documentFixture();
    vi.stubGlobal("document", doc);
    highlighter = Object.assign(Object.create(TextHighlighter.prototype), {
      navigator: {
        view: { isPaginated: () => false },
        iframes: [{ contentDocument: doc }],
      },
      getScrollingElement: () => ({ scrollLeft: 0, scrollTop: 0 }),
    });
  });

  afterEach(() => {
    _highlights.splice(0);
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function render(
    node: ContentNode,
    overrides: Partial<IHighlight> = {},
    top = 0
  ) {
    vi.mocked(convertRangeInfo).mockReturnValue({
      commonAncestorContainer: node,
      getBoundingClientRect: () => ({
        top,
        left: 0,
        width: 40,
        height: 20,
      }),
    } as Range);
    return highlighter.createHighlightDom(
      { document: doc },
      { ...highlight, ...overrides }
    );
  }

  it.each([
    AnnotationMarker.Highlight,
    AnnotationMarker.Underline,
    AnnotationMarker.Comment,
    AnnotationMarker.Custom,
  ])("hides annotation marker %s in collapsed content", (marker) => {
    const details = element("details");
    const content = element("p", details);
    expect(
      render({ nodeType: 3, parentElement: content }, { marker, note: "Note" })
        ?.style.display
    ).toBe("none");
  });

  it("restores annotations when reopened and hides them when closed again", () => {
    const details = element("details");
    const content = element("p", details);
    expect(render(content)?.style.display).toBe("none");
    details.open = true;
    expect(render(content)?.style.display).toBe("");
    details.open = false;
    expect(render(content)?.style.display).toBe("none");
  });

  it("keeps the first summary visible, but not a second summary", () => {
    const details = element("details");
    const summary = element("summary", details);
    const secondSummary = element("summary", details);
    expect(render(element("span", summary))?.style.display).toBe("");
    expect(render(secondSummary)?.style.display).toBe("none");
  });

  it("checks closed outer details even when inner details are open", () => {
    const outer = element("details");
    const inner = element("details", outer);
    inner.open = true;
    const content = element("p", inner);
    expect(render(content)?.style.display).toBe("none");
    outer.open = true;
    expect(render(content)?.style.display).toBe("");
    inner.open = false;
    expect(render(content)?.style.display).toBe("none");
  });

  it("hides an inner summary when its outer details are closed", () => {
    const outer = element("details");
    const inner = element("details", outer);
    const summary = element("summary", inner);
    expect(render(summary)?.style.display).toBe("none");
    outer.open = true;
    expect(render(summary)?.style.display).toBe("");
  });

  it("does not hide bookmarks in closed details", () => {
    const details = element("details");
    expect(
      render(element("p", details), { marker: AnnotationMarker.Bookmark })
        ?.style.display
    ).toBe("");
  });

  it("leaves annotations outside details and other overlay types unchanged", () => {
    expect(render(element("p"))?.style.display).toBe("");
    const details = element("details");
    expect(
      render(element("p", details), { type: HighlightType.Search })?.style
        .display
    ).toBe("");
  });

  it("can create a hidden annotation without losing its model", () => {
    const details = element("details");
    render(element("p", details));
    highlighter.destroyHighlight = vi.fn();
    const [created, dom] = highlighter.createHighlight(
      { document: doc },
      highlight.selectionInfo,
      highlight.color,
      false,
      AnnotationMarker.Highlight
    );
    expect(dom?.style.display).toBe("none");
    expect(_highlights).toContain(created);
  });

  function annotationModule(enableAnnotations = true) {
    return new AnnotationModule(
      new LocalAnnotator({ store: new MemoryStore() }),
      { enableAnnotations },
      Object.create(Publication.prototype),
      null,
      {},
      highlighter
    );
  }

  function layoutEvent(type = "toggle", insideDetails = true) {
    const registration = doc.addEventListener.mock.calls.find(
      ([event]) => event === type
    );
    if (!registration) throw new Error(`Missing ${type} listener`);
    const [, listener, capture] = registration;
    expect(capture).toBe(true);
    const target = Object.assign(new EventTarget(), {
      localName: type === "toggle" ? "details" : "summary",
      closest: () => (insideDetails ? {} : null),
    });
    target.addEventListener(type, listener);
    target.dispatchEvent(new Event(type));
    return listener;
  }

  it("redraws on details toggles using a capturing listener", async () => {
    const module = annotationModule();
    const draw = vi.spyOn(module, "drawHighlights").mockResolvedValue();
    await module.initialize(
      Object.assign(Object.create(null), { contentDocument: doc })
    );
    layoutEvent();
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it.each([
    "transitionend",
    "transitioncancel",
    "animationend",
    "animationcancel",
  ])("remeasures the text range after %s", async (event) => {
    const details = element("details");
    details.open = true;
    const content = element("p", details);
    const module = annotationModule();
    let top = 100;
    let rendered: HTMLDivElement | undefined;
    vi.spyOn(module, "drawHighlights").mockImplementation(async () => {
      rendered = render(content, {}, top);
    });
    await module.initialize(
      Object.assign(Object.create(null), { contentDocument: doc })
    );
    layoutEvent();
    expect((rendered?.childNodes[0] as HTMLElement).style.top).toBe("100px");
    top = 115.25;
    layoutEvent(event);
    expect((rendered?.childNodes[0] as HTMLElement).style.top).toBe("115.25px");
  });

  it("ignores animation events outside details", async () => {
    const module = annotationModule();
    const draw = vi.spyOn(module, "drawHighlights").mockResolvedValue();
    await module.initialize(
      Object.assign(Object.create(null), { contentDocument: doc })
    );
    layoutEvent("transitionend", false);
    expect(draw).not.toHaveBeenCalled();
  });

  it("removes listeners on reinitialization and stop", async () => {
    const module = annotationModule();
    await module.initialize(
      Object.assign(Object.create(null), { contentDocument: doc })
    );
    const listener = doc.addEventListener.mock.calls[0][1];
    const nextDocument = documentFixture();
    await module.initialize(
      Object.assign(Object.create(null), { contentDocument: nextDocument })
    );
    await module.stop();
    expect(doc.addEventListener).toHaveBeenCalledTimes(5);
    for (const [event] of doc.addEventListener.mock.calls) {
      expect(doc.removeEventListener).toHaveBeenCalledWith(
        event,
        listener,
        true
      );
      expect(nextDocument.removeEventListener).toHaveBeenCalledWith(
        event,
        listener,
        true
      );
    }
  });

  it("does not subscribe when annotations are disabled", async () => {
    const module = annotationModule(false);
    await module.initialize(
      Object.assign(Object.create(null), { contentDocument: doc })
    );
    expect(doc.addEventListener).not.toHaveBeenCalled();
  });

  it("reports a failed redraw", async () => {
    const module = annotationModule();
    const error = new Error("redraw failed");
    vi.spyOn(module, "drawHighlights").mockRejectedValue(error);
    const report = vi.spyOn(log, "error").mockImplementation(() => {});
    await module.initialize(
      Object.assign(Object.create(null), { contentDocument: doc })
    );
    layoutEvent();
    await Promise.resolve();
    expect(report).toHaveBeenCalledWith(
      "Failed to redraw annotations after details layout change",
      error
    );
  });
});
