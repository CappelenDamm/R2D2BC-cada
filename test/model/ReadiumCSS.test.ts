/*
 * Copyright 2018-2025 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import { describe, it, expect } from "vitest";
import { ReadiumCSS } from "../../src/model/user-settings/ReadiumCSS";

describe("ReadiumCSS constants", () => {
  it("every KEY follows the --USER__<ref> pattern", () => {
    const keyEntries = Object.entries(ReadiumCSS).filter(
      ([name]) =>
        name.endsWith("_KEY") && typeof (ReadiumCSS as any)[name] === "string"
    );

    expect(keyEntries.length).toBeGreaterThan(0);

    for (const [name, value] of keyEntries) {
      expect(value).toMatch(/^--USER__\w+$/);
      // Corresponding REF should exist
      const refName = name.replace("_KEY", "_REF");
      expect((ReadiumCSS as any)[refName]).toBeDefined();
      // KEY must equal "--USER__" + REF
      expect(value).toBe("--USER__" + (ReadiumCSS as any)[refName]);
    }
  });

  it("has KEY/REF pairs for all 6 new v2.5 properties", () => {
    const newProps = [
      "BODY_HYPHENS",
      "PARA_SPACING",
      "PARA_INDENT",
      "TYPE_SCALE",
      "BACKGROUND_COLOR",
      "TEXT_COLOR",
    ];

    for (const prop of newProps) {
      const ref = (ReadiumCSS as any)[prop + "_REF"];
      const key = (ReadiumCSS as any)[prop + "_KEY"];
      expect(ref).toBeDefined();
      expect(key).toBeDefined();
      expect(key).toBe("--USER__" + ref);
    }
  });

  it("has all original properties", () => {
    const origProps = [
      "FONT_SIZE",
      "FONT_FAMILY",
      "FONT_OVERRIDE",
      "APPEARANCE",
      "SCROLL",
      "ADVANCED_SETTINGS",
      "TEXT_ALIGNMENT",
      "COLUMN_COUNT",
      "DIRECTION",
      "WORD_SPACING",
      "LETTER_SPACING",
      "PAGE_MARGINS",
      "LINE_HEIGHT",
    ];

    for (const prop of origProps) {
      expect((ReadiumCSS as any)[prop + "_REF"]).toBeDefined();
      expect((ReadiumCSS as any)[prop + "_KEY"]).toBeDefined();
    }
  });
});
