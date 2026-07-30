import { describe, it, expect, vi } from "vitest";
import {
  createStore,
  createCommand,
  createEvent,
  BuiltinEvent,
  matchEvent,
} from "@naikidev/commiq";
import type { StoreErrorReport } from "@naikidev/commiq";
import {
  AssertionError,
  ContextCheckError,
  GuardError,
  withPatch,
  withDefer,
  withInjector,
  withGuard,
  withAssert,
} from "../index";

describe("withPatch", () => {
  type State = { name: string; count: number; active: boolean };

  it("shallow-merges partial state", async () => {
    const store = createStore<State>({
      name: "test",
      count: 0,
      active: false,
    });
    store.useExtension(withPatch<State>()).addCommandHandler("activate", (ctx) => {
      ctx.patch({ active: true, count: ctx.state.count + 1 });
    });

    store.queue(createCommand("activate", undefined));
    await store.flush();

    expect(store.state).toEqual({ name: "test", count: 1, active: true });
  });

  it("preserves unpatched fields", async () => {
    const store = createStore<State>({
      name: "original",
      count: 5,
      active: true,
    });
    store
      .useExtension(withPatch<State>())
      .addCommandHandler<string>("rename", (ctx, cmd) => {
        ctx.patch({ name: cmd.data });
      });

    store.queue(createCommand("rename", "updated"));
    await store.flush();

    expect(store.state).toEqual({
      name: "updated",
      count: 5,
      active: true,
    });
  });

  it("is not available on event handler contexts", () => {
    const TestEvent = createEvent("patchAttempt");
    const store = createStore<State>({
      name: "test",
      count: 0,
      active: false,
    });

    store
      .useExtension(withPatch<State>())
      // @ts-expect-error patch is command-only and must not be typed on event contexts
      .addEventHandler(TestEvent, (ctx) => ctx.patch({ active: true }));

    expect(store.state.active).toBe(false);
  });
});

describe("withDefer", () => {
  type State = { value: number };

  it("runs deferred callbacks after handler completes", async () => {
    const order: string[] = [];

    const store = createStore<State>({ value: 0 });
    store.useExtension(withDefer<State>()).addCommandHandler("work", (ctx) => {
      ctx.defer(() => {
        order.push("deferred-1");
      });
      ctx.defer(() => {
        order.push("deferred-2");
      });
      order.push("handler");
      ctx.setState({ value: 1 });
    });

    store.queue(createCommand("work", undefined));
    await store.flush();

    expect(order).toEqual(["handler", "deferred-1", "deferred-2"]);
    expect(store.state.value).toBe(1);
  });

  it("runs deferred callbacks even when handler throws", async () => {
    const cleanedUp = vi.fn();

    const store = createStore<State>({ value: 0 }, { onError: () => {} });
    store.useExtension(withDefer<State>()).addCommandHandler("fail", (ctx) => {
      ctx.defer(cleanedUp);
      throw new Error("handler error");
    });

    store.queue(createCommand("fail", undefined));
    await store.flush();

    expect(cleanedUp).toHaveBeenCalledOnce();
  });

  it("reports deferred callback errors through the error channel", async () => {
    const reports: StoreErrorReport[] = [];

    const store = createStore<State>(
      { value: 0 },
      { onError: (report) => reports.push(report) },
    );
    store.useExtension(withDefer<State>()).addCommandHandler("work", (ctx) => {
      ctx.defer(() => {
        throw new Error("deferred error");
      });
      ctx.setState({ value: 42 });
    });

    store.queue(createCommand("work", undefined));
    await store.flush();

    expect(store.state.value).toBe(42);
    expect(reports).toHaveLength(1);
    expect(reports[0].source).toBe("contextExtension");
    expect((reports[0].error as Error).message).toBe("deferred error");
  });

  it("reports deferred event callback errors through the error channel", async () => {
    const TestEvent = createEvent("deferredEvent");
    const reports: StoreErrorReport[] = [];

    const store = createStore<State>(
      { value: 0 },
      { onError: (report) => reports.push(report) },
    );
    const extended = store.useExtension(withDefer<State>());

    extended.addCommandHandler("fire", (ctx) => {
      ctx.emit(TestEvent, undefined);
    });
    extended.addEventHandler(TestEvent, (ctx) => {
      ctx.defer(() => {
        throw new Error("deferred event error");
      });
    });

    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(reports).toHaveLength(1);
    expect(reports[0].source).toBe("contextExtension");
    expect((reports[0].error as Error).message).toBe("deferred event error");
  });

  it("supports async deferred callbacks", async () => {
    const results: string[] = [];

    const store = createStore<State>({ value: 0 });
    store.useExtension(withDefer<State>()).addCommandHandler("work", (ctx) => {
      ctx.defer(async () => {
        await Promise.resolve();
        results.push("async-cleanup");
      });
      results.push("handler");
    });

    store.queue(createCommand("work", undefined));
    await store.flush();

    expect(results).toEqual(["handler", "async-cleanup"]);
  });

  it("deferred callbacks do not leak between commands", async () => {
    const calls: string[] = [];

    const store = createStore<State>({ value: 0 });
    const extended = store.useExtension(withDefer<State>());

    extended.addCommandHandler("first", (ctx) => {
      ctx.defer(() => {
        calls.push("first-defer");
      });
    });
    extended.addCommandHandler("second", () => {
      calls.push("second-handler");
    });

    store.queue(createCommand("first", undefined));
    store.queue(createCommand("second", undefined));
    await store.flush();

    expect(calls).toEqual(["first-defer", "second-handler"]);
  });

  it("keeps deferred callbacks per store when one extension is shared", async () => {
    const shared = withDefer<State>();
    const calls: string[] = [];

    const storeA = createStore<State>({ value: 0 });
    const storeB = createStore<State>({ value: 0 });

    storeA.useExtension(shared).addCommandHandler("hold", (ctx) => {
      ctx.defer(() => {
        calls.push("a-defer");
      });
      return new Promise<void>((resolve) => {
        setTimeout(resolve, 5);
      });
    });

    storeB.useExtension(shared).addCommandHandler("quick", () => {
      calls.push("b-handler");
    });

    const pending = storeA.queue(createCommand("hold", undefined));
    storeB.queue(createCommand("quick", undefined));
    await storeB.flush();

    expect(calls).toEqual(["b-handler"]);

    await pending;
    await storeA.flush();

    expect(calls).toEqual(["b-handler", "a-defer"]);
  });

  it("drops pending callbacks when the extension is removed", async () => {
    const deferred = vi.fn();

    const store = createStore<State>({ value: 0 });
    const defer = withDefer<State>();

    store.useExtension(defer).addCommandHandler("work", async (ctx) => {
      ctx.defer(deferred);
      expect(store.removeExtension(defer)).toBe(true);
      await Promise.resolve();
    });

    store.queue(createCommand("work", undefined));
    await store.flush();

    expect(deferred).not.toHaveBeenCalled();
  });
});

