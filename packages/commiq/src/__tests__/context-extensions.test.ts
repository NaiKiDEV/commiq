import { describe, it, expect, vi } from "vitest";
import {
  createStore,
  createCommand,
  createEvent,
  matchEvent,
  BuiltinEvent,
} from "../index";
import type { ContextExtensionDef } from "../index";

type State = { count: number };

describe("context extensions", () => {
  describe("command context", () => {
    it("provides extension properties to command handlers", async () => {
      const ext: ContextExtensionDef<State, { double: () => void }> = {
        command: (ctx) => ({
          double: () => ctx.setState({ count: ctx.state.count * 2 }),
        }),
      };

      const store = createStore<State>({ count: 5 })
        .useExtension(ext)
        .addCommandHandler("double", (ctx) => {
          ctx.double();
        });

      store.queue(createCommand("double", undefined));
      await store.flush();

      expect(store.state.count).toBe(10);
    });

    it("provides command data to extension builder", async () => {
      const receivedNames: string[] = [];

      const ext: ContextExtensionDef<State, { track: () => void }> = {
        command: (_ctx, command) => ({
          track: () => receivedNames.push(command.name),
        }),
      };

      const store = createStore<State>({ count: 0 })
        .useExtension(ext)
        .addCommandHandler("foo", (ctx) => {
          ctx.track();
        })
        .addCommandHandler("bar", (ctx) => {
          ctx.track();
        });

      store.queue(createCommand("foo", undefined));
      store.queue(createCommand("bar", undefined));
      await store.flush();

      expect(receivedNames).toEqual(["foo", "bar"]);
    });

    it("supports multiple extensions", async () => {
      const ext1: ContextExtensionDef<State, { add: (n: number) => void }> = {
        command: (ctx) => ({
          add: (n: number) => ctx.setState({ count: ctx.state.count + n }),
        }),
      };

      const ext2: ContextExtensionDef<State, { log: () => string }> = {
        command: (ctx) => ({
          log: () => `count=${ctx.state.count}`,
        }),
      };

      const logs: string[] = [];

      const store = createStore<State>({ count: 0 })
        .useExtension(ext1)
        .useExtension(ext2)
        .addCommandHandler("work", (ctx) => {
          ctx.add(10);
          logs.push(ctx.log());
        });

      store.queue(createCommand("work", undefined));
      await store.flush();

      expect(store.state.count).toBe(10);
      expect(logs).toEqual(["count=10"]);
    });

    it("extensions can use emit from base context", async () => {
      const TestEvent = createEvent<string>("testEvent");

      const ext: ContextExtensionDef<State, { emitTest: (msg: string) => void }> = {
        command: (ctx) => ({
          emitTest: (msg: string) => ctx.emit(TestEvent, msg),
        }),
      };

      const collected: string[] = [];

      const store = createStore<State>({ count: 0 })
        .useExtension(ext)
        .addCommandHandler("fire", (ctx) => {
          ctx.emitTest("hello");
        });

      store.openStream((event) => {
        if (matchEvent(event, TestEvent)) {
          collected.push(event.data);
        }
      });

      store.queue(createCommand("fire", undefined));
      await store.flush();

      expect(collected).toEqual(["hello"]);
    });
  });

  describe("event context", () => {
    it("provides extension properties to event handlers", async () => {
      const TestEvent = createEvent<number>("testEvent");

      const ext: ContextExtensionDef<State, { enqueue: (name: string) => void }> = {
        event: (ctx) => ({
          enqueue: (name: string) => ctx.queue(createCommand(name, undefined)),
        }),
      };

      const handled: string[] = [];

      const store = createStore<State>({ count: 0 })
        .useExtension(ext)
        .addCommandHandler("emit", (ctx) => {
          ctx.emit(TestEvent, 42);
        })
        .addCommandHandler("reaction", () => {
          handled.push("reaction");
        })
        .addEventHandler(TestEvent, (ctx) => {
          ctx.enqueue("reaction");
        });

      store.queue(createCommand("emit", undefined));
      await store.flush();

      expect(handled).toEqual(["reaction"]);
    });
  });

  describe("key conflict detection", () => {
    it("emits error when extension conflicts with base command context keys", async () => {
      const ext: ContextExtensionDef<State, { setState: () => void }> = {
        command: () => ({
          setState: () => {},
        }),
      };

      const errors: { error: unknown }[] = [];

      const store = createStore<State>({ count: 0 })
        .useExtension(ext)
        .addCommandHandler("test", () => {});

      store.openStream((event) => {
        if (matchEvent(event, BuiltinEvent.CommandHandlingError)) {
          errors.push(event.data);
        }
      });

      store.queue(createCommand("test", undefined));
      await store.flush();

      expect(errors).toHaveLength(1);
      expect(errors[0].error).toBeInstanceOf(Error);
      expect((errors[0].error as Error).message).toBe(
        'Context extension key "setState" conflicts with existing context property',
      );
    });

    it("emits error when extension conflicts with base event context keys", async () => {
      const TestEvent = createEvent("testEvent");

      const ext: ContextExtensionDef<State, { queue: () => void }> = {
        event: () => ({
          queue: () => {},
        }),
      };

      const errors: { error: unknown }[] = [];

      const store = createStore<State>({ count: 0 })
        .useExtension(ext)
        .addCommandHandler("fire", (ctx) => {
          ctx.emit(TestEvent, undefined);
        })
        .addEventHandler(TestEvent, () => {});

      store.openStream((event) => {
        if (matchEvent(event, BuiltinEvent.CommandHandlingError)) {
          errors.push(event.data);
        }
      });

      store.queue(createCommand("fire", undefined));
      await store.flush();

      expect(errors).toHaveLength(1);
      expect(errors[0].error).toBeInstanceOf(Error);
      expect((errors[0].error as Error).message).toBe(
        'Context extension key "queue" conflicts with existing context property',
      );
    });

    it("emits error when two extensions produce the same key", async () => {
      const ext1: ContextExtensionDef<State, { helper: () => void }> = {
        command: () => ({ helper: () => {} }),
      };

      const ext2: ContextExtensionDef<State, { helper: () => void }> = {
        command: () => ({ helper: () => {} }),
      };

      const errors: { error: unknown }[] = [];

      const store = createStore<State>({ count: 0 })
        .useExtension(ext1)
        .useExtension(ext2)
        .addCommandHandler("test", () => {});

      store.openStream((event) => {
        if (matchEvent(event, BuiltinEvent.CommandHandlingError)) {
          errors.push(event.data);
        }
      });

      store.queue(createCommand("test", undefined));
      await store.flush();

      expect(errors).toHaveLength(1);
      expect(errors[0].error).toBeInstanceOf(Error);
      expect((errors[0].error as Error).message).toBe(
        'Context extension key "helper" conflicts with existing context property',
      );
    });
  });

  describe("sealing", () => {
    it("throws when adding extensions after processing starts", async () => {
      const store = createStore<State>({ count: 0 })
        .addCommandHandler("inc", (ctx) => {
          ctx.setState({ count: ctx.state.count + 1 });
        });

      store.queue(createCommand("inc", undefined));
      await store.flush();

      const ext: ContextExtensionDef<State, { noop: () => void }> = {
        command: () => ({ noop: () => {} }),
      };

      expect(() => store.useExtension(ext)).toThrow(
        "Cannot add extensions to an active store",
      );
    });
  });

  describe("type safety", () => {
    it("extensions are visible in handler ctx type after useExtension", async () => {
      const ext: ContextExtensionDef<State, { greet: () => string }> = {
        command: () => ({
          greet: () => "hello",
        }),
      };

      const results: string[] = [];

      const store = createStore<State>({ count: 0 })
        .useExtension(ext)
        .addCommandHandler("test", (ctx) => {
          results.push(ctx.greet());
        });

      store.queue(createCommand("test", undefined));
      await store.flush();

      expect(results).toEqual(["hello"]);
    });
  });
});
