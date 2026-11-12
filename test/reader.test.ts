import { afterEach, describe, expect, it, vi } from "vitest";
import D2Reader from "../src/reader";
import type { PDFNavigatorConfig } from "../src/navigator/PDFNavigator";

const createPDFNavigator = vi.hoisted(() => vi.fn());

vi.mock("../src/navigator/PDFNavigator", () => ({
  PDFNavigator: class {
    static create = createPDFNavigator;
  },
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("PDF reader configuration", () => {
  it("forwards initial columns and reports runtime settings changes", async () => {
    class Element {}
    vi.stubGlobal("HTMLElement", Element);
    vi.stubGlobal("document", {
      querySelector: (selector: string) =>
        selector === "#D2Reader-Container" ? new Element() : null,
    });
    const applyColumnSettings = vi.fn();
    createPDFNavigator.mockImplementation(
      async (config: PDFNavigatorConfig) => {
        config.settings.onColumnSettingsChange(applyColumnSettings);
        return { applyColumnSettings };
      }
    );
    const updateSettings = vi.fn(async () => {});

    const reader = await D2Reader.load({
      url: new URL("https://publication.example/manifest.json"),
      injectables: [],
      useStorageType: "memory",
      publication: {
        metadata: {
          title: "Test PDF",
          conformsTo: ["https://readium.org/webpub-manifest/profiles/pdf"],
        },
        readingOrder: [{ href: "book.pdf", type: "application/pdf" }],
      },
      userSettings: { columnCount: 2, scrollMode: "scrolled" },
      api: { updateSettings },
    });

    expect(createPDFNavigator).toHaveBeenCalledWith(
      expect.objectContaining({ scrollMode: "scrolled", columnCount: 2 })
    );
    expect(applyColumnSettings).not.toHaveBeenCalled();
    await reader.applyUserSettings({ columnCount: 1 });
    expect(applyColumnSettings).toHaveBeenCalledOnce();
    expect(updateSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ columnCount: "1" })
    );
  });
});
