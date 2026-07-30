import type {
  Command,
  CommandHandle,
  CommandResult,
  CommandStatus,
} from "./types";

export type CommandSettler = {
  command: Command;
  settle: (result: CommandResult) => void;
}

export type SettlerRegistry = {
  register: (command: Command) => CommandHandle;
  settle: (command: Command, status: CommandStatus, error?: unknown) => void;
  settleAll: (status: CommandStatus) => void;
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

export function createSettlerRegistry(): SettlerRegistry {
  const settlers = new Map<string, CommandSettler>();

  const settle = (
    command: Command,
    status: CommandStatus,
    error?: unknown,
  ): void => {
    const settler = settlers.get(command.correlationId);
    if (!settler) return;
    settlers.delete(command.correlationId);
    settler.settle(
      status === "failed" ? { status, command, error } : { status, command },
    );
  };

  return {
    register: (command: Command): CommandHandle => {
      const { handle, settler } = createPendingHandle(command);
      settlers.set(command.correlationId, settler);
      return handle;
    },
    settle,
    settleAll: (status: CommandStatus): void => {
      for (const settler of [...settlers.values()]) {
        settle(settler.command, status);
      }
      settlers.clear();
    },
  };
}
