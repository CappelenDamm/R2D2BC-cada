import { afterEach, describe, expect, it, vi } from "vitest";
import { getDocument } from "pdfjs-dist";
import {
  PDFNavigator,
  ScrollMode,
  SpreadMode,
} from "../../src/navigator/PDFNavigator";
import { UserSettings } from "../../src/model/user-settings/UserSettings";
import MemoryStore from "../../src/store/MemoryStore";

vi.mock("pdfjs-dist", () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: {},
  AnnotationMode: {},
  AnnotationEditorType: {},
  version: "6.2.108",
}));

vi.mock("pdfjs-dist/web/pdf_viewer.mjs", () => ({
  EventBus: class {},
  PDFFindController: class {},
  PDFHistory: class {},
  PDFLinkService: class {},
  PDFViewer: class {},
  ScrollMode: { VERTICAL: 0, HORIZONTAL: 1, WRAPPED: 2, PAGE: 3 },
  SpreadMode: { NONE: 0, ODD: 1, EVEN: 2 },
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function setup() {
  const oldDocument = {
    loadingTask: { destroy: vi.fn(async () => {}) },
  };
  const document = {
    fingerprints: ["test-fingerprint"],
    annotationStorage: { onSetModified: null },
  };
  const navigator: PDFNavigator = Object.assign(
    Object.create(PDFNavigator.prototype),
    {
      pdfDoc: oldDocument,
      pdfViewer: { setDocument: vi.fn() },
      linkService: { setDocument: vi.fn() },
      pdfHistory: { initialize: vi.fn() },
      settings: { onColumnSettingsChange: vi.fn() },
      showLoading: vi.fn(),
      hideLoading: vi.fn(),
      restoreAnnotations: vi.fn(),
    }
  );
  vi.mocked(getDocument).mockReturnValue(
    Object.assign(Object.create(null), {
      promise: Promise.resolve(document),
    })
  );
  return { navigator, oldDocument, document };
}

describe("PDF.js v6 integration", () => {
  it("reports PDF progression in the reading-position callback and persists it", async () => {
    const updateCurrentLocation = vi.fn(async () => {});
    const saveLastReadingPosition = vi.fn();
    const navigator: PDFNavigator = Object.assign(
      Object.create(PDFNavigator.prototype),
      {
        pdfDoc: { numPages: 11 },
        pageNum: 6,
        resource: { Href: "book.pdf" },
        publication: {
          getAbsoluteHref: (href: string) =>
            `https://publication.example/${href}`,
        },
        api: { updateCurrentLocation },
        annotator: { saveLastReadingPosition },
      }
    );

    navigator["saveLastReadingPosition"]();
    await Promise.resolve();

    const position = {
      href: "https://publication.example/book.pdf",
      title: "Page 6",
      type: "application/pdf",
      locations: { position: 6, progression: 0.5 },
      created: expect.any(Date),
    };
    expect(updateCurrentLocation).toHaveBeenCalledExactlyOnceWith(position);
    expect(saveLastReadingPosition).toHaveBeenCalledExactlyOnceWith(position);
  });

  it("destroys the previous loading task and loads a URL through init parameters", async () => {
    const { navigator, oldDocument, document } = setup();
    const url = "https://publication.example/document.pdf";

    await navigator["loadDocument"](url, 2);

    expect(oldDocument.loadingTask.destroy).toHaveBeenCalledOnce();
    expect(getDocument).toHaveBeenCalledExactlyOnceWith({ url });
    expect(navigator["pdfViewer"].setDocument).toHaveBeenNthCalledWith(1, null);
    expect(navigator["pdfViewer"].setDocument).toHaveBeenNthCalledWith(
      2,
      document
    );
    expect(navigator["linkService"].setDocument).toHaveBeenLastCalledWith(
      document
    );
    expect(navigator.pageNum).toBe(2);
  });

  describe("PDF column settings", () => {
    async function setupColumns(columnCount?: number) {
      const settings: UserSettings = await UserSettings.create({
        store: new MemoryStore(),
        layout: "",
        initialUserSettings:
          columnCount === undefined ? undefined : { columnCount },
      });
      const viewStore = new MemoryStore();
      class TestPDFNavigator extends PDFNavigator {
        protected override async start(): Promise<void> {
          Object.assign(this, { pdfViewer: { pagesCount: 3 } });
        }
      }
      const navigator = await TestPDFNavigator.create({
        mainElement: {} as HTMLElement,
        publication: {} as PDFNavigator["publication"],
        settings,
        store: viewStore,
        columnCount,
      });
      settings.onColumnSettingsChange(
        navigator.applyColumnSettings.bind(navigator)
      );
      return { navigator, settings, viewStore };
    }

    it.each([
      [undefined, SpreadMode.NONE, undefined],
      [undefined, SpreadMode.ODD, SpreadMode.ODD],
      [0, SpreadMode.NONE, SpreadMode.EVEN],
      [1, SpreadMode.NONE, SpreadMode.EVEN],
      [2, SpreadMode.EVEN, SpreadMode.NONE],
    ])(
      "initializes columnCount %s as spread mode %s",
      async (columnCount, spreadMode, savedSpreadMode) => {
        const { navigator, viewStore } = await setupColumns(columnCount);
        if (savedSpreadMode !== undefined) {
          viewStore.set("pdf-spread-mode", String(savedSpreadMode));
        }

        navigator["restoreViewSettings"]();

        expect(navigator["pdfViewer"].spreadMode).toBe(spreadMode);
      }
    );

    it("switches between a cover-first spread, single page, and auto at runtime", async () => {
      const { navigator, settings, viewStore } = await setupColumns();

      for (const columnCount of [2, 1, 2, 0]) {
        await settings.applyUserSettings({ columnCount });

        const spreadMode =
          columnCount === 2 ? SpreadMode.EVEN : SpreadMode.NONE;
        expect(navigator["pdfViewer"].spreadMode).toBe(spreadMode);
        expect(viewStore.get("pdf-spread-mode")).toBe(String(spreadMode));
      }
    });

    it("lets an explicit load setting replace a saved PDF spread", async () => {
      const { navigator, viewStore } = await setupColumns(2);
      viewStore.set("pdf-spread-mode", String(SpreadMode.NONE));
      navigator["restoreViewSettings"]();

      expect(navigator["pdfViewer"].spreadMode).toBe(SpreadMode.EVEN);
    });

    it("defers spread updates until page views exist and applies the latest request", async () => {
      const { navigator, settings, viewStore } = await setupColumns();
      const appliedModes: number[] = [];
      const viewer = {
        pagesCount: 0,
        set spreadMode(mode: number) {
          if (this.pagesCount === 0) {
            throw new Error("Page views are not initialized");
          }
          appliedModes.push(mode);
        },
      };
      Object.assign(navigator, { pdfViewer: viewer, viewStore: undefined });

      for (const columnCount of [2, 1, 2]) {
        await settings.applyUserSettings({ columnCount });
      }

      expect(appliedModes).toEqual([]);
      viewStore.set("pdf-spread-mode", String(SpreadMode.NONE));
      Object.assign(navigator, { viewStore });
      viewer.pagesCount = 3;
      navigator["restoreViewSettings"]();

      expect(appliedModes).toEqual([SpreadMode.EVEN]);
      expect(navigator["pendingSpreadMode"]).toBeUndefined();
    });
  });

  it("destroys the loading task when the navigator stops", () => {
    const { navigator, oldDocument } = setup();
    vi.stubGlobal("window", { removeEventListener: vi.fn() });

    navigator.stop();

    expect(oldDocument.loadingTask.destroy).toHaveBeenCalledOnce();
    expect(navigator["pdfDoc"]).toBeNull();
    expect(navigator["pdfViewer"].setDocument).toHaveBeenCalledWith(null);
  });
});

describe("PDF scroll mode", () => {
  it.each([
    ["scrolled", ScrollMode.VERTICAL],
    ["paginated", ScrollMode.PAGE],
  ] as const)(
    "applies the initial %s mode over a saved PDF mode",
    async (scrollMode, expectedMode) => {
      const settings = await UserSettings.create({
        store: new MemoryStore(),
        layout: "",
      });
      const viewStore = new MemoryStore();
      viewStore.set("pdf-scroll-mode", String(ScrollMode.PAGE));

      class TestPDFNavigator extends PDFNavigator {
        protected override async start(
          _mainElement: HTMLElement,
          _headerMenu?: HTMLElement | null,
          _footerMenu?: HTMLElement | null
        ): Promise<void> {
          Object.assign(this, { pdfViewer: { pagesCount: 3 } });
        }
      }

      const navigator = await TestPDFNavigator.create({
        mainElement: {} as HTMLElement,
        publication: {} as PDFNavigator["publication"],
        settings,
        store: viewStore,
        scrollMode,
      });

      navigator["restoreViewSettings"]();

      expect(navigator["pdfViewer"].scrollMode).toBe(expectedMode);
      expect(viewStore.get("pdf-scroll-mode")).toBe(String(expectedMode));
    }
  );

  it("defers scroll and spread changes together until page views exist", async () => {
    const appliedScrollModes: number[] = [];
    const appliedSpreadModes: number[] = [];
    const viewer = {
      pagesCount: 0,
      set scrollMode(mode: number) {
        if (this.pagesCount === 0) {
          throw new Error("Page views are not initialized");
        }
        appliedScrollModes.push(mode);
      },
      set spreadMode(mode: number) {
        if (this.pagesCount === 0) {
          throw new Error("Page views are not initialized");
        }
        appliedSpreadModes.push(mode);
      },
    };
    const navigator: PDFNavigator = Object.assign(
      Object.create(PDFNavigator.prototype),
      { pdfViewer: viewer }
    );

    navigator.setSpreadMode(SpreadMode.EVEN);
    await navigator.scroll(false);
    expect(appliedScrollModes).toEqual([]);
    expect(appliedSpreadModes).toEqual([]);

    viewer.pagesCount = 3;
    navigator["restoreViewSettings"]();

    expect(appliedScrollModes).toEqual([ScrollMode.PAGE]);
    expect(appliedSpreadModes).toEqual([SpreadMode.EVEN]);
    expect(navigator["pendingScrollMode"]).toBeUndefined();
  });

  it("preserves the latest queued mode over saved settings, including vertical mode", async () => {
    const viewer = { pagesCount: 0, scrollMode: ScrollMode.PAGE };
    const viewStore = new MemoryStore();
    const navigator: PDFNavigator = Object.assign(
      Object.create(PDFNavigator.prototype),
      {
        pdfViewer: viewer,
        viewStore,
        settings: { columnCount: 1 },
      }
    );

    await navigator.scroll(false);
    await navigator.scroll(true, "horizontal");
    await navigator.scroll(true, "wrapped");
    await navigator.scroll(true);
    viewStore.set("pdf-scroll-mode", String(ScrollMode.PAGE));
    viewer.pagesCount = 3;
    navigator["restoreViewSettings"]();

    expect(viewer.scrollMode).toBe(ScrollMode.VERTICAL);
    expect(viewStore.get("pdf-scroll-mode")).toBe(String(ScrollMode.VERTICAL));
  });
});
