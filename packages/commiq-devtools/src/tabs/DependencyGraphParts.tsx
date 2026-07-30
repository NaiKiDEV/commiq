import { useCallback } from "react";
import { colors, fonts } from "../theme";
import type { StoreEdge } from "../causality";
import { NODE_H, NODE_W, type Vec } from "./dependency-layout";

const CURVE_STRENGTH = 24;

type DependencyEdgeProps = {
  edge: StoreEdge;
  from: Vec | undefined;
  to: Vec | undefined;
  bidirectional: boolean;
  hovering: boolean;
  highlighted: boolean;
}

export function DependencyEdge({
  edge,
  from,
  to,
  bidirectional,
  hovering,
  highlighted,
}: DependencyEdgeProps) {
  if (!from || !to) return null;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return null;

  const nx = dx / dist;
  const ny = dy / dist;
  const x1 = from.x + nx * (NODE_W / 2 + 6);
  const y1 = from.y + ny * (NODE_H / 2 + 6);
  const x2 = to.x - nx * (NODE_W / 2 + 12);
  const y2 = to.y - ny * (NODE_H / 2 + 12);

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const curve = bidirectional ? CURVE_STRENGTH : 0;
  const offsetX = -ny * curve;
  const offsetY = nx * curve;
  const labelX = midX + offsetX * 0.6;
  const labelY = midY + offsetY * 0.6;

  const active = !hovering || highlighted;
  const opacity = hovering ? (active ? 0.8 : 0.1) : 0.55;

  return (
    <g opacity={opacity}>
      <path
        d={`M${x1},${y1} Q${midX + offsetX},${midY + offsetY} ${x2},${y2}`}
        fill="none"
        stroke={colors.accent}
        strokeWidth={Math.min(3, 1.2 + edge.count * 0.3)}
        markerEnd={active ? "url(#dep-arrow)" : "url(#dep-arrow-dim)"}
      />
      <text
        x={labelX}
        y={labelY - 5}
        textAnchor="middle"
        fill={colors.textSecondary}
        fontSize={9}
        fontFamily={fonts.mono}
      >
        {[...edge.commands].join(", ")}
      </text>
      <text
        x={labelX}
        y={labelY + 7}
        textAnchor="middle"
        fill={colors.textSecondary}
        fontSize={8}
        fontFamily={fonts.sans}
        opacity={0.7}
      >
        ×{edge.count}
      </text>
    </g>
  );
}

type DependencyNodeProps = {
  name: string;
  position: Vec | undefined;
  connected: boolean;
  hovered: boolean;
  dimmed: boolean;
  onPointerDown: (e: React.MouseEvent, name: string) => void;
  onHover: (name: string | null) => void;
}

export function DependencyNode({
  name,
  position,
  connected,
  hovered,
  dimmed,
  onPointerDown,
  onHover,
}: DependencyNodeProps) {
  const handleDown = useCallback(
    (e: React.MouseEvent) => onPointerDown(e, name),
    [onPointerDown, name],
  );

  const handleEnter = useCallback(() => onHover(name), [onHover, name]);
  const handleLeave = useCallback(() => onHover(null), [onHover]);

  if (!position) return null;

  return (
    <g
      onMouseDown={handleDown}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{ cursor: "grab" }}
      opacity={dimmed ? 0.25 : 1}
    >
      <rect
        x={position.x - NODE_W / 2}
        y={position.y - NODE_H / 2}
        width={NODE_W}
        height={NODE_H}
        rx={10}
        ry={10}
        fill={hovered ? colors.bgHeader : colors.bgPanel}
        stroke={strokeFor(hovered, connected)}
        strokeWidth={hovered ? 2 : connected ? 1.5 : 1}
      />
      <text
        x={position.x}
        y={position.y + 1}
        textAnchor="middle"
        dominantBaseline="central"
        fill={dimmed ? colors.textMuted : colors.text}
        fontSize={12}
        fontWeight={600}
        fontFamily={fonts.sans}
        pointerEvents="none"
      >
        {name}
      </text>
    </g>
  );
}

function strokeFor(hovered: boolean, connected: boolean): string {
  if (hovered) return colors.accentLight;
  return connected ? colors.accent : colors.border;
}
