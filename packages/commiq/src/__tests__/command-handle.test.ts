import { describe, it, expect, expectTypeOf, vi } from "vitest";
import {
  BuiltinEvent,
  createCommand,
  createCommandDef,
  createEvent,
  createStore,
  matchEvent,
  type CommandResult,
} from "../index";
import { createGate, drain } from "./gate";

type State = { count: number };

type ProcessLike = {
  on: (event: string, listener: (reason: unknown) => void) => void;
  off: (event: string, listener: (reason: unknown) => void) => void;
};

const inc = createCommandDef<number>("inc");

function createCounter() {
  const store = createStore<State>({ count: 0 }, { onError: () => {} });
  store.addCommandHandler(inc, (ctx, cmd) => {
    ctx.setState({ count: ctx.state.count + cmd.data });
  });
  return store;
}

describe("queue handle", () => {
  it("resolves when that command is handled", async () => {
    const store = createCounter();

    const result = await store.queue(inc, 3);

    expect(result.status).toBe("handled");
    expect(result.command.name).toBe("inc");
    expect(store.state.count).toBe(3);
  });

  it("exposes the queued command and its correlationId", async () => {
    const store = createCounter();

    const handle = store.queue(inc, 1);

    expect(handle.correlationId).not.toBe("");
    expect(handle.command.correlationId).toBe(handle.correlationId);
    expect((await handle).command.correlationId).toBe(handle.correlationId);
  });

  it("settles per command instead of waiting for the whole queue", async () => {
    const gate = createGate();
    const store = createStore<State>({ count: 0 });
    const order: string[] = [];

    store.addCommandHandler("first", () => {
      order.push("first");
    });
    store.addCommandHandler("second", async () => {
      await gate.wait();
      order.push("second");
    });

    const first = store.queue(createCommand("first", undefined));
    const second = store.queue(createCommand("second", undefined));

    expect((await first).status).toBe("handled");
    expect(order).toEqual(["first"]);

    await drain(store, gate);

    expect((await second).status).toBe("handled");
    expect(order).toEqual(["first", "second"]);
  });

  it("resolves with failed status and the thrown error", async () => {
    const store = createStore<State>({ count: 0 }, { onError: () => {} });
    const failure = new Error("handler exploded");
    store.addCommandHandler("boom", () => {
      throw failure;
    });

    const result = await store.queue(createCommand("boom", undefined));

    expect(result.status).toBe("failed");
    expect(result.error).toBe(failure);
  });

  it("resolves with invalid status for an unregistered command", async () => {
    const store = createStore<State>({ count: 0 });

    const result = await store.queue(createCommand("nope", undefined));

    expect(result.status).toBe("invalid");
  });

  it("resolves with interrupted status when superseded while queued", async () => {
    const gate = createGate();
    const store = createStore<State>({ count: 0 });
    store.addCommandHandler(
      "search",
      async () => {
        await gate.wait();
      },
      { interruptable: true },
    );

    const running = store.queue(createCommand("search", undefined));
    const superseded = store.queue(createCommand("search", undefined));
    const winner = store.queue(createCommand("search", undefined));

    expect((await superseded).status).toBe("interrupted");

    await drain(store, gate);

    expect((await running).status).toBe("interrupted");
    expect((await winner).status).toBe("handled");
  });

  it("resolves handles created from inside an event handler", async () => {
    const store = createStore<State>({ count: 0 });
    const fired = createEvent<void>("fired");
    const results: CommandResult[] = [];

    store.addCommandHandler("fire", (ctx) => {
      ctx.emit(fired, undefined);
    });
    store.addCommandHandler(inc, (ctx, cmd) => {
      ctx.setState({ count: ctx.state.count + cmd.data });
    });
    store.addEventHandler(fired, (ctx) => {
      void ctx.queue(inc, 5).then((result) => results.push(result));
    });

    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(store.state.count).toBe(5);
    expect(results.map((r) => r.status)).toEqual(["handled"]);
  });

  it("does not produce an unhandled rejection when a failing handle is ignored", async () => {
    const rejections: unknown[] = [];
    const proc = (globalThis as { process?: ProcessLike }).process;
    const onRejection = (reason: unknown) => rejections.push(reason);
    proc?.on("unhandledRejection", onRejection);

    try {
      const store = createStore<State>({ count: 0 }, { onError: () => {} });
      store.addCommandHandler("boom", () => {
        throw new Error("ignored failure");
      });

      store.queue(createCommand("boom", undefined));
      await store.flush();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });

      expect(rejections).toEqual([]);
    } finally {
      proc?.off("unhandledRejection", onRejection);
    }
  });
});

