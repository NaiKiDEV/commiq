import type { TimelineEntry } from "@naikidev/commiq-devtools-core";

let seq = 0;

export function resetSeq(): void {
  seq = 0;
}

type EntryOverrides = Partial<TimelineEntry> & { correlationId: string };

export function entry(overrides: EntryOverrides): TimelineEntry {
  seq += 1;
  return {
    seq,
    storeName: "store",
    type: "event",
    name: "somethingHappened",
    eventId: "somethingHappened",
    data: undefined,
    causedBy: null,
    timestamp: seq,
    ...overrides,
  };
}

export function commandStarted(options: {
  correlationId: string;
  commandId: string;
  commandName: string;
  storeName?: string;
  parentEventId?: string | null;
}): TimelineEntry {
  return entry({
    correlationId: options.correlationId,
    causedBy: options.commandId,
    name: "commandStarted",
    eventId: "commandStarted",
    type: "command",
    storeName: options.storeName ?? "store",
    data: {
      command: {
        name: options.commandName,
        correlationId: options.commandId,
        causedBy: options.parentEventId ?? null,
      },
    },
  });
}