describe("withInjector", () => {
  type State = { data: string };

  it("provides typed access to dependencies", async () => {
    const apiClient = {
      fetch: (url: string) => Promise.resolve(`data from ${url}`),
    };

    const store = createStore<State>({ data: "" });
    store
      .useExtension(
        withInjector<State>()({
          api: apiClient,
          baseUrl: "https://example.com",
        }),
      )
      .addCommandHandler("load", async (ctx) => {
        const result = await ctx.deps.api.fetch(ctx.deps.baseUrl);
        ctx.setState({ data: result });
      });

    store.queue(createCommand("load", undefined));
    await store.flush();

    expect(store.state.data).toBe("data from https://example.com");
  });

  it("works in event handlers", async () => {
    const TestEvent = createEvent("test");
    const results: string[] = [];

    const store = createStore<State>({ data: "" });
    const extended = store.useExtension(
      withInjector<State>()({ label: "injected" }),
    );

    extended.addCommandHandler("fire", (ctx) => {
      ctx.emit(TestEvent, undefined);
    });
    extended.addEventHandler(TestEvent, (ctx) => {
      results.push(ctx.deps.label);
    });

    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(results).toEqual(["injected"]);
  });

  it("supports swapping dependencies for testing", async () => {
    const mockApi = { fetch: () => "mock" };

    const createTestStore = (api: { fetch: () => string }) => {
      const store = createStore<State>({ data: "" });
      store
        .useExtension(withInjector<State>()({ api }))
        .addCommandHandler("load", (ctx) => {
          ctx.setState({ data: ctx.deps.api.fetch() });
        });
      return store;
    };

    const store = createTestStore(mockApi);
    store.queue(createCommand("load", undefined));
    await store.flush();

    expect(store.state.data).toBe("mock");
  });
});

describe("withGuard", () => {
  type State = { items: string[] };

  it("allows handler to continue when condition is true", async () => {
    const store = createStore<State>({ items: ["a"] });
    store.useExtension(withGuard<State>()).addCommandHandler("process", (ctx) => {
      ctx.guard(ctx.state.items.length > 0, "items must not be empty");
      ctx.setState({ items: [...ctx.state.items, "processed"] });
    });

    store.queue(createCommand("process", undefined));
    await store.flush();

    expect(store.state.items).toEqual(["a", "processed"]);
  });

  it("throws a named GuardError and stops the handler", async () => {
    const errors: { error: unknown }[] = [];

    const store = createStore<State>({ items: [] }, { onError: () => {} });
    store.useExtension(withGuard<State>()).addCommandHandler("process", (ctx) => {
      ctx.guard(ctx.state.items.length > 0, "items must not be empty");
      ctx.setState({ items: ["should not reach"] });
    });

    store.openStream((event) => {
      if (matchEvent(event, BuiltinEvent.CommandHandlingError)) {
        errors.push(event.data);
      }
    });

    store.queue(createCommand("process", undefined));
    await store.flush();

    expect(store.state.items).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].error).toBeInstanceOf(GuardError);
    expect(errors[0].error).toBeInstanceOf(ContextCheckError);
    expect(errors[0].error).not.toBeInstanceOf(AssertionError);
    expect((errors[0].error as Error).name).toBe("GuardError");
    expect((errors[0].error as Error).message).toBe("items must not be empty");
  });

  it("supports multiple guards in sequence", async () => {
    type FormState = { email: string; age: number };

    const store = createStore<FormState>({
      email: "test@test.com",
      age: 20,
    });
    store.useExtension(withGuard<FormState>()).addCommandHandler("submit", (ctx) => {
      ctx.guard(ctx.state.email.includes("@"), "invalid email");
      ctx.guard(ctx.state.age >= 18, "must be 18 or older");
    });

    store.queue(createCommand("submit", undefined));
    await store.flush();
  });

  it("becomes a no-op when disabled", async () => {
    const store = createStore<State>({ items: [] });
    store
      .useExtension(withGuard<State>({ enabled: false }))
      .addCommandHandler("process", (ctx) => {
        ctx.guard(false, "never thrown");
        ctx.setState({ items: ["reached"] });
      });

    store.queue(createCommand("process", undefined));
    await store.flush();

    expect(store.state.items).toEqual(["reached"]);
  });

  it("is not available on event handler contexts", () => {
    const TestEvent = createEvent("guardAttempt");
    const store = createStore<State>({ items: [] });

    store
      .useExtension(withGuard<State>())
      // @ts-expect-error guard is command-only and must not be typed on event contexts
      .addEventHandler(TestEvent, (ctx) => ctx.guard(true, "unreachable"));

    expect(store.state.items).toEqual([]);
  });
});

