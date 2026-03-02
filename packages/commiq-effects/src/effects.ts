import type { SealedStore, StoreEvent, EventDef } from "@naikidev/commiq";
import type { Effects, EffectHandler, EffectOptions, EffectContext } from "./types";

type EffectRegistration = {
  eventId: symbol;
  handler: EffectHandler<any>;
  options?: EffectOptions;
};

export function createEffects(store: SealedStore<any>): Effects {
  const registrations: EffectRegistration[] = [];
  const controllers = new Map<symbol, AbortController>();
  const debounceTimers = new Map<symbol, ReturnType<typeof setTimeout>>();
  let destroyed = false;

  const listener = (event: StoreEvent) => {
    if (destroyed) return;

    for (const reg of registrations) {
      if (event.id === reg.eventId) {
        runEffect(reg, event.data);
      }

      if (reg.options?.cancelOn && event.id === reg.options.cancelOn.id) {
        abortEffect(reg.eventId);
      }
    }
  };

  store.openStream(listener);

  function abortEffect(eventId: symbol): void {
    const existing = controllers.get(eventId);
    if (existing) {
      existing.abort();
      controllers.delete(eventId);
    }
  }

  function runEffect(reg: EffectRegistration, data: unknown): void {
    const { eventId, handler, options } = reg;

    if (options?.restartOnNew) {
      abortEffect(eventId);
    }

    const debounceMs = options?.debounce;
    if (debounceMs !== undefined && debounceMs > 0) {
      const existingTimer = debounceTimers.get(eventId);
      if (existingTimer !== undefined) {
        clearTimeout(existingTimer);
      }
      // Also abort any running effect when debouncing restarts
      if (options?.restartOnNew) {
        abortEffect(eventId);
      }
      debounceTimers.set(
        eventId,
        setTimeout(() => {
          debounceTimers.delete(eventId);
          executeEffect(reg, data);
        }, debounceMs),
      );
      return;
    }

    executeEffect(reg, data);
  }

  function executeEffect(reg: EffectRegistration, data: unknown): void {
    const { eventId, handler } = reg;

    const ac = new AbortController();
    controllers.set(eventId, ac);

    const ctx: EffectContext = {
      queue: (command) => store.queue(command),
      signal: ac.signal,
    };

    try {
      const result = handler(data, ctx);
      if (result && typeof result.then === "function") {
        result
          .catch((err: unknown) => {
            if (err instanceof DOMException && err.name === "AbortError") return;
            if (err instanceof Error && err.name === "AbortError") return;
          })
          .finally(() => {
            if (controllers.get(eventId) === ac) {
              controllers.delete(eventId);
            }
          });
      } else {
        if (controllers.get(eventId) === ac) {
          controllers.delete(eventId);
        }
      }
    } catch (err) {
      if (controllers.get(eventId) === ac) {
        controllers.delete(eventId);
      }
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (err instanceof Error && err.name === "AbortError") return;
    }
  }

  return {
    on<D>(eventDef: EventDef<D>, handler: EffectHandler<D>, options?: EffectOptions) {
      registrations.push({ eventId: eventDef.id, handler, options });
    },
    destroy() {
      destroyed = true;
      store.closeStream(listener);
      for (const ac of controllers.values()) {
        ac.abort();
      }
      controllers.clear();
      for (const timer of debounceTimers.values()) {
        clearTimeout(timer);
      }
      debounceTimers.clear();
    },
  };
}
