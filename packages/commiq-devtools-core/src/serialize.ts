import type { DevtoolsErrorHandler, DevtoolsMessage, TimelineEntry } from "./types";
import { safeEntries } from "./snapshot";

const maxDepth = 12;
const maxNodes = 10000;
const unserializablePlaceholder = "[Unserializable]";

type SerializeBudget = { nodes: number };

export function toSerializable(value: unknown): unknown {
  return serializeValue(value, 0, new Map<object, unknown>(), { nodes: 0 });
}

export function sanitizeMessage(message: DevtoolsMessage): DevtoolsMessage {
  if (message.type === "EVENT") {
    return { type: "EVENT", entry: sanitizeEntry(message.entry) };
  }
  if (message.type === "STORE_CONNECTED") {
    return { ...message, initialState: toSerializable(message.initialState) };
  }
  if (message.type === "STATE_SNAPSHOT") {
    return { ...message, state: toSerializable(message.state) };
  }
  return message;
}

export function sanitizeEntry(entry: TimelineEntry): TimelineEntry {
  const sanitized: TimelineEntry = { ...entry, data: toSerializable(entry.data) };
  if ("stateBefore" in entry) {
    sanitized.stateBefore = toSerializable(entry.stateBefore);
  }
  if ("stateAfter" in entry) {
    sanitized.stateAfter = toSerializable(entry.stateAfter);
  }
  return sanitized;
}

export function sendSafely(
  send: (message: DevtoolsMessage) => void,
  message: DevtoolsMessage,
  onError: DevtoolsErrorHandler,
): void {
  try {
    send(message);
    return;
  } catch (error) {
    onError(error);
  }
  try {
    send(sanitizeMessage(message));
  } catch (error) {
    onError(error);
  }
}

function serializeValue(
  value: unknown,
  depth: number,
  seen: Map<object, unknown>,
  budget: SerializeBudget,
): unknown {
  if (typeof value === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }
  if (typeof value === "symbol") {
    return `[Symbol ${value.description ?? ""}]`;
  }
  if (typeof value === "bigint") {
    return `${value.toString()}n`;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (depth >= maxDepth || budget.nodes >= maxNodes) {
    return unserializablePlaceholder;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  budget.nodes += 1;
  return serializeObject(value, depth, seen, budget);
}

function serializeObject(
  value: object,
  depth: number,
  seen: Map<object, unknown>,
  budget: SerializeBudget,
): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const item of value) {
      copy.push(serializeValue(item, depth + 1, seen, budget));
    }
    return copy;
  }
  if (value instanceof Map) {
    return serializeEntryList([...value], depth, seen, budget, value);
  }
  if (value instanceof Set) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const item of value) {
      copy.push(serializeValue(item, depth + 1, seen, budget));
    }
    return copy;
  }
  return serializeEntryList(safeEntries(value), depth, seen, budget, value);
}

function serializeEntryList(
  entries: readonly [unknown, unknown][],
  depth: number,
  seen: Map<object, unknown>,
  budget: SerializeBudget,
  source: object,
): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  seen.set(source, copy);
  for (const [key, item] of entries) {
    copy[String(key)] = serializeValue(item, depth + 1, seen, budget);
  }
  return copy;
}
