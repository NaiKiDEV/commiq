import type { QueueFn } from "@naikidev/commiq";
import { useResolvedStore } from "./internal/use-resolved-store";
import type { StoreSource } from "./types";

export function useQueue<S>(source: StoreSource<S>): QueueFn {
  return useResolvedStore<S>(source).queue;
}
