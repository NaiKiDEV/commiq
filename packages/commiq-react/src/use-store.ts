import type { DeepReadonly } from "@naikidev/commiq";
import { useSelector } from "./use-selector";
import type { StoreSource } from "./types";

function identity<S>(state: DeepReadonly<S>): DeepReadonly<S> {
  return state;
}

export function useStore<S>(source: StoreSource<S>): DeepReadonly<S> {
  return useSelector(source, identity);
}
