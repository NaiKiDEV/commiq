import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { TimelineEntry } from "@naikidev/commiq-devtools-core";
import { colors, fonts, sharedStyles } from "../theme";
import { buildCausalityIndex, buildStoreEdges, edgeSignature, type StoreEdge } from "../causality";
import {
  clampZoom,
  computeFit,
  computeLayout,
  mergePositions,
  type Vec,
} from "./dependency-layout";
import { DependencyEdge, DependencyNode } from "./DependencyGraphParts";

const WHEEL_FACTOR = 1.12;

type DependencyMapProps = {
  timeline: readonly TimelineEntry[];
  storeNames: string[];
}

export function DependencyMap({ timeline, storeNames }: DependencyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [positions, setPositions] = useState<Map<string, Vec>>(new Map());
  const [pan, setPan] = useState<Vec>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  const dragRef = useRef({
    startMouse: { x: 0, y: 0 },
    startPos: { x: 0, y: 0 },
    startPan: { x: 0, y: 0 },
  });

  const edgeList = useMemo(
    () => buildStoreEdges(buildCausalityIndex(timeline), timeline),
    [timeline],
  );

  const edgeKeys = useMemo(
    () => new Set(edgeList.map((e) => `${e.from}→${e.to}`)),
    [edgeList],
  );

  const layoutKey = useMemo(
    () => `${[...storeNames].sort().join(",")};${edgeSignature(edgeList)}`,
    [storeNames, edgeList],
  );

  const layoutInputsRef = useRef({ storeNames, edgeList });
  layoutInputsRef.current = { storeNames, edgeList };

  const layout = useMemo(() => {
    const { storeNames: names, edgeList: edges } = layoutInputsRef.current;
    return computeLayout(names, edges);
  }, [layoutKey]);

  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const applyFit = useCallback(() => {
    const container = containerRef.current;
    const current = layoutRef.current;
    if (!container || current.size === 0) {
      setPan({ x: 0, y: 0 });
      setZoom(1);
      return;
    }
    const fit = computeFit(current, container.clientWidth, container.clientHeight);
    setPan(fit.pan);
    setZoom(fit.zoom);
  }, []);

  const handleFitClick = useCallback(() => {
    setPositions(new Map(layoutRef.current));
    applyFit();
  }, [applyFit]);

  useEffect(() => {
    setPositions((prev) => mergePositions(prev, layoutRef.current));
  }, [layoutKey]);

  useEffect(() => {
    const frame = requestAnimationFrame(applyFit);
    return () => cancelAnimationFrame(frame);
  }, [layoutKey, applyFit]);

  const screenToGraph = useCallback(
    (sx: number, sy: number) => ({ x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom }),
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
      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;
      const factor = e.deltaY < 0 ? WHEEL_FACTOR : 1 / WHEEL_FACTOR;
      const nextZoom = clampZoom(currentZoom * factor);

      setPan({
        x: mx - (mx - currentPan.x) * (nextZoom / currentZoom),
        y: my - (my - currentPan.y) * (nextZoom / currentZoom),
      });
      setZoom(nextZoom);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const handleBackgroundDown = useCallback(
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
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDraggingNode(name);
      const graphPoint = screenToGraph(e.clientX - rect.left, e.clientY - rect.top);
      dragRef.current.startMouse = graphPoint;
      dragRef.current.startPos = { ...(positions.get(name) ?? { x: 0, y: 0 }) };
    },
    [positions, screenToGraph],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (draggingNode) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const graphPoint = screenToGraph(e.clientX - rect.left, e.clientY - rect.top);
        const dx = graphPoint.x - dragRef.current.startMouse.x;
        const dy = graphPoint.y - dragRef.current.startMouse.y;
        setPositions((prev) => {
          const next = new Map(prev);
          next.set(draggingNode, {
            x: dragRef.current.startPos.x + dx,
            y: dragRef.current.startPos.y + dy,
          });
          return next;
        });
        return;
      }
      if (!isPanning) return;
      setPan({
        x: dragRef.current.startPan.x + (e.clientX - dragRef.current.startMouse.x),
        y: dragRef.current.startPan.y + (e.clientY - dragRef.current.startMouse.y),
      });
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

  const highlighted = useMemo(
    () => highlightSet(hovered, edgeList),
    [hovered, edgeList],
  );

  const connectedStores = useMemo(() => {
    const set = new Set<string>();
    for (const edge of edgeList) {
      set.add(edge.from);
      set.add(edge.to);
    }
    return set;
  }, [edgeList]);

  return (
    <div style={sharedStyles.container}>
      <div style={styles.toolbar}>
        <span style={styles.toolbarLabel}>
          {storeNames.length} stores · {edgeList.length} connections
        </span>
        <div style={styles.spacer} />
        <span style={styles.toolbarHint}>
          scroll to zoom · drag to pan · drag nodes to move
        </span>
        <button
          type="button"
          className="commiq-label-btn"
          onClick={handleFitClick}
          style={styles.fitButton}
          title="Reset layout and fit to view"
        >
          ⊞ Fit
        </button>
      </div>

      <div
        ref={containerRef}
        style={{
          ...styles.canvas,
          cursor: isPanning || draggingNode ? "grabbing" : "grab",
        }}
        onMouseDown={handleBackgroundDown}
      >
        {storeNames.length === 0 ? (
          <div style={sharedStyles.empty}>
            No stores connected. Add stores to see the dependency map.
          </div>
        ) : (
          <svg width="100%" height="100%" style={styles.svg}>
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
                <path d="M0,1.5 L10,5 L0,8.5" fill={colors.accent} opacity={0.25} />
              </marker>
            </defs>

            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {edgeList.map((edge) => (
                <DependencyEdge
                  key={`edge-${edge.from}→${edge.to}`}
                  edge={edge}
                  from={positions.get(edge.from)}
                  to={positions.get(edge.to)}
                  bidirectional={edgeKeys.has(`${edge.to}→${edge.from}`)}
                  hovering={hovered !== null}
                  highlighted={highlighted.has(edge.from) && highlighted.has(edge.to)}
                />
              ))}

              {storeNames.map((name) => (
                <DependencyNode
                  key={`node-${name}`}
                  name={name}
                  position={positions.get(name)}
                  connected={connectedStores.has(name)}
                  hovered={hovered === name}
                  dimmed={hovered !== null && !highlighted.has(name)}
                  onPointerDown={handleNodeDown}
                  onHover={setHovered}
                />
              ))}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}

function highlightSet(hovered: string | null, edges: readonly StoreEdge[]): Set<string> {
  if (hovered === null) return new Set<string>();
  const set = new Set<string>([hovered]);
  for (const edge of edges) {
    if (edge.from === hovered) set.add(edge.to);
    if (edge.to === hovered) set.add(edge.from);
  }
  return set;
}

const styles = {
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
  },
  spacer: {
    flex: 1,
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
    position: "relative",
    userSelect: "none",
    touchAction: "none",
  },
  svg: {
    display: "block",
    overflow: "visible",
  },
} satisfies Record<string, CSSProperties>;
