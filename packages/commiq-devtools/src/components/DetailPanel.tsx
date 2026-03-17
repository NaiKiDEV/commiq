import type { CSSProperties, ReactNode } from "react";
import type { TimelineEntry } from "@naikidev/commiq-devtools-core";
import { colors, fonts, formatTime } from "../theme";
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
        <span style={styles.title}>{event.name}</span>
        <button onClick={onClose} style={styles.close}>
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
    justifyContent: "space-between",
    padding: "6px 12px",
    borderBottom: `1px solid ${colors.border}`,
  },
  title: {
    fontSize: 12,
    fontWeight: 600,
    color: colors.text,
    fontFamily: fonts.sans,
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
  },
  row: {
    display: "flex",
    gap: 12,
    marginBottom: 3,
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
