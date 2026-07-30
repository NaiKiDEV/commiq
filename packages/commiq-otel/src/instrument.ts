import type { Streamable } from "@naikidev/commiq";
import { createCommandTracker } from "./command-tracker";
import { resolveConfig } from "./config";
import { createStoreListener } from "./listener";
import type { InstrumentOptions, StoreInstrumentation } from "./types";

export function instrumentStore(
  store: Streamable,
  options: InstrumentOptions,
): StoreInstrumentation {
  const config = resolveConfig(options);
  const tracker = createCommandTracker(config);
  const listener = createStoreListener({ config, tracker });

  const result = store.openStream(listener);
  const unsubscribe =
    typeof result === "function" ? result : () => store.closeStream(listener);

  let isDisposed = false;
  const uninstrument = (): void => {
    if (isDisposed) return;
    isDisposed = true;
    unsubscribe();
    tracker.dispose();
  };

  return Object.assign(uninstrument, { destroy: uninstrument });
}
