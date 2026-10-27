import { afterEach, describe, expect, it, vi } from "vitest";
import { UserSettings } from "../../src/model/user-settings/UserSettings";

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
