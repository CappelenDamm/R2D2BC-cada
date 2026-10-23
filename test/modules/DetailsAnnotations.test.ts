import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnotationMarker } from "../../src/model/Locator";
import { Publication } from "../../src/model/Publication";
import { Link } from "../../src/model/Link";
import { AnnotationModule } from "../../src/modules/AnnotationModule";
import {
  TextHighlighter,
  _highlights,
  HighlightContainer,
} from "../../src/modules/highlight/TextHighlighter";
import { getClientRectsNoOverlap } from "../../src/modules/highlight/common/rect-utils";
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
  getClientRectsNoOverlap: vi.fn(() => []),
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
    dataset: {},
    innerHTML: "",
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
    appendChild: (child: { style: { top: string } }) => children.push(child),
    querySelectorAll: () => [],
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
    querySelectorAll: (): ContentElement[] => [],
    createRange: vi.fn(),
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
        view: { isPaginated: () => false, isScrollMode: () => true },
        iframes: [{ contentDocument: doc, contentWindow: { document: doc } }],
      },
      getScrollingElement: () => ({ scrollLeft: 0, scrollTop: 0 }),
    });
  });

  afterEach(() => {
    _highlights.splice(0);
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.mocked(getClientRectsNoOverlap).mockReset().mockReturnValue([]);
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

  it("clips a mixed summary/body range without changing the saved range", () => {
    const details = element("details");
    const summary = element("summary", details);
    const content = element("p", details);
    doc.querySelectorAll = () => (details.open ? [] : [details]);
    const clipped = {
      startContainer: summary,
      startOffset: 2,
      endContainer: content,
      endOffset: 4,
      setEnd(node: ContentElement, offset: number) {
        this.endContainer = node;
        this.endOffset = offset;
      },
    };
    const range = {
      commonAncestorContainer: details,
      startContainer: summary,
      startOffset: 2,
      endContainer: content,
      endOffset: 4,
      intersectsNode: () => true,
      cloneRange: () => clipped,
      getBoundingClientRect: () => ({
        top: 10,
        left: 5,
        width: 200,
        height: 100,
      }),
    };
    doc.createRange.mockReturnValue({
      startContainer: details,
      startOffset: 1,
      endContainer: details,
      endOffset: 2,
      selectNodeContents: vi.fn(),
      cloneRange: () => ({
        collapsed: true,
        setEndBefore: vi.fn(),
      }),
      setStartAfter: vi.fn(),
      comparePoint: (node: ContentElement) => (node === summary ? -1 : 0),
    });
    vi.mocked(convertRangeInfo).mockReturnValue(
      Object.assign(Object.create(null), range)
    );
    vi.mocked(getClientRectsNoOverlap).mockReturnValue([
      { top: 10, left: 5, width: 30, height: 20, bottom: 30, right: 35 },
    ]);
    Object.assign(doc, {
      documentElement: { style: { getPropertyValue: () => "0" } },
    });
    Object.assign(highlighter.navigator, { settings: { fontSize: 100 } });
    vi.stubGlobal("getComputedStyle", () => ({
      width: "600px",
      getPropertyValue: () => "0",
    }));

    const closed = highlighter.createHighlightDom({ document: doc }, highlight);
    expect(closed?.style.display).toBe("");
    expect(getClientRectsNoOverlap).toHaveBeenLastCalledWith(clipped, true);
    expect(clipped.endContainer).toBe(details);
    expect(clipped.endOffset).toBe(1);
    expect(range.endContainer).toBe(content);
    const bounding = closed?.childNodes[1] as HTMLElement;
    expect(bounding.style.width).toBe("30px");
    expect(bounding.style.height).toBe("20px");

    details.open = true;
    highlighter.createHighlightDom({ document: doc }, highlight);
    expect(getClientRectsNoOverlap).toHaveBeenLastCalledWith(range, true);
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

  it("keeps definitions clickable after an actual details annotation redraw", async () => {
    Object.assign(doc, { readyState: "complete" });
    const definition = {
      ...highlight,
      id: "definition",
      type: HighlightType.Definition,
      pointerInteraction: true,
    };
    const click = vi.fn();
    const emit = vi.fn();
    const result = { order: 1, term: "Term" };
    Object.assign(highlighter.navigator, {
      currentLocator: () => ({ href: "chapter.xhtml" }),
      currentChapterLink: { href: "chapter.xhtml" },
      rights: {},
      definitionsModule: {
        properties: { definitions: [result] },
        api: { click },
      },
      emit,
    });
    const module = annotationModule();
    module.navigator = highlighter.navigator;
    vi.spyOn(module.annotator!, "getAnnotationsByChapter").mockReturnValue([
      {
        href: "chapter.xhtml",
        locations: {},
        created: new Date(),
        highlight,
      },
    ]);
    vi.spyOn(Publication.prototype, "getTOCItem").mockReturnValue(
      Object.assign(new Link(), { Href: "chapter.xhtml" })
    );
    vi.spyOn(highlighter, "createHighlightDom").mockReturnValue(undefined);
    const draw = vi.spyOn(module, "drawHighlights");
    _highlights.push(highlight, definition);
    await module.initialize(
      Object.assign(Object.create(null), { contentDocument: doc })
    );
    layoutEvent();
    await draw.mock.results[0].value;
    expect(_highlights).toEqual([definition, highlight]);

    const target = Object.assign(new EventTarget(), {
      parentElement: {
        id: definition.id,
        style: { display: "" },
        dataset: { order: "1" },
      },
      getAttribute: (name: string) => (name === "data-click" ? "1" : null),
    });
    const interactions: Promise<void>[] = [];
    target.addEventListener("click", (event) => {
      interactions.push(highlighter.processMouseEvent(event as MouseEvent));
    });
    target.dispatchEvent(new Event("click"));
    await Promise.all(interactions);
    expect(click).toHaveBeenCalledWith(result, definition);
    expect(emit).toHaveBeenCalledWith("definition.click", result, definition);
  });

  it.each(["hidden", "empty", "missing", "zero-height", "zero-width"])(
    "omits %s gutter comments and restores them when renderable",
    (state) => {
      const area = {
        style: {
          top: "50px",
          width: "40px",
          height: "20px",
          display: "",
        },
      };
      if (state === "zero-height") area.style.height = "0px";
      if (state === "zero-width") area.style.width = "0px";
      const areas = state === "empty" ? [] : [area];
      const hidden = {
        style: { display: state === "hidden" ? "none" : "" },
        querySelectorAll: () => areas,
        getElementsByClassName: () => areas,
      };
      const visibleArea = {
        style: { top: "10px", width: "40px", height: "20px", display: "" },
      };
      const visible = {
        style: { display: "" },
        querySelectorAll: () => [visibleArea],
        getElementsByClassName: () => [visibleArea],
      };
      const overlays = new Map([["visible", visible]]);
      if (state !== "missing") overlays.set("hidden", hidden);
      const gutter = {
        innerHTML: "",
        style: { removeProperty: vi.fn() },
        appendChild: vi.fn(),
      };
      Object.assign(doc, {
        getElementById: (id: string) =>
          id === HighlightContainer.R2_ID_GUTTER_RIGHT_CONTAINER
            ? gutter
            : {
                querySelector: (selector: string) =>
                  overlays.get(selector.slice(1)),
              },
      });
      Object.assign(highlighter.navigator, {
        view: { isScrollMode: () => true },
        currentLocator: () => ({ href: "chapter.xhtml" }),
      });
      const module = annotationModule();
      module.navigator = highlighter.navigator;
      module.properties = { enableComments: true };
      vi.spyOn(module.annotator!, "getAnnotationsByChapter").mockReturnValue(
        ["visible", "hidden"].map((id) => ({
          href: "chapter.xhtml",
          locations: {},
          created: new Date(),
          highlight: { ...highlight, id, note: id },
        }))
      );

      module.repositionGutters();
      expect(gutter.appendChild).toHaveBeenCalledTimes(1);
      expect(gutter.appendChild.mock.calls[0][0].childNodes[1].innerHTML).toBe(
        "visible"
      );

      hidden.style.display = "";
      area.style.width = "40px";
      area.style.height = "20px";
      if (!areas.length) areas.push(area);
      overlays.set("hidden", hidden);
      gutter.appendChild.mockClear();
      module.repositionGutters();
      expect(gutter.appendChild).toHaveBeenCalledTimes(2);
      expect(gutter.appendChild.mock.calls[1][0].childNodes[1].innerHTML).toBe(
        "hidden"
      );
    }
  );

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
