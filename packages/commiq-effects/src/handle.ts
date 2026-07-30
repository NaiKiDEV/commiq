import { createCommand } from "@naikidev/commiq";
import type {
  Command,
  CommandDef,
  CommandHandle,
  CommandResult,
} from "@naikidev/commiq";

export type QueueTarget = Command | CommandDef<string, never>;

function isCommandDefTarget(
  target: QueueTarget,
): target is CommandDef<string, never> {
  return "kind" in target && target.kind === "commandDef";
}

export function toCommand(target: QueueTarget, data: unknown): Command {
  if (isCommandDefTarget(target)) return createCommand(target.name, data);
  return target;
}

export function discardedHandle(command: Command): CommandHandle {
  const result: CommandResult = { status: "discarded", command };
  return Object.assign(Promise.resolve(result), {
    command,
    correlationId: command.correlationId,
  });
}
