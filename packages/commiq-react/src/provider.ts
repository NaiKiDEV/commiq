import { createContext, createElement } from "react";
import type { CommiqContextValue, CommiqProviderProps } from "./types";

export const CommiqContext = createContext<CommiqContextValue | null>(null);

export function CommiqProvider({ stores, children }: CommiqProviderProps) {
  return createElement(CommiqContext.Provider, { value: { stores } }, children);
}