describe("reentrant flush", () => {
  it("fails the command instead of hanging when flush is called from a handler", async () => {
    const reported: unknown[] = [];
    const store = createStore<State>(
      { count: 0 },
      { onError: (report) => reported.push(report.source) },
    );
    store.addCommandHandler("reentrant", async () => {
      await store.flush();
    });

    const result = await store.queue(createCommand("reentrant", undefined));

    expect(result.status).toBe("failed");
    expect((result.error as Error).message).toContain(
      "flush() cannot be called from inside",
    );
    expect(reported).toEqual(["commandHandler"]);
  });

  it("fails when flush is called from an event handler", async () => {
    const store = createStore<State>({ count: 0 }, { onError: () => {} });
    const errors: unknown[] = [];
    const fired = createEvent<void>("fired");

    store.addCommandHandler("fire", (ctx) => {
      ctx.emit(fired, undefined);
    });
    store.addEventHandler(fired, () => store.flush());
    store.openStream((event) => {
      if (matchEvent(event, BuiltinEvent.EventHandlingError)) {
        errors.push(event.data.error);
      }
    });

    store.queue(createCommand("fire", undefined));
    await store.flush();

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toContain(
      "flush() cannot be called from inside",
    );
  });

  it("still allows an external flush while a handler is awaiting", async () => {
    const gate = createGate();
    const store = createStore<State>({ count: 0 });
    const done = vi.fn();

    store.addCommandHandler("slow", async (ctx) => {
      await gate.wait();
      ctx.setState({ count: 1 });
      done();
    });

    store.queue(createCommand("slow", undefined));
    await drain(store, gate);

    expect(done).toHaveBeenCalledOnce();
    expect(store.state.count).toBe(1);
  });
});

describe("command definitions", () => {
  it("types the payload inside the handler", async () => {
    const store = createStore<State>({ count: 0 });
    const seen: number[] = [];

    store.addCommandHandler(inc, (ctx, cmd) => {
      expectTypeOf(cmd.data).toEqualTypeOf<number>();
      seen.push(cmd.data);
      ctx.setState({ count: ctx.state.count + cmd.data });
    });

    await store.queue(inc, 7);

    expect(seen).toEqual([7]);
    expect(store.state.count).toBe(7);
  });

  it("allows omitting the payload for void definitions", async () => {
    const ping = createCommandDef("ping");
    const store = createStore<State>({ count: 0 });
    store.addCommandHandler(ping, (ctx) => {
      ctx.setState({ count: ctx.state.count + 1 });
    });

    await store.queue(ping);

    expect(store.state.count).toBe(1);
  });

  it("rejects mismatched payloads at compile time", () => {
    const store = createStore<State>({ count: 0 });
    store.addCommandHandler(inc, () => {});

    // @ts-expect-error a string is not a valid payload for a number command
    store.queue(inc, "five");
    // @ts-expect-error the payload is required
    store.queue(inc);
    expect(true).toBe(true);
  });

  it("keeps accepting raw string names and createCommand", async () => {
    const store = createStore<State>({ count: 0 });
    store.addCommandHandler<number>("legacy", (ctx, cmd) => {
      expectTypeOf(cmd.data).toEqualTypeOf<number>();
      ctx.setState({ count: cmd.data });
    });

    await store.queue(createCommand("legacy", 4));

    expect(store.state.count).toBe(4);
  });
});
