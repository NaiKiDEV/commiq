import type { Command } from "@naikidev/commiq";
import type { TimelineEntry } from "@naikidev/commiq-devtools-core";

export type CommandStartedData = {
  command: Command;
}

export function getCommandFromEntry(entry: TimelineEntry): Command | undefined {
  if (entry.name !== "commandStarted") return undefined;
  const data = entry.data as CommandStartedData | undefined;
  return data?.command;
}
