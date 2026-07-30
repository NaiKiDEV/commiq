import type { StoreEvent } from "@naikidev/commiq";
import type { CommandTracker } from "./command-tracker";
import type { InstrumentConfig } from "./config";

export type HandlerDeps = {
  config: InstrumentConfig;
  tracker: CommandTracker;
}

export type EventHandler = (deps: HandlerDeps, event: StoreEvent) => void;
