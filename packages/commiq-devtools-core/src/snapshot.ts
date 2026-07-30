import type { SnapshotMode } from "./types";

const maxDepth = 12;
const maxNodes = 10000;
const unknownPrototypeKind = "value with a custom prototype";

export type AliasReport = {
  path: string;
  kind: string;
}

export type AliasReporter = (report: AliasReport) => void;

type CloneContext = {
  nodes: number;
  seen: Map<object, unknown>;
  trail: unknown[] | undefined;
  report: AliasReporter | undefined;
}

export function createSnapshot(
  value: unknown,
  mode: SnapshotMode,
  report?: AliasReporter,
): unknown {
  if (mode === "none") {
    return value;
  }
  if (mode === "structured") {
    return structuredSnapshot(value);
  }
  return safeClone(value, report);
}

export function safeClone(value: unknown, report?: AliasReporter): unknown {
  return cloneValue(value, 0, {
    nodes: 0,
    seen: new Map<object, unknown>(),
    trail: report ? [] : undefined,
    report,
  });
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

function cloneValue(value: unknown, depth: number, ctx: CloneContext): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (depth >= maxDepth || ctx.nodes >= maxNodes) {
    return value;
  }
  if (ctx.seen.has(value)) {
    return ctx.seen.get(value);
  }
  ctx.nodes += 1;

  if (Array.isArray(value)) {
    return cloneArray(value, depth, ctx);
  }
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (value instanceof Map) {
    reportAlias(ctx, value);
    return cloneMap(value, depth, ctx);
  }
  if (value instanceof Set) {
    reportAlias(ctx, value);
    return cloneSet(value, depth, ctx);
  }
  if (!isPlainObject(value)) {
    reportAlias(ctx, value);
    return value;
  }
  return cloneRecord(value, depth, ctx);
}

function cloneChild(value: unknown, key: unknown, depth: number, ctx: CloneContext): unknown {
  const trail = ctx.trail;
  if (!trail) {
    return cloneValue(value, depth + 1, ctx);
  }
  trail.push(key);
  const cloned = cloneValue(value, depth + 1, ctx);
  trail.pop();
  return cloned;
}

function cloneArray(value: readonly unknown[], depth: number, ctx: CloneContext): unknown[] {
  const copy: unknown[] = [];
  ctx.seen.set(value, copy);
  let index = 0;
  for (const item of value) {
    copy.push(cloneChild(item, index, depth, ctx));
    index += 1;
  }
  return copy;
}

function cloneMap(
  value: Map<unknown, unknown>,
  depth: number,
  ctx: CloneContext,
): Map<unknown, unknown> {
  const copy = new Map<unknown, unknown>();
  ctx.seen.set(value, copy);
  for (const [key, item] of value) {
    copy.set(key, cloneChild(item, key, depth, ctx));
  }
  return copy;
}

function cloneSet(value: Set<unknown>, depth: number, ctx: CloneContext): Set<unknown> {
  const copy = new Set<unknown>();
  ctx.seen.set(value, copy);
  let index = 0;
  for (const item of value) {
    copy.add(cloneChild(item, index, depth, ctx));
    index += 1;
  }
  return copy;
}

function cloneRecord(value: object, depth: number, ctx: CloneContext): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  ctx.seen.set(value, copy);
  for (const [key, item] of safeEntries(value)) {
    copy[key] = cloneChild(item, key, depth, ctx);
  }
  return copy;
}

function reportAlias(ctx: CloneContext, value: object): void {
  const report = ctx.report;
  const trail = ctx.trail;
  if (!report || !trail) {
    return;
  }
  try {
    report({ path: trail.map(keyLabel).join("."), kind: kindOf(value) });
  } catch {
    ctx.report = undefined;
  }
}

function kindOf(value: object): string {
  try {
    const name = value.constructor?.name;
    return name ? name : unknownPrototypeKind;
  } catch {
    return unknownPrototypeKind;
  }
}

function keyLabel(key: unknown): string {
  if (typeof key === "string") {
    return key;
  }
  try {
    return String(key);
  } catch {
    return "?";
  }
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
