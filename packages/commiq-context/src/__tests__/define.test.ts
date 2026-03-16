import { describe, it, expect } from "vitest";
import { createStore, createCommand } from "@naikidev/commiq";
import { defineContextExtension } from "../index";

type State = { value: number };

describe("defineContextExtension", () => {
  it("creates a usable context extension", async () => {
    const ext = defineContextExtension<State, { double: () => void }>({
      command: (ctx) => ({
        double: () => ctx.setState({ value: ctx.state.value * 2 }),
      }),
    });

    const store = createStore<State>({ value: 3 })
      .useExtension(ext)
      .addCommandHandler("run", (ctx) => {
        ctx.double();
      });

    store.queue(createCommand("run", undefined));
    await store.flush();

    expect(store.state.value).toBe(6);
  });
});
