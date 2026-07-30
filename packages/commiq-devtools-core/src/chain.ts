import type { TimelineEntry } from "./types";

export type ChainIndex = {
  byCorrelationId: Map<string, TimelineEntry[]>;
  byCausedBy: Map<string, TimelineEntry[]>;
  commandParents: Map<string, string>;
  commandChildren: Map<string, string[]>;
}

type CommandLink = {
  correlationId: string;
  causedBy: string;
}

export function buildChainIndex(entries: readonly TimelineEntry[]): ChainIndex {
  const index: ChainIndex = {
    byCorrelationId: new Map<string, TimelineEntry[]>(),
    byCausedBy: new Map<string, TimelineEntry[]>(),
    commandParents: new Map<string, string>(),
    commandChildren: new Map<string, string[]>(),
  };

  for (const entry of entries) {
    appendEntry(index.byCorrelationId, entry.correlationId, entry);
    if (entry.causedBy !== null) {
      appendEntry(index.byCausedBy, entry.causedBy, entry);
    }
    if (entry.type !== "command") {
      continue;
    }
    const link = commandLinkFrom(entry.data);
    if (link) {
      index.commandParents.set(link.correlationId, link.causedBy);
      appendId(index.commandChildren, link.causedBy, link.correlationId);
    }
  }

  return index;
}

export function collectChain(index: ChainIndex, correlationId: string): TimelineEntry[] {
  const visited = new Set<string>();
  const collected = new Set<TimelineEntry>();
  const frontier = [findRoot(index, correlationId)];

  for (let cursor = 0; cursor < frontier.length; cursor += 1) {
    const id = frontier[cursor];
    if (visited.has(id)) {
      continue;
    }
    visited.add(id);

    for (const entry of index.byCorrelationId.get(id) ?? []) {
      collected.add(entry);
    }
    for (const child of index.byCausedBy.get(id) ?? []) {
      collected.add(child);
      if (!visited.has(child.correlationId)) {
        frontier.push(child.correlationId);
      }
    }
    for (const commandId of index.commandChildren.get(id) ?? []) {
      if (!visited.has(commandId)) {
        frontier.push(commandId);
      }
    }
  }

  return [...collected].sort((a, b) => a.seq - b.seq);
}

function findRoot(index: ChainIndex, correlationId: string): string {
  const visited = new Set<string>([correlationId]);
  let current = correlationId;

  while (true) {
    const parent = parentOf(index, current);
    if (parent === null || visited.has(parent)) {
      return current;
    }
    visited.add(parent);
    current = parent;
  }
}

function parentOf(index: ChainIndex, correlationId: string): string | null {
  for (const entry of index.byCorrelationId.get(correlationId) ?? []) {
    if (entry.causedBy !== null) {
      return entry.causedBy;
    }
  }
  return index.commandParents.get(correlationId) ?? null;
}

function commandLinkFrom(data: unknown): CommandLink | null {
  if (typeof data !== "object" || data === null || !("command" in data)) {
    return null;
  }
  const command = data.command;
  if (typeof command !== "object" || command === null) {
    return null;
  }
  if (!("correlationId" in command) || typeof command.correlationId !== "string") {
    return null;
  }
  if (!("causedBy" in command) || typeof command.causedBy !== "string") {
    return null;
  }
  return { correlationId: command.correlationId, causedBy: command.causedBy };
}

function appendEntry(
  target: Map<string, TimelineEntry[]>,
  key: string,
  entry: TimelineEntry,
): void {
  const existing = target.get(key);
  if (existing) {
    existing.push(entry);
    return;
  }
  target.set(key, [entry]);
}

function appendId(target: Map<string, string[]>, key: string, id: string): void {
  const existing = target.get(key);
  if (existing) {
    if (!existing.includes(id)) {
      existing.push(id);
    }
    return;
  }
  target.set(key, [id]);
}
