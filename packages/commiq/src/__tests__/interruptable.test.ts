import { describe, it, expect, vi } from "vitest";
import { createStore, createCommand, BuiltinEvent, matchEvent } from "../index";
import type { StoreEvent, Command } from "../types";

describe("interruptable commands", () => {
  it("interruptable handler receives a working signal", async () => {
    const store = createStore({ value: "" });
    let receivedSignal: AbortSignal | undefined;

    store.addCommandHandler("fetch", (ctx) => {
      receivedSignal = ctx.signal;
      ctx.setState({ value: "done" });
    }, { interruptable: true });

    store.queue(createCommand("fetch", undefined));
    await store.flush();

    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(receivedSignal!.aborted).toBe(false);
    expect(store.state.value).toBe("done");
  });

  it("non-interruptable handler does not receive signal", async () => {
    const store = createStore({ value: "" });
    let receivedSignal: AbortSignal | undefined = undefined;

    store.addCommandHandler("sync", (ctx) => {
      receivedSignal = ctx.signal;
      ctx.setState({ value: "done" });
    });

    store.queue(createCommand("sync", undefined));
    await store.flush();

    expect(receivedSignal).toBeUndefined();
  });

  it("re-queuing same command aborts running handler", async () => {
    const store = createStore({ value: "" });
    const interrupted: Array<{ command: Command; phase: string }> = [];

    store.openStream((event: StoreEvent) => {
      if (matchEvent(event, BuiltinEvent.CommandInterrupted)) {
        interrupted.push(event.data);
      }
    });

    store.addCommandHandler("search", async (ctx) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (!ctx.signal!.aborted) {
        ctx.setState({ value: ctx.state.value + "x" });
      }
    }, { interruptable: true });

    store.queue(createCommand("search", undefined));
    // Queue another while first is running — this triggers abort on first
    await new Promise((r) => setTimeout(r, 10));
    store.queue(createCommand("search", undefined));
    await store.flush();

    expect(interrupted.some((e) => e.phase === "running")).toBe(true);
    // Only the second command should complete
    expect(store.state.value).toBe("x");
  });

  it("re-queuing removes queued (not-yet-started) duplicates", async () => {
    const store = createStore({ count: 0 });
    const interrupted: Array<{ command: Command; phase: string }> = [];

    store.openStream((event: StoreEvent) => {
      if (matchEvent(event, BuiltinEvent.CommandInterrupted)) {
        interrupted.push(event.data);
      }
    });

    // Use a slow blocking handler to ensure queue builds up
    store.addCommandHandler("block", async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    store.addCommandHandler<number>("update", (ctx, cmd) => {
      ctx.setState({ count: cmd.data });
    }, { interruptable: true });

    // Queue a blocking command first, then multiple updates
    store.queue(createCommand("block", undefined));
    store.queue(createCommand("update", 1));
    store.queue(createCommand("update", 2));
    // This should remove the queued "update 1" and "update 2"
    store.queue(createCommand("update", 3));

    await store.flush();

    const queuedInterrupts = interrupted.filter((e) => e.phase === "queued");
    expect(queuedInterrupts).toHaveLength(2);
    expect(store.state.count).toBe(3);
  });

  it("CommandInterrupted event has correct phase for queued commands", async () => {
    const store = createStore({ value: "" });
    const phases: string[] = [];

    store.openStream((event: StoreEvent) => {
      if (matchEvent(event, BuiltinEvent.CommandInterrupted)) {
        phases.push(event.data.phase);
      }
    });

    store.addCommandHandler("block", async () => {
      await new Promise((r) => setTimeout(r, 30));
    });

    store.addCommandHandler("task", (ctx) => {
      ctx.setState({ value: "done" });
    }, { interruptable: true });

    store.queue(createCommand("block", undefined));
    store.queue(createCommand("task", undefined));
    store.queue(createCommand("task", undefined)); // replaces the queued one

    await store.flush();

    expect(phases).toContain("queued");
  });

  it("multiple rapid re-queues: only last one runs", async () => {
    const store = createStore({ value: "" });
    const handled: number[] = [];

    store.addCommandHandler("block", async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    store.addCommandHandler<number>("rapid", (ctx, cmd) => {
      handled.push(cmd.data);
      ctx.setState({ value: String(cmd.data) });
    }, { interruptable: true });

    store.queue(createCommand("block", undefined));
    store.queue(createCommand("rapid", 1));
    store.queue(createCommand("rapid", 2));
    store.queue(createCommand("rapid", 3));
    store.queue(createCommand("rapid", 4));
    store.queue(createCommand("rapid", 5));

    await store.flush();

    expect(handled).toEqual([5]);
    expect(store.state.value).toBe("5");
  });

  it("non-interruptable handlers are unaffected by interruptable logic", async () => {
    const store = createStore({ values: [] as number[] });

    store.addCommandHandler<number>("append", (ctx, cmd) => {
      ctx.setState({ values: [...ctx.state.values, cmd.data] });
    });

    store.queue(createCommand("append", 1));
    store.queue(createCommand("append", 2));
    store.queue(createCommand("append", 3));
    await store.flush();

    expect(store.state.values).toEqual([1, 2, 3]);
  });

  it("handler that throws AbortError when aborted emits CommandInterrupted", async () => {
    const store = createStore({ value: "" });
    const events: string[] = [];

    store.openStream((event: StoreEvent) => {
      if (event.id === BuiltinEvent.CommandInterrupted.id) events.push("interrupted");
      if (event.id === BuiltinEvent.CommandHandlingError.id) events.push("error");
    });

    store.addCommandHandler("abortable", async (ctx) => {
      await new Promise((resolve, reject) => {
        ctx.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        setTimeout(resolve, 100);
      });
      ctx.setState({ value: "done" });
    }, { interruptable: true });

    store.queue(createCommand("abortable", undefined));
    await new Promise((r) => setTimeout(r, 10));
    store.queue(createCommand("abortable", undefined));
    await store.flush();

    expect(events).toContain("interrupted");
    expect(events).not.toContain("error");
  });
});
