import type { Unsubscribe } from "./types";

export const DEFAULT_SUSPEND_WARNING_MS = 5000;

export type SuspensionOptions = {
  warningMs: number;
  onWarn: (heldMs: number) => void;
  onResume: () => void;
};

export type SuspensionGate = {
  suspend: () => Unsubscribe;
  readonly isSuspended: boolean;
  reset: () => void;
};

export function createSuspensionGate(
  options: SuspensionOptions,
): SuspensionGate {
  let count = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearWarning = (): void => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
  };

  const armWarning = (): void => {
    if (options.warningMs <= 0) return;
    timer = setTimeout(() => {
      timer = undefined;
      options.onWarn(options.warningMs);
    }, options.warningMs);
  };

  const suspend = (): Unsubscribe => {
    count += 1;
    if (count === 1) armWarning();

    let isReleased = false;
    return () => {
      if (isReleased) return;
      isReleased = true;
      if (count === 0) return;
      count -= 1;
      if (count > 0) return;
      clearWarning();
      options.onResume();
    };
  };

  return {
    suspend,
    get isSuspended(): boolean {
      return count > 0;
    },
    reset: (): void => {
      count = 0;
      clearWarning();
    },
  };
}
