import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { TimelineEntry } from "@naikidev/commiq-devtools-core";
import {
  colors,
  fonts,
  getEventColor,
  truncId,
  formatTime,
  sharedStyles,
} from "../theme";
import { BUILTIN_EVENT_NAMES } from "../event-names";
import { buildCausalityIndex, collectChainIds } from "../causality";
import { FilterToolbar } from "../components/FilterToolbar";
import { DetailPanel } from "../components/DetailPanel";
import {
  buildChartLayout,
  CHART_PADDING,
  DOT_RADIUS,
  LABEL_WIDTH,
  LANE_HEIGHT,
  TIME_AXIS_HEIGHT,
  type CausalLink,
  type PositionedEvent,
} from "./timeline-layout";

type TimelineChartProps = {
  timeline: readonly TimelineEntry[];
  storeNames: string[];
}

type TooltipPos = { x: number; y: number };

export function TimelineChart({ timeline, storeNames }: TimelineChartProps) {
  const [showBuiltins, setShowBuiltins] = useState(true);
  const [storeFilter, setStoreFilter] = useState<string | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<TimelineEntry | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEntry | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPos>({ x: 0, y: 0 });
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () =>
      timeline.filter((e) => {
        if (!showBuiltins && BUILTIN_EVENT_NAMES.has(e.name)) return false;
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

  const causality = useMemo(() => buildCausalityIndex(timeline), [timeline]);

  const selectedChain = useMemo(() => {
    if (!selectedEvent) return null;
    return collectChainIds(causality, selectedEvent.correlationId);
  }, [selectedEvent, causality]);

  const layout = useMemo(
    () => buildChartLayout(filtered, visibleStores, causality),
    [filtered, visibleStores, causality],
  );

  useEffect(() => {
    const el = chartScrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [filtered.length]);

  const handleChartScroll = useCallback(() => {
    const chart = chartScrollRef.current;
    const labels = labelRef.current;
    if (chart && labels) labels.scrollTop = chart.scrollTop;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltipPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleHover = useCallback((entry: TimelineEntry, position: TooltipPos) => {
    setHoveredEvent(entry);
    setTooltipPos(position);
  }, []);

  const handleHoverEnd = useCallback(() => setHoveredEvent(null), []);

  const handleSelect = useCallback((entry: TimelineEntry) => {
    setSelectedEvent((prev) => (prev?.correlationId === entry.correlationId ? null : entry));
  }, []);

  const handleCloseDetail = useCallback(() => setSelectedEvent(null), []);

  const svgHeight = layout?.chartHeight ?? 100;

  return (
    <div style={sharedStyles.container}>
      <FilterToolbar
        showBuiltins={showBuiltins}
        onShowBuiltinsChange={setShowBuiltins}
        storeFilter={storeFilter}
        onStoreFilterChange={setStoreFilter}
        storeNames={storeNames}
        trailing={<span style={styles.eventCount}>{filtered.length} events</span>}
      />

      <div style={styles.body}>
        <div ref={labelRef} style={{ ...styles.labelCol, height: svgHeight }}>
          <div style={styles.axisSpacer} />
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
          onMouseMove={hoveredEvent ? handleMouseMove : undefined}
        >
          {!layout ? (
            <div style={sharedStyles.empty}>
              No events yet. Interact with your stores to see the timeline.
            </div>
          ) : (
            <svg
              width={layout.chartWidth}
              height={layout.chartHeight}
              style={styles.svg}
            >
              {visibleStores.map((name, i) => (
                <rect
                  key={`bg-${name}`}
                  x={0}
                  y={TIME_AXIS_HEIGHT + i * LANE_HEIGHT}
                  width={layout.chartWidth}
                  height={LANE_HEIGHT}
                  fill={i % 2 === 1 ? colors.bgPanel : "transparent"}
                  opacity={0.4}
                />
              ))}

              {visibleStores.map((name, i) => (
                <line
                  key={`ln-${name}`}
                  x1={0}
                  y1={TIME_AXIS_HEIGHT + (i + 1) * LANE_HEIGHT}
                  x2={layout.chartWidth}
                  y2={TIME_AXIS_HEIGHT + (i + 1) * LANE_HEIGHT}
                  stroke={colors.borderLight}
                  strokeWidth={0.5}
                />
              ))}

              {layout.ticks.map((tick) => (
                <g key={`t-${tick.x}`}>
                  <line
                    x1={tick.x}
                    y1={TIME_AXIS_HEIGHT}
                    x2={tick.x}
                    y2={layout.chartHeight}
                    stroke={colors.borderLight}
                    strokeWidth={0.5}
                    strokeDasharray="4 4"
                  />
                  <text
                    x={tick.x}
                    y={TIME_AXIS_HEIGHT - 7}
                    textAnchor="middle"
                    fill={colors.textMuted}
                    fontSize={9}
                    fontFamily={fonts.mono}
                  >
                    {tick.label}
                  </text>
                </g>
              ))}

              {layout.links.map((link) => (
                <ChainEdge
                  key={`lk-${link.from.entry.seq}-${link.to.entry.seq}`}
                  link={link}
                  chain={selectedChain}
                />
              ))}

              {layout.positioned.map((p) => (
                <TimelineDot
                  key={`ev-${p.entry.seq}`}
                  positioned={p}
                  hovered={hoveredEvent?.correlationId === p.entry.correlationId}
                  selected={selectedEvent?.correlationId === p.entry.correlationId}
                  dimmed={selectedChain != null && !selectedChain.has(p.entry.correlationId)}
                  onHover={handleHover}
                  onHoverEnd={handleHoverEnd}
                  onSelect={handleSelect}
                />
              ))}
            </svg>
          )}
        </div>
      </div>

      {hoveredEvent && !selectedEvent && (
        <div style={{ ...styles.tooltip, left: tooltipPos.x + 14, top: tooltipPos.y - 8 }}>
          <div
            style={{
              fontWeight: 600,
              color: getEventColor(hoveredEvent.name, hoveredEvent.type).fg,
            }}
          >
            {hoveredEvent.name}
          </div>
          <div style={styles.tooltipMeta}>
            {hoveredEvent.storeName} · {formatTime(hoveredEvent.timestamp)}
          </div>
          <div style={styles.tooltipIds}>
            {truncId(hoveredEvent.correlationId)}
            {hoveredEvent.causedBy && ` ← ${truncId(hoveredEvent.causedBy)}`}
          </div>
        </div>
      )}

      {selectedEvent && <DetailPanel event={selectedEvent} onClose={handleCloseDetail} />}
    </div>
  );
}

type ChainEdgeProps = {
  link: CausalLink;
  chain: Set<string> | null;
}

function ChainEdge({ link, chain }: ChainEdgeProps) {
  const inChain =
    chain !== null &&
    chain.has(link.from.entry.correlationId) &&
    chain.has(link.to.entry.correlationId);
  const opacity = chain ? (inChain ? 0.85 : 0.06) : 0.45;
  const stroke = inChain ? colors.accentLight : colors.accent;
  const strokeWidth = inChain ? 2 : 1.3;

  const gap = DOT_RADIUS + 2;
  const dx = link.to.x - link.from.x;
  const dy = link.to.y - link.from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < gap * 2) return null;

  const nx = dx / dist;
  const ny = dy / dist;
  const x1 = link.from.x + nx * gap;
  const y1 = link.from.y + ny * gap;
  const x2 = link.to.x - nx * gap;
  const y2 = link.to.y - ny * gap;

  if (Math.abs(link.to.y - link.from.y) > 2) {
    const cdx = x2 - x1;
    const cdy = y2 - y1;
    return (
      <path
        d={`M${x1},${y1} C${x1 + cdx * 0.4},${y1} ${x2 - cdx * 0.15},${y2 - cdy * 0.15} ${x2},${y2}`}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
      />
    );
  }

  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={stroke}
      strokeWidth={strokeWidth}
      opacity={opacity}
    />
  );
}

type TimelineDotProps = {
  positioned: PositionedEvent;
  hovered: boolean;
  selected: boolean;
  dimmed: boolean;
  onHover: (entry: TimelineEntry, position: TooltipPos) => void;
  onHoverEnd: () => void;
  onSelect: (entry: TimelineEntry) => void;
}

function TimelineDot({
  positioned,
  hovered,
  selected,
  dimmed,
  onHover,
  onHoverEnd,
  onSelect,
}: TimelineDotProps) {
  const { entry, x, y } = positioned;
  const color = getEventColor(entry.name, entry.type);
  const radius = hovered || selected ? DOT_RADIUS + 2 : DOT_RADIUS;

  const handleEnter = useCallback(
    (e: React.MouseEvent) => onHover(entry, { x: e.clientX, y: e.clientY }),
    [onHover, entry],
  );

  const handleClick = useCallback(() => onSelect(entry), [onSelect, entry]);

  return (
    <g
      opacity={dimmed ? 0.15 : 1}
      style={styles.dot}
      onMouseEnter={handleEnter}
      onMouseLeave={onHoverEnd}
      onClick={handleClick}
    >
      {(hovered || selected) && <circle cx={x} cy={y} r={radius + 4} fill={color.bg} />}
      <circle
        cx={x}
        cy={y}
        r={radius}
        fill={color.fg}
        stroke={selected ? colors.textInverse : "none"}
        strokeWidth={selected ? 1.5 : 0}
      />
    </g>
  );
}

const styles = {
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
    overflowY: "hidden",
    overflowX: "hidden",
  },
  axisSpacer: {
    height: TIME_AXIS_HEIGHT,
    flexShrink: 0,
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
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  chartScroll: {
    flex: 1,
    overflowX: "auto",
    overflowY: "auto",
    position: "relative",
    paddingRight: CHART_PADDING,
  },
  svg: {
    display: "block",
    minWidth: "100%",
  },
  dot: {
    cursor: "pointer",
  },
  tooltip: {
    position: "fixed",
    zIndex: 100001,
    padding: "6px 10px",
    backgroundColor: colors.bgHeader,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    fontSize: 11,
    fontFamily: fonts.sans,
    lineHeight: 1.5,
    pointerEvents: "none",
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    maxWidth: 280,
  },
  tooltipMeta: {
    color: colors.textMuted,
    fontSize: 10,
  },
  tooltipIds: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: fonts.mono,
    lineHeight: 1,
  },
} satisfies Record<string, CSSProperties>;
