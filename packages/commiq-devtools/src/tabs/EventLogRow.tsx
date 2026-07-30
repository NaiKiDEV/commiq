import { useCallback, type CSSProperties } from "react";
import type { TimelineEntry } from "@naikidev/commiq-devtools-core";
import { colors, fonts, getEventColor, truncId, formatTime } from "../theme";
import { DetailRow } from "../components/DetailPanel";
import { JsonTree } from "../components/JsonTree";
import { StateDiff } from "../components/StateDiff";

type EventLogRowProps = {
  entry: TimelineEntry;
  entryKeyValue: string;
  expanded: boolean;
  pinned: boolean;
  pinnable: boolean;
  style: CSSProperties;
  onToggleExpand: (key: string) => void;
  onTogglePin: (key: string) => void;
  onSelectCorrelation?: (correlationId: string) => void;
}

export function EventLogRow({
  entry,
  entryKeyValue,
  expanded,
  pinned,
  pinnable,
  style,
  onToggleExpand,
  onTogglePin,
  onSelectCorrelation,
}: EventLogRowProps) {
  const color = getEventColor(entry.name, entry.type);

  const handleToggleExpand = useCallback(
    () => onToggleExpand(entryKeyValue),
    [onToggleExpand, entryKeyValue],
  );

  const handleTogglePin = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onTogglePin(entryKeyValue);
    },
    [onTogglePin, entryKeyValue],
  );

  const handleCorrelationClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelectCorrelation?.(entry.correlationId);
    },
    [onSelectCorrelation, entry.correlationId],
  );

  const handleCausedByClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (entry.causedBy) onSelectCorrelation?.(entry.causedBy);
    },
    [onSelectCorrelation, entry.causedBy],
  );

  return (
    <div
      className={`commiq-row${expanded ? " selected" : ""}`}
      style={{
        ...styles.row,
        ...(pinned ? styles.rowPinned : {}),
        ...(expanded ? styles.rowSelected : {}),
        ...style,
      }}
      onClick={handleToggleExpand}
    >
      {pinnable && (
        <span
          className="commiq-pin"
          style={pinned ? { ...styles.pinButton, ...styles.pinButtonActive } : styles.pinButton}
          onClick={handleTogglePin}
          title={pinned ? "Unpin" : "Pin"}
        >
          ●
        </span>
      )}
      <span style={styles.time}>{formatTime(entry.timestamp)}</span>
      <span style={{ ...styles.badge, backgroundColor: colors.badge, color: colors.badgeText }}>
        {entry.storeName}
      </span>
      <span style={{ ...styles.badge, backgroundColor: color.bg, color: color.fg }}>
        {entry.name}
      </span>
      <span style={styles.corrId}>
        <span className="commiq-link" onClick={handleCorrelationClick} style={styles.corrLink}>
          {truncId(entry.correlationId)}
        </span>
      </span>
      {entry.causedBy && (
        <span style={styles.causedBy}>
          ←{" "}
          <span className="commiq-link" onClick={handleCausedByClick} style={styles.causedByLink}>
            {truncId(entry.causedBy)}
          </span>
        </span>
      )}
      <span className="commiq-expand" style={styles.expandIcon}>
        {expanded ? "▼" : "▶"}
      </span>
    </div>
  );
}

type EventLogDetailProps = {
  entry: TimelineEntry;
  style: CSSProperties;
}

export function EventLogDetail({ entry, style }: EventLogDetailProps) {
  return (
    <div style={{ ...styles.details, ...style }} className="commiq-devtools-scroll">
      <div style={styles.detailGrid}>
        <DetailRow label="Event" value={entry.name} />
        <DetailRow label="Type" value={entry.type} />
        <DetailRow label="Store" value={entry.storeName} />
        <DetailRow label="Correlation ID" value={entry.correlationId} mono />
        <DetailRow label="Caused By" value={entry.causedBy ?? "—"} mono />
        <DetailRow label="Timestamp" value={new Date(entry.timestamp).toISOString()} />
      </div>

      {entry.data !== undefined && (
        <div>
          <div style={styles.detailSectionLabel}>Data</div>
          <div style={styles.detailContent}>
            <JsonTree data={entry.data} initialExpanded={true} />
          </div>
        </div>
      )}

      {entry.stateBefore !== undefined && entry.stateAfter !== undefined && (
        <div>
          <div style={styles.detailSectionLabel}>State Diff</div>
          <div style={styles.detailContent}>
            <StateDiff before={entry.stateBefore} after={entry.stateAfter} />
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 12px",
    borderBottom: `1px solid ${colors.borderLight}`,
    borderLeft: "2px solid transparent",
    cursor: "pointer",
    transition: "background-color 0.1s, border-color 0.1s",
    fontSize: 11,
    fontFamily: fonts.sans,
    boxSizing: "border-box",
  },
  rowPinned: {
    borderLeftColor: colors.accent,
    backgroundColor: "rgba(99, 102, 241, 0.05)",
  },
  rowSelected: {
    backgroundColor: colors.bgSelected,
    borderBottom: `1px solid ${colors.borderSelected}`,
  },
  pinButton: {
    fontSize: 8,
    color: colors.textMuted,
    cursor: "pointer",
    flexShrink: 0,
    width: 14,
    textAlign: "center",
    transition: "color 0.1s",
  },
  pinButtonActive: {
    color: colors.accent,
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
    whiteSpace: "nowrap",
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
    textAlign: "center",
  },
  details: {
    padding: "10px 16px 14px",
    backgroundColor: colors.bgPanel,
    borderBottom: `1px solid ${colors.border}`,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    overflowY: "auto",
    boxSizing: "border-box",
  },
  detailGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  detailSectionLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  detailContent: {
    padding: "6px 10px",
    backgroundColor: colors.bg,
    borderRadius: 6,
    border: `1px solid ${colors.border}`,
    overflow: "auto",
  },
} satisfies Record<string, CSSProperties>;
