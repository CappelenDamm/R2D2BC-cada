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