describe("withAssert", () => {
  type State = { items: string[] | undefined };

  it("throws a named AssertionError with a prefixed message", async () => {
    const errors: { error: unknown }[] = [];

    const store = createStore<State>(
      { items: undefined },
      { onError: () => {} },
    );
    store.useExtension(withAssert<State>()).addCommandHandler("check", (ctx) => {
      ctx.assert(ctx.state.items !== undefined, "items should be initialized");
    });

    store.openStream((event) => {
      if (matchEvent(event, BuiltinEvent.CommandHandlingError)) {
        errors.push(event.data);
      }
    });

    store.queue(createCommand("check", undefined));
    await store.flush();

    expect(errors).toHaveLength(1);
    expect(errors[0].error).toBeInstanceOf(AssertionError);
    expect(errors[0].error).not.toBeInstanceOf(GuardError);
    expect((errors[0].error as Error).name).toBe("AssertionError");
    expect((errors[0].error as Error).message).toBe(
      "Assertion failed: items should be initialized",
    );
  });

  it("passes through when assertion is true", async () => {
    const store = createStore<State>({ items: ["a"] });
    store.useExtension(withAssert<State>()).addCommandHandler("check", (ctx) => {
      ctx.assert(ctx.state.items !== undefined, "items should exist");
    });

    store.queue(createCommand("check", undefined));
    await store.flush();
  });

  it("becomes no-op when disabled", async () => {
    const store = createStore<State>({ items: undefined });
    store
      .useExtension(withAssert<State>({ enabled: false }))
      .addCommandHandler("check", (ctx) => {
        ctx.assert(false, "this should not throw");
        ctx.setState({ items: ["ok"] });
      });

    store.queue(createCommand("check", undefined));
    await store.flush();

    expect(store.state.items).toEqual(["ok"]);
  });

  it("works in event handlers and reports as an event handling error", async () => {
    const TestEvent = createEvent("test");
    const errors: { error: unknown }[] = [];

    const store = createStore<State>(
      { items: undefined },
      { onError: () => {} },
    );
    const extended = store.useExtension(withAssert<State>());

    extended.addCommandHandler("fire", (ctx) => {
      ctx.emit(TestEvent, undefined);
    });
    extended.addEventHandler(TestEvent, (ctx) => {
      ctx.assert(
        ctx.state.items !== undefined,
        "items missing in event handler",
      );
    });

    store.openStream((event) => {
      if (matchEvent(event, BuiltinEvent.EventHandlingError)) {
        errors.push(event.data);
      }
    });

    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(errors).toHaveLength(1);
    expect(errors[0].error).toBeInstanceOf(AssertionError);
    expect((errors[0].error as Error).message).toBe(
      "Assertion failed: items missing in event handler",
    );
  });
});

describe("extension composition", () => {
  type State = { count: number; label: string };

  it("accumulates command and event context types across chained extensions", async () => {
    const TestEvent = createEvent("composed");
    const seen: string[] = [];

    const store = createStore<State>({ count: 0, label: "" });
    const extended = store
      .useExtension(withPatch<State>())
      .useExtension(withGuard<State>())
      .useExtension(withInjector<State>()({ label: "composed" }));

    extended.addCommandHandler("run", (ctx) => {
      ctx.guard(ctx.state.count === 0, "count must start at zero");
      ctx.patch({ count: 1, label: ctx.deps.label });
      ctx.emit(TestEvent, undefined);
    });
    extended.addEventHandler(TestEvent, (ctx) => {
      seen.push(ctx.deps.label);
    });

    store.queue(createCommand("run", undefined));
    await store.flush();

    expect(store.state).toEqual({ count: 1, label: "composed" });
    expect(seen).toEqual(["composed"]);
  });
});
