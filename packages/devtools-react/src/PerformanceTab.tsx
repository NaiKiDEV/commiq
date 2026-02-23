import { useState, useMemo, type CSSProperties } from "react";
import type { TimelineEntry } from "@naikidev/commiq-devtools";
import { colors, fonts } from "./theme";

interface PerformanceTabProps {
  timeline: TimelineEntry[];
  storeNames: string[];
}

interface CommandStats {
  name: string;
  storeName: string;
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
}

interface StoreStats {
  storeName: string;
  totalCommands: number;
  totalEvents: number;
  totalMs: number;
  avgMs: number;
  commands: CommandStats[];
}

export function PerformanceTab({
  timeline,
  storeNames,
}: PerformanceTabProps) {
  const [storeFilter, setStoreFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"total" | "avg" | "max" | "count">(
    "total",
  );

  const storeStats = useMemo(() => {
    const commandPairs = new Map<
      string,
      { start: number; end: number; name: string; storeName: string }[]
    >();

    const started = new Map<string, TimelineEntry>();
    for (const e of timeline) {
      if (e.name === "commandStarted" && e.causedBy) {
        started.set(e.causedBy, e);
      }
      if (e.name === "commandHandled" || e.name === "commandHandlingError") {
        const cb = e.causedBy;
        const s = cb ? started.get(cb) : undefined;
        if (s && cb) {
          const cmdName =
            (s.data as any)?.command?.name ?? "unknown";
          const key = `${e.storeName}::${cmdName}`;
          const pairs = commandPairs.get(key) ?? [];
          pairs.push({
            start: s.timestamp,
            end: e.timestamp,
            name: cmdName,
            storeName: e.storeName,
          });
          commandPairs.set(key, pairs);
          started.delete(cb);
        }
      }
    }

    const eventCounts = new Map<string, number>();
    for (const e of timeline) {
      eventCounts.set(e.storeName, (eventCounts.get(e.storeName) ?? 0) + 1);
    }

    const statsMap = new Map<string, StoreStats>();

    for (const storeName of storeNames) {
      statsMap.set(storeName, {
        storeName,
        totalCommands: 0,
        totalEvents: eventCounts.get(storeName) ?? 0,
        totalMs: 0,
        avgMs: 0,
        commands: [],
      });
    }

    for (const [, pairs] of commandPairs) {
      if (pairs.length === 0) continue;
      const { name, storeName } = pairs[0];
      const durations = pairs.map((p) => p.end - p.start);
      const totalMs = durations.reduce((a, b) => a + b, 0);
      const minMs = Math.min(...durations);
      const maxMs = Math.max(...durations);
      const avgMs = totalMs / durations.length;

      const stat: CommandStats = {
        name,
        storeName,
        count: durations.length,
        totalMs,
        minMs,
        maxMs,
        avgMs,
      };

      const store = statsMap.get(storeName);
      if (store) {
        store.commands.push(stat);
        store.totalCommands += stat.count;
        store.totalMs += totalMs;
      }
    }

    for (const store of statsMap.values()) {
      store.avgMs =
        store.totalCommands > 0 ? store.totalMs / store.totalCommands : 0;

      const sortFns: Record<
        string,
        (a: CommandStats, b: CommandStats) => number
      > = {
        total: (a, b) => b.totalMs - a.totalMs,
        avg: (a, b) => b.avgMs - a.avgMs,
        max: (a, b) => b.maxMs - a.maxMs,
        count: (a, b) => b.count - a.count,
      };
      store.commands.sort(sortFns[sortBy]);
    }

    const result = [...statsMap.values()];
    if (storeFilter) return result.filter((s) => s.storeName === storeFilter);
    return result;
  }, [timeline, storeNames, storeFilter, sortBy]);

  const globalMax = useMemo(() => {
    let max = 0;
    for (const store of storeStats) {
      for (const cmd of store.commands) {
        if (cmd.maxMs > max) max = cmd.maxMs;
      }
    }
    return max || 1;
  }, [storeStats]);

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <select
          value={storeFilter ?? "__all__"}
          onChange={(e) =>
            setStoreFilter(e.target.value === "__all__" ? null : e.target.value)
          }
          style={styles.select}
        >
          <option value="__all__">All stores</option>
          {storeNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <span style={styles.sortLabel}>Sort by</span>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          style={styles.select}
        >
          <option value="total">Total time</option>
          <option value="avg">Avg time</option>
          <option value="max">Max time</option>
          <option value="count">Call count</option>
        </select>

      </div>

      <div
        style={styles.scrollArea}
        className="commiq-devtools-scroll"
      >
        {storeStats.every((s) => s.totalCommands === 0) && (
          <div style={styles.empty}>
            No commands recorded yet. Dispatch commands to see performance
            metrics.
          </div>
        )}

        {storeStats.map((store) => (
          <div key={store.storeName} style={styles.storeCard}>
            <div style={styles.storeHeader}>
              <span style={styles.storeIcon}>◆</span>
              <span style={styles.storeName}>{store.storeName}</span>
              <div style={styles.headerStats}>
                <Pill
                  label="cmds"
                  value={String(store.totalCommands)}
                  color={colors.command}
                />
                <Pill
                  label="events"
                  value={String(store.totalEvents)}
                  color={colors.event}
                />
                <Pill
                  label="total"
                  value={fmtMs(store.totalMs)}
                  color={colors.textSecondary}
                />
                <Pill
                  label="avg"
                  value={fmtMs(store.avgMs)}
                  color={colors.textSecondary}
                />
              </div>
            </div>

            {store.commands.length === 0 ? (
              <div style={styles.noCommands}>No commands recorded</div>
            ) : (
              <div style={styles.commandList}>
                {store.commands.map((cmd) => (
                  <CommandRow
                    key={cmd.name}
                    cmd={cmd}
                    globalMax={globalMax}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CommandRow({
  cmd,
  globalMax,
}: {
  cmd: CommandStats;
  globalMax: number;
}) {
  const barWidth = Math.max(2, (cmd.maxMs / globalMax) * 100);
  const avgBarWidth = Math.max(1, (cmd.avgMs / globalMax) * 100);

  return (
    <div style={styles.commandRow}>
      <div style={styles.commandInfo}>
        <span style={styles.commandName}>{cmd.name}</span>
        <span style={styles.commandMeta}>×{cmd.count}</span>
      </div>

      <div style={styles.barContainer}>
        <div
          style={{
            ...styles.barMax,
            width: `${barWidth}%`,
          }}
        />
        <div
          style={{
            ...styles.barAvg,
            width: `${avgBarWidth}%`,
          }}
        />
      </div>

      <div style={styles.timings}>
        <TimingCell label="min" value={cmd.minMs} />
        <TimingCell label="avg" value={cmd.avgMs} />
        <TimingCell label="max" value={cmd.maxMs} />
        <TimingCell label="total" value={cmd.totalMs} />
      </div>
    </div>
  );
}

function TimingCell({ label, value }: { label: string; value: number }) {
  return (
    <div style={styles.timingCell}>
      <span style={styles.timingLabel}>{label}</span>
      <span style={styles.timingValue}>{fmtMs(value)}</span>
    </div>
  );
}

function Pill({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <span style={styles.pill}>
      <span style={styles.pillLabel}>{label}</span>
      <span style={{ ...styles.pillValue, color }}>{value}</span>
    </span>
  );
}

function fmtMs(ms: number): string {
  if (ms < 0.01) return "0ms";
  if (ms < 1) return `${ms.toFixed(2)}ms`;
  if (ms < 10) return `${ms.toFixed(1)}ms`;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 12px",
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.bgToolbar,
    flexShrink: 0,
  },
  select: {
    fontSize: 11,
    backgroundColor: colors.bgInput,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: 4,
    padding: "3px 6px",
    fontFamily: fonts.sans,
    outline: "none",
    cursor: "pointer",
  },
  sortLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    marginLeft: 4,
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto" as const,
    padding: 12,
  },
  empty: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 20px",
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    textAlign: "center" as const,
  },
  storeCard: {
    marginBottom: 12,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.bgPanel,
  },
  storeHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.bgHeader,
  },
  storeIcon: {
    color: colors.accent,
    fontSize: 10,
  },
  storeName: {
    fontSize: 12,
    fontWeight: 600,
    color: colors.text,
    fontFamily: fonts.sans,
  },
  headerStats: {
    display: "flex",
    gap: 10,
    marginLeft: "auto",
    alignItems: "center",
  },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  },
  pillLabel: {
    fontSize: 9,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    textTransform: "uppercase" as const,
    letterSpacing: 0.4,
  },
  pillValue: {
    fontSize: 11,
    fontFamily: fonts.mono,
    fontWeight: 600,
  },
  noCommands: {
    padding: "12px 14px",
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fonts.sans,
  },
  commandList: {
    padding: "6px 0",
  },
  commandRow: {
    padding: "6px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  commandInfo: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  commandName: {
    fontSize: 11,
    fontWeight: 600,
    fontFamily: fonts.mono,
    color: colors.text,
  },
  commandMeta: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: fonts.mono,
  },
  barContainer: {
    position: "relative" as const,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bgActive,
    overflow: "hidden",
  },
  barMax: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    height: "100%",
    borderRadius: 3,
    backgroundColor: "rgba(99, 102, 241, 0.2)",
    transition: "width 0.2s ease",
  },
  barAvg: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    height: "100%",
    borderRadius: 3,
    backgroundColor: colors.accent,
    transition: "width 0.2s ease",
  },
  timings: {
    display: "flex",
    gap: 16,
  },
  timingCell: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  timingLabel: {
    fontSize: 9,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    textTransform: "uppercase" as const,
    letterSpacing: 0.3,
  },
  timingValue: {
    fontSize: 10,
    fontFamily: fonts.mono,
    fontWeight: 500,
  },
};
