import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import debounce from "debounce";
import { IFrameNavigator } from "../../src/navigator/IFrameNavigator";

const chapterHref = "https://publication.example/chapter.xhtml";
const chapterHTML =
  '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title></head><body><details><summary>More</summary><p>Content</p></details></body></html>';

describe("iframe navigation", () => {
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
        iframeLoads: new Map(),
        currentSpreadLinks: {},
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
        savePosition: debounce(
          () => navigator["saveCurrentReadingPosition"](),
          200
        ),
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

  it("writes supplied XHTML in standards mode with a publication base URL", async () => {
    const { navigator, iframes } = setup({
      getContent: async () => chapterHTML,
    });
    await load(navigator);
    expectStandardsDocument(iframes[0]);
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

  it("saves the pending reading position before shutdown clears the view", async () => {
    const { navigator } = setup();
    const saveLastReadingPosition = vi.fn();
    let progression = 0.75;
    Object.assign(navigator, {
      annotator: { saveLastReadingPosition },
      rights: {},
      view: {
        getCurrentPosition: () => progression,
        stop: () => {
          progression = 0;
        },
      },
    });
    Object.assign(navigator.publication, {
      getTOCItem: () => ({ Href: chapterHref }),
    });
    navigator.savePosition();
    navigator.stop();
    navigator.savePosition();
    await vi.runAllTimersAsync();
    expect(progression).toBe(0);
    expect(saveLastReadingPosition).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ locations: { progression: 0.75 } })
    );
  });

  it("reports a failed injected stylesheet instead of continuing initialization", async () => {
    const { navigator } = setup();
    Object.assign(navigator, {
      injectables: [
        { type: "style", url: "https://publication.example/missing.css" },
      ],
    });
    Object.assign(navigator.iframes[0].contentDocument!, {
      getElementsByTagName: () => [{}],
      head: {
        appendChild: (link: HTMLLinkElement) => {
          queueMicrotask(() => link.onerror?.(new Event("error")));
        },
      },
    });
    await expect(
      navigator["injectInjectablesIntoIframeHead"](navigator.iframes[0])
    ).rejects.toThrow(
      "Injectable failed to load at: https://publication.example/missing.css"
    );
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
      atStart: () => false,
      atEnd: () => false,
      goToProgression: vi.fn(),
      goToElement: vi.fn(),
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
      hideIframeContents: vi.fn(),
      precessContentForIframe: vi.fn(() =>
        navigator["invalidateIFrameLoads"]()
      ),
      setActiveTOCItem: vi.fn(),
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
    expect(view.goToProgression).not.toHaveBeenCalled();

    finishSize();
    await loaded;

    expect(view.goToProgression).toHaveBeenCalledExactlyOnceWith(0.5);
  });

  it("preserves the start position after resizing", async () => {
    const { navigator, view, finishSize } = setupRestoration();
    view.getCurrentPosition = () => 0;
    Object.assign(navigator, { newPosition: undefined });
    const resized = navigator.handleResize();
    await vi.advanceTimersByTimeAsync(0);
    expect(view.goToProgression).not.toHaveBeenCalled();

    finishSize();
    await resized;

    expect(view.goToProgression).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("ignores spread loads from an older navigation generation", async () => {
    const { navigator, finishSize } = setupRestoration(true);
    vi.spyOn(navigator, "handleResize").mockResolvedValue();
    const loads = navigator.iframes.map((iframe) =>
      navigator["handleIFrameLoad"](iframe)
    );
    await vi.advanceTimersByTimeAsync(0);
    Object.assign(navigator.publication, {
      getTOCItem: (href: string) => ({ Href: href }),
    });
    await navigator.navigate({
      href: "https://publication.example/next.xhtml",
      locations: { progression: 0 },
    });
    finishSize();
    await Promise.all(loads);

    expect(navigator["showIframeContents"]).not.toHaveBeenCalled();
  });

  it("preserves a newer same-document fragment request while initialization completes", async () => {
    const { navigator, view, finishSize } = setupRestoration();
    vi.spyOn(navigator, "handleResize").mockResolvedValue();
    Object.assign(navigator.publication, {
      getTOCItem: (href: string) => ({ Href: href }),
    });
    const element = { id: "target" };
    Object.assign(navigator.iframes[0].contentDocument!, {
      getElementById: () => element,
    });
    const loaded = navigator["handleIFrameLoad"](navigator.iframes[0]);
    await vi.advanceTimersByTimeAsync(0);
    const navigated = navigator.navigate({
      href: chapterHref + "#target",
      locations: { fragment: "target" },
    });
    await vi.advanceTimersByTimeAsync(0);
    finishSize();
    await Promise.all([loaded, navigated]);

    expect(view.goToElement).toHaveBeenCalledExactlyOnceWith(
      element,
      undefined,
      undefined
    );
    expect(view.goToProgression).not.toHaveBeenCalled();
    expect(navigator["showIframeContents"]).toHaveBeenCalledOnce();
  });

  it.each(["", "#target"])(
    "finishes both spread loads after navigation to a current spread page%s",
    async (fragment) => {
      const { navigator, view, finishSize } = setupRestoration(true);
      vi.spyOn(navigator, "handleResize").mockResolvedValue();
      const rightHref = "https://publication.example/right.xhtml";
      const saveLastReadingPosition = vi.fn();
      Object.assign(navigator, {
        annotator: { saveLastReadingPosition },
        newElementId: "obsolete-fragment",
        newElementScrollPosition: "center",
        currentSpreadLinks: {
          left: { href: chapterHref },
          right: { href: rightHref },
        },
      });
      Object.assign(navigator.publication, {
        getTOCItem: (href: string) => ({ Href: href }),
      });
      const loads = navigator.iframes.map((iframe) =>
        navigator["handleIFrameLoad"](iframe)
      );
      await vi.advanceTimersByTimeAsync(0);
      await navigator.navigate({
        href: rightHref + fragment,
        locations: { progression: 0 },
      });
      finishSize();
      await Promise.all(loads);

      for (const iframe of navigator.iframes) {
        expect(navigator["showIframeContents"]).toHaveBeenCalledWith(iframe);
      }
      expect(view.goToProgression).not.toHaveBeenCalled();
      navigator.savePosition();
      await vi.runAllTimersAsync();
      expect(saveLastReadingPosition).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          href: rightHref,
          locations: { progression: 0.5 },
        })
      );
    }
  );

  it("keeps same-origin URL navigation unchanged", async () => {
    const href = "https://reader.example/chapter.xhtml";
    const { navigator, iframes } = setup({ href });
    await load(navigator);
    expect(iframes[0].src).toBe(href);
    expect(iframes[0].contentDocument.write).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(parseFromString).not.toHaveBeenCalled();
  });

  it.each([
    ["supplied", false],
    ["fetched", true],
    ["fallback", false],
  ] as const)(
    "ignores obsolete %s document responses for spread=%s",
    async (source, spread) => {
      const pending: ((content: string | undefined) => void)[] = [];
      const getContent = () =>
        new Promise<string | undefined>((resolve) => {
          pending.push(resolve);
        });
      if (source === "fetched") {
        vi.stubGlobal(
          "fetch",
          vi.fn(async () => ({ text: getContent }))
        );
      }
      const href =
        source === "fallback"
          ? "https://reader.example/chapter.xhtml"
          : chapterHref;
      const { navigator, iframes } = setup({
        href,
        spread,
        getContent: source === "fetched" ? undefined : getContent,
      });
      await load(navigator);
      const obsolete = pending.splice(0);
      navigator.currentChapterLink.href = new URL("new.xhtml", href).href;
      await load(navigator);
      pending
        .splice(0)
        .forEach((resolve) =>
          resolve(source === "fallback" ? undefined : chapterHTML)
        );
      await vi.advanceTimersByTimeAsync(0);
      const currentSources = iframes.map((iframe) => iframe.src);
      obsolete.forEach((resolve) =>
        resolve(source === "fallback" ? undefined : chapterHTML)
      );
      await vi.advanceTimersByTimeAsync(0);

      for (const iframe of iframes) {
        expect(iframe.contentDocument.write).toHaveBeenCalledTimes(
          source === "fallback" ? 0 : 1
        );
      }
      expect(iframes.map((iframe) => iframe.src)).toEqual(currentSources);
    }
  );

  it("does not write fetched documents after shutdown", async () => {
    const pending: ((content: string) => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        text: () => new Promise<string>((resolve) => pending.push(resolve)),
      }))
    );
    const { navigator, iframes } = setup({ spread: true });
    await load(navigator);
    navigator.stop();
    pending.forEach((resolve) => resolve(chapterHTML));
    await vi.advanceTimersByTimeAsync(0);

    for (const iframe of iframes) {
      expect(iframe.contentDocument.write).not.toHaveBeenCalled();
    }
  });

  it.each(["supplied", "fetched"])(
    "reports a failed %s document and releases its waiting position requests",
    async (source) => {
      const error = new Error("Document unavailable");
      const getContent = async () => {
        throw error;
      };
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw error;
        })
      );
      const { navigator } = setup({
        getContent: source === "fetched" ? undefined : getContent,
      });
      const onError = vi.fn();
      Object.assign(navigator, { api: { ...navigator.api, onError } });
      await load(navigator);

      expect(onError).toHaveBeenCalledExactlyOnceWith(error);
      await expect(navigator["waitForIFrameLoads"]()).resolves.toBe(false);
    }
  );

  it("waits for document fetching as well as initialization before applying a position", async () => {
    const { navigator, view, finishSize } = setupRestoration();
    vi.spyOn(navigator, "handleResize").mockResolvedValue();
    let finishDocument: (content: string) => void = () => {};
    Object.assign(navigator, {
      api: {
        getContent: () =>
          new Promise<string>((resolve) => {
            finishDocument = resolve;
          }),
      },
    });
    Object.assign(navigator.publication, {
      getTOCItem: (href: string) => ({ Href: href }),
    });
    IFrameNavigator.prototype["precessContentForIframe"].call(navigator);
    const navigated = navigator.navigate({
      href: chapterHref,
      locations: { progression: 0.75 },
    });
    finishSize();
    await vi.advanceTimersByTimeAsync(0);
    expect(view.goToProgression).not.toHaveBeenCalled();
    finishDocument(chapterHTML);
    await vi.advanceTimersByTimeAsync(0);
    await navigator["handleIFrameLoad"](navigator.iframes[0]);
    await navigated;

    expect(view.goToProgression).toHaveBeenCalledExactlyOnceWith(0.75);
  });

  it("releases a waiting position request on shutdown without initializing more modules", async () => {
    const { navigator, view, finishSize } = setupRestoration();
    vi.spyOn(navigator, "handleResize").mockResolvedValue();
    Object.assign(navigator.publication, {
      getTOCItem: (href: string) => ({ Href: href }),
    });
    let finishHighlighting: () => void = () => {};
    const initializePageBreaks = vi.fn();
    Object.assign(navigator, {
      highlighter: {
        initialize: () =>
          new Promise<void>((resolve) => {
            finishHighlighting = resolve;
          }),
      },
      rights: { enablePageBreaks: true },
      pageBreakModule: {
        initialize: initializePageBreaks,
        handleResize: async () => {},
      },
    });
    const loaded = navigator["handleIFrameLoad"](navigator.iframes[0]);
    await vi.advanceTimersByTimeAsync(0);
    const navigated = navigator.navigate({
      href: chapterHref,
      locations: { progression: 0.75 },
    });
    await vi.advanceTimersByTimeAsync(0);
    navigator.stop();
    await navigated;
    finishHighlighting();
    finishSize();
    await loaded;

    expect(initializePageBreaks).not.toHaveBeenCalled();
    expect(view.goToProgression).not.toHaveBeenCalled();
    expect(navigator["showIframeContents"]).not.toHaveBeenCalled();
  });

  it("applies only the latest position request after delayed chapter initialization", async () => {
    const { navigator, view, finishSize } = setupRestoration();
    vi.spyOn(navigator, "handleResize").mockResolvedValue();
    Object.assign(navigator.publication, {
      getTOCItem: (href: string) => ({ Href: href }),
    });
    Object.assign(navigator, { newElementId: "obsolete-fragment" });
    const loaded = navigator["handleIFrameLoad"](navigator.iframes[0]);
    await vi.advanceTimersByTimeAsync(0);
    const older = navigator.navigate({
      href: chapterHref,
      locations: { progression: 0.75 },
    });
    const latest = navigator.navigate({
      href: chapterHref,
      locations: { progression: 0.25 },
    });
    finishSize();
    await Promise.all([loaded, older, latest]);

    expect(view.goToProgression).toHaveBeenCalledExactlyOnceWith(0.25);
    expect(view.goToElement).not.toHaveBeenCalled();
  });

  it.each(["stop", "navigation"])(
    "does not run delayed reveal or resource-ready callbacks after %s",
    async (action) => {
      const { navigator, finishSize } = setupRestoration();
      vi.spyOn(navigator, "handleResize").mockResolvedValue();
      vi.mocked(navigator["showIframeContents"]).mockImplementation(
        IFrameNavigator.prototype["showIframeContents"].bind(navigator)
      );
      vi.mocked(navigator["hideLoadingMessage"]).mockImplementation(
        IFrameNavigator.prototype["hideLoadingMessage"].bind(navigator)
      );
      finishSize();
      await navigator["handleIFrameLoad"](navigator.iframes[0]);
      if (action === "stop") {
        navigator.stop();
      } else {
        Object.assign(navigator.publication, {
          getTOCItem: (href: string) => ({ Href: href }),
        });
        await navigator.navigate({
          href: "https://publication.example/next.xhtml",
          locations: { progression: 0 },
        });
      }
      await vi.advanceTimersByTimeAsync(150);

      expect(navigator.iframes[0].style.opacity).toBe("0");
      expect(navigator["emit"]).not.toHaveBeenCalledWith("resource.ready");
    }
  );
});
