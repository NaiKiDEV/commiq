import { BuiltinEventName } from "@naikidev/commiq";
import type { TimelineEntry } from "@naikidev/commiq-devtools-core";
import { getCommandFromEntry } from "./types";

export const MAX_CHAIN_DEPTH = 64;

const ROOT_PREFIX = "__root_";

export type CausalityIndex = {
  entryByCorrelationId: Map<string, TimelineEntry>;
  entriesByCausedBy: Map<string, TimelineEntry[]>;
  parentEventOfCommand: Map<string, string>;
  commandsByParentEvent: Map<string, string[]>;
}

export type CommandGroup = {
  commandId: string;
  commandName: string;
  storeName: string;
  events: TimelineEntry[];
  children: CommandGroup[];
  timestamp: number;
}

export type StoreEdge = {
  from: string;
  to: string;
  commands: Set<string>;
  count: number;
}

export function groupKeyOf(entry: TimelineEntry): string {
  return entry.causedBy ?? ROOT_PREFIX + entry.correlationId;
}

export function buildCausalityIndex(timeline: readonly TimelineEntry[]): CausalityIndex {
  const index: CausalityIndex = {
    entryByCorrelationId: new Map(),
    entriesByCausedBy: new Map(),
    parentEventOfCommand: new Map(),
    commandsByParentEvent: new Map(),
  };

  for (const entry of timeline) {
    if (!index.entryByCorrelationId.has(entry.correlationId)) {
      index.entryByCorrelationId.set(entry.correlationId, entry);
    }
    if (entry.causedBy !== null) {
      push(index.entriesByCausedBy, entry.causedBy, entry);
    }
    if (entry.name !== BuiltinEventName.CommandStarted || entry.causedBy === null) {
      continue;
    }
    const parentEventId = getCommandFromEntry(entry)?.causedBy;
    if (!parentEventId) continue;
    index.parentEventOfCommand.set(entry.causedBy, parentEventId);
    pushId(index.commandsByParentEvent, parentEventId, entry.causedBy);
  }

  return index;
}

export function collectChainIds(index: CausalityIndex, startId: string): Set<string> {
  const ids = new Set<string>();
  const seed = index.entryByCorrelationId.get(startId);
  const rootCommandId = seed?.causedBy ?? null;

  ids.add(startId);
  addCommandGroup(index, rootCommandId, ids);
  walkAncestors(index, rootCommandId, ids);
  walkDescendants(index, ids);

  return ids;
}

function walkAncestors(index: CausalityIndex, commandId: string | null, ids: Set<string>): void {
  let cursor = commandId;
  let depth = 0;
  const seen = new Set<string>();

  while (cursor !== null && depth < MAX_CHAIN_DEPTH && !seen.has(cursor)) {
    seen.add(cursor);
    depth += 1;
    const parentEventId = index.parentEventOfCommand.get(cursor);
    if (parentEventId === undefined) return;
    const parentEvent = index.entryByCorrelationId.get(parentEventId);
    if (parentEvent === undefined) return;
    ids.add(parentEventId);
    addCommandGroup(index, parentEvent.causedBy, ids);
    cursor = parentEvent.causedBy;
  }
}

function walkDescendants(index: CausalityIndex, ids: Set<string>): void {
  const frontier = [...ids];

  for (let cursor = 0; cursor < frontier.length; cursor += 1) {
    const id = frontier[cursor];
    for (const commandId of index.commandsByParentEvent.get(id) ?? []) {
      for (const entry of index.entriesByCausedBy.get(commandId) ?? []) {
        if (ids.has(entry.correlationId)) continue;
        ids.add(entry.correlationId);
        frontier.push(entry.correlationId);
      }
    }
  }
}

function addCommandGroup(
  index: CausalityIndex,
  commandId: string | null,
  ids: Set<string>,
): void {
  if (commandId === null) return;
  for (const entry of index.entriesByCausedBy.get(commandId) ?? []) {
    ids.add(entry.correlationId);
  }
}

