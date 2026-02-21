import { describe, it, expect, vi } from "vitest";
import {
  createStore,
  createCommand,
  createEvent,
  createEventBus,
} from "../index";

describe("createEventBus", () => {
  it("routes events between connected stores", async () => {
    const userCreated = createEvent<{ name: string }>("userCreated");

    const storeA = createStore({ user: "" });
    const storeB = createStore({ greeting: "" });

    storeA.addCommandHandler("createUser", (ctx, cmd) => {
      ctx.setState({ user: cmd.data.name });
      ctx.emit(userCreated, { name: cmd.data.name });
    });

    storeB.addCommandHandler("greet", (ctx, cmd) => {
      ctx.setState({ greeting: `Hello ${cmd.data.name}` });
    });

    const bus = createEventBus();
    bus.connect(storeA);
    bus.connect(storeB);
    bus.on(userCreated, (event) => {
      storeB.queue(createCommand("greet", { name: event.data.name }));
    });

    storeA.queue(createCommand("createUser", { name: "Alice" }));
    await storeA.flush();
    await storeB.flush();
    expect(storeB.state.greeting).toBe("Hello Alice");
  });

  it("disconnects a store from the bus", async () => {
    const evt = createEvent("test");
    const listener = vi.fn();
    const store = createStore({});
    store.addCommandHandler("fire", (ctx) => {
      ctx.emit(evt, {});
    });

    const bus = createEventBus();
    bus.connect(store);
    bus.on(evt, listener);
    bus.disconnect(store);

    store.queue(createCommand("fire", undefined));
    await store.flush();
    expect(listener).not.toHaveBeenCalled();
  });
});
