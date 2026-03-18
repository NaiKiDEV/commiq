import type { CSSProperties, ReactNode } from "react";
import type { TimelineEntry } from "@naikidev/commiq-devtools-core";
import { colors, fonts, formatTime, getEventColor } from "../theme";
import { JsonTree } from "./JsonTree";
import { StateDiff } from "./StateDiff";
import { useResizable } from "../hooks/useResizable";

type DetailPanelProps = {
  event: TimelineEntry;
  onClose: () => void;
  initialHeight?: number;
}

export function DetailPanel({
  event,
  onClose,
  initialHeight = 180,
}: DetailPanelProps) {
  const { height, isDragging, onMouseDown } = useResizable({
    initial: initialHeight,
    min: 80,
    max: 500,
  });

  return (
    <div style={{ ...styles.panel, height }}>
      <div
        style={styles.resize}
        className={`commiq-resize-handle${isDragging ? " dragging" : ""}`}
        onMouseDown={onMouseDown}
      >
        <div style={styles.resizeGrip} className="commiq-resize-grip" />
      </div>
      <div style={styles.header}>
        <span style={styles.headerLabel}>Viewing</span>
        <span style={{
          ...styles.headerType,
          color: getEventColor(event.name, event.type).fg,
          backgroundColor: getEventColor(event.name, event.type).bg,
        }}>{event.type}</span>
        <span style={{
          ...styles.title,
          color: getEventColor(event.name, event.type).fg,
        }}>{event.name}</span>
        <span style={styles.headerStore}>{event.storeName}</span>
        <button className="commiq-close-btn" onClick={onClose} style={styles.close}>
          ✕
        </button>
      </div>
      <div style={styles.body}>
        <DetailRow label="Store" value={event.storeName} />
        <DetailRow label="Type" value={event.type} />
        <DetailRow label="Correlation" value={event.correlationId} mono />
        <DetailRow label="Caused By" value={event.causedBy ?? "—"} mono />
        <DetailRow
          label="Time"
          value={new Date(event.timestamp).toISOString()}
        />
        {event.data !== undefined && (
          <DetailSection label="Data">
            <JsonTree data={event.data} initialExpanded />
          </DetailSection>
        )}
        {event.stateBefore !== undefined &&
          event.stateAfter !== undefined && (
            <DetailSection label="State Diff">
              <StateDiff before={event.stateBefore} after={event.stateAfter} />
            </DetailSection>
          )}
      </div>
    </div>
  );
}

export function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={styles.row}>
      <span style={styles.label}>{label}</span>
      <span
        style={{
          ...styles.value,
          ...(mono ? { fontFamily: fonts.mono } : {}),
        }}
      >
        {value}
      </span>
    </div>
  );
}

function DetailSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={styles.sectionLabel}>{label}</div>
      <div style={styles.sectionContent}>{children}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: {
    flexShrink: 0,
    borderTop: `1px solid ${colors.border}`,
    backgroundColor: colors.bgActive,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    position: "relative" as const,
  },
  resize: {
    position: "absolute" as const,
    top: -4,
    left: 0,
    right: 0,
    height: 8,
    cursor: "ns-resize",
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  resizeGrip: {
    width: 36,
    height: 3,
    borderRadius: 2,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    borderBottom: `1px solid ${colors.border}`,
  },
  headerLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontFamily: fonts.sans,
    fontWeight: 500,
    flexShrink: 0,
  },
  headerType: {
    fontSize: 10,
    fontWeight: 600,
    fontFamily: fonts.sans,
    padding: "1px 7px",
    borderRadius: 4,
    flexShrink: 0,
  },
  title: {
    fontSize: 11,
    fontWeight: 600,
    fontFamily: fonts.mono,
  },
  headerStore: {
    fontSize: 10,
    fontWeight: 500,
    fontFamily: fonts.sans,
    color: colors.text,
    backgroundColor: colors.bg,
    padding: "1px 7px",
    borderRadius: 9999,
    flexShrink: 0,
    marginLeft: "auto",
  },
  close: {
    backgroundColor: "transparent",
    borderWidth: 0,
    color: colors.textMuted,
    cursor: "pointer",
    fontSize: 12,
    padding: "2px 6px",
    borderRadius: 4,
  },
  body: {
    padding: "8px 12px",
    overflow: "auto" as const,
    flex: 1,
    backgroundColor: colors.bgPanel,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  row: {
    display: "flex",
    gap: 12,
  },
  label: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontWeight: 500,
    width: 80,
    flexShrink: 0,
  },
  value: {
    fontSize: 11,
    color: colors.text,
    fontFamily: fonts.sans,
    wordBreak: "break-all" as const,
  },
  sectionLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  sectionContent: {
    padding: "6px 10px",
    backgroundColor: colors.bg,
    borderRadius: 6,
    border: `1px solid ${colors.border}`,
    overflow: "auto",
  },
};