export function buildCommandGroups(
  index: CausalityIndex,
  timeline: readonly TimelineEntry[],
): CommandGroup[] {
  if (timeline.length === 0) return [];

  const groups = groupEntries(timeline);
  const parents = resolveParentKeys(index, groups);
  const roots: CommandGroup[] = [];

  for (const [key, group] of groups) {
    const parentKey = parents.get(key);
    const parent = parentKey === undefined ? undefined : groups.get(parentKey);
    if (parent) {
      parent.children.push(group);
      continue;
    }
    roots.push(group);
  }

  roots.sort((a, b) => b.timestamp - a.timestamp);
  return roots;
}

function groupEntries(timeline: readonly TimelineEntry[]): Map<string, CommandGroup> {
  const buckets = new Map<string, TimelineEntry[]>();
  for (const entry of timeline) {
    const key = groupKeyOf(entry);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(entry);
      continue;
    }
    buckets.set(key, [entry]);
  }

  const groups = new Map<string, CommandGroup>();
  for (const [commandId, entries] of buckets) {
    const events = [...entries].sort((a, b) => a.timestamp - b.timestamp);
    const started = events.find((e) => e.name === BuiltinEventName.CommandStarted);
    const command = started ? getCommandFromEntry(started) : undefined;
    groups.set(commandId, {
      commandId,
      commandName: command?.name ?? events[0]?.name ?? "unknown",
      storeName: events[0]?.storeName ?? "unknown",
      events,
      children: [],
      timestamp: events[0]?.timestamp ?? 0,
    });
  }
  return groups;
}

function resolveParentKeys(
  index: CausalityIndex,
  groups: Map<string, CommandGroup>,
): Map<string, string> {
  const parents = new Map<string, string>();

  for (const key of groups.keys()) {
    const parentEventId = index.parentEventOfCommand.get(key);
    if (parentEventId === undefined) continue;
    const parentEvent = index.entryByCorrelationId.get(parentEventId);
    if (parentEvent === undefined) continue;
    const parentKey = groupKeyOf(parentEvent);
    if (parentKey === key || !groups.has(parentKey)) continue;
    parents.set(key, parentKey);
  }

  return breakCycles(parents);
}

function breakCycles(parents: Map<string, string>): Map<string, string> {
  for (const key of [...parents.keys()]) {
    const path = new Set<string>([key]);
    let cursor = key;
    let depth = 0;

    while (depth < MAX_CHAIN_DEPTH) {
      const parent = parents.get(cursor);
      if (parent === undefined) break;
      if (path.has(parent)) {
        parents.delete(cursor);
        break;
      }
      path.add(parent);
      cursor = parent;
      depth += 1;
    }

    if (depth >= MAX_CHAIN_DEPTH) parents.delete(key);
  }
  return parents;
}

export function buildStoreEdges(
  index: CausalityIndex,
  timeline: readonly TimelineEntry[],
): StoreEdge[] {
  const storeOfEvent = new Map<string, string>();
  for (const entry of timeline) {
    storeOfEvent.set(entry.correlationId, entry.storeName);
  }

  const edges = new Map<string, StoreEdge>();

  for (const entry of timeline) {
    if (entry.name !== BuiltinEventName.CommandStarted || entry.causedBy === null) continue;
    const command = getCommandFromEntry(entry);
    const parentEventId = index.parentEventOfCommand.get(entry.causedBy);
    if (!parentEventId) continue;

    const from = storeOfEvent.get(parentEventId);
    const to = entry.storeName;
    if (!from || from === to) continue;

    const key = `${from}→${to}`;
    const name = command?.name ?? "unknown";
    const existing = edges.get(key);
    if (existing) {
      existing.commands.add(name);
      existing.count += 1;
      continue;
    }
    edges.set(key, { from, to, commands: new Set([name]), count: 1 });
  }

  return [...edges.values()];
}

export function edgeSignature(edges: readonly StoreEdge[]): string {
  return edges
    .map((e) => `${e.from}→${e.to}:${e.count}:[${[...e.commands].sort().join(",")}]`)
    .sort()
    .join("|");
}

function push(target: Map<string, TimelineEntry[]>, key: string, entry: TimelineEntry): void {
  const existing = target.get(key);
  if (existing) {
    existing.push(entry);
    return;
  }
  target.set(key, [entry]);
}

function pushId(target: Map<string, string[]>, key: string, id: string): void {
  const existing = target.get(key);
  if (existing) {
    if (!existing.includes(id)) existing.push(id);
    return;
  }
  target.set(key, [id]);
}
