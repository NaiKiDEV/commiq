import { useContext } from "react";
import type { SealedStore } from "@naikidev/commiq";
import { CommiqContext } from "./provider";
import type { StoreRegistry } from "./types";

export function resolveNamedStore<S>(
  stores: StoreRegistry,
  name: string,
): SealedStore<S> {
  const store = stores[name];
  if (!store) {
    const known = Object.keys(stores).join(", ") || "none";
    throw new Error(
      `[commiq] no store named "${name}" in <CommiqProvider>. Registered: ${known}`,
    );
  }
  return store as SealedStore<S>;
}

export function useStoreRegistry(): StoreRegistry {
  const value = useContext(CommiqContext);
  if (!value) {
    throw new Error(
      "[commiq] looking a store up by name requires a <CommiqProvider stores={...}> ancestor",
    );
  }
  return value.stores;
}

export function useNamedStore<S>(name: string): SealedStore<S> {
  return resolveNamedStore<S>(useStoreRegistry(), name);
}
