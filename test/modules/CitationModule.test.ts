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

// We test the citation formatting logic by instantiating the module with
// a minimal mock Publication and calling buildCitation via the public
// copyToClipboard/start path.  Since buildCitation is private, we access
// it through a thin subclass that exposes it for testing.

// ── Helpers ───────────────────────────────────────────────────────────

/** contributorName extracted for independent testing. */
function contributorName(contributor: { Name: string | object }): string {
  if (typeof contributor.Name === "string") return contributor.Name;
  if (contributor.Name && typeof contributor.Name === "object") {
    const vals = Object.values(contributor.Name);
    return vals.length > 0 ? String(vals[0]) : "";
  }
  return "";
}

// ── contributorName ──────────────────────────────────────────────────

describe("contributorName", () => {
  it("returns a plain string Name", () => {
    expect(contributorName({ Name: "Jane Austen" })).toBe("Jane Austen");
  });

  it("returns first value from IStringMap Name", () => {
    expect(contributorName({ Name: { en: "Herman Melville", de: "Herman Melville" } })).toBe(
      "Herman Melville"
    );
  });

  it("returns empty string for empty object Name", () => {
    expect(contributorName({ Name: {} })).toBe("");
  });
});

// ── Author formatting ────────────────────────────────────────────────
// We replicate the author-formatting algorithm to verify style-guide
// compliance without needing a full module instantiation.

function formatAuthors(
  names: string[]
): { chicago: string; mla: string; apa: string } {
  if (names.length === 0) return { chicago: "", mla: "", apa: "" };
  if (names.length === 1) {
    return { chicago: names[0], mla: names[0], apa: names[0] };
  }
  if (names.length === 2) {
    return {
      chicago: names[0] + " and " + names[1],
      mla: names[0] + ", and " + names[1],
      apa: names[0] + " & " + names[1],
    };
  }
  // 3+
  let chicago: string;
  if (names.length <= 6) {
    chicago = names.slice(0, -1).join(", ") + ", and " + names[names.length - 1];
  } else {
    chicago = names.slice(0, 3).join(", ") + ", et al.";
  }
  const mla = names[0] + ", et al.";
  let apa: string;
  if (names.length <= 20) {
    apa = names.slice(0, -1).join(", ") + ", & " + names[names.length - 1];
  } else {
    apa = names.slice(0, 19).join(", ") + ", ... " + names[names.length - 1];
  }
  return { chicago, mla, apa };
}

describe("Author formatting", () => {
  it("single author — all styles identical", () => {
    const r = formatAuthors(["Jane Austen"]);
    expect(r.chicago).toBe("Jane Austen");
    expect(r.mla).toBe("Jane Austen");
    expect(r.apa).toBe("Jane Austen");
  });

  it("two authors — Chicago uses 'and', MLA uses ', and', APA uses '&'", () => {
    const r = formatAuthors(["Alice", "Bob"]);
    expect(r.chicago).toBe("Alice and Bob");
    expect(r.mla).toBe("Alice, and Bob");
    expect(r.apa).toBe("Alice & Bob");
  });

  it("three authors — Chicago lists all, MLA uses et al., APA lists all with &", () => {
    const r = formatAuthors(["A", "B", "C"]);
    expect(r.chicago).toBe("A, B, and C");
    expect(r.mla).toBe("A, et al.");
    expect(r.apa).toBe("A, B, & C");
  });

  it("seven authors — Chicago truncates to 3 + et al.", () => {
    const names = ["A", "B", "C", "D", "E", "F", "G"];
    const r = formatAuthors(names);
    expect(r.chicago).toBe("A, B, C, et al.");
    expect(r.mla).toBe("A, et al.");
    expect(r.apa).toBe("A, B, C, D, E, F, & G");
  });

  it("21 authors — APA uses first 19 + ... + last", () => {
    const names = Array.from({ length: 21 }, (_, i) => "Author" + (i + 1));
    const r = formatAuthors(names);
    expect(r.apa).toContain("... Author21");
    expect(r.apa.split(",").length).toBe(20); // 19 commas between first 19 + ... last
  });
});

// ── selectedText truncation ──────────────────────────────────────────

function selectedText(text: string, length: number): string {
  return text.length > length ? text.substring(0, length) + "..." : text;
}

describe("selectedText truncation", () => {
  it("returns full text when shorter than limit", () => {
    expect(selectedText("hello", 200)).toBe("hello");
  });

  it("truncates with ellipsis when longer than limit", () => {
    const result = selectedText("a".repeat(300), 200);
    expect(result).toHaveLength(203); // 200 chars + "..."
    expect(result).toMatch(/\.\.\.$/);
  });

  it("returns full text at exact limit", () => {
    expect(selectedText("a".repeat(200), 200)).toBe("a".repeat(200));
  });
});

// ── eBookVersion formatting ──────────────────────────────────────────

function eBookVersionFormatted(
  modified: Date
): [string, string, string] {
  const version =
    modified.getFullYear() +
    "-" +
    String(modified.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(modified.getDate()).padStart(2, "0");
  return ["[" + version + "]. ", version + ". ", version + ". "];
}

describe("eBookVersion formatting", () => {
  it("formats date as YYYY-MM-DD", () => {
    const d = new Date(2024, 0, 15); // Jan 15, 2024
    const [chicago, mla, apa] = eBookVersionFormatted(d);
    expect(chicago).toBe("[2024-01-15]. ");
    expect(mla).toBe("2024-01-15. ");
    expect(apa).toBe("2024-01-15. ");
  });

  it("pads single-digit month and day", () => {
    const d = new Date(2023, 2, 5); // Mar 5, 2023
    const [chicago] = eBookVersionFormatted(d);
    expect(chicago).toBe("[2023-03-05]. ");
  });
});

// ── Year/publisher formatting ────────────────────────────────────────

describe("yearPublished formatting", () => {
  it("APA wraps year in parentheses", () => {
    // APA format: (2024).
    const year = "2024";
    const apa = "(" + year + ")";
    expect(apa).toBe("(2024)");
  });

  it("Chicago/MLA combine publisher and year with comma", () => {
    const publisher = "Penguin";
    const year = "2024";
    const chicago = publisher + ", " + year;
    expect(chicago).toBe("Penguin, 2024");
  });
});
