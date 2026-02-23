import {
  useMemo,
  useState,
  useRef,
  useCallback,
  useEffect,
  type CSSProperties,
} from "react";
import type { TimelineEntry } from "@naikidev/commiq-devtools";
import { colors, fonts } from "./theme";

interface DependencyMapProps {
  timeline: TimelineEntry[];
  storeNames: string[];
}

interface StoreEdge {
  from: string;
  to: string;
  commands: Set<string>;
  count: number;
}

const NODE_W = 130;
const NODE_H = 44;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;

/* ── Force-directed layout helpers ──────────────────────────────── */

type Vec = { x: number; y: number };

function findComponents(
  nodes: string[],
  edgeList: { from: string; to: string }[],
): string[][] {
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(n, new Set());
  for (const e of edgeList) {
    adj.get(e.from)?.add(e.to);
    adj.get(e.to)?.add(e.from);
  }

  const visited = new Set<string>();
  const components: string[][] = [];

  for (const n of nodes) {
    if (visited.has(n)) continue;
    const comp: string[] = [];
    const stack = [n];
    while (stack.length) {
      const cur = stack.pop()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      comp.push(cur);
      for (const nb of adj.get(cur) ?? []) {
        if (!visited.has(nb)) stack.push(nb);
      }
    }
    components.push(comp);
  }
  return components;
}

function forceLayout(
  nodes: string[],
  edgeList: { from: string; to: string }[],
  iterations = 120,
): Map<string, Vec> {
  const pos = new Map<string, Vec>();
  const vel = new Map<string, Vec>();
  const n = nodes.length;

  if (n === 1) {
    pos.set(nodes[0], { x: 0, y: 0 });
    return pos;
  }

  // seed in a circle so nothing starts overlapping
  const seedR = Math.max(100, n * 40);
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    pos.set(nodes[i], {
      x: seedR * Math.cos(angle),
      y: seedR * Math.sin(angle),
    });
    vel.set(nodes[i], { x: 0, y: 0 });
  }

  const edgeSet = new Set(edgeList.map((e) => `${e.from}→${e.to}`));
  const isLinked = (a: string, b: string) =>
    edgeSet.has(`${a}→${b}`) || edgeSet.has(`${b}→${a}`);

  const REPULSION = 60_000;
  const SPRING_K = 0.006;
  const IDEAL_LEN = NODE_W * 2.2;
  const DAMPING = 0.85;
  const MIN_DIST = NODE_W * 0.8;

  for (let iter = 0; iter < iterations; iter++) {
    const temp = 1 - iter / iterations; // cooling
    const maxMove = 30 * temp + 2;

    // repulsion between all pairs
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = pos.get(nodes[i])!;
        const b = pos.get(nodes[j])!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MIN_DIST) dist = MIN_DIST;
        const force = REPULSION / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        vel.get(nodes[i])!.x -= fx;
        vel.get(nodes[i])!.y -= fy;
        vel.get(nodes[j])!.x += fx;
        vel.get(nodes[j])!.y += fy;
      }
    }

    // spring attraction along edges
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (!isLinked(nodes[i], nodes[j])) continue;
        const a = pos.get(nodes[i])!;
        const b = pos.get(nodes[j])!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const displacement = dist - IDEAL_LEN;
        const fx = (dx / dist) * displacement * SPRING_K;
        const fy = (dy / dist) * displacement * SPRING_K;
        vel.get(nodes[i])!.x += fx;
        vel.get(nodes[i])!.y += fy;
        vel.get(nodes[j])!.x -= fx;
        vel.get(nodes[j])!.y -= fy;
      }
    }

    // apply velocities with damping
    for (const name of nodes) {
      const v = vel.get(name)!;
      const p = pos.get(name)!;
      v.x *= DAMPING;
      v.y *= DAMPING;
      const mag = Math.sqrt(v.x * v.x + v.y * v.y);
      if (mag > maxMove) {
        v.x = (v.x / mag) * maxMove;
        v.y = (v.y / mag) * maxMove;
      }
      p.x += v.x;
      p.y += v.y;
    }
  }

  return pos;
}

function getBounds(positions: Map<string, Vec>): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
}

/* ── Component ──────────────────────────────────────────────────── */

