import { isProductionEnv } from "./env";

function isContainer(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  if (Array.isArray(value)) return true;
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === null || proto === Object.prototype;
}

function freezeDeep(value: unknown, seen: WeakSet<object>): void {
  if (!isContainer(value)) return;
  if (Object.isFrozen(value) || seen.has(value)) return;

  seen.add(value);
  for (const key of Object.keys(value)) {
    freezeDeep(value[key], seen);
  }
  Object.freeze(value);
}

export function freezeState<T>(state: T): T {
  if (isProductionEnv()) return state;
  freezeDeep(state, new WeakSet<object>());
  return state;
}
