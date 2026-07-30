import type { Command, CommandHandle, CommandResult } from "./types";

export type CommandSettler = {
  command: Command;
  settle: (result: CommandResult) => void;
}

function attach(
  command: Command,
  promise: Promise<CommandResult>,
): CommandHandle {
  return Object.assign(promise, {
    command,
    correlationId: command.correlationId,
  });
}

export function createPendingHandle(command: Command): {
  handle: CommandHandle;
  settler: CommandSettler;
} {
  let settle: (result: CommandResult) => void = () => {};
  const promise = new Promise<CommandResult>((resolve) => {
    settle = resolve;
  });

  return { handle: attach(command, promise), settler: { command, settle } };
}

export function createSettledHandle(result: CommandResult): CommandHandle {
  return attach(result.command, Promise.resolve(result));
}
