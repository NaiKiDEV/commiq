import { isRecord } from "./internal";
import type {
  JsonReplacer,
  JsonReviver,
  PersistedSnapshot,
} from "./types";

const envelopeMarker = "commiq/persist";
const richTag = "$commiqType";

type Envelope = {
  $: typeof envelopeMarker;
  version: number;
  state: unknown;
};

type RichTagged = {
  [richTag]: string;
  value?: unknown;
};

export const LEGACY_VERSION = 0;

export function createSerializer(
  replacer?: JsonReplacer,
): (snapshot: PersistedSnapshot) => string {
  return (snapshot) => {
    const envelope: Envelope = {
      $: envelopeMarker,
      version: snapshot.version,
      state: snapshot.state,
    };
    return JSON.stringify(envelope, replacer);
  };
}

export function createDeserializer(
  reviver?: JsonReviver,
): (raw: string) => unknown {
  return (raw) => JSON.parse(raw, reviver);
}

export function readSnapshot(parsed: unknown): PersistedSnapshot {
  if (
    isRecord(parsed) &&
    parsed.$ === envelopeMarker &&
    typeof parsed.version === "number"
  ) {
    return { version: parsed.version, state: parsed.state };
  }
  return { version: LEGACY_VERSION, state: parsed };
}

function readHolder(holder: unknown, key: string): unknown {
  if (typeof holder !== "object" || holder === null) return undefined;
  const value: unknown = Reflect.get(holder, key);
  return value;
}

function tag(type: string, value?: unknown): RichTagged {
  return value === undefined
    ? { [richTag]: type }
    : { [richTag]: type, value };
}

export function richReplacer(
  this: unknown,
  key: string,
  value: unknown,
): unknown {
  const source = readHolder(this, key);
  if (source instanceof Date) return tag("Date", source.toISOString());
  if (source instanceof Map) return tag("Map", Array.from(source.entries()));
  if (source instanceof Set) return tag("Set", Array.from(source.values()));
  if (typeof source === "bigint") return tag("BigInt", source.toString());
  if (source === undefined && value === undefined) return tag("undefined");
  if (typeof value === "number" && Number.isNaN(value)) return tag("NaN");
  if (value === Infinity) return tag("Infinity");
  if (value === -Infinity) return tag("-Infinity");
  return value;
}

const richDecoders: Record<string, (value: unknown) => unknown> = {
  Date: (value) => new Date(String(value)),
  Map: (value) => new Map(Array.isArray(value) ? readEntries(value) : []),
  Set: (value) => new Set(Array.isArray(value) ? value : []),
  BigInt: (value) => BigInt(String(value)),
  undefined: () => undefined,
  NaN: () => Number.NaN,
  Infinity: () => Infinity,
  "-Infinity": () => -Infinity,
};

function readEntries(value: unknown[]): [unknown, unknown][] {
  const entries: [unknown, unknown][] = [];
  for (const entry of value) {
    if (Array.isArray(entry) && entry.length === 2) {
      entries.push([entry[0], entry[1]]);
    }
  }
  return entries;
}

export function richReviver(_key: string, value: unknown): unknown {
  if (!isRecord(value)) return value;
  const type = value[richTag];
  if (typeof type !== "string") return value;
  const decoder = richDecoders[type];
  if (decoder === undefined) return value;
  return decoder(value.value);
}
