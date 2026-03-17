import { useState, useRef, useEffect, type CSSProperties } from "react";
import type { TimelineEntry } from "@naikidev/commiq-devtools-core";
import {
  colors,
  fonts,
  BUILTIN_EVENTS,
  getEventColor,
  truncId,
  formatTime,
  sharedStyles,
} from "../theme";
import { FilterToolbar } from "../components/FilterToolbar";
import { DetailRow } from "../components/DetailPanel";
import { JsonTree } from "../components/JsonTree";
import { StateDiff } from "../components/StateDiff";

type EventLogProps = {
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

  function handleAutoScrollChange(e: React.ChangeEvent<HTMLInputElement>) {
    setAutoScroll(e.target.checked);
  }

  return (
    <div style={sharedStyles.container}>
      <FilterToolbar
        showBuiltins={showBuiltins}
        onShowBuiltinsChange={setShowBuiltins}
        storeFilter={storeFilter}
        onStoreFilterChange={setStoreFilter}
        storeNames={storeNames}
        extraLeft={
          <label style={styles.checkLabel}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={handleAutoScrollChange}
              style={styles.checkbox}
            />
            Auto-scroll
          </label>
        }
        trailing={
          <span style={styles.eventCount}>{filtered.length} events</span>
        }
      />

      <div style={styles.scrollArea} ref={scrollRef}>
        {filtered.length === 0 && (
          <div style={sharedStyles.empty}>
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

                  {entry.stateBefore !== undefined &&
                    entry.stateAfter !== undefined && (
                      <div style={styles.detailSection}>
                        <div style={styles.detailSectionLabel}>State Diff</div>
                        <div style={styles.detailContent}>
                          <StateDiff
                            before={entry.stateBefore}
                            after={entry.stateAfter}
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

const styles: Record<string, CSSProperties> = {
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
