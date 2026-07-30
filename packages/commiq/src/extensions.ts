import {
  RESERVED_COMMAND_CONTEXT_KEYS,
  RESERVED_EVENT_CONTEXT_KEYS,
} from "./constants";
import { runSafe } from "./run-safe";
import type { ErrorSink } from "./run-safe";
import type {
  AnyContextExtension,
  Command,
  CommandContext,
  EventContext,
  StoreEvent,
} from "./types";

export type AfterHookName = "afterCommand" | "afterEvent";

function assignProps(
  target: object,
  props: Record<string, unknown>,
  reserved: Set<string>,
  claimed: Set<string>,
): void {
  for (const key of Object.keys(props)) {
    if (reserved.has(key) || claimed.has(key)) {
      throw new Error(
        `Context extension key "${key}" conflicts with existing context property`,
      );
    }
    claimed.add(key);
  }
  Object.assign(target, props);
}

export function applyCommandExtensions<S>(
  extensions: ReadonlyArray<AnyContextExtension<S>>,
  ctx: CommandContext<S>,
  command: Command,
): void {
  const claimed = new Set<string>();
  for (const ext of extensions) {
    if (!ext.command) continue;
    assignProps(
      ctx,
      ext.command(ctx, command),
      RESERVED_COMMAND_CONTEXT_KEYS,
      claimed,
    );
  }
}

export function applyEventExtensions<S>(
  extensions: ReadonlyArray<AnyContextExtension<S>>,
  ctx: EventContext<S>,
  event: StoreEvent,
): void {
  const claimed = new Set<string>();
  for (const ext of extensions) {
    if (!ext.event) continue;
    assignProps(
      ctx,
      ext.event(ctx, event),
      RESERVED_EVENT_CONTEXT_KEYS,
      claimed,
    );
  }
}

export function destroyExtensions<S>(
  extensions: ReadonlyArray<AnyContextExtension<S>>,
  onError: ErrorSink,
): void {
  for (const ext of extensions) {
    if (!ext.destroy) continue;
    try {
      ext.destroy();
    } catch (error) {
      onError(error);
    }
  }
}

export async function runAfterHooks<S>(
  extensions: ReadonlyArray<AnyContextExtension<S>>,
  name: AfterHookName,
  onError: ErrorSink,
): Promise<void> {
  for (const ext of extensions) {
    const hook = ext[name];
    if (!hook) continue;
    await runSafe(() => hook(), onError);
  }
}
