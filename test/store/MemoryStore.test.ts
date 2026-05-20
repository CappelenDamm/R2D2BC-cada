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
import MemoryStore from "../../src/store/MemoryStore";

describe("MemoryStore", () => {
  it("returns null for unknown keys", () => {
    const store = new MemoryStore();
    expect(store.get("nonexistent")).toBeNull();
  });

  it("stores and retrieves a value", () => {
    const store = new MemoryStore();
    store.set("key1", "value1");
    expect(store.get("key1")).toBe("value1");
  });

  it("overwrites an existing value", () => {
    const store = new MemoryStore();
    store.set("key1", "first");
    store.set("key1", "second");
    expect(store.get("key1")).toBe("second");
  });

  it("remove sets key to null", () => {
    const store = new MemoryStore();
    store.set("key1", "value1");
    store.remove("key1");
    expect(store.get("key1")).toBeNull();
  });

  it("different keys are independent", () => {
    const store = new MemoryStore();
    store.set("a", "1");
    store.set("b", "2");
    expect(store.get("a")).toBe("1");
    expect(store.get("b")).toBe("2");
    store.remove("a");
    expect(store.get("a")).toBeNull();
    expect(store.get("b")).toBe("2");
  });

  it("stores JSON strings", () => {
    const store = new MemoryStore();
    const obj = { fontSize: 100, fontFamily: "serif" };
    store.set("settings", JSON.stringify(obj));
    const result = JSON.parse(store.get("settings")!);
    expect(result.fontSize).toBe(100);
    expect(result.fontFamily).toBe("serif");
  });

  it("two MemoryStore instances are isolated", () => {
    const s1 = new MemoryStore();
    const s2 = new MemoryStore();
    s1.set("key", "from-s1");
    expect(s2.get("key")).toBeNull();
  });
});
