import { describe, it, expect } from "vitest";
import { buildChainIndex, collectChain } from "../chain";
import type { TimelineEntry } from "../types";

function entry(overrides: Partial<TimelineEntry> & { correlationId: string }): TimelineEntry {
  return {
    seq: 0,
    storeName: "s",
    type: "event",
    name: "e",
    eventId: "e",
    data: undefined,
    causedBy: null,
    timestamp: 0,
    ...overrides,
  };
}

describe("collectChain", () => {
  it("returns entries ordered by seq", () => {
    const index = buildChainIndex([
      entry({ correlationId: "c", causedBy: "root", seq: 3 }),
      entry({ correlationId: "a", causedBy: "root", seq: 1 }),
      entry({ correlationId: "b", causedBy: "root", seq: 2 }),
    ]);

    expect(collectChain(index, "root").map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it("walks transitively downstream", () => {
    const index = buildChainIndex([
      entry({ correlationId: "a", causedBy: "root", seq: 1 }),
      entry({ correlationId: "b", causedBy: "a", seq: 2 }),
      entry({ correlationId: "c", causedBy: "b", seq: 3 }),
    ]);

    expect(collectChain(index, "root").map((e) => e.correlationId)).toEqual(["a", "b", "c"]);
  });

  it("walks up to the root from a leaf", () => {
    const index = buildChainIndex([
      entry({ correlationId: "a", causedBy: "root", seq: 1 }),
      entry({ correlationId: "b", causedBy: "a", seq: 2 }),
      entry({ correlationId: "c", causedBy: "b", seq: 3 }),
    ]);

    expect(collectChain(index, "c").map((e) => e.correlationId)).toEqual(["a", "b", "c"]);
  });

  it("bridges through command entries", () => {
    const index = buildChainIndex([
      entry({ correlationId: "evt", causedBy: "cmd1", seq: 1, name: "userCreated" }),
      entry({
        correlationId: "started",
        causedBy: "cmd2",
        seq: 2,
        type: "command",
        name: "commandStarted",
        data: { command: { correlationId: "cmd2", causedBy: "evt" } },
      }),
      entry({ correlationId: "changed", causedBy: "cmd2", seq: 3, name: "stateChanged" }),
    ]);

    expect(collectChain(index, "cmd1").map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(collectChain(index, "changed").map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it("terminates on a causedBy cycle instead of hanging", () => {
    const index = buildChainIndex([
      entry({ correlationId: "a", causedBy: "b", seq: 1 }),
      entry({ correlationId: "b", causedBy: "a", seq: 2 }),
    ]);

    expect(collectChain(index, "a").map((e) => e.seq)).toEqual([1, 2]);
    expect(collectChain(index, "b").map((e) => e.seq)).toEqual([1, 2]);
  });

  it("terminates on a self-referencing entry", () => {
    const index = buildChainIndex([entry({ correlationId: "a", causedBy: "a", seq: 1 })]);
    expect(collectChain(index, "a").map((e) => e.seq)).toEqual([1]);
  });

  it("returns nothing for an unknown id", () => {
    const index = buildChainIndex([entry({ correlationId: "a", seq: 1 })]);
    expect(collectChain(index, "zzz")).toEqual([]);
  });
});
