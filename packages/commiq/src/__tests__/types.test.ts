import { describe, it, expect } from "vitest";
import { createCommand, createEvent } from "../index";

describe("createCommand", () => {
  it("creates a command with name and data", () => {
    const cmd = createCommand("initUser", { name: "Alice" });
    expect(cmd.name).toBe("initUser");
    expect(cmd.data).toEqual({ name: "Alice" });
  });
});

describe("createEvent", () => {
  it("creates an event definition with symbol id and string name", () => {
    const evt = createEvent("sessionExpired");
    expect(typeof evt.id).toBe("symbol");
    expect(evt.name).toBe("sessionExpired");
  });

  it("creates unique symbols for different events with same name", () => {
    const a = createEvent("test");
    const b = createEvent("test");
    expect(a.id).not.toBe(b.id);
  });
});
