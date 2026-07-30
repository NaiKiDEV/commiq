import { describe, it, expect, expectTypeOf } from "vitest";
import {
  createCommand,
  createCommandDef,
  createEvent,
  createStore,
  matchEvent,
  type CommandDef,
  type DeepReadonly,
  type EventDef,
  type StoreEvent,
} from "../index";

describe("createCommand", () => {
  it("creates a command with name and data", () => {
    const cmd = createCommand("initUser", { name: "Alice" });
    expect(cmd.name).toBe("initUser");
    expect(cmd.data).toEqual({ name: "Alice" });
  });
});

describe("createEvent", () => {
  it("creates an event definition with symbol id and string name", () => {
    const evt = createEvent("sessionExpired");
    expect(typeof evt.id).toBe("symbol");
    expect(evt.name).toBe("sessionExpired");
  });

  it("creates unique symbols for different events with same name", () => {
    const a = createEvent("test");
    const b = createEvent("test");
    expect(a.id).not.toBe(b.id);
  });
});

describe("matchEvent", () => {
  const TestEvent = createEvent<{ count: number }>("test:event");
  const OtherEvent = createEvent<string>("other:event");

  const event: StoreEvent = {
    id: TestEvent.id,
    name: TestEvent.name,
    data: { count: 42 },
    timestamp: Date.now(),
    correlationId: "abc",
    causedBy: null,
  };

  it("returns true when event matches the event definition", () => {
    expect(matchEvent(event, TestEvent)).toBe(true);
  });

  it("returns false when event does not match", () => {
    expect(matchEvent(event, OtherEvent)).toBe(false);
  });

  it("narrows the event data type", () => {
    if (matchEvent(event, TestEvent)) {
      expectTypeOf(event.data).toEqualTypeOf<{ count: number }>();
      expect(event.data.count).toBe(42);
    }
  });
});

describe("EventDef payload branding", () => {
  it("rejects assigning an event def with a different payload", () => {
    const numberEvent = createEvent<number>("numeric");
    const objectEvent = createEvent<{ name: string }>("object");

    // @ts-expect-error payload types are not interchangeable
    const wrong: EventDef<number> = objectEvent;

    expect(wrong.name).toBe("object");
    expect(numberEvent.name).toBe("numeric");
  });

  it("keeps emit payloads checked", async () => {
    const numberEvent = createEvent<number>("numeric");
    const store = createStore({ count: 0 });

    store.addCommandHandler("fire", (ctx) => {
      ctx.emit(numberEvent, 1);
      // @ts-expect-error the payload must match the event definition
      ctx.emit(numberEvent, "one");
    });

    await store.queue(createCommand("fire", undefined));

    expect(store.state.count).toBe(0);
  });
});

describe("createCommandDef", () => {
  it("carries the name and payload type", () => {
    const def = createCommandDef<{ amount: number }>("add");

    expect(def.name).toBe("add");
    expect(def.kind).toBe("commandDef");
    expectTypeOf(def).toExtend<CommandDef<string, { amount: number }>>();
  });

  it("rejects assigning a def with a different payload", () => {
    const numberDef = createCommandDef<number>("num");
    const stringDef = createCommandDef<string>("str");

    // @ts-expect-error payload types are not interchangeable
    const wrong: CommandDef<string, number> = stringDef;

    expect(wrong.name).toBe("str");
    expect(numberDef.name).toBe("num");
  });
});

describe("DeepReadonly", () => {
  it("makes nested structures readonly at the type level", () => {
    type State = {
      count: number;
      nested: { items: string[] };
    };

    expectTypeOf<DeepReadonly<State>>().toEqualTypeOf<{
      readonly count: number;
      readonly nested: { readonly items: ReadonlyArray<string> };
    }>();
    expectTypeOf<DeepReadonly<unknown>>().toEqualTypeOf<unknown>();
    expect(true).toBe(true);
  });
});
