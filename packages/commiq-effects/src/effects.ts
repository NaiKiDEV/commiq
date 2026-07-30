import type { EventDef, SealedStore, Unsubscribe } from "@naikidev/commiq";
import type {
  EffectHandler,
  EffectOptions,
  Effects,
  EffectsOptions,
} from "./types";
import {
  createRegistration,
  disposeRegistration,
  handleEvent,
  reportError,
  type EffectsRuntime,
} from "./runtime";

const noop: Unsubscribe = () => {};

export function createEffects<S>(
  store: SealedStore<S>,
  options?: EffectsOptions,
): Effects<S> {
  const runtime: EffectsRuntime<S> = {
    store,
    registrations: new Set(),
    fallbackReporter: options?.onError,
    destroyed: false,
  };

  const unsubscribe = store.openStream((event) => handleEvent(runtime, event));

  return {
    on<D>(
      eventDef: EventDef<D>,
      handler: EffectHandler<S, D>,
      effectOptions?: EffectOptions,
    ): Unsubscribe {
      if (runtime.destroyed) {
        reportError(runtime, undefined, {
          error: new Error(
            `on("${eventDef.name}") was ignored because the effects instance was destroyed`,
          ),
          source: "destroyedEffects",
        });
        return noop;
      }

      const registration = createRegistration<S, D>(
        eventDef,
        handler,
        effectOptions,
      );
      runtime.registrations.add(registration);

      return () => {
        if (registration.disposed) return;
        disposeRegistration(runtime, registration);
      };
    },
    destroy(): void {
      if (runtime.destroyed) return;
      runtime.destroyed = true;
      unsubscribe();
      for (const registration of [...runtime.registrations]) {
        disposeRegistration(runtime, registration);
      }
    },
  };
}
