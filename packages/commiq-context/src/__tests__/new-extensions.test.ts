import { describe, it, expect, vi } from "vitest";
import { createStore, createCommand, createEvent, BuiltinEvent, matchEvent } from "@naikidev/commiq";
import { withPatch, withDefer, withInjector, withGuard, withAssert } from "../index";

describe("withPatch", () => {
  type State = { name: string; count: number; active: boolean };

  it("shallow-merges partial state", async () => {
    const store = createStore<State>({ name: "test", count: 0, active: false })
      .useExtension(withPatch<State>())
      .addCommandHandler("activate", (ctx) => {
        ctx.patch({ active: true, count: ctx.state.count + 1 });
      });

    store.queue(createCommand("activate", undefined));
    await store.flush();

    expect(store.state).toEqual({ name: "test", count: 1, active: true });
  });

  it("preserves unpatched fields", async () => {
    const store = createStore<State>({ name: "original", count: 5, active: true })
      .useExtension(withPatch<State>())
      .addCommandHandler<string>("rename", (ctx, cmd) => {
        ctx.patch({ name: cmd.data });
      });

    store.queue(createCommand("rename", "updated"));
    await store.flush();

    expect(store.state).toEqual({ name: "updated", count: 5, active: true });
  });
});

describe("withDefer", () => {
  type State = { value: number };

  it("runs deferred callbacks after handler completes", async () => {
    const order: string[] = [];

    const store = createStore<State>({ value: 0 })
      .useExtension(withDefer<State>())
      .addCommandHandler("work", (ctx) => {
        ctx.defer(() => { order.push("deferred-1"); });
        ctx.defer(() => { order.push("deferred-2"); });
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

    const store = createStore<State>({ value: 0 })
      .useExtension(withDefer<State>())
      .addCommandHandler("fail", (ctx) => {
        ctx.defer(cleanedUp);
        throw new Error("handler error");
      });

    store.queue(createCommand("fail", undefined));
    await store.flush();

    expect(cleanedUp).toHaveBeenCalledOnce();
  });

  it("swallows errors from deferred callbacks", async () => {
    const store = createStore<State>({ value: 0 })
      .useExtension(withDefer<State>())
      .addCommandHandler("work", (ctx) => {
        ctx.defer(() => { throw new Error("deferred error"); });
        ctx.setState({ value: 42 });
      });

    store.queue(createCommand("work", undefined));
    await store.flush();

    expect(store.state.value).toBe(42);
  });

  it("supports async deferred callbacks", async () => {
    const results: string[] = [];

    const store = createStore<State>({ value: 0 })
      .useExtension(withDefer<State>())
      .addCommandHandler("work", (ctx) => {
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

    const store = createStore<State>({ value: 0 })
      .useExtension(withDefer<State>())
      .addCommandHandler("first", (ctx) => {
        ctx.defer(() => { calls.push("first-defer"); });
      })
      .addCommandHandler("second", () => {
        calls.push("second-handler");
      });

    store.queue(createCommand("first", undefined));
    store.queue(createCommand("second", undefined));
    await store.flush();

    expect(calls).toEqual(["first-defer", "second-handler"]);
  });
});

describe("withInjector", () => {
  type State = { data: string };

  it("provides typed access to dependencies", async () => {
    const apiClient = {
      fetch: (url: string) => Promise.resolve(`data from ${url}`),
    };

    const store = createStore<State>({ data: "" })
      .useExtension(withInjector<State>()({ api: apiClient, baseUrl: "https://example.com" }))
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

    const store = createStore<State>({ data: "" })
      .useExtension(withInjector<State>()({ label: "injected" }))
      .addCommandHandler("fire", (ctx) => {
        ctx.emit(TestEvent, undefined);
      })
      .addEventHandler(TestEvent, (ctx) => {
        results.push(ctx.deps.label);
      });

    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(results).toEqual(["injected"]);
  });

  it("supports swapping dependencies for testing", async () => {
    const realApi = { fetch: () => "real" };
    const mockApi = { fetch: () => "mock" };

    const createTestStore = (api: { fetch: () => string }) =>
      createStore<State>({ data: "" })
        .useExtension(withInjector<State>()({ api }))
        .addCommandHandler("load", (ctx) => {
          ctx.setState({ data: ctx.deps.api.fetch() });
        });

    const store = createTestStore(mockApi);
    store.queue(createCommand("load", undefined));
    await store.flush();

    expect(store.state.data).toBe("mock");
  });
});

describe("withGuard", () => {
  type State = { items: string[] };

  it("allows handler to continue when condition is true", async () => {
    const store = createStore<State>({ items: ["a"] })
      .useExtension(withGuard<State>())
      .addCommandHandler("process", (ctx) => {
        ctx.guard(ctx.state.items.length > 0, "items must not be empty");
        ctx.setState({ items: [...ctx.state.items, "processed"] });
      });

    store.queue(createCommand("process", undefined));
    await store.flush();

    expect(store.state.items).toEqual(["a", "processed"]);
  });

  it("throws and stops handler when condition is false", async () => {
    const errors: { error: unknown }[] = [];

    const store = createStore<State>({ items: [] })
      .useExtension(withGuard<State>())
      .addCommandHandler("process", (ctx) => {
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
    expect((errors[0].error as Error).message).toBe("items must not be empty");
  });

  it("supports multiple guards in sequence", async () => {
    type FormState = { email: string; age: number };

    const store = createStore<FormState>({ email: "test@test.com", age: 20 })
      .useExtension(withGuard<FormState>())
      .addCommandHandler("submit", (ctx) => {
        ctx.guard(ctx.state.email.includes("@"), "invalid email");
        ctx.guard(ctx.state.age >= 18, "must be 18 or older");
      });

    store.queue(createCommand("submit", undefined));
    await store.flush();
  });
});

describe("withAssert", () => {
  type State = { items: string[] | undefined };

  it("throws with prefixed message when assertion fails", async () => {
    const errors: { error: unknown }[] = [];

    const store = createStore<State>({ items: undefined })
      .useExtension(withAssert<State>())
      .addCommandHandler("check", (ctx) => {
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
    expect((errors[0].error as Error).message).toBe("Assertion failed: items should be initialized");
  });

  it("passes through when assertion is true", async () => {
    const store = createStore<State>({ items: ["a"] })
      .useExtension(withAssert<State>())
      .addCommandHandler("check", (ctx) => {
        ctx.assert(ctx.state.items !== undefined, "items should exist");
      });

    store.queue(createCommand("check", undefined));
    await store.flush();
  });

  it("becomes no-op when disabled", async () => {
    const store = createStore<State>({ items: undefined })
      .useExtension(withAssert<State>({ enabled: false }))
      .addCommandHandler("check", (ctx) => {
        ctx.assert(false, "this should not throw");
        ctx.setState({ items: ["ok"] });
      });

    store.queue(createCommand("check", undefined));
    await store.flush();

    expect(store.state.items).toEqual(["ok"]);
  });

  it("works in event handlers", async () => {
    const TestEvent = createEvent("test");
    const errors: { error: unknown }[] = [];

    const store = createStore<State>({ items: undefined })
      .useExtension(withAssert<State>())
      .addCommandHandler("fire", (ctx) => {
        ctx.emit(TestEvent, undefined);
      })
      .addEventHandler(TestEvent, (ctx) => {
        ctx.assert(ctx.state.items !== undefined, "items missing in event handler");
      });

    store.openStream((event) => {
      if (matchEvent(event, BuiltinEvent.CommandHandlingError)) {
        errors.push(event.data);
      }
    });

    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(errors).toHaveLength(1);
    expect((errors[0].error as Error).message).toBe("Assertion failed: items missing in event handler");
  });
});
