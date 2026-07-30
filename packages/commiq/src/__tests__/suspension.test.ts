import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createStore,
  createCommand,
  createCommandDef,
  BuiltinEvent,
} from "../index";
import type { StoreErrorReport } from "../index";
import { createGate } from "./gate";

type State = { count: number; log: string[] };

const Push = createCommandDef<string>("push");

const initialState = (): State => ({ count: 0, log: [] });

async function settleMicrotasks(turns = 100): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
}

function track(promise: Promise<void>): { isSettled: () => boolean } {
  let isSettled = false;
  void promise.then(() => {
    isSettled = true;
  });
  return { isSettled: () => isSettled };
}

function createLoggingStore(options?: { suspendWarningMs?: number }) {
  const reports: StoreErrorReport[] = [];
  const store = createStore<State>(initialState(), {
    onError: (report) => reports.push(report),
    suspendWarningMs: options?.suspendWarningMs ?? 0,
  }).addCommandHandler(Push, (ctx, cmd) => {
    ctx.setState({ ...ctx.state, log: [...ctx.state.log, cmd.data] });
  });
  return { store, reports };
}

describe("queue suspension", () => {
  it("holds queued commands until the gate is released, preserving order", async () => {
    const { store } = createLoggingStore();

    const release = store.suspend();
    expect(store.isSuspended).toBe(true);

    store.queue(Push, "a");
    store.queue(Push, "b");
    store.queue(Push, "c");

    await settleMicrotasks();
    expect(store.state.log).toEqual([]);

    release();
    expect(store.isSuspended).toBe(false);
    await store.flush();

    expect(store.state.log).toEqual(["a", "b", "c"]);
    store.destroy();
  });

  it("returns a working CommandHandle for commands queued while suspended", async () => {
    const { store } = createLoggingStore();

    const release = store.suspend();
    const handle = store.queue(Push, "a");

    expect(handle.command.name).toBe("push");
    expect(handle.correlationId).toEqual(expect.any(String));

    await settleMicrotasks();
    release();

    const result = await handle;
    expect(result.status).toBe("handled");
    store.destroy();
  });

  it("requires every suspender to release before processing resumes", async () => {
    const { store } = createLoggingStore();

    const releaseFirst = store.suspend();
    const releaseSecond = store.suspend();

    store.queue(Push, "a");

    releaseFirst();
    await settleMicrotasks();
    expect(store.isSuspended).toBe(true);
    expect(store.state.log).toEqual([]);

    releaseSecond();
    await store.flush();

    expect(store.state.log).toEqual(["a"]);
    store.destroy();
  });

  it("treats release() as idempotent", async () => {
    const { store } = createLoggingStore();

    const releaseFirst = store.suspend();
    const releaseSecond = store.suspend();

    releaseFirst();
    releaseFirst();
    releaseFirst();
    expect(store.isSuspended).toBe(true);

    releaseSecond();
    expect(store.isSuspended).toBe(false);

    store.queue(Push, "a");
    await store.flush();
    expect(store.state.log).toEqual(["a"]);
    store.destroy();
  });

  it("keeps interrupt deduplication working while suspended", async () => {
    const { store } = createLoggingStore();
    store.addCommandHandler(
      "latest",
      (ctx, cmd: { data: string }) => {
        ctx.setState({ ...ctx.state, log: [...ctx.state.log, cmd.data] });
      },
      { interruptable: true },
    );

    const release = store.suspend();
    const first = store.queue(createCommand("latest", "old"));
    store.queue(createCommand("latest", "new"));

    expect((await first).status).toBe("interrupted");

    release();
    await store.flush();

    expect(store.state.log).toEqual(["new"]);
    store.destroy();
  });

  describe("flush()", () => {
    it("resolves immediately when the store is already quiescent", async () => {
      const { store } = createLoggingStore();
      const release = store.suspend();

      const flushed = track(store.flush());
      await settleMicrotasks();

      expect(flushed.isSettled()).toBe(true);
      release();
      store.destroy();
    });

    it("waits for the gate to open and the queue to drain", async () => {
      const { store } = createLoggingStore();
      const release = store.suspend();
      store.queue(Push, "a");

      const flushed = track(store.flush());
      await settleMicrotasks();
      expect(flushed.isSettled()).toBe(false);

      release();
      await store.flush();

      expect(flushed.isSettled()).toBe(true);
      expect(store.state.log).toEqual(["a"]);
      store.destroy();
    });

    it("still throws when called from inside a handler while suspended", async () => {
      const reports: StoreErrorReport[] = [];
      const store = createStore<State>(initialState(), {
        onError: (report) => reports.push(report),
        suspendWarningMs: 0,
      }).addCommandHandler("trap", () => {
        const release = store.suspend();
        try {
          store.flush();
        } finally {
          release();
        }
      });

      const result = await store.queue(createCommand("trap", undefined));

      expect(result.status).toBe("failed");
      expect(reports.map((report) => report.source)).toEqual(["commandHandler"]);
      store.destroy();
    });
  });

  describe("destroy()", () => {
    it("releases the gate and settles pending flush callers", async () => {
      const { store } = createLoggingStore();
      const release = store.suspend();
      const handle = store.queue(Push, "a");
      const flushed = track(store.flush());

      await settleMicrotasks();
      expect(flushed.isSettled()).toBe(false);

      store.destroy();
      await settleMicrotasks();

      expect(flushed.isSettled()).toBe(true);
      expect((await handle).status).toBe("discarded");
      expect(store.isSuspended).toBe(false);

      release();
      expect(store.state.log).toEqual([]);
    });

    it("reports suspend() calls made after destroy", () => {
      const { store, reports } = createLoggingStore();
      store.destroy();

      const release = store.suspend();
      release();

      expect(reports.map((report) => report.source)).toEqual(["destroyedStore"]);
      expect(store.isSuspended).toBe(false);
    });
  });

  describe("event dispatch", () => {
    it("keeps dispatching events and replaceState while commands are gated", async () => {
      const { store } = createLoggingStore();
      const gate = createGate();
      const handled: string[] = [];
      const observed: string[] = [];

      store.openStream((event) => observed.push(event.name));
      store.addEventHandler(BuiltinEvent.StateReset, async (ctx) => {
        handled.push("reset");
        ctx.queue(Push, "fromEvent");
        await gate.wait();
      });

      const release = store.suspend();
      store.replaceState({ count: 5, log: [] });

      await gate.parked();

      expect(store.state.count).toBe(5);
      expect(handled).toEqual(["reset"]);
      expect(observed).toContain("stateChanged");
      expect(observed).toContain("stateReset");
      expect(store.state.log).toEqual([]);

      gate.release();
      release();
      await store.flush();

      expect(store.state.log).toEqual(["fromEvent"]);
      store.destroy();
    });
  });

  describe("safety valve", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("reports a gate held beyond the warning threshold", () => {
      vi.useFakeTimers();
      const { store, reports } = createLoggingStore({ suspendWarningMs: 50 });

      const release = store.suspend();
      vi.advanceTimersByTime(50);

      expect(reports).toHaveLength(1);
      expect(reports[0].source).toBe("suspendedQueue");
      expect((reports[0].error as Error).message).toContain("50ms");

      release();
      vi.advanceTimersByTime(1000);
      expect(reports).toHaveLength(1);
      store.destroy();
    });

    it("cancels the warning when released in time", () => {
      vi.useFakeTimers();
      const { store, reports } = createLoggingStore({ suspendWarningMs: 50 });

      store.suspend()();
      vi.advanceTimersByTime(500);

      expect(reports).toEqual([]);
      store.destroy();
    });

    it("clears the warning timer on destroy", () => {
      vi.useFakeTimers();
      const { store, reports } = createLoggingStore({ suspendWarningMs: 50 });

      store.suspend();
      store.destroy();
      vi.advanceTimersByTime(500);

      expect(reports).toEqual([]);
    });

    it("is disabled when suspendWarningMs is zero", () => {
      vi.useFakeTimers();
      const { store, reports } = createLoggingStore({ suspendWarningMs: 0 });

      store.suspend();
      vi.advanceTimersByTime(100000);

      expect(reports).toEqual([]);
      store.destroy();
    });
  });
});
