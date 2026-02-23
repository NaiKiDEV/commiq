import {
  useState,
  useMemo,
  useRef,
  useEffect,
  type CSSProperties,
} from "react";
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

interface TimelineChartProps {
  timeline: TimelineEntry[];
  storeNames: string[];
}

const LANE_HEIGHT = 38;
const DOT_RADIUS = 5;
const LABEL_WIDTH = 100;
const TIME_AXIS_HEIGHT = 24;
const MIN_SPACING = 18;
const CHART_PADDING = 24;

interface PositionedEvent {
  entry: TimelineEntry;
  x: number;
  y: number;
}

interface CausalLink {
  from: PositionedEvent;
  to: PositionedEvent;
}

export function TimelineChart({ timeline, storeNames }: TimelineChartProps) {
  const [showBuiltins, setShowBuiltins] = useState(true);
  const [storeFilter, setStoreFilter] = useState<string | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<TimelineEntry | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEntry | null>(
    null,
  );
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () =>
      timeline.filter((e) => {
        if (!showBuiltins && BUILTIN_EVENTS.has(e.name)) return false;
        if (storeFilter && e.storeName !== storeFilter) return false;
        return true;
      }),
    [timeline, showBuiltins, storeFilter],
  );

  const visibleStores = useMemo(() => {
    if (storeFilter) return [storeFilter];
    const seen = new Set<string>();
    for (const e of filtered) seen.add(e.storeName);
    return storeNames.filter((n) => seen.has(n));
  }, [filtered, storeNames, storeFilter]);

  const entryMap = useMemo(() => {
    const m = new Map<string, TimelineEntry>();
    for (const e of timeline) m.set(e.correlationId, e);
    return m;
  }, [timeline]);

  const selectedChain = useMemo(() => {
    if (!selectedEvent) return null;
    const ids = new Set<string>();

    const commandGroupMap = new Map<string, TimelineEntry[]>();
    for (const e of timeline) {
      if (e.causedBy) {
        const group = commandGroupMap.get(e.causedBy) ?? [];
        group.push(e);
        commandGroupMap.set(e.causedBy, group);
      }
    }

    const parentOfCommand = new Map<string, string>();
    for (const [cmdCorrId, group] of commandGroupMap) {
      const cmdStarted = group.find((e) => e.name === "commandStarted");
      const parentId = (cmdStarted?.data as any)?.command?.causedBy;
      if (parentId && typeof parentId === "string") {
        parentOfCommand.set(cmdCorrId, parentId);
      }
    }

    const selectedCmdId = selectedEvent.causedBy;
    const addGroup = (cmdId: string) => {
      const group = commandGroupMap.get(cmdId);
      if (group) {
        for (const e of group) ids.add(e.correlationId);
      }
    };

    if (selectedCmdId) addGroup(selectedCmdId);
    ids.add(selectedEvent.correlationId);

    let walkCmdId = selectedCmdId;
    while (walkCmdId) {
      const parentEventId = parentOfCommand.get(walkCmdId);
      if (!parentEventId || ids.has(parentEventId)) break;
      const parentEvent = entryMap.get(parentEventId);
      if (!parentEvent) break;
      ids.add(parentEventId);
      if (parentEvent.causedBy) {
        addGroup(parentEvent.causedBy);
        walkCmdId = parentEvent.causedBy;
      } else {
        break;
      }
    }

    const queue = [...ids];
    while (queue.length > 0) {
      const id = queue.shift()!;
      for (const [cmdId, parentId] of parentOfCommand) {
        if (parentId === id) {
          const group = commandGroupMap.get(cmdId);
          if (group) {
            for (const e of group) {
              if (!ids.has(e.correlationId)) {
                ids.add(e.correlationId);
                queue.push(e.correlationId);
              }
            }
          }
        }
      }
    }

    return ids;
  }, [selectedEvent, timeline, entryMap]);

  const layout = useMemo(() => {
    if (filtered.length === 0) return null;

    const sorted = [...filtered].sort((a, b) => a.timestamp - b.timestamp);
    const minTs = sorted[0].timestamp;
    const maxTs = sorted[sorted.length - 1].timestamp;
    const timeSpan = maxTs - minTs;

    const storeY = new Map<string, number>();
    visibleStores.forEach((name, i) => {
      storeY.set(name, TIME_AXIS_HEIGHT + i * LANE_HEIGHT + LANE_HEIGHT / 2);
    });

    const baseWidth = Math.max(400, sorted.length * MIN_SPACING);
    const positioned: PositionedEvent[] = [];
    let lastX = -Infinity;

    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i];
      let x =
        timeSpan === 0
          ? (i / Math.max(1, sorted.length - 1)) * baseWidth
          : ((entry.timestamp - minTs) / timeSpan) * baseWidth;

      if (x - lastX < MIN_SPACING) x = lastX + MIN_SPACING;

      positioned.push({
        entry,
        x: x + CHART_PADDING,
        y: storeY.get(entry.storeName) ?? TIME_AXIS_HEIGHT + LANE_HEIGHT / 2,
      });
      lastX = x;
    }

    const chartWidth =
      (positioned[positioned.length - 1]?.x ?? 0) + CHART_PADDING * 2;
    const chartHeight = TIME_AXIS_HEIGHT + visibleStores.length * LANE_HEIGHT;

    const posMap = new Map<string, PositionedEvent>();
    for (const p of positioned) posMap.set(p.entry.correlationId, p);

    const links: CausalLink[] = [];

    const commandGroups = new Map<string, PositionedEvent[]>();
    for (const p of positioned) {
      if (p.entry.causedBy) {
        const group = commandGroups.get(p.entry.causedBy) ?? [];
        group.push(p);
        commandGroups.set(p.entry.causedBy, group);
      }
    }

    for (const group of commandGroups.values()) {
      group.sort((a, b) => a.entry.timestamp - b.entry.timestamp);
      for (let i = 1; i < group.length; i++) {
        links.push({ from: group[i - 1], to: group[i] });
      }
    }

    for (const group of commandGroups.values()) {
      const cmdStarted = group.find((p) => p.entry.name === "commandStarted");
      if (!cmdStarted) continue;
      const cmd = (cmdStarted.entry.data as any)?.command;
      const parentEventId: string | undefined = cmd?.causedBy;
      if (parentEventId && posMap.has(parentEventId)) {
        links.push({ from: posMap.get(parentEventId)!, to: group[0] });
      }
    }

    const firstX = positioned[0].x;
    const lastEvtX = positioned[positioned.length - 1].x;
    const xRange = lastEvtX - firstX || 1;
    const ticks: { x: number; label: string }[] = [];

    if (timeSpan === 0) {
      ticks.push({ x: firstX + xRange / 2, label: formatTime(minTs) });
    } else {
      const tickCount = Math.max(2, Math.min(8, Math.floor(xRange / 100)));
      for (let i = 0; i <= tickCount; i++) {
        const frac = i / tickCount;
        ticks.push({
          x: firstX + frac * xRange,
          label: formatTime(minTs + frac * timeSpan),
        });
      }
    }

    return { positioned, links, ticks, chartWidth, chartHeight };
  }, [filtered, visibleStores]);

  useEffect(() => {
    if (chartScrollRef.current) {
      chartScrollRef.current.scrollLeft = chartScrollRef.current.scrollWidth;
    }
  }, [filtered.length]);

  const handleChartScroll = () => {
    if (chartScrollRef.current && labelRef.current) {
      labelRef.current.scrollTop = chartScrollRef.current.scrollTop;
    }
  };

  const svgHeight = layout?.chartHeight ?? 100;

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
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

        <span style={styles.eventCount}>{filtered.length} events</span>
      </div>

      <div style={styles.body}>
        <div ref={labelRef} style={{ ...styles.labelCol, height: svgHeight }}>
          <div style={{ height: TIME_AXIS_HEIGHT, flexShrink: 0 }} />
          {visibleStores.map((name) => (
            <div key={name} style={styles.storeLabel}>
              {name}
            </div>
          ))}
        </div>

        <div
          ref={chartScrollRef}
          style={styles.chartScroll}
          className="commiq-devtools-scroll"
          onScroll={handleChartScroll}
          onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
        >
          {!layout ? (
            <div style={styles.empty}>
              No events yet. Interact with your stores to see the timeline.
            </div>
          ) : (
            <svg
              width={layout.chartWidth}
              height={layout.chartHeight}
              style={{ display: "block", minWidth: "100%" }}
            >
              {visibleStores.map((_, i) => (
                <rect
                  key={`bg-${i}`}
                  x={0}
                  y={TIME_AXIS_HEIGHT + i * LANE_HEIGHT}
                  width={layout.chartWidth}
                  height={LANE_HEIGHT}
                  fill={i % 2 === 1 ? colors.bgPanel : "transparent"}
                  opacity={0.4}
                />
              ))}

              {visibleStores.map((_, i) => (
                <line
                  key={`ln-${i}`}
                  x1={0}
                  y1={TIME_AXIS_HEIGHT + (i + 1) * LANE_HEIGHT}
                  x2={layout.chartWidth}
                  y2={TIME_AXIS_HEIGHT + (i + 1) * LANE_HEIGHT}
                  stroke={colors.borderLight}
                  strokeWidth={0.5}
                />
              ))}

              {layout.ticks.map((t, i) => (
                <g key={`t-${i}`}>
                  <line
                    x1={t.x}
                    y1={TIME_AXIS_HEIGHT}
                    x2={t.x}
                    y2={layout.chartHeight}
                    stroke={colors.borderLight}
                    strokeWidth={0.5}
                    strokeDasharray="4 4"
                  />
                  <text
                    x={t.x}
                    y={TIME_AXIS_HEIGHT - 7}
                    textAnchor="middle"
                    fill={colors.textMuted}
                    fontSize={9}
                    fontFamily={fonts.mono}
                  >
                    {t.label}
                  </text>
                </g>
              ))}

              {layout.links.map((lk, i) => {
                const inChain =
                  selectedChain?.has(lk.from.entry.correlationId) &&
                  selectedChain?.has(lk.to.entry.correlationId);
                const opacity = selectedChain ? (inChain ? 0.85 : 0.06) : 0.45;
                const stroke = inChain ? colors.accentLight : colors.accent;
                const sw = inChain ? 2 : 1.3;
                const crossLane = Math.abs(lk.to.y - lk.from.y) > 2;

                const gap = DOT_RADIUS + 2;
                const dx = lk.to.x - lk.from.x;
                const dy = lk.to.y - lk.from.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < gap * 2) return null;

                const nx = dx / dist;
                const ny = dy / dist;
                const x1 = lk.from.x + nx * gap;
                const y1 = lk.from.y + ny * gap;
                const x2 = lk.to.x - nx * gap;
                const y2 = lk.to.y - ny * gap;

                if (crossLane) {
                  const cdx = x2 - x1;
                  const cdy = y2 - y1;
                  return (
                    <path
                      key={`lk-${i}`}
                      d={`M${x1},${y1} C${x1 + cdx * 0.4},${y1} ${x2 - cdx * 0.15},${y2 - cdy * 0.15} ${x2},${y2}`}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={sw}
                      opacity={opacity}
                    />
                  );
                }

                return (
                  <line
                    key={`lk-${i}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={stroke}
                    strokeWidth={sw}
                    opacity={opacity}
                  />
                );
              })}

              {layout.positioned.map((p, i) => {
                const ec = getEventColor(p.entry.name, p.entry.type);
                const isHovered =
                  hoveredEvent?.correlationId === p.entry.correlationId;
                const isSelected =
                  selectedEvent?.correlationId === p.entry.correlationId;
                const inChain = selectedChain?.has(p.entry.correlationId);
                const dimmed = selectedChain != null && !inChain;
                const r = isHovered || isSelected ? DOT_RADIUS + 2 : DOT_RADIUS;

                return (
                  <g
                    key={`ev-${i}`}
                    opacity={dimmed ? 0.15 : 1}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHoveredEvent(p.entry)}
                    onMouseLeave={() => setHoveredEvent(null)}
                    onClick={() =>
                      setSelectedEvent(
                        selectedEvent?.correlationId === p.entry.correlationId
                          ? null
                          : p.entry,
                      )
                    }
                  >
                    {(isHovered || isSelected) && (
                      <circle cx={p.x} cy={p.y} r={r + 4} fill={ec.bg} />
                    )}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={r}
                      fill={ec.fg}
                      stroke={isSelected ? colors.textInverse : "none"}
                      strokeWidth={isSelected ? 1.5 : 0}
                    />
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>

      {hoveredEvent && !selectedEvent && (
        <div
          style={{
            ...styles.tooltip,
            left: tooltipPos.x + 14,
            top: tooltipPos.y - 8,
          }}
        >
          <div
            style={{
              fontWeight: 600,
              color: getEventColor(hoveredEvent.name, hoveredEvent.type).fg,
            }}
          >
            {hoveredEvent.name}
          </div>
          <div style={{ color: colors.textMuted, fontSize: 10 }}>
            {hoveredEvent.storeName} · {formatTime(hoveredEvent.timestamp)}
          </div>
          <div
            style={{
              color: colors.textMuted,
              fontSize: 10,
              fontFamily: fonts.mono,
            }}
          >
            {truncId(hoveredEvent.correlationId)}
            {hoveredEvent.causedBy && ` ← ${truncId(hoveredEvent.causedBy)}`}
          </div>
        </div>
      )}

      {selectedEvent && (
        <div style={styles.detailPanel}>
          <div style={styles.detailHeader}>
            <span style={styles.detailTitle}>{selectedEvent.name}</span>
            <button
              onClick={() => setSelectedEvent(null)}
              style={styles.detailClose}
            >
              ✕
            </button>
          </div>
          <div style={styles.detailBody}>
            <DetailRow label="Store" value={selectedEvent.storeName} />
            <DetailRow label="Type" value={selectedEvent.type} />
            <DetailRow
              label="Correlation"
              value={selectedEvent.correlationId}
              mono
            />
            <DetailRow
              label="Caused By"
              value={selectedEvent.causedBy ?? "—"}
              mono
            />
            <DetailRow
              label="Time"
              value={new Date(selectedEvent.timestamp).toISOString()}
            />
            {selectedEvent.data !== undefined && (
              <div style={{ marginTop: 8 }}>
                <div style={styles.sectionLabel}>Data</div>
                <div style={styles.sectionContent}>
                  <JsonTree data={selectedEvent.data} initialExpanded />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
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
    <div style={detailStyles.row}>
      <span style={detailStyles.label}>{label}</span>
      <span
        style={{
          ...detailStyles.value,
          ...(mono ? { fontFamily: fonts.mono } : {}),
        }}
      >
        {value}
      </span>
    </div>
  );
}

const detailStyles: Record<string, CSSProperties> = {
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
};

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
    marginLeft: "auto",
  },
  body: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  },
  labelCol: {
    width: LABEL_WIDTH,
    flexShrink: 0,
    borderRight: `1px solid ${colors.borderLight}`,
    backgroundColor: colors.bg,
    overflowY: "hidden" as const,
    overflowX: "hidden" as const,
  },
  storeLabel: {
    height: LANE_HEIGHT,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingRight: 10,
    fontSize: 11,
    fontWeight: 600,
    color: colors.textSecondary,
    fontFamily: fonts.sans,
    whiteSpace: "nowrap" as const,
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
  },
  chartScroll: {
    flex: 1,
    overflowX: "auto" as const,
    overflowY: "auto" as const,
    position: "relative" as const,
  },
  empty: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    padding: "40px 20px",
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    textAlign: "center" as const,
  },
  tooltip: {
    position: "fixed" as const,
    zIndex: 100001,
    padding: "6px 10px",
    backgroundColor: colors.bgHeader,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    fontSize: 11,
    fontFamily: fonts.sans,
    lineHeight: 1.5,
    pointerEvents: "none" as const,
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    maxWidth: 280,
  },
  detailPanel: {
    flexShrink: 0,
    borderTop: `1px solid ${colors.border}`,
    backgroundColor: colors.bgActive,
    maxHeight: "40%",
    overflow: "auto" as const,
  },
  detailHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 12px",
    borderBottom: `1px solid ${colors.border}`,
  },
  detailTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: colors.text,
    fontFamily: fonts.sans,
  },
  detailClose: {
    backgroundColor: "transparent",
    borderWidth: 0,
    color: colors.textMuted,
    cursor: "pointer",
    fontSize: 12,
    padding: "2px 6px",
    borderRadius: 4,
  },
  detailBody: {
    padding: "8px 12px",
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
    overflow: "auto" as const,
    maxHeight: 140,
  },
};
