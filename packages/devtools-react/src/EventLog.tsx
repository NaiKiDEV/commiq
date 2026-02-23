import { useState, useRef, useEffect, type CSSProperties } from "react";
import type { TimelineEntry } from "@naikidev/commiq-devtools";
import {
  colors,
  fonts,
  BUILTIN_EVENTS,
  getEventColor,
  truncId,
  formatTime,
} from "./theme";
import { JsonTree } from "./JsonTree";

interface EventLogProps {
  timeline: TimelineEntry[];
  storeNames: string[];
  onSelectCorrelation?: (id: string) => void;
}

export function EventLog({
  timeline,
  storeNames,
  onSelectCorrelation,
}: EventLogProps) {
  const [showBuiltins, setShowBuiltins] = useState(true);
  const [storeFilter, setStoreFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const filtered = timeline.filter((entry) => {
    if (!showBuiltins && BUILTIN_EVENTS.has(entry.name)) return false;
    if (storeFilter && entry.storeName !== storeFilter) return false;
    return true;
  });

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [filtered.length, autoScroll]);

  function toggleExpand(entry: TimelineEntry) {
    const key = `${entry.correlationId}-${entry.timestamp}`;
    setExpandedId(expandedId === key ? null : key);
  }

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <label style={styles.checkLabel}>
            <input
              type="checkbox"
              checked={showBuiltins}
              onChange={(e) => setShowBuiltins(e.target.checked)}
              style={styles.checkbox}
            />
            Show builtins
          </label>

          <select
            value={storeFilter ?? "__all__"}
            onChange={(e) =>
              setStoreFilter(
                e.target.value === "__all__" ? null : e.target.value,
              )
            }
            style={styles.select}
          >
            <option value="__all__">All stores</option>
            {storeNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <label style={styles.checkLabel}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              style={styles.checkbox}
            />
            Auto-scroll
          </label>
        </div>

        <span style={styles.eventCount}>{filtered.length} events</span>
      </div>

      <div style={styles.scrollArea} ref={scrollRef}>
        {filtered.length === 0 && (
          <div style={styles.empty}>
            {timeline.length === 0
              ? "No events yet. Interact with your stores to generate events."
              : "No events match the current filter. Try enabling builtin events."}
          </div>
        )}

        {filtered.map((entry, i) => {
          const key = `${entry.correlationId}-${entry.timestamp}`;
          const isExpanded = expandedId === key;
          const ec = getEventColor(entry.name, entry.type);

          return (
            <div key={`${key}-${i}`}>
              <div
                style={{
                  ...styles.row,
                  ...(isExpanded ? styles.rowSelected : {}),
                }}
                onClick={() => toggleExpand(entry)}
              >
                <span style={styles.time}>{formatTime(entry.timestamp)}</span>

                <span
                  style={{
                    ...styles.badge,
                    backgroundColor: colors.badge,
                    color: colors.badgeText,
                  }}
                >
                  {entry.storeName}
                </span>

                <span
                  style={{
                    ...styles.badge,
                    backgroundColor: ec.bg,
                    color: ec.fg,
                  }}
                >
                  {entry.name}
                </span>

                <span style={styles.corrId}>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectCorrelation?.(entry.correlationId);
                    }}
                    style={styles.corrLink}
                  >
                    {truncId(entry.correlationId)}
                  </span>
                </span>

                {entry.causedBy && (
                  <span style={styles.causedBy}>
                    ←{" "}
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCorrelation?.(entry.causedBy!);
                      }}
                      style={styles.causedByLink}
                    >
                      {truncId(entry.causedBy)}
                    </span>
                  </span>
                )}

                <span style={styles.expandIcon}>{isExpanded ? "▼" : "▶"}</span>
              </div>

              {isExpanded && (
                <div style={styles.details}>
                  <div style={styles.detailGrid}>
                    <DetailRow label="Event" value={entry.name} />
                    <DetailRow label="Type" value={entry.type} />
                    <DetailRow label="Store" value={entry.storeName} />
                    <DetailRow
                      label="Correlation ID"
                      value={entry.correlationId}
                      mono
                    />
                    <DetailRow
                      label="Caused By"
                      value={entry.causedBy ?? "—"}
                      mono
                    />
                    <DetailRow
                      label="Timestamp"
                      value={new Date(entry.timestamp).toISOString()}
                    />
                  </div>

                  {entry.data !== undefined && (
                    <div style={styles.detailSection}>
                      <div style={styles.detailSectionLabel}>Data</div>
                      <div style={styles.detailContent}>
                        <JsonTree data={entry.data} initialExpanded={true} />
                      </div>
                    </div>
                  )}

                  {entry.stateBefore !== undefined && (
                    <div style={styles.detailSection}>
                      <div style={styles.detailSectionLabel}>State Before</div>
                      <div style={styles.detailContent}>
                        <JsonTree
                          data={entry.stateBefore}
                          initialExpanded={false}
                        />
                      </div>
                    </div>
                  )}

                  {entry.stateAfter !== undefined && (
                    <div style={styles.detailSection}>
                      <div style={styles.detailSectionLabel}>State After</div>
                      <div style={styles.detailContent}>
                        <JsonTree
                          data={entry.stateAfter}
                          initialExpanded={false}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={styles.detailRow}>
      <span style={styles.detailLabel}>{label}</span>
      <span
        style={{
          ...styles.detailValue,
          ...(mono ? { fontFamily: fonts.mono } : {}),
        }}
      >
        {value}
      </span>
    </div>
  );
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
    justifyContent: "space-between",
    padding: "8px 12px",
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.bgToolbar,
    flexShrink: 0,
    gap: 8,
  },
  toolbarLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  checkLabel: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    color: colors.textSecondary,
    cursor: "pointer",
    fontFamily: fonts.sans,
    userSelect: "none" as const,
    whiteSpace: "nowrap" as const,
  },
  checkbox: {
    accentColor: colors.accent,
    cursor: "pointer",
    margin: 0,
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
  eventCount: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fonts.mono,
    whiteSpace: "nowrap" as const,
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto" as const,
    overflowX: "hidden" as const,
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
  row: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "5px 12px",
    borderBottom: `1px solid ${colors.borderLight}`,
    cursor: "pointer",
    transition: "background-color 0.1s",
    fontSize: 11,
    fontFamily: fonts.sans,
  },
  rowSelected: {
    backgroundColor: colors.bgSelected,
    borderBottom: `1px solid ${colors.borderSelected}`,
  },
  time: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textMuted,
    flexShrink: 0,
    width: 80,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    fontSize: 10,
    fontWeight: 500,
    padding: "1px 7px",
    borderRadius: 9999,
    whiteSpace: "nowrap" as const,
    fontFamily: fonts.sans,
    letterSpacing: 0.2,
  },
  corrId: {
    flexShrink: 0,
    marginLeft: "auto",
  },
  corrLink: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.accentLight,
    cursor: "pointer",
    textDecoration: "none",
  },
  causedBy: {
    fontSize: 10,
    color: colors.textMuted,
    flexShrink: 0,
  },
  causedByLink: {
    fontFamily: fonts.mono,
    color: colors.stateChange,
    cursor: "pointer",
    textDecoration: "none",
  },
  expandIcon: {
    fontSize: 8,
    color: colors.textMuted,
    flexShrink: 0,
    width: 12,
    textAlign: "center" as const,
  },
  details: {
    padding: "10px 16px 14px",
    backgroundColor: colors.bgActive,
    borderBottom: `1px solid ${colors.border}`,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "120px 1fr",
    gap: "4px 12px",
    marginBottom: 8,
  },
  detailRow: {
    display: "contents",
  },
  detailLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontWeight: 500,
    paddingTop: 1,
  },
  detailValue: {
    fontSize: 11,
    color: colors.text,
    fontFamily: fonts.sans,
    wordBreak: "break-all" as const,
  },
  detailSection: {
    marginTop: 10,
  },
  detailSectionLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  detailContent: {
    padding: "6px 10px",
    backgroundColor: colors.bg,
    borderRadius: 6,
    border: `1px solid ${colors.border}`,
    overflow: "auto",
  },
};
