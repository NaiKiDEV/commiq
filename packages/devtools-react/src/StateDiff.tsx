import { useMemo, type CSSProperties } from "react";
import { colors, fonts } from "./theme";

type StateDiffProps = {
  before: unknown;
  after: unknown;
}

type DiffEntry =
  | { type: "added"; path: string; value: unknown }
  | { type: "removed"; path: string; value: unknown }
  | { type: "changed"; path: string; oldValue: unknown; newValue: unknown }
  | { type: "unchanged"; path: string; value: unknown };

export function StateDiff({ before, after }: StateDiffProps) {
  const entries = useMemo(() => computeDiff(before, after), [before, after]);

  const changed = entries.filter((e) => e.type !== "unchanged");

  if (changed.length === 0) {
    return <div style={styles.noChanges}>No state changes detected</div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.summary}>{summarize(entries)}</div>
      <div style={styles.entries}>
        {changed.map((entry, i) => (
          <DiffRow key={i} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function DiffRow({ entry }: { entry: DiffEntry }) {
  if (entry.type === "added") {
    return (
      <div style={{ ...styles.row, ...styles.addedRow }}>
        <span style={styles.indicator}>+</span>
        <span style={styles.path}>{entry.path}</span>
        <span style={styles.value}>{formatValue(entry.value)}</span>
      </div>
    );
  }

  if (entry.type === "removed") {
    return (
      <div style={{ ...styles.row, ...styles.removedRow }}>
        <span style={styles.indicator}>−</span>
        <span style={styles.path}>{entry.path}</span>
        <span style={styles.valueStrike}>{formatValue(entry.value)}</span>
      </div>
    );
  }

  if (entry.type === "changed") {
    return (
      <div style={{ ...styles.row, ...styles.changedRow }}>
        <span style={styles.indicator}>~</span>
        <span style={styles.path}>{entry.path}</span>
        <span style={styles.valueOld}>{formatValue(entry.oldValue)}</span>
        <span style={styles.arrow}>→</span>
        <span style={styles.valueNew}>{formatValue(entry.newValue)}</span>
      </div>
    );
  }

  return null;
}

function computeDiff(before: unknown, after: unknown): DiffEntry[] {
  const entries: DiffEntry[] = [];
  diffRecursive(before, after, "", entries);
  return entries;
}

function diffRecursive(
  a: unknown,
  b: unknown,
  path: string,
  out: DiffEntry[],
): void {
  if (a === b) {
    out.push({ type: "unchanged", path: path || "(root)", value: a });
    return;
  }

  if (
    a !== null &&
    b !== null &&
    typeof a === "object" &&
    typeof b === "object" &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);

    for (const key of allKeys) {
      const childPath = path ? `${path}.${key}` : key;
      if (!(key in aObj)) {
        out.push({ type: "added", path: childPath, value: bObj[key] });
      } else if (!(key in bObj)) {
        out.push({ type: "removed", path: childPath, value: aObj[key] });
      } else {
        diffRecursive(aObj[key], bObj[key], childPath, out);
      }
    }
    return;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      const childPath = `${path}[${i}]`;
      if (i >= a.length) {
        out.push({ type: "added", path: childPath, value: b[i] });
      } else if (i >= b.length) {
        out.push({ type: "removed", path: childPath, value: a[i] });
      } else {
        diffRecursive(a[i], b[i], childPath, out);
      }
    }
    return;
  }

  out.push({
    type: "changed",
    path: path || "(root)",
    oldValue: a,
    newValue: b,
  });
}

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function summarize(entries: DiffEntry[]): string {
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const e of entries) {
    if (e.type === "added") added++;
    else if (e.type === "removed") removed++;
    else if (e.type === "changed") changed++;
  }
  const parts: string[] = [];
  if (changed) parts.push(`${changed} changed`);
  if (added) parts.push(`${added} added`);
  if (removed) parts.push(`${removed} removed`);
  return parts.join(", ");
}

const diffColors = {
  addedBg: "rgba(52, 211, 153, 0.08)",
  addedFg: "#34d399",
  removedBg: "rgba(248, 113, 113, 0.08)",
  removedFg: "#f87171",
  changedBg: "rgba(251, 191, 36, 0.06)",
  changedFg: "#fbbf24",
} as const;

const styles: Record<string, CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  noChanges: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    padding: "6px 0",
  },
  summary: {
    fontSize: 10,
    color: colors.textSecondary,
    fontFamily: fonts.sans,
    marginBottom: 2,
  },
  entries: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
  },
  row: {
    display: "flex",
    alignItems: "baseline",
    gap: 6,
    padding: "3px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontFamily: fonts.mono,
    lineHeight: 1.5,
  },
  addedRow: {
    backgroundColor: diffColors.addedBg,
  },
  removedRow: {
    backgroundColor: diffColors.removedBg,
  },
  changedRow: {
    backgroundColor: diffColors.changedBg,
  },
  indicator: {
    fontWeight: 700,
    width: 12,
    flexShrink: 0,
    textAlign: "center" as const,
  },
  path: {
    color: colors.key,
    fontWeight: 500,
    flexShrink: 0,
  },
  value: {
    color: diffColors.addedFg,
    wordBreak: "break-all" as const,
  },
  valueStrike: {
    color: diffColors.removedFg,
    textDecoration: "line-through",
    opacity: 0.7,
    wordBreak: "break-all" as const,
  },
  valueOld: {
    color: diffColors.removedFg,
    textDecoration: "line-through",
    opacity: 0.7,
    wordBreak: "break-all" as const,
  },
  arrow: {
    color: colors.textMuted,
    flexShrink: 0,
  },
  valueNew: {
    color: diffColors.changedFg,
    wordBreak: "break-all" as const,
  },
};
