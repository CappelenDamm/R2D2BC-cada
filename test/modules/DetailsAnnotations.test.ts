import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnnotationMarker } from "../../src/model/Locator";
import { Publication } from "../../src/model/Publication";
import { Link } from "../../src/model/Link";
import { AnnotationModule } from "../../src/modules/AnnotationModule";
import { PageBreakModule } from "../../src/modules/pagebreak/PageBreakModule";
import { DefinitionsModule } from "../../src/modules/search/DefinitionsModule";
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
import {
  convertRange,
  convertRangeInfo,
} from "../../src/modules/highlight/renderer/iframe/selection";
import LocalAnnotator from "../../src/store/LocalAnnotator";
import MemoryStore from "../../src/store/MemoryStore";
import log from "loglevel";

vi.mock("../../src/modules/highlight/renderer/iframe/selection", () => ({
  convertRange: vi.fn(),
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
    const registrations = doc.addEventListener.mock.calls.filter(
      ([event]) => event === type
    );
    if (!registrations.length) throw new Error(`Missing ${type} listener`);
    const target = Object.assign(new EventTarget(), {
      localName: type === "toggle" ? "details" : "summary",
      closest: () => (insideDetails ? {} : null),
    });
    for (const [, listener, capture] of registrations) {
      expect(capture).toBe(true);
      target.addEventListener(type, listener);
    }
    target.dispatchEvent(new Event(type));
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

  it.each([true, false])(
    "redraws page breaks on details events with annotations enabled=%s",
    async (annotationsEnabled) => {
      const iframe = Object.assign(Object.create(null), {
        contentDocument: doc,
      });
      const drawAnnotations = vi.fn(async () => {});
      if (annotationsEnabled) {
        const module = annotationModule();
        vi.spyOn(module, "drawHighlights").mockImplementation(drawAnnotations);
        await module.initialize(iframe);
      }
      const pageBreakModule: PageBreakModule = Object.assign(
        Object.create(PageBreakModule.prototype),
        { navigator: highlighter.navigator }
      );
      const drawPageBreaks = vi
        .spyOn(pageBreakModule, "drawPageBreaks")
        .mockResolvedValue();
      const destroy = vi.spyOn(highlighter, "destroyHighlights");
      pageBreakModule.initialize(iframe);

      const events = [
        "toggle",
        "transitionend",
        "transitioncancel",
        "animationend",
        "animationcancel",
      ];
      for (const [index, event] of events.entries()) {
        layoutEvent(event);
        expect(drawPageBreaks).toHaveBeenCalledTimes(index + 1);
        expect(drawAnnotations).toHaveBeenCalledTimes(
          annotationsEnabled ? index + 1 : 0
        );
      }
      expect(destroy).not.toHaveBeenCalled();
    }
  );

  it.each(["drawPageBreaks", "handleResize"] as const)(
    "keeps page numbers visible until their replacements are drawn by %s",
    async (method) => {
      Object.assign(highlighter.navigator, { highlighter });
      const pageBreakModule: PageBreakModule = Object.assign(
        Object.create(PageBreakModule.prototype),
        { navigator: highlighter.navigator }
      );
      const pageNumbers: HTMLDivElement[] = [];
      const container = {
        get firstChild() {
          return pageNumbers[0];
        },
        removeChild: () => pageNumbers.shift(),
      };
      Object.assign(doc, {
        getElementById: (id: string) =>
          id === HighlightContainer.R2_ID_PAGEBREAK_CONTAINER
            ? container
            : overlay(),
      });
      Object.assign(doc.body, {
        querySelectorAll: () => [{ innerHTML: "1" }],
      });
      doc.createRange.mockReturnValue({
        selectNodeContents: vi.fn(),
        collapsed: false,
      });
      vi.spyOn(highlighter, "dom").mockReturnValue({
        getWindow: () => ({ document: doc }),
        getSelection: () => ({
          removeAllRanges: vi.fn(),
          addRange: vi.fn(),
          isCollapsed: false,
        }),
      });
      vi.mocked(convertRange).mockReturnValue(
        highlight.selectionInfo.rangeInfo
      );
      let top = 20;
      vi.spyOn(highlighter, "createHighlightDom").mockImplementation(() => {
        const dom = document.createElement("div");
        dom.style.top = `${top}px`;
        pageNumbers.push(dom);
        return dom;
      });
      pageBreakModule.createPageBreakHighlight(highlight.selectionInfo, "1");

      for (let cycle = 0; cycle < 3; cycle++) {
        const previous = pageNumbers[0];
        top += 100;
        const completed = vi.fn();
        const rendering = pageBreakModule[method]().then(completed);
        expect(pageNumbers).toEqual([previous]);
        await vi.advanceTimersByTimeAsync(199);
        expect(pageNumbers).toEqual([previous]);
        expect(completed).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await rendering;
        expect(completed).toHaveBeenCalledTimes(1);
        expect(pageNumbers).toHaveLength(1);
        expect(pageNumbers[0]).not.toBe(previous);
        expect(pageNumbers[0].style.top).toBe(`${top}px`);
        expect(_highlights).toHaveLength(1);
        expect(_highlights[0].position).toBe(top);
      }
    }
  );

  it.each([false, true])(
    "preserves an existing selection through a details redraw with anchor collapsed=%s",
    async (collapsed) => {
      const passage = { startOffset: 2, endOffset: 10 };
      let selectedRange: object | null = passage;
      const selection = {
        removeAllRanges: vi.fn(() => {
          selectedRange = null;
        }),
        addRange: vi.fn((range: Range) => {
          selectedRange = range;
        }),
        get isCollapsed() {
          return selectedRange === null;
        },
      };
      const range = { selectNodeContents: vi.fn(), collapsed };
      const anchor = { innerHTML: "1" };
      doc.createRange.mockReturnValue(range);
      Object.assign(doc.body, { querySelectorAll: () => [anchor] });
      Object.assign(highlighter.navigator, { highlighter });
      vi.spyOn(highlighter, "dom").mockReturnValue({
        getWindow: () => ({ document: doc }),
        getSelection: () => selection,
      });
      vi.mocked(convertRange)
        .mockReset()
        .mockReturnValue(highlight.selectionInfo.rangeInfo);
      const pageBreakModule: PageBreakModule = Object.assign(
        Object.create(PageBreakModule.prototype),
        { navigator: highlighter.navigator }
      );
      const create = vi
        .spyOn(pageBreakModule, "createPageBreakHighlight")
        .mockReturnValue(highlight);
      const redraw = vi.spyOn(pageBreakModule, "drawPageBreaks");
      pageBreakModule.initialize(
        Object.assign(Object.create(null), { contentDocument: doc })
      );

      layoutEvent("transitionend");
      await vi.waitFor(() => expect(redraw).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(200);

      expect(range.selectNodeContents).toHaveBeenCalledExactlyOnceWith(anchor);
      expect(selectedRange).toBe(passage);
      expect(selection.removeAllRanges).not.toHaveBeenCalled();
      expect(selection.addRange).not.toHaveBeenCalled();
      expect(create).toHaveBeenCalledTimes(collapsed ? 0 : 1);
      if (collapsed) {
        expect(convertRange).not.toHaveBeenCalled();
      } else {
        expect(convertRange).toHaveBeenCalledExactlyOnceWith(
          range,
          expect.any(Function)
        );
      }
    }
  );

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

  it.each([true, false])(
    "replaces obsolete definition models across chapters with container present=%s",
    async (containerPresent) => {
      const module = await DefinitionsModule.create({
        publication: Object.create(Publication.prototype),
        highlighter,
        definitions: [{ order: 1, terms: ["Term"] }],
      });
      vi.clearAllTimers();
      module.navigator = highlighter.navigator;
      Object.assign(module.navigator, { definitionsModule: module });
      vi.spyOn(highlighter, "createHighlightDom").mockReturnValue(undefined);
      const pageBreak = {
        ...highlight,
        id: "page-break",
        type: HighlightType.PageBreak,
      };
      _highlights.push(highlight, pageBreak);
      let chapter = "";
      vi.spyOn(module, "define").mockImplementation(async (item) => {
        const model = module.createDefinitionHighlight(
          {
            rangeInfo: {
              ...highlight.selectionInfo.rangeInfo,
              startContainerElementCssSelector: `#${chapter}`,
              endContainerElementCssSelector: `#${chapter}`,
            },
          },
          item
        );
        module["currentChapterPopupResult"].push({ chapter });
        module["currentPopupHighlights"].push(model);
      });

      for (chapter of ["chapter-1", "chapter-2", "chapter-3"]) {
        const chapterDocument = documentFixture();
        if (!containerPresent) {
          Object.assign(chapterDocument, { getElementById: () => null });
        }
        Object.assign(module.navigator.iframes[0], {
          contentDocument: chapterDocument,
          contentWindow: { document: chapterDocument },
        });
        await module.drawDefinitions();
        await vi.advanceTimersByTimeAsync(300);
        expect(_highlights).toHaveLength(3);
        expect(_highlights.slice(0, 2)).toEqual([highlight, pageBreak]);
        expect(
          _highlights[2].selectionInfo.rangeInfo
            .startContainerElementCssSelector
        ).toBe(`#${chapter}`);
        expect(module["currentChapterPopupResult"]).toEqual([{ chapter }]);
        expect(module["currentPopupHighlights"]).toEqual([_highlights[2]]);
      }

      await module.clearDefinitions();
      expect(_highlights).toEqual([highlight, pageBreak]);
      expect(module["currentChapterPopupResult"]).toEqual([]);
      expect(module["currentPopupHighlights"]).toEqual([]);
    }
  );

  it("keeps one model per page break across annotation and page-break redraws", () => {
    Object.assign(highlighter.navigator, { highlighter });
    const pageBreakModule: PageBreakModule = Object.assign(
      Object.create(PageBreakModule.prototype),
      { navigator: highlighter.navigator }
    );
    vi.spyOn(highlighter, "createHighlightDom").mockImplementation(() => {
      const dom = document.createElement("div");
      dom.style.top = "20px";
      return dom;
    });
    const definition = {
      ...highlight,
      id: "definition",
      type: HighlightType.Definition,
      pointerInteraction: true,
    };
    _highlights.push(definition);
    const redrawPageBreaks = () =>
      ["1", "2"].map((page) =>
        pageBreakModule.createPageBreakHighlight(
          {
            rangeInfo: {
              ...highlight.selectionInfo.rangeInfo,
              startContainerElementCssSelector: `#page-${page}`,
              endContainerElementCssSelector: `#page-${page}`,
            },
          },
          page
        )
      );
    const pageBreakIds = redrawPageBreaks().map((pageBreak) => pageBreak.id);

    for (let cycle = 0; cycle < 5; cycle++) {
      _highlights.push({ ...highlight });
      highlighter.destroyHighlights(HighlightType.Annotation);
      expect(_highlights.map((model) => model.id)).toEqual([
        definition.id,
        ...pageBreakIds,
      ]);

      highlighter.destroyHighlights(HighlightType.PageBreak);
      expect(_highlights).toEqual([definition]);
      redrawPageBreaks();
      expect(_highlights.map((model) => model.id)).toEqual([
        definition.id,
        ...pageBreakIds,
      ]);
    }
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

  it.each(["annotations", "page breaks"])(
    "removes %s listeners on reinitialization and stop",
    async (type) => {
      const module: AnnotationModule | PageBreakModule =
        type === "annotations"
          ? annotationModule()
          : Object.assign(Object.create(PageBreakModule.prototype), {
              navigator: highlighter.navigator,
            });
      await module.initialize(
        Object.assign(Object.create(null), { contentDocument: doc })
      );
      const listener = doc.addEventListener.mock.calls[0][1];
      const nextDocument = documentFixture();
      await module.initialize(
        Object.assign(Object.create(null), { contentDocument: nextDocument })
      );
      const nextListener = nextDocument.addEventListener.mock.calls[0][1];
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
          nextListener,
          true
        );
      }
    }
  );

  it("does not subscribe when annotations are disabled", async () => {
    const module = annotationModule(false);
    await module.initialize(
      Object.assign(Object.create(null), { contentDocument: doc })
    );
    expect(doc.addEventListener).not.toHaveBeenCalled();
  });

  it("ignores page-break layout events outside details", () => {
    const module: PageBreakModule = Object.assign(
      Object.create(PageBreakModule.prototype),
      { navigator: highlighter.navigator }
    );
    const redraw = vi.spyOn(module, "drawPageBreaks").mockResolvedValue();
    module.initialize(
      Object.assign(Object.create(null), { contentDocument: doc })
    );
    layoutEvent("transitionend", false);
    expect(redraw).not.toHaveBeenCalled();
  });

  it("reports a failure thrown by delayed page-break rendering", async () => {
    const module: PageBreakModule = Object.assign(
      Object.create(PageBreakModule.prototype),
      { navigator: highlighter.navigator }
    );
    const error = new Error("page-break redraw failed");
    Object.assign(highlighter.navigator, { highlighter });
    Object.assign(doc.body, {
      querySelectorAll: () => [{ innerHTML: "1" }],
    });
    doc.createRange.mockReturnValue({
      selectNodeContents: vi.fn(),
      collapsed: false,
    });
    vi.mocked(convertRange).mockReturnValue(highlight.selectionInfo.rangeInfo);
    const create = vi
      .spyOn(module, "createPageBreakHighlight")
      .mockImplementation(() => {
        throw error;
      });
    const report = vi.spyOn(log, "error").mockImplementation(() => {});
    module.initialize(
      Object.assign(Object.create(null), { contentDocument: doc })
    );
    layoutEvent();
    await vi.advanceTimersByTimeAsync(199);
    expect(create).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledExactlyOnceWith(
      "Failed to redraw page breaks after details layout change",
      error
    );
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
    await vi.waitFor(() =>
      expect(report).toHaveBeenCalledWith(
        "Failed to redraw annotations after details layout change",
        error
      )
    );
  });
});
