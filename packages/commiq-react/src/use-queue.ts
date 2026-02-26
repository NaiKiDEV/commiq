import { useCallback } from "react";
import type { SealedStore, Command } from "@naikidev/commiq";

export function useQueue<S>(store: SealedStore<S>): (command: Command) => void {
  return useCallback(
    (command: Command) => {
      store.queue(command);
    },
    [store],
  );
}
