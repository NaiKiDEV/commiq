export const DEFAULT_MAX_DEPTH = 8;

const CIRCULAR = "[Circular]";
const TRUNCATED = "[MaxDepth]";
const UNSERIALIZABLE = "[Unserializable]";
const MAX_COLLECTION_ENTRIES = 200;

export function toSafeJson(value: unknown, maxDepth: number = DEFAULT_MAX_DEPTH): unknown {
  return sanitize(value, 0, maxDepth, new WeakSet<object>());
}

export function safeStringify(value: unknown, maxDepth: number = DEFAULT_MAX_DEPTH): string {
  return stringify(value, maxDepth, undefined);
}

export function safeStringifyPretty(
  value: unknown,
  space: number = 2,
  maxDepth: number = DEFAULT_MAX_DEPTH,
): string {
  return stringify(value, maxDepth, space);
}

function stringify(value: unknown, maxDepth: number, space: number | undefined): string {
  try {
    const result = JSON.stringify(toSafeJson(value, maxDepth), null, space);
    return result ?? String(value);
  } catch {
    return UNSERIALIZABLE;
  }
}

function sanitize(
  value: unknown,
  depth: number,
  maxDepth: number,
  seen: WeakSet<object>,
): unknown {
  const primitive = sanitizePrimitive(value);
  if (primitive !== undefined) return primitive.value;
  const target = value as object;

  if (seen.has(target)) return CIRCULAR;
  if (depth >= maxDepth) return TRUNCATED;

  seen.add(target);
  try {
    return sanitizeObject(target, depth, maxDepth, seen);
  } catch {
    return UNSERIALIZABLE;
  } finally {
    seen.delete(target);
  }
}

function sanitizePrimitive(value: unknown): { value: unknown } | undefined {
  if (value === null) return { value: null };
  const kind = typeof value;
  if (kind === "bigint") return { value: `${String(value)}n` };
  if (kind === "function") return { value: `[Function ${functionName(value)}]` };
  if (kind === "symbol") return { value: String(value) };
  if (kind === "number") return { value: Number.isFinite(value) ? value : String(value) };
  if (kind !== "object") return { value };
  return undefined;
}

function functionName(value: unknown): string {
  const named = value as { name?: unknown };
  return typeof named.name === "string" && named.name.length > 0 ? named.name : "anonymous";
}

function sanitizeObject(
  target: object,
  depth: number,
  maxDepth: number,
  seen: WeakSet<object>,
): unknown {
  const next = depth + 1;
  if (Array.isArray(target)) {
    return target.slice(0, MAX_COLLECTION_ENTRIES).map((item) => sanitize(item, next, maxDepth, seen));
  }
  if (target instanceof Date) return target.toISOString();
  if (target instanceof Error) return { name: target.name, message: target.message };
  if (target instanceof Map) return sanitizeMap(target, next, maxDepth, seen);
  if (target instanceof Set) {
    return [...target]
      .slice(0, MAX_COLLECTION_ENTRIES)
      .map((item) => sanitize(item, next, maxDepth, seen));
  }
  return sanitizeRecord(target, next, maxDepth, seen);
}

function sanitizeMap(
  target: Map<unknown, unknown>,
  depth: number,
  maxDepth: number,
  seen: WeakSet<object>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [key, item] of target) {
    if (count >= MAX_COLLECTION_ENTRIES) break;
    out[String(key)] = sanitize(item, depth, maxDepth, seen);
    count += 1;
  }
  return out;
}

function sanitizeRecord(
  target: object,
  depth: number,
  maxDepth: number,
  seen: WeakSet<object>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [key, item] of Object.entries(target)) {
    if (count >= MAX_COLLECTION_ENTRIES) break;
    out[key] = sanitize(item, depth, maxDepth, seen);
    count += 1;
  }
  return out;
}
