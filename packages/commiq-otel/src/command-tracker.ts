import { SpanStatusCode } from "@opentelemetry/api";
import type { Span } from "@opentelemetry/api";

export const ABANDON_TIMEOUT = "timeout";
export const ABANDON_OVERFLOW = "overflow";
export const ABANDON_DISPOSED = "disposed";

type PendingCommand = {
  span: Span;
  startedAt: number;
}

export type CommandTrackerOptions = {
  maxCommandDurationMs: number;
  maxPendingCommands: number;
}

export type CommandTracker = {
  start: (commandId: string, span: Span) => void;
  live: (commandId: string | null) => Span | undefined;
  settle: (commandId: string, finish: (span: Span) => void) => boolean;
  sweep: () => void;
  pendingCount: () => number;
  dispose: () => void;
}

export function createCommandTracker(
  options: CommandTrackerOptions,
): CommandTracker {
  const { maxCommandDurationMs, maxPendingCommands } = options;
  const pending = new Map<string, PendingCommand>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = (): void => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };

  const oldestStartedAt = (): number | null => {
    const first = pending.values().next();
    return first.done ? null : first.value.startedAt;
  };

  const abandon = (commandId: string, reason: string): void => {
    const entry = pending.get(commandId);
    if (!entry) return;
    pending.delete(commandId);
    entry.span.setAttribute("commiq.command.abandoned", true);
    entry.span.setAttribute("commiq.command.abandoned_reason", reason);
    entry.span.setStatus({
      code: SpanStatusCode.ERROR,
      message: `command abandoned (${reason})`,
    });
    entry.span.end();
  };

  const sweep = (): void => {
    if (maxCommandDurationMs <= 0 || pending.size === 0) return;
    const deadline = Date.now() - maxCommandDurationMs;
    for (const [commandId, entry] of [...pending]) {
      if (entry.startedAt > deadline) break;
      abandon(commandId, ABANDON_TIMEOUT);
    }
    if (pending.size === 0) clearTimer();
  };

  const onTimer = (): void => {
    timer = null;
    sweep();
    schedule();
  };

  const schedule = (): void => {
    if (maxCommandDurationMs <= 0 || timer !== null) return;
    const oldest = oldestStartedAt();
    if (oldest === null) return;
    const elapsed = Date.now() - oldest;
    timer = setTimeout(onTimer, Math.max(1, maxCommandDurationMs - elapsed));
  };

  const enforceCap = (): void => {
    while (pending.size > maxPendingCommands) {
      const oldest = pending.keys().next();
      if (oldest.done) return;
      abandon(oldest.value, ABANDON_OVERFLOW);
    }
  };

  return {
    start: (commandId: string, span: Span): void => {
      pending.set(commandId, { span, startedAt: Date.now() });
      enforceCap();
      schedule();
    },
    live: (commandId: string | null): Span | undefined =>
      commandId === null ? undefined : pending.get(commandId)?.span,
    settle: (commandId: string, finish: (span: Span) => void): boolean => {
      const entry = pending.get(commandId);
      if (!entry) return false;
      pending.delete(commandId);
      try {
        finish(entry.span);
      } finally {
        entry.span.end();
        if (pending.size === 0) clearTimer();
      }
      return true;
    },
    sweep,
    pendingCount: (): number => pending.size,
    dispose: (): void => {
      clearTimer();
      for (const commandId of [...pending.keys()]) {
        abandon(commandId, ABANDON_DISPOSED);
      }
    },
  };
}