export function DependencyMap({ timeline, storeNames }: DependencyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [positions, setPositions] = useState<
    Map<string, { x: number; y: number }>
  >(new Map());
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  const dragRef = useRef({
    startMouse: { x: 0, y: 0 },
    startPos: { x: 0, y: 0 },
    startPan: { x: 0, y: 0 },
  });

  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;

  const { edges, edgeList } = useMemo(() => {
    const tl = timelineRef.current;
    const edgeMap = new Map<string, StoreEdge>();

    const commandGroupMap = new Map<string, TimelineEntry[]>();
    for (const e of tl) {
      if (e.causedBy) {
        const group = commandGroupMap.get(e.causedBy) ?? [];
        group.push(e);
        commandGroupMap.set(e.causedBy, group);
      }
    }

    const eventStore = new Map<string, string>();
    for (const e of tl) {
      eventStore.set(e.correlationId, e.storeName);
    }

    for (const group of commandGroupMap.values()) {
      const cmdStarted = group.find((e) => e.name === "commandStarted");
      if (!cmdStarted) continue;

      const cmd = (cmdStarted.data as any)?.command;
      const parentEventId: string | undefined = cmd?.causedBy;
      if (!parentEventId) continue;

      const sourceStore = eventStore.get(parentEventId);
      const targetStore = cmdStarted.storeName;

      if (!sourceStore || sourceStore === targetStore) continue;

      const key = `${sourceStore}→${targetStore}`;
      const existing = edgeMap.get(key);
      const cmdName: string = cmd?.name ?? "unknown";
      if (existing) {
        existing.commands.add(cmdName);
        existing.count++;
      } else {
        edgeMap.set(key, {
          from: sourceStore,
          to: targetStore,
          commands: new Set([cmdName]),
          count: 1,
        });
      }
    }

    return { edges: edgeMap, edgeList: [...edgeMap.values()] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline.length]);

  const initialPositions = useMemo(() => {
    const pos = new Map<string, Vec>();
    if (storeNames.length === 0) return pos;

    // 1. Find connected components
    const connectedStores = new Set<string>();
    for (const edge of edgeList) {
      connectedStores.add(edge.from);
      connectedStores.add(edge.to);
    }

    const connected = storeNames.filter((s) => connectedStores.has(s));
    const disconnected = storeNames.filter((s) => !connectedStores.has(s));

    const components = findComponents(connected, edgeList);
    const CLUSTER_GAP = NODE_W * 2;

    // 2. Force-layout each component independently, then pack horizontally
    let cursorX = 0;

    for (const comp of components) {
      const compEdges = edgeList.filter(
        (e) => comp.includes(e.from) && comp.includes(e.to),
      );
      const layoutPositions = forceLayout(comp, compEdges);

      // Normalize: shift so component's center is at (cursorX + halfW, 0)
      const bounds = getBounds(layoutPositions);
      const compW = bounds.maxX - bounds.minX + NODE_W;
      const compCx = (bounds.minX + bounds.maxX) / 2;
      const compCy = (bounds.minY + bounds.maxY) / 2;
      const offsetX = cursorX + compW / 2 - compCx;
      const offsetY = -compCy;

      for (const [name, p] of layoutPositions) {
        pos.set(name, { x: p.x + offsetX, y: p.y + offsetY });
      }

      cursorX += compW + CLUSTER_GAP;
    }

    // 3. Center all clusters around origin
    if (pos.size > 0) {
      const allBounds = getBounds(pos);
      const shiftX = -(allBounds.minX + allBounds.maxX) / 2;
      const shiftY = -(allBounds.minY + allBounds.maxY) / 2;
      for (const [name, p] of pos) {
        pos.set(name, { x: p.x + shiftX, y: p.y + shiftY });
      }
    }

    // 4. Place disconnected stores in a row below everything
    if (disconnected.length > 0) {
      const allBounds =
        pos.size > 0 ? getBounds(pos) : { minX: 0, maxX: 0, minY: 0, maxY: 0 };
      const bottomY = allBounds.maxY + NODE_H * 2.5;
      const totalW = disconnected.length * (NODE_W + 24) - 24;
      const startX = -totalW / 2 + NODE_W / 2;
      for (let i = 0; i < disconnected.length; i++) {
        pos.set(disconnected[i], {
          x: startX + i * (NODE_W + 24),
          y: bottomY,
        });
      }
    }

    return pos;
  }, [storeNames, edgeList]);

  const fitToView = useCallback(() => {
    setPositions(new Map(initialPositions));
    const container = containerRef.current;
    if (!container || initialPositions.size === 0) {
      setPan({ x: 0, y: 0 });
      setZoom(1);
      return;
    }

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const p of initialPositions.values()) {
      minX = Math.min(minX, p.x - NODE_W / 2);
      maxX = Math.max(maxX, p.x + NODE_W / 2);
      minY = Math.min(minY, p.y - NODE_H / 2);
      maxY = Math.max(maxY, p.y + NODE_H / 2);
    }

    const graphW = maxX - minX + 80;
    const graphH = maxY - minY + 80;
    const cw = container.clientWidth;
    const ch = container.clientHeight;

    const scale = Math.min(1.2, Math.min(cw / graphW, ch / graphH));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale)));
    setPan({ x: cw / 2 - cx * scale, y: ch / 2 - cy * scale });
  }, [initialPositions]);

  const layoutKey = useMemo(() => {
    const edgeKey = edgeList
      .map(
        (e) =>
          `${e.from}→${e.to}:${e.count}:[${[...e.commands].sort().join(",")}]`,
      )
      .sort()
      .join("|");
    return storeNames.slice().sort().join(",") + ";" + edgeKey;
  }, [storeNames, edgeList]);

  useEffect(() => {
    setPositions(new Map(initialPositions));
  }, [initialPositions]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      fitToView();
    });
    return () => cancelAnimationFrame(frame);
  }, [layoutKey, fitToView]);

  const screenToGraph = useCallback(
    (sx: number, sy: number) => {
      return { x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom };
    },
    [pan, zoom],
  );

  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  zoomRef.current = zoom;
  panRef.current = pan;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const z = zoomRef.current;
      const p = panRef.current;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * factor));

      setPan({
        x: mx - (mx - p.x) * (newZoom / z),
        y: my - (my - p.y) * (newZoom / z),
      });
      setZoom(newZoom);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const handleBgDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      setIsPanning(true);
      dragRef.current.startMouse = { x: e.clientX, y: e.clientY };
      dragRef.current.startPan = { ...pan };
    },
    [pan],
  );

  const handleNodeDown = useCallback(
    (e: React.MouseEvent, name: string) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      setDraggingNode(name);
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const gp = screenToGraph(e.clientX - rect.left, e.clientY - rect.top);
      dragRef.current.startMouse = { x: gp.x, y: gp.y };
      const pos = positions.get(name) ?? { x: 0, y: 0 };
      dragRef.current.startPos = { ...pos };
    },
    [positions, screenToGraph],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (draggingNode) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const gp = screenToGraph(e.clientX - rect.left, e.clientY - rect.top);
        const dx = gp.x - dragRef.current.startMouse.x;
        const dy = gp.y - dragRef.current.startMouse.y;
        setPositions((prev) => {
          const next = new Map(prev);
          next.set(draggingNode, {
            x: dragRef.current.startPos.x + dx,
            y: dragRef.current.startPos.y + dy,
          });
          return next;
        });
      } else if (isPanning) {
        const dx = e.clientX - dragRef.current.startMouse.x;
        const dy = e.clientY - dragRef.current.startMouse.y;
        setPan({
          x: dragRef.current.startPan.x + dx,
          y: dragRef.current.startPan.y + dy,
        });
      }
    };
    const onUp = () => {
      setDraggingNode(null);
      setIsPanning(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingNode, isPanning, screenToGraph]);

  const highlightedStores = useMemo(() => {
    if (!hovered) return new Set<string>();
    const set = new Set<string>([hovered]);
    for (const edge of edgeList) {
      if (edge.from === hovered) set.add(edge.to);
      if (edge.to === hovered) set.add(edge.from);
    }
    return set;
  }, [hovered, edgeList]);

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <span style={styles.toolbarLabel}>
          {storeNames.length} stores · {edgeList.length} connections
        </span>
        <div style={{ flex: 1 }} />
        <span style={styles.toolbarHint}>
          scroll to zoom · drag to pan · drag nodes to move
        </span>
        <button
          onClick={fitToView}
          style={styles.fitButton}
          title="Fit to view"
        >
          ⊞ Fit
        </button>
      </div>

      <div
        ref={containerRef}
        style={{
          ...styles.canvas,
          cursor: isPanning ? "grabbing" : draggingNode ? "grabbing" : "grab",
        }}
        onMouseDown={handleBgDown}
      >
        {storeNames.length === 0 ? (
          <div style={styles.empty}>
            No stores connected. Add stores to see the dependency map.
          </div>
        ) : (
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            style={{ display: "block", overflow: "visible" }}
          >
            <defs>
              <marker
                id="dep-arrow"
                viewBox="0 0 10 10"
                refX={10}
                refY={5}
                markerWidth={7}
                markerHeight={7}
                orient="auto"
              >
                <path d="M0,1.5 L10,5 L0,8.5" fill={colors.accent} />
              </marker>
              <marker
                id="dep-arrow-dim"
                viewBox="0 0 10 10"
                refX={10}
                refY={5}
                markerWidth={7}
                markerHeight={7}
                orient="auto"
              >
                <path
                  d="M0,1.5 L10,5 L0,8.5"
                  fill={colors.accent}
                  opacity={0.25}
                />
              </marker>
            </defs>

            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {edgeList.map((edge, i) => {
                const fromPos = positions.get(edge.from);
                const toPos = positions.get(edge.to);
                if (!fromPos || !toPos) return null;

                const dx = toPos.x - fromPos.x;
                const dy = toPos.y - fromPos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist === 0) return null;

                const nx = dx / dist;
                const ny = dy / dist;

                const x1 = fromPos.x + nx * (NODE_W / 2 + 6);
                const y1 = fromPos.y + ny * (NODE_H / 2 + 6);
                const x2 = toPos.x - nx * (NODE_W / 2 + 12);
                const y2 = toPos.y - ny * (NODE_H / 2 + 12);

                const reverseKey = `${edge.to}→${edge.from}`;
                const hasReverse = edges.has(reverseKey);

                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2;
                const curveStrength = hasReverse ? 24 : 0;
                const offsetX = -ny * curveStrength;
                const offsetY = nx * curveStrength;
                const ctrlX = midX + offsetX;
                const ctrlY = midY + offsetY;

                const labelX = midX + offsetX * 0.6;
                const labelY = midY + offsetY * 0.6;

                const isHighlighted =
                  !hovered ||
                  (highlightedStores.has(edge.from) &&
                    highlightedStores.has(edge.to));
                const edgeOpacity = hovered
                  ? isHighlighted
                    ? 0.8
                    : 0.1
                  : 0.55;

                return (
                  <g key={`edge-${i}`} opacity={edgeOpacity}>
                    <path
                      d={`M${x1},${y1} Q${ctrlX},${ctrlY} ${x2},${y2}`}
                      fill="none"
                      stroke={colors.accent}
                      strokeWidth={Math.min(3, 1.2 + edge.count * 0.3)}
                      markerEnd={
                        isHighlighted
                          ? "url(#dep-arrow)"
                          : "url(#dep-arrow-dim)"
                      }
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
              })}

              {storeNames.map((name) => {
                const pos = positions.get(name);
                if (!pos) return null;

                const hasEdge = edgeList.some(
                  (e) => e.from === name || e.to === name,
                );
                const isHovered = hovered === name;
                const isRelated = highlightedStores.has(name);
                const dimmed = hovered && !isRelated;

                return (
                  <g
                    key={`node-${name}`}
                    onMouseDown={(e) => handleNodeDown(e, name)}
                    onMouseEnter={() => setHovered(name)}
                    onMouseLeave={() => setHovered(null)}
                    style={{ cursor: "grab" }}
                    opacity={dimmed ? 0.25 : 1}
                  >
                    <rect
                      x={pos.x - NODE_W / 2}
                      y={pos.y - NODE_H / 2}
                      width={NODE_W}
                      height={NODE_H}
                      rx={10}
                      ry={10}
                      fill={isHovered ? colors.bgHeader : colors.bgPanel}
                      stroke={
                        isHovered
                          ? colors.accentLight
                          : hasEdge
                            ? colors.accent
                            : colors.border
                      }
                      strokeWidth={isHovered ? 2 : hasEdge ? 1.5 : 1}
                    />
                    <text
                      x={pos.x}
                      y={pos.y + 1}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={
                        dimmed
                          ? colors.textMuted
                          : hasEdge
                            ? "#ffffff"
                            : colors.text
                      }
                      fontSize={12}
                      fontWeight={600}
                      fontFamily={fonts.sans}
                      pointerEvents="none"
                    >
                      {name}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>
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
    gap: 12,
    padding: "8px 12px",
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.bgToolbar,
    flexShrink: 0,
  },
  toolbarLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fonts.sans,
  },
  toolbarHint: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    opacity: 0.5,
  },
  fitButton: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 10px",
    fontSize: 10,
    fontWeight: 500,
    color: colors.textSecondary,
    backgroundColor: colors.bgPanel,
    borderWidth: 0,
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: fonts.sans,
    transition: "all 0.15s",
  },
  canvas: {
    flex: 1,
    overflow: "hidden",
    position: "relative" as const,
    userSelect: "none" as const,
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
    position: "absolute" as const,
    inset: 0,
  },
};
