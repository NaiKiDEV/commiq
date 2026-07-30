import { describe, it, expect, vi } from "vitest";
import {
  createStore,
  createCommand,
  createCommandDef,
  createEvent,
} from "@naikidev/commiq";
import type { Disposable, StoreErrorReport } from "@naikidev/commiq";
import { extendStore, withGuard, withHistory, withLogger } from "../index";
import type { ContextExtensionFactory } from "../index";

type State = { value: number };

const withNow = <S>(): ContextExtensionFactory<S, { now: () => number }> => () => ({
  command: () => ({ now: () => 42 }),
});

describe("extendStore", () => {
  it("supports custom extensions declared with ContextExtensionFactory", async () => {
    const store = createStore<State>({ value: 0 });
    extendStore(store)
      .use(withNow<State>())
      .addCommandHandler("run", (ctx) => {
        ctx.setState({ value: ctx.now() });
      });

    store.queue(createCommand("run", undefined));
    await store.flush();

    expect(store.state.value).toBe(42);
  });

  it("composes multiple extensions on both context kinds", async () => {
    const TestEvent = createEvent("tick");
    const logs: string[] = [];

    const store = createStore<State>({ value: 0 });
    const extended = extendStore(store)
      .use(withLogger<State>({ onLog: (entry) => logs.push(entry.message) }))
      .use(withHistory<State>())
      .use(withGuard<State>());

    extended.addCommandHandler("run", (ctx) => {
      ctx.guard(true, "always fine");
      ctx.log("info", `entries:${ctx.history.entries.length}`);
      ctx.setState({ value: 1 });
      ctx.emit(TestEvent, undefined);
    });
    extended.addEventHandler(TestEvent, (ctx) => {
      ctx.log("info", `event-entries:${ctx.history.entries.length}`);
    });

    store.queue(createCommand("run", undefined));
    await store.flush();

    expect(logs).toEqual(["entries:1", "event-entries:2"]);
  });

  it("supports command definitions and returns an unsubscribe for event handlers", async () => {
    const Run = createCommandDef<number>("run");
    const TestEvent = createEvent("tick");
    const seen: number[] = [];

    const store = createStore<State>({ value: 0 });
    const extended = extendStore(store).use(withNow<State>());

    extended.addCommandHandler(Run, (ctx, cmd) => {
      ctx.setState({ value: cmd.data + ctx.now() });
      ctx.emit(TestEvent, undefined);
    });
    const unsubscribe = extended.addEventHandler(TestEvent, () => {
      seen.push(store.state.value);
    });

    store.queue(Run, 1);
    await store.flush();
    expect(seen).toEqual([43]);

    unsubscribe();
    store.queue(Run, 2);
    await store.flush();

    expect(seen).toEqual([43]);
    expect(store.state.value).toBe(44);
  });

  it("reports conflicting extension keys through the error channel", async () => {
    const reports: StoreErrorReport[] = [];
    const store = createStore<State>(
      { value: 0 },
      { onError: (report) => reports.push(report) },
    );

    extendStore(store)
      .use(withNow<State>())
      .use(withNow<State>())
      .addCommandHandler("run", () => {});

    store.queue(createCommand("run", undefined));
    await store.flush();

    expect(reports).toHaveLength(1);
    expect((reports[0].error as Error).message).toContain('"now"');
  });

  it("routes a throwing afterCommand hook to the error channel", async () => {
    const reports: StoreErrorReport[] = [];
    const store = createStore<State>(
      { value: 0 },
      { onError: (report) => reports.push(report) },
    );

    const withBrokenHook = (): ContextExtensionFactory<State> => () => ({
      afterCommand: () => {
        throw new Error("hook exploded");
      },
    });

    extendStore(store)
      .use(withBrokenHook())
      .addCommandHandler("run", (ctx) => {
        ctx.setState({ value: 1 });
      });

    store.queue(createCommand("run", undefined));
    await store.flush();

    expect(store.state.value).toBe(1);
    expect(reports).toHaveLength(1);
    expect(reports[0].source).toBe("contextExtension");
    expect((reports[0].error as Error).message).toBe("hook exploded");
  });

  it("runs every afterCommand hook even when an earlier one throws", async () => {
    const store = createStore<State>({ value: 0 }, { onError: () => {} });
    const second = vi.fn();

    const broken = (): ContextExtensionFactory<State> => () => ({
      afterCommand: () => {
        throw new Error("first hook exploded");
      },
    });
    const healthy = (): ContextExtensionFactory<State> => () => ({
      afterCommand: second,
    });

    extendStore(store)
      .use(broken())
      .use(healthy())
      .addCommandHandler("run", () => {});

    store.queue(createCommand("run", undefined));
    await store.flush();

    expect(second).toHaveBeenCalledOnce();
  });

  it("destroy is idempotent and calls each extension destroy once", () => {
    const store = createStore<State>({ value: 0 });
    const disposed = vi.fn();

    const withDisposable = (): ContextExtensionFactory<State> => () => ({
      destroy: disposed,
    });

    const host: Disposable = extendStore(store).use(withDisposable());

    host.destroy();
    host.destroy();
    host.destroy();

    expect(disposed).toHaveBeenCalledOnce();
  });

  it("rejects adding extensions after destroy", () => {
    const store = createStore<State>({ value: 0 });
    const extended = extendStore(store).use(withNow<State>());

    extended.destroy();

    expect(() => extended.use(withGuard<State>())).toThrow(
      /destroyed extension host/,
    );
  });

  it("keeps two hosts over the same factory isolated", async () => {
    const factory = withHistory<State>();
    const storeA = createStore<State>({ value: 0 });
    const storeB = createStore<State>({ value: 0 });

    const hostA = extendStore(storeA).use(factory);
    const hostB = extendStore(storeB).use(factory);

    const lengths: number[] = [];
    hostA.addCommandHandler("inc", (ctx) => {
      ctx.setState({ value: ctx.state.value + 1 });
      lengths.push(ctx.history.entries.length);
    });
    hostB.addCommandHandler("inc", (ctx) => {
      ctx.setState({ value: ctx.state.value + 1 });
      lengths.push(ctx.history.entries.length);
    });

    storeA.queue(createCommand("inc", undefined));
    await storeA.flush();

    hostA.destroy();

    storeB.queue(createCommand("inc", undefined));
    await storeB.flush();

    expect(lengths).toEqual([2, 2]);
  });
});
