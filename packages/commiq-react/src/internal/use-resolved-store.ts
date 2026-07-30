import { useContext } from "react";
import type { SealedStore } from "@naikidev/commiq";
import { CommiqContext } from "../provider";
import { resolveNamedStore } from "../use-named-store";
import type { StoreSource } from "../types";

export function useResolvedStore<S>(source: StoreSource<S>): SealedStore<S> {
  const value = useContext(CommiqContext);
  if (typeof source !== "string") return source;

  if (!value) {
    throw new Error(
      `[commiq] store "${source}" was requested by name but no <CommiqProvider stores={...}> ancestor exists`,
    );
  }
  return resolveNamedStore<S>(value.stores, source);
}
