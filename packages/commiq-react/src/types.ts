import type { PropsWithChildren } from "react";
import type {
  CommandDef,
  QueueFn,
  SealedStore,
  StreamListener,
  Unsubscribe,
} from "@naikidev/commiq";

export type AnyStore = {
  readonly state: unknown;
  queue: QueueFn;
  flush: () => Promise<void>;
  openStream: (listener: StreamListener) => Unsubscribe;
  closeStream: (listener: StreamListener) => void;
}

export type StoreRegistry = Record<string, AnyStore>;

export type CommiqContextValue = {
  stores: StoreRegistry;
}

export type CommiqProviderProps = PropsWithChildren<{
  stores: StoreRegistry;
}>;

export type StoreSource<S> = SealedStore<S> | string;

export type IsEqual<T> = (a: T, b: T) => boolean;

export type CommandSource = string | CommandDef<string, never>;

export type CommandStatusSnapshot = {
  pending: boolean;
  error: unknown;
  lastCompletedAt: number | null;
}
