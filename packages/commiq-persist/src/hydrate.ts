import { isRecord } from "./internal";
import type { Report } from "./internal";
import { readSnapshot } from "./serialize";
import type { DeepReadonly } from "@naikidev/commiq";
import type { MergeFn, MigrateFn, ValidateFn } from "./types";

export type HydrateOutcome<S> =
  | { status: "hydrate"; state: S }
  | { status: "skip" }
  | { status: "corrupt" };

export type HydrateConfig<S> = {
  version: number;
  deserialize: (raw: string) => unknown;
  migrate?: MigrateFn<S>;
  validate?: ValidateFn<S>;
  merge: MergeFn<S>;
  report: Report;
};

function asState<S>(value: unknown): S {
  return value as S;
}

export function mergeOverInitial<S>(
  persisted: unknown,
  initial: DeepReadonly<S>,
): S | null {
  if (!isRecord(persisted) || !isRecord(initial)) return asState<S>(persisted);
  return asState<S>({ ...initial, ...persisted });
}

function applyMigration<S>(
  state: unknown,
  from: number,
  config: HydrateConfig<S>,
): { ok: true; value: unknown } | { ok: false } {
  if (from === config.version) return { ok: true, value: state };
  if (config.migrate === undefined) {
    config.report(
      "migrate",
      new Error(
        `Persisted version ${from} does not match ${config.version} and no migrate function was provided`,
      ),
    );
    return { ok: false };
  }
  try {
    return { ok: true, value: config.migrate(state, from) };
  } catch (error) {
    config.report("migrate", error);
    return { ok: false };
  }
}

function applyValidation<S>(
  state: unknown,
  config: HydrateConfig<S>,
): { ok: true; value: unknown } | { ok: false } {
  if (config.validate === undefined) return { ok: true, value: state };
  try {
    const validated = config.validate(state);
    if (validated === null) {
      config.report("validate", new Error("Persisted state was rejected"));
      return { ok: false };
    }
    return { ok: true, value: validated };
  } catch (error) {
    config.report("validate", error);
    return { ok: false };
  }
}

export function resolveHydration<S>(
  raw: string,
  initial: DeepReadonly<S>,
  config: HydrateConfig<S>,
): HydrateOutcome<S> {
  let parsed: unknown;
  try {
    parsed = config.deserialize(raw);
  } catch (error) {
    config.report("deserialize", error, raw);
    return { status: "corrupt" };
  }

  const snapshot = readSnapshot(parsed);
  const migrated = applyMigration(snapshot.state, snapshot.version, config);
  if (!migrated.ok) return { status: "skip" };

  const validated = applyValidation(migrated.value, config);
  if (!validated.ok) return { status: "skip" };

  let merged: S | null;
  try {
    merged = config.merge(validated.value, initial);
  } catch (error) {
    config.report("merge", error);
    return { status: "skip" };
  }
  if (merged === null) {
    config.report("merge", new Error("Merge rejected the persisted state"));
    return { status: "skip" };
  }
  return { status: "hydrate", state: merged };
}
