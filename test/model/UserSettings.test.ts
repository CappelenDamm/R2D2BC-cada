import { afterEach, describe, expect, it, vi } from "vitest";
import { UserSettings } from "../../src/model/user-settings/UserSettings";
import MemoryStore from "../../src/store/MemoryStore";

afterEach(() => {
  vi.clearAllMocks();
});

describe("scroll mode position restoration", () => {
  it("waits for the new mode's content sizing before restoring progression", async () => {
    let finishMode: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      finishMode = resolve;
    });
    const view = {
      getCurrentPosition: () => 0.5,
      setMode: vi.fn(() => ready),
      goToProgression: vi.fn(),
    };
    const settings: UserSettings = Object.assign(
      Object.create(UserSettings.prototype),
      {
        view,
        applyProperties: vi.fn(async () => {}),
        viewChangeCallback: vi.fn(),
      }
    );
    const changed = settings.scroll(true);
    await Promise.resolve();
    expect(view.setMode).toHaveBeenCalledWith(true);
    expect(view.goToProgression).not.toHaveBeenCalled();
    finishMode();
    await changed;
    expect(view.goToProgression).toHaveBeenCalledExactlyOnceWith(0.5);
  });
});

describe("column count settings", () => {
  it.each([0, 1, 2])(
    "loads numeric columnCount %i without an iframe",
    async (columnCount) => {
      const store = new MemoryStore();
      const settings: UserSettings = await UserSettings.create({
        store,
        layout: "",
        initialUserSettings: { columnCount },
      });

      expect(settings.columnCount).toBe(columnCount);
      const restored: UserSettings = await UserSettings.create({
        store,
        layout: "",
      });
      expect(restored.columnCount).toBe(columnCount);
    }
  );

  it("updates and persists columns, including auto, without an iframe", async () => {
    const store = new MemoryStore();
    const updateSettings = vi.fn(async () => {});
    const settings: UserSettings = await UserSettings.create({
      store,
      layout: "",
      api: { updateSettings },
    });
    const onColumnsChange = vi.fn();
    settings.onColumnSettingsChange(onColumnsChange);

    for (const columnCount of [2, 1, 0]) {
      await settings.applyUserSettings({ columnCount });

      expect(settings.columnCount).toBe(columnCount);
      expect(updateSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({
          columnCount: columnCount === 0 ? "auto" : String(columnCount),
        })
      );
      const restored: UserSettings = await UserSettings.create({
        store,
        layout: "",
      });
      expect(restored.columnCount).toBe(columnCount);
    }
    expect(onColumnsChange).toHaveBeenCalledTimes(3);
  });

  it("rejects unsupported column counts", async () => {
    await expect(
      UserSettings.create({
        store: new MemoryStore(),
        layout: "",
        initialUserSettings: { columnCount: 3 },
      })
    ).rejects.toThrow("Unsupported column count: 3");
  });
});
