import { describe, expect, it, vi } from "vitest";
import { MediaOverlayModule } from "../../src/modules/mediaoverlays/MediaOverlayModule";

describe("media overlay resume", () => {
  it("reports progress through a long span", () => {
    const positionChanged = vi.fn();
    const first = { Text: "chapter.xhtml#mo-1", Audio: "first.mp3#t=0,20" };
    const audioElement = {
      currentTime: 1,
      src: "https://example.org/first.mp3",
    };
    const module = Object.assign(Object.create(MediaOverlayModule.prototype), {
      navigator: { iframes: [] },
      currentLinks: [{ Href: "chapter.xhtml" }],
      currentLinkIndex: 0,
      mediaOverlayTextAudioPair: first,
      audioElement,
      currentAudioEnd: 20,
      publication: {
        manifestUrl: new URL("https://example.org/manifest.json"),
      },
      settings: { playing: true },
      api: { positionChanged },
      mediaOverlayHighlight: vi.fn(),
    }) as MediaOverlayModule;
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1)
    );
    try {
      module.trackCurrentTime();
      audioElement.currentTime = 1.4;
      module.trackCurrentTime();
      audioElement.currentTime = 2.2;
      module.trackCurrentTime();
      expect(positionChanged).toHaveBeenCalledTimes(2);
      expect(positionChanged).toHaveBeenLastCalledWith({
        href: "chapter.xhtml",
        time: 2.2,
        spanId: "mo-1",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reports the new position when playback moves to another chapter's audio file", () => {
    const positionChanged = vi.fn();
    const first = { Text: "first.xhtml#mo-1", Audio: "first.mp3#t=0,20" };
    const second = { Text: "second.xhtml#mo-2", Audio: "second.mp3#t=0,20" };
    const audioElement = {
      currentTime: 1,
      src: "https://example.org/first.mp3",
    };
    const module = Object.assign(Object.create(MediaOverlayModule.prototype), {
      navigator: { iframes: [] },
      currentLinks: [{ Href: "first.xhtml" }, { Href: "second.xhtml" }],
      currentLinkIndex: 0,
      mediaOverlayTextAudioPair: first,
      audioElement,
      currentAudioEnd: 20,
      publication: {
        manifestUrl: new URL("https://example.org/manifest.json"),
      },
      settings: { playing: true },
      api: { positionChanged },
      mediaOverlayHighlight: vi.fn(),
    }) as MediaOverlayModule;
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1)
    );
    try {
      module.trackCurrentTime();
      Object.assign(module, {
        currentLinkIndex: 1,
        mediaOverlayTextAudioPair: second,
      });
      audioElement.src = "https://example.org/second.mp3";
      audioElement.currentTime = 0;
      module.trackCurrentTime();
      expect(positionChanged).toHaveBeenCalledTimes(2);
      expect(positionChanged).toHaveBeenLastCalledWith({
        href: "second.xhtml",
        time: 0,
        spanId: "mo-2",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("resumes within a clip using chapter href and audio time", async () => {
    const first = { Text: "chapter.xhtml#mo-1", Audio: "audio.mp3#t=0,8" };
    const middle = { Text: "chapter.xhtml#mo-2", Audio: "audio.mp3#t=8,20" };
    const last = { Text: "chapter.xhtml#mo-3", Audio: "audio.mp3#t=20,28" };
    const root = { initialized: true, Children: [first, middle, last] };
    const playMediaOverlaysAudio = vi.fn();
    const module = Object.assign(Object.create(MediaOverlayModule.prototype), {
      navigator: { rights: { enableMediaOverlays: true } },
      currentLinks: [{ Href: "chapter.xhtml", MediaOverlays: root }],
      publication: {
        manifestUrl: new URL("https://example.org/manifest.json"),
      },
      settings: { playing: false },
      playMediaOverlaysAudio,
      bindClickHandler: vi.fn(),
    }) as MediaOverlayModule;

    expect(
      await module.startReadAlongFromPosition({
        href: "chapter.xhtml",
        time: 15,
      })
    ).toBe(true);
    expect(playMediaOverlaysAudio).toHaveBeenCalledWith(middle, 15, 20);
    const generator = (
      module as unknown as {
        mediaOverlayGenerator: IterableIterator<unknown>;
      }
    ).mediaOverlayGenerator;
    expect(generator.next().value).toBe(last);
  });

  it("resumes the requested chapter when chapters share an audio file", async () => {
    const first = { Text: "first.xhtml#mo-1", Audio: "book.mp3#t=0,10" };
    const second = { Text: "second.xhtml#mo-2", Audio: "book.mp3#t=10,20" };
    const playMediaOverlaysAudio = vi.fn();
    const module = Object.assign(Object.create(MediaOverlayModule.prototype), {
      navigator: { rights: { enableMediaOverlays: true } },
      currentLinks: [
        {
          Href: "first.xhtml",
          MediaOverlays: { initialized: true, Children: [first] },
        },
        {
          Href: "second.xhtml",
          MediaOverlays: { initialized: true, Children: [second] },
        },
      ],
      publication: {
        manifestUrl: new URL("https://example.org/manifest.json"),
      },
      settings: { playing: false },
      playMediaOverlaysAudio,
      bindClickHandler: vi.fn(),
    }) as MediaOverlayModule;

    expect(
      await module.startReadAlongFromPosition({
        href: "second.xhtml",
        time: 15,
      })
    ).toBe(true);
    expect(playMediaOverlaysAudio).toHaveBeenCalledWith(second, 15, 20);
  });

  it("does not report a new file with the previous file's audio time", () => {
    const pair = { Text: "chapter.xhtml#mo-2", Audio: "next.mp3#t=0,8" };
    const module = Object.assign(Object.create(MediaOverlayModule.prototype), {
      currentLinks: [{ Href: "chapter.xhtml" }],
      currentLinkIndex: 0,
      mediaOverlayTextAudioPair: pair,
      audioElement: { src: "https://example.org/previous.mp3", currentTime: 4 },
      publication: {
        manifestUrl: new URL("https://example.org/manifest.json"),
      },
    }) as MediaOverlayModule;
    expect(module.getPlaybackPosition()).toBeUndefined();
  });

  it("does not replace a saved time with the audio element's initial zero before seeking", () => {
    const module = Object.assign(Object.create(MediaOverlayModule.prototype), {
      currentLinks: [{ Href: "chapter.xhtml" }],
      currentLinkIndex: 0,
      mediaOverlayTextAudioPair: {
        Text: "chapter.xhtml#mo-2",
        Audio: "next.mp3#t=10,20",
      },
      currentAudioBegin: 15,
      audioElement: { src: "https://example.org/next.mp3", currentTime: 0 },
      publication: {
        manifestUrl: new URL("https://example.org/manifest.json"),
      },
    }) as MediaOverlayModule;
    expect(module.getPlaybackPosition()).toBeUndefined();
  });
});
