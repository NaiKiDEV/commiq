import { useCallback } from "react";
import { useResolvedStore } from "./internal/use-resolved-store";
import type { StoreSource } from "./types";

export function useFlush<S>(source: StoreSource<S>): () => Promise<void> {
  const store = useResolvedStore<S>(source);
  return useCallback(() => store.flush(), [store]);
}
