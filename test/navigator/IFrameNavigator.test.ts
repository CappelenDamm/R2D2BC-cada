import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IFrameNavigator } from "../../src/navigator/IFrameNavigator";

const chapterHref = "https://publication.example/chapter.xhtml";
const chapterHTML =
  '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title></head><body><details><summary>More</summary><p>Content</p></details></body></html>';

describe("written iframe documents", () => {
  const parseFromString = vi.fn();
  const insertBefore = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      location: new URL("https://reader.example/"),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: () => ({}),
    });
    vi.stubGlobal(
      "DOMParser",
      class {
        parseFromString = parseFromString;
      }
    );
    parseFromString.mockReturnValue({
      documentElement: { outerHTML: chapterHTML },
      head: { firstChild: null, insertBefore },
      getElementsByTagName: () => [],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ text: async () => chapterHTML }))
    );
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function setup({
    href = chapterHref,
    spread = false,
    getContent,
  }: {
    href?: string;
    spread?: boolean;
    getContent?: () => Promise<string | undefined>;
  } = {}) {
    const iframes = Array.from({ length: spread ? 2 : 1 }, () => ({
      src: "",
      style: { opacity: "0" },
      removeEventListener: vi.fn(),
      contentDocument: {
        open: vi.fn(),
        write: vi.fn(),
        close: vi.fn(),
      },
    }));
    const navigator: IFrameNavigator = Object.assign(
      Object.create(IFrameNavigator.prototype),
      {
        iframes,
        iframeLoadTokens: new WeakMap<HTMLIFrameElement, object>(),
        currentChapterLink: { href },
        settings: { columnCount: spread ? 2 : 1 },
        publication: {
          getSpineIndex: () => 1,
          isFixedLayout: spread,
          readingOrder: [{}, {}, {}],
          getNextSpineItem: () => ({ Href: "next.xhtml" }),
          getAbsoluteHref: (path: string) => new URL(path, href).href,
        },
        api: getContent ? { getContent } : undefined,
        showLoadingMessageAfterDelay: vi.fn(),
      }
    );
    return { navigator, iframes };
  }

  async function load(navigator: IFrameNavigator) {
    navigator["precessContentForIframe"]();
    await vi.advanceTimersByTimeAsync(0);
  }

  function expectStandardsDocument(
    iframe: ReturnType<typeof setup>["iframes"][number]
  ) {
    expect(iframe.contentDocument.open).toHaveBeenCalledOnce();
    expect(iframe.contentDocument.write).toHaveBeenCalledExactlyOnceWith(
      "<!DOCTYPE html>\n" + chapterHTML
    );
    expect(iframe.contentDocument.close).toHaveBeenCalledOnce();
  }

  it.each([
    ["without a doctype", chapterHTML],
    ["with an HTML5 doctype", "<!DOCTYPE html>\n" + chapterHTML],
    [
      "with an XHTML doctype",
      '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">\n' +
        chapterHTML,
    ],
  ])("writes supplied XHTML %s in standards mode", async (_name, content) => {
    const { navigator, iframes } = setup({
      getContent: async () => content,
    });
    await load(navigator);
    expect(parseFromString).toHaveBeenCalledWith(
      content,
      "application/xhtml+xml"
    );
    expectStandardsDocument(iframes[0]);
    expect(fetch).not.toHaveBeenCalled();
    expect(insertBefore).toHaveBeenCalledWith(
      { target: "_self", href: chapterHref },
      null
    );
  });

  it("writes fetched cross-origin XHTML in standards mode", async () => {
    const { navigator, iframes } = setup();
    await load(navigator);
    expect(fetch).toHaveBeenCalledWith(chapterHref, undefined);
    expectStandardsDocument(iframes[0]);
  });

  it("preserves standards mode when supplied content falls back to fetching", async () => {
    const { navigator, iframes } = setup({
      getContent: async () => undefined,
    });
    await load(navigator);
    expect(fetch).toHaveBeenCalledWith(chapterHref, undefined);
    expectStandardsDocument(iframes[0]);
  });

  it.each(["supplied", "cross-origin"] as const)(
    "writes both %s fixed-layout spread documents in standards mode",
    async (source) => {
      const { navigator, iframes } = setup({
        spread: true,
        getContent: source === "supplied" ? async () => chapterHTML : undefined,
      });
      await load(navigator);
      for (const iframe of iframes) {
        expectStandardsDocument(iframe);
      }
    }
  );

  it("stops the book view when the navigator stops", () => {
    const { navigator } = setup();
    const stop = vi.fn();
    Object.assign(navigator, { view: { stop } });
    navigator.stop();
    expect(stop).toHaveBeenCalledOnce();
  });

  function setupRestoration(spread = false) {
    const { navigator } = setup({ spread });
    let finishSize: () => void = () => {};
    const sizeReady = new Promise<void>((resolve) => {
      finishSize = resolve;
    });
    const view = {
      layout: spread ? "fixed" : "reflowable",
      stop: vi.fn(),
      setSize: vi.fn(() => sizeReady),
      getCurrentPosition: () => 0.5,
      goToProgression: vi.fn(),
    };
    Object.assign(navigator, {
      view,
      rights: {},
      newPosition: { locations: { progression: 0.5 } },
      settings: {
        applyProperties: vi.fn(async () => {}),
        isPaginated: async () => false,
      },
      updateBookView: vi.fn(),
      injectInjectablesIntoIframeHead: vi.fn(async () => {}),
      updatePositionInfo: vi.fn(),
      hideLoadingMessage: vi.fn(),
      showIframeContents: vi.fn(),
      emit: vi.fn(),
    });
    Object.assign(navigator.publication, {
      Metadata: {},
      getPreviousSpineItem: () => undefined,
      getSpineItem: () => undefined,
      getTOCItem: () => undefined,
      getStartLink: () => undefined,
    });
    return { navigator, view, finishSize };
  }

  it("waits for final content sizing before restoring the saved position", async () => {
    const { navigator, view, finishSize } = setupRestoration();
    vi.spyOn(navigator, "handleResize").mockResolvedValue();
    const loaded = navigator["handleIFrameLoad"](navigator.iframes[0]);
    await vi.advanceTimersByTimeAsync(0);
    expect(view.setSize).toHaveBeenCalledOnce();
    expect(view.goToProgression).not.toHaveBeenCalled();

    finishSize();
    await loaded;

    expect(view.goToProgression).toHaveBeenCalledExactlyOnceWith(0.5);
  });

  it("does not restore or reveal a stopped reader after pending sizing completes", async () => {
    const { navigator, view, finishSize } = setupRestoration();
    vi.spyOn(navigator, "handleResize").mockResolvedValue();
    const loaded = navigator["handleIFrameLoad"](navigator.iframes[0]);
    await vi.advanceTimersByTimeAsync(0);
    navigator.stop();
    finishSize();
    await loaded;
    await vi.runAllTimersAsync();

    expect(view.goToProgression).not.toHaveBeenCalled();
    expect(navigator["showIframeContents"]).not.toHaveBeenCalled();
    expect(view.setSize).toHaveBeenCalledOnce();
  });

  it("waits for resized content before restoring the pre-resize position", async () => {
    const { navigator, view, finishSize } = setupRestoration();
    Object.assign(navigator, { newPosition: undefined });
    const resized = navigator.handleResize();
    await vi.advanceTimersByTimeAsync(0);
    expect(view.setSize).toHaveBeenCalledOnce();
    expect(view.goToProgression).not.toHaveBeenCalled();

    finishSize();
    await resized;

    expect(view.goToProgression).toHaveBeenCalledExactlyOnceWith(0.5);
  });

  it("ignores a superseded load of the same iframe", async () => {
    const { navigator, view, finishSize } = setupRestoration();
    vi.spyOn(navigator, "handleResize").mockResolvedValue();
    const previous = navigator["handleIFrameLoad"](navigator.iframes[0]);
    await vi.advanceTimersByTimeAsync(0);
    Object.assign(navigator, {
      newPosition: { locations: { progression: 0.75 } },
    });
    const current = navigator["handleIFrameLoad"](navigator.iframes[0]);
    await vi.advanceTimersByTimeAsync(0);
    finishSize();
    await Promise.all([previous, current]);

    expect(view.goToProgression).toHaveBeenCalledExactlyOnceWith(0.75);
  });

  it.each(["resizing", "injectables"])(
    "initializes and reveals both spread frames when loads overlap during %s",
    async (phase) => {
      const { navigator, finishSize } = setupRestoration(true);
      let finishPending: () => void = () => {};
      const pending = new Promise<void>((resolve) => {
        finishPending = resolve;
      });
      vi.spyOn(navigator, "handleResize").mockImplementation(
        () => phase === "resizing" ? pending : Promise.resolve()
      );
      if (phase === "injectables") {
        vi.mocked(navigator["injectInjectablesIntoIframeHead"])
          .mockImplementation(() => pending);
      }
      const initialize = vi.fn();
      Object.assign(navigator, {
        rights: { enablePageBreaks: true },
        pageBreakModule: { initialize },
      });
      vi.mocked(navigator["showIframeContents"]).mockImplementation(
        IFrameNavigator.prototype["showIframeContents"].bind(navigator)
      );
      const loads = navigator.iframes.map((iframe) =>
        navigator["handleIFrameLoad"](iframe)
      );
      await vi.advanceTimersByTimeAsync(0);
      finishPending();
      finishSize();
      await Promise.all(loads);
      await vi.runAllTimersAsync();

      for (const iframe of navigator.iframes) {
        expect(navigator["injectInjectablesIntoIframeHead"])
          .toHaveBeenCalledWith(iframe);
        expect(initialize).toHaveBeenCalledWith(iframe);
        expect(navigator["showIframeContents"]).toHaveBeenCalledWith(iframe);
        expect(iframe.style.opacity).toBe("1");
      }
      expect(navigator["showIframeContents"]).toHaveBeenCalledTimes(2);
    }
  );

  it("ignores spread loads from an older navigation generation", async () => {
    const { navigator, finishSize } = setupRestoration(true);
    vi.spyOn(navigator, "handleResize").mockResolvedValue();
    const loads = navigator.iframes.map((iframe) =>
      navigator["handleIFrameLoad"](iframe)
    );
    await vi.advanceTimersByTimeAsync(0);
    await navigator.navigate({
      href: "https://publication.example/next.xhtml",
      locations: { progression: 0 },
    });
    finishSize();
    await Promise.all(loads);

    expect(navigator["showIframeContents"]).not.toHaveBeenCalled();
  });

  it("keeps same-origin URL navigation unchanged", async () => {
    const href = "https://reader.example/chapter.xhtml";
    const { navigator, iframes } = setup({ href });
    await load(navigator);
    expect(iframes[0].src).toBe(href);
    expect(iframes[0].contentDocument.write).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(parseFromString).not.toHaveBeenCalled();
  });
});
