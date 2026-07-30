import type { SnapshotMode } from "./types";

const maxDepth = 12;
const maxNodes = 10000;

type CloneBudget = { nodes: number };

export function createSnapshot(value: unknown, mode: SnapshotMode): unknown {
  if (mode === "none") {
    return value;
  }
  if (mode === "structured") {
    return structuredSnapshot(value);
  }
  return safeClone(value);
}

export function safeClone(value: unknown): unknown {
  return cloneValue(value, 0, new Map<object, unknown>(), { nodes: 0 });
}

function structuredSnapshot(value: unknown): unknown {
  if (typeof structuredClone !== "function") {
    return safeClone(value);
  }
  try {
    return structuredClone(value);
  } catch {
    return safeClone(value);
  }
}

function cloneValue(
  value: unknown,
  depth: number,
  seen: Map<object, unknown>,
  budget: CloneBudget,
): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (depth >= maxDepth || budget.nodes >= maxNodes) {
    return value;
  }
  if (seen.has(value)) {
    return seen.get(value);
  }
  budget.nodes += 1;

  if (Array.isArray(value)) {
    return cloneArray(value, depth, seen, budget);
  }
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (value instanceof Map) {
    return cloneMap(value, depth, seen, budget);
  }
  if (value instanceof Set) {
    return cloneSet(value, depth, seen, budget);
  }
  if (!isPlainObject(value)) {
    return value;
  }
  return cloneRecord(value, depth, seen, budget);
}

function cloneArray(
  value: readonly unknown[],
  depth: number,
  seen: Map<object, unknown>,
  budget: CloneBudget,
): unknown[] {
  const copy: unknown[] = [];
  seen.set(value, copy);
  for (const item of value) {
    copy.push(cloneValue(item, depth + 1, seen, budget));
  }
  return copy;
}

function cloneMap(
  value: Map<unknown, unknown>,
  depth: number,
  seen: Map<object, unknown>,
  budget: CloneBudget,
): Map<unknown, unknown> {
  const copy = new Map<unknown, unknown>();
  seen.set(value, copy);
  for (const [key, item] of value) {
    copy.set(key, cloneValue(item, depth + 1, seen, budget));
  }
  return copy;
}

function cloneSet(
  value: Set<unknown>,
  depth: number,
  seen: Map<object, unknown>,
  budget: CloneBudget,
): Set<unknown> {
  const copy = new Set<unknown>();
  seen.set(value, copy);
  for (const item of value) {
    copy.add(cloneValue(item, depth + 1, seen, budget));
  }
  return copy;
}

function cloneRecord(
  value: object,
  depth: number,
  seen: Map<object, unknown>,
  budget: CloneBudget,
): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const [key, item] of safeEntries(value)) {
    copy[key] = cloneValue(item, depth + 1, seen, budget);
  }
  return copy;
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function safeEntries(value: object): [string, unknown][] {
  try {
    return Object.entries(value);
  } catch {
    return [];
  }
}
