import type { ReactNode } from "react";
import type { SealedStore } from "@naikidev/commiq";

export type CommiqContextValue = {
  stores: Record<string, SealedStore<any>>;
}

export type CommiqProviderProps = {
  stores: Record<string, SealedStore<any>>;
  children?: ReactNode;
}
