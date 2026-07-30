import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createCommand, createStore, sealStore } from "@naikidev/commiq";
import { CommiqDevtoolsInner } from "../CommiqDevtoolsInner";
import type { DevtoolsStoreLike, DevtoolsStoreRegistry } from "../types";

const TOAST_SELECTOR = ".commiq-toast";

function failingStore(): { queueBoom: () => void; flush: () => Promise<void>; stores: DevtoolsStoreRegistry } {
  const store = createStore<{ count: number }>({ count: 0 });
  store.addCommandHandler("boom", () => {
    throw new Error("boom");
  });
  const sealed: DevtoolsStoreLike = sealStore(store);
  return {
    queueBoom: () => {
      store.queue(createCommand("boom", undefined));
    },
    flush: () => store.flush(),
    stores: { counter: sealed },
  };
}

function toastCount(): number {
  return document.querySelectorAll(TOAST_SELECTOR).length;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "requestAnimationFrame",
      "cancelAnimationFrame",
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.restoreAllMocks();
});

async function raiseError(harness: ReturnType<typeof failingStore>): Promise<void> {
  await act(async () => {
    harness.queueBoom();
    await harness.flush();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(32);
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("error toast lifecycle (DT-6)", () => {
  it("dismisses the first toast on schedule even when a second error arrives", async () => {
    const harness = failingStore();
    render(<CommiqDevtoolsInner stores={harness.stores} />);

    await raiseError(harness);
    expect(toastCount()).toBe(1);

    await advance(2500);
    await raiseError(harness);
    expect(toastCount()).toBe(2);

    await advance(1600);
    expect(toastCount()).toBe(1);

    await advance(2500);
    expect(toastCount()).toBe(0);
  });

  it("keeps at most three toasts on screen", async () => {
    const harness = failingStore();
    render(<CommiqDevtoolsInner stores={harness.stores} />);

    for (let i = 0; i < 5; i += 1) {
      await raiseError(harness);
    }

    expect(toastCount()).toBe(3);
  });

  it("dismisses a single toast via its close button", async () => {
    const harness = failingStore();
    render(<CommiqDevtoolsInner stores={harness.stores} />);

    await raiseError(harness);
    const close = document.querySelector<HTMLButtonElement>(".commiq-toast-close");
    expect(close).not.toBeNull();

    await act(async () => {
      close?.click();
    });

    expect(toastCount()).toBe(0);
  });
});

describe("toast click routing (DT-7)", () => {
  it("applies the error filter when the panel is already open", async () => {
    const harness = failingStore();
    render(<CommiqDevtoolsInner stores={harness.stores} initialOpen />);

    expect(document.querySelector(".commiq-error-pill")).toBeNull();

    await raiseError(harness);
    const toast = document.querySelector<HTMLElement>(TOAST_SELECTOR);
    expect(toast).not.toBeNull();

    await act(async () => {
      toast?.click();
    });

    expect(document.querySelector(".commiq-error-pill")).not.toBeNull();
    expect(toastCount()).toBe(0);
  });

  it("opens the panel on the events tab when it was closed", async () => {
    const harness = failingStore();
    render(<CommiqDevtoolsInner stores={harness.stores} />);

    await raiseError(harness);

    await act(async () => {
      document.querySelector<HTMLElement>(TOAST_SELECTOR)?.click();
    });

    const eventsTab = screen.getByRole("tab", { name: /Events/ });
    expect(eventsTab.getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector(".commiq-error-pill")).not.toBeNull();
  });
});

describe("correlation links (DT-13)", () => {
  it("focuses the causality chain and switches to the graph tab", async () => {
    const harness = failingStore();
    render(<CommiqDevtoolsInner stores={harness.stores} initialOpen />);
    await raiseError(harness);

    const link = document.querySelector<HTMLElement>(".commiq-link");
    expect(link).not.toBeNull();

    await act(async () => {
      link?.click();
    });

    expect(screen.getByRole("tab", { name: /Graph/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTitle(/single causality chain/)).toBeTruthy();
  });
});

describe("panel accessibility (DT-10)", () => {
  it("exposes an ARIA tablist with a single selected tab and a resize separator", async () => {
    const harness = failingStore();
    render(<CommiqDevtoolsInner stores={harness.stores} initialOpen />);
    await advance(32);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(7);
    expect(tabs.filter((t) => t.getAttribute("aria-selected") === "true")).toHaveLength(1);
    expect(tabs.filter((t) => t.getAttribute("tabindex") === "0")).toHaveLength(1);

    expect(screen.getByRole("tabpanel")).toBeTruthy();

    const separators = screen.getAllByRole("separator");
    expect(separators.length).toBeGreaterThan(0);
    expect(separators[0].getAttribute("aria-valuenow")).not.toBeNull();
    expect(separators[0].getAttribute("tabindex")).toBe("0");
  });
});
