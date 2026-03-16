import { describe, it, expect, vi } from "vitest";
import { createStore, createCommand, createEvent } from "@naikidev/commiq";
import { withLogger, withMeta, withHistory } from "../index";
import type { LogEntry } from "../index";

type State = { count: number };

describe("withLogger", () => {
  it("calls onLog with log entries from command handlers", async () => {
    const entries: LogEntry[] = [];

    const store = createStore<State>({ count: 0 })
      .useExtension(withLogger<State>({ onLog: (entry) => entries.push(entry) }))
      .addCommandHandler("test", (ctx) => {
        ctx.log("info", "handling test command");
        ctx.log("debug", "some detail");
      });

    store.queue(createCommand("test", undefined));
    await store.flush();

    expect(entries).toHaveLength(2);
    expect(entries[0].level).toBe("info");
    expect(entries[0].message).toBe("handling test command");
    expect(entries[1].level).toBe("debug");
    expect(entries[1].message).toBe("some detail");
    expect(entries[0].timestamp).toBeGreaterThan(0);
  });

  it("calls onLog from event handlers", async () => {
    const TestEvent = createEvent("testEvent");
    const entries: LogEntry[] = [];

    const store = createStore<State>({ count: 0 })
      .useExtension(withLogger<State>({ onLog: (entry) => entries.push(entry) }))
      .addCommandHandler("fire", (ctx) => {
        ctx.emit(TestEvent, undefined);
      })
      .addEventHandler(TestEvent, (ctx) => {
        ctx.log("warn", "event received");
      });

    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("warn");
  });

  it("works without onLog handler", async () => {
    const store = createStore<State>({ count: 0 })
      .useExtension(withLogger<State>())
      .addCommandHandler("test", (ctx) => {
        ctx.log("info", "no handler");
      });

    store.queue(createCommand("test", undefined));
    await store.flush();

    expect(store.state.count).toBe(0);
  });
});

describe("withMeta", () => {
  it("provides command metadata in command handlers", async () => {
    const metas: { commandName: string; correlationId: string }[] = [];

    const store = createStore<State>({ count: 0 })
      .useExtension(withMeta<State>())
      .addCommandHandler("increment", (ctx) => {
        metas.push({
          commandName: ctx.meta.commandName,
          correlationId: ctx.meta.correlationId,
        });
      });

    store.queue(createCommand("increment", undefined));
    await store.flush();

    expect(metas).toHaveLength(1);
    expect(metas[0].commandName).toBe("increment");
    expect(metas[0].correlationId).toBeTruthy();
  });

  it("provides event metadata in event handlers", async () => {
    const TestEvent = createEvent("testEvent");
    const metas: { commandName: string }[] = [];

    const store = createStore<State>({ count: 0 })
      .useExtension(withMeta<State>())
      .addCommandHandler("fire", (ctx) => {
        ctx.emit(TestEvent, undefined);
      })
      .addEventHandler(TestEvent, (ctx) => {
        metas.push({ commandName: ctx.meta.commandName });
      });

    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(metas).toHaveLength(1);
    expect(metas[0].commandName).toBe("testEvent");
  });
});

describe("withHistory", () => {
  it("tracks previous states in command handlers", async () => {
    const snapshots: { previous: State | undefined; length: number }[] = [];

    const store = createStore<State>({ count: 0 })
      .useExtension(withHistory<State>())
      .addCommandHandler("inc", (ctx) => {
        snapshots.push({
          previous: ctx.history.previous,
          length: ctx.history.entries.length,
        });
        ctx.setState({ count: ctx.state.count + 1 });
      });

    store.queue(createCommand("inc", undefined));
    store.queue(createCommand("inc", undefined));
    store.queue(createCommand("inc", undefined));
    await store.flush();

    expect(snapshots[0].previous).toBeUndefined();
    expect(snapshots[0].length).toBe(1);

    expect(snapshots[1].previous).toEqual({ count: 0 });
    expect(snapshots[1].length).toBe(2);

    expect(snapshots[2].previous).toEqual({ count: 1 });
    expect(snapshots[2].length).toBe(3);
  });

  it("respects maxEntries option", async () => {
    const lengths: number[] = [];

    const store = createStore<State>({ count: 0 })
      .useExtension(withHistory<State>({ maxEntries: 2 }))
      .addCommandHandler("inc", (ctx) => {
        lengths.push(ctx.history.entries.length);
        ctx.setState({ count: ctx.state.count + 1 });
      });

    store.queue(createCommand("inc", undefined));
    store.queue(createCommand("inc", undefined));
    store.queue(createCommand("inc", undefined));
    store.queue(createCommand("inc", undefined));
    await store.flush();

    expect(lengths).toEqual([1, 2, 2, 2]);
  });
});
