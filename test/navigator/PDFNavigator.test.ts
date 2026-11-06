import { afterEach, describe, expect, it, vi } from "vitest";
import { getDocument } from "pdfjs-dist";
import { PDFNavigator } from "../../src/navigator/PDFNavigator";

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
  ScrollMode: {},
  SpreadMode: {},
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

  it("destroys the loading task when the navigator stops", () => {
    const { navigator, oldDocument } = setup();
    vi.stubGlobal("window", { removeEventListener: vi.fn() });

    navigator.stop();

    expect(oldDocument.loadingTask.destroy).toHaveBeenCalledOnce();
    expect(navigator["pdfDoc"]).toBeNull();
    expect(navigator["pdfViewer"].setDocument).toHaveBeenCalledWith(null);
  });
});
