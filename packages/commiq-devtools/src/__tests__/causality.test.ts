import { describe, it, expect, beforeEach } from "vitest";
import {
  buildCausalityIndex,
  buildCommandGroups,
  buildStoreEdges,
  collectChainIds,
  edgeSignature,
  groupKeyOf,
} from "../causality";
import { commandStarted, entry, resetSeq } from "./fixtures";

beforeEach(resetSeq);

describe("buildCausalityIndex", () => {
  it("indexes entries by correlation id and by causedBy", () => {
    const timeline = [
      entry({ correlationId: "e1" }),
      entry({ correlationId: "e2", causedBy: "cmd1" }),
      entry({ correlationId: "e3", causedBy: "cmd1" }),
    ];

    const index = buildCausalityIndex(timeline);

    expect(index.entryByCorrelationId.get("e2")?.correlationId).toBe("e2");
    expect(index.entriesByCausedBy.get("cmd1")?.map((e) => e.correlationId)).toEqual(["e2", "e3"]);
  });

  it("links a command to the event that caused it", () => {
    const timeline = [
      entry({ correlationId: "parentEvent", causedBy: "cmdA" }),
      commandStarted({
        correlationId: "startedB",
        commandId: "cmdB",
        commandName: "sync",
        parentEventId: "parentEvent",
      }),
    ];

    const index = buildCausalityIndex(timeline);

    expect(index.parentEventOfCommand.get("cmdB")).toBe("parentEvent");
    expect(index.commandsByParentEvent.get("parentEvent")).toEqual(["cmdB"]);
  });
});

describe("collectChainIds", () => {
  it("collects siblings, ancestors and descendants of the selected event", () => {
    const timeline = [
      commandStarted({ correlationId: "s1", commandId: "cmd1", commandName: "root" }),
      entry({ correlationId: "rootEvent", causedBy: "cmd1" }),
      commandStarted({
        correlationId: "s2",
        commandId: "cmd2",
        commandName: "child",
        parentEventId: "rootEvent",
      }),
      entry({ correlationId: "childEvent", causedBy: "cmd2" }),
      entry({ correlationId: "unrelated", causedBy: "cmd9" }),
    ];

    const ids = collectChainIds(buildCausalityIndex(timeline), "childEvent");

    expect([...ids].sort()).toEqual(["childEvent", "rootEvent", "s1", "s2"]);
    expect(ids.has("unrelated")).toBe(false);
  });

  it("terminates on a causedBy cycle", () => {
    const timeline = [
      commandStarted({
        correlationId: "sA",
        commandId: "cmdA",
        commandName: "a",
        parentEventId: "eventB",
      }),
      entry({ correlationId: "eventA", causedBy: "cmdA" }),
      commandStarted({
        correlationId: "sB",
        commandId: "cmdB",
        commandName: "b",
        parentEventId: "eventA",
      }),
      entry({ correlationId: "eventB", causedBy: "cmdB" }),
    ];

    const index = buildCausalityIndex(timeline);
    expect(() => collectChainIds(index, "eventA")).not.toThrow();
    expect(collectChainIds(index, "eventA").size).toBe(4);
  });

  it("returns just the id for an unknown correlation id", () => {
    const ids = collectChainIds(buildCausalityIndex([]), "missing");
    expect([...ids]).toEqual(["missing"]);
  });
});

describe("buildCommandGroups", () => {
  it("nests a child command under the group that produced its cause", () => {
    const timeline = [
      commandStarted({ correlationId: "s1", commandId: "cmd1", commandName: "checkout" }),
      entry({ correlationId: "rootEvent", causedBy: "cmd1" }),
      commandStarted({
        correlationId: "s2",
        commandId: "cmd2",
        commandName: "notify",
        parentEventId: "rootEvent",
      }),
    ];

    const roots = buildCommandGroups(buildCausalityIndex(timeline), timeline);

    expect(roots).toHaveLength(1);
    expect(roots[0].commandName).toBe("checkout");
    expect(roots[0].children.map((c) => c.commandName)).toEqual(["notify"]);
  });

  it("does not loop forever when two commands cause each other", () => {
    const timeline = [
      commandStarted({
        correlationId: "sA",
        commandId: "cmdA",
        commandName: "a",
        parentEventId: "eventB",
      }),
      entry({ correlationId: "eventA", causedBy: "cmdA" }),
      commandStarted({
        correlationId: "sB",
        commandId: "cmdB",
        commandName: "b",
        parentEventId: "eventA",
      }),
      entry({ correlationId: "eventB", causedBy: "cmdB" }),
    ];

    const roots = buildCommandGroups(buildCausalityIndex(timeline), timeline);

    expect(roots.length).toBeGreaterThanOrEqual(1);
    expect(countGroups(roots)).toBe(2);
  });

  it("returns an empty list for an empty timeline", () => {
    expect(buildCommandGroups(buildCausalityIndex([]), [])).toEqual([]);
  });

  it("groups uncaused events under their own synthetic root key", () => {
    const orphan = entry({ correlationId: "e1" });
    expect(groupKeyOf(orphan)).toBe("__root_e1");
  });
});

describe("buildStoreEdges", () => {
  it("records a cross-store edge when a command is caused by another store's event", () => {
    const timeline = [
      entry({ correlationId: "cartEvent", causedBy: "cmdCart", storeName: "cart" }),
      commandStarted({
        correlationId: "s2",
        commandId: "cmdShip",
        commandName: "reserve",
        storeName: "shipping",
        parentEventId: "cartEvent",
      }),
    ];

    const edges = buildStoreEdges(buildCausalityIndex(timeline), timeline);

    expect(edges).toHaveLength(1);
    expect(edges[0].from).toBe("cart");
    expect(edges[0].to).toBe("shipping");
    expect([...edges[0].commands]).toEqual(["reserve"]);
  });

  it("ignores same-store causality", () => {
    const timeline = [
      entry({ correlationId: "e1", causedBy: "cmd1", storeName: "cart" }),
      commandStarted({
        correlationId: "s2",
        commandId: "cmd2",
        commandName: "recalc",
        storeName: "cart",
        parentEventId: "e1",
      }),
    ];

    expect(buildStoreEdges(buildCausalityIndex(timeline), timeline)).toEqual([]);
  });

  it("produces a signature that is stable under edge reordering", () => {
    const a = { from: "x", to: "y", commands: new Set(["b", "a"]), count: 2 };
    const b = { from: "y", to: "z", commands: new Set(["c"]), count: 1 };
    expect(edgeSignature([a, b])).toBe(edgeSignature([b, a]));
  });
});

function countGroups(roots: { children: unknown[] }[]): number {
  let total = 0;
  const stack = [...roots];
  while (stack.length > 0) {
    const group = stack.pop() as { children: { children: unknown[] }[] };
    total += 1;
    stack.push(...group.children);
  }
  return total;
}
