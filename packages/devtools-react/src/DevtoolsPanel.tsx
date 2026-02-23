import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type CSSProperties,
} from "react";
import type { SealedStore } from "@naikidev/commiq";
import { colors, fonts } from "./theme";
import { EventLog } from "./EventLog";
import { CausalityGraph } from "./CausalityGraph";
import { TimelineChart } from "./TimelineChart";
import { PerformanceTab } from "./PerformanceTab";
import { StoreStateView } from "./StoreStateView";
import type { DevtoolsEngine } from "./useDevtoolsEngine";

type Tab = "events" | "graph" | "timeline" | "perf" | "state";

interface DevtoolsPanelProps {
  engine: DevtoolsEngine;
  stores: Record<string, SealedStore<any>>;
  onClose: () => void;
  initialHeight: number;
}

export function DevtoolsPanel({
  engine,
  stores,
  onClose,
  initialHeight,
}: DevtoolsPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("events");
  const [panelHeight, setPanelHeight] = useState(initialHeight);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      startY.current = e.clientY;
      startHeight.current = panelHeight;
      e.preventDefault();
    },
    [panelHeight],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startY.current - e.clientY;
      const newHeight = Math.max(
        120,
        Math.min(window.innerHeight - 60, startHeight.current + delta),
      );
      setPanelHeight(newHeight);
    };
    const onMouseUp = () => {
      isDragging.current = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "events", label: "Events", icon: "≡" },
    { id: "graph", label: "Graph", icon: "◇" },
    { id: "timeline", label: "Timeline", icon: "◔" },
    { id: "perf", label: "Performance", icon: "⚡" },
    { id: "state", label: "State", icon: "◆" },
  ];

  return (
    <div style={{ ...styles.panel, height: panelHeight }}>
      <style>{scrollbarCSS}</style>

      <div style={styles.resizeHandle} onMouseDown={onMouseDown}>
        <div style={styles.resizeGrip} />
      </div>

      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logo}>⬡</span>
          <span style={styles.title}>Commiq</span>
          <span style={styles.titleSuffix}>devtools</span>
        </div>

        <div style={styles.tabs}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                ...styles.tab,
                ...(activeTab === tab.id ? styles.tabActive : {}),
              }}
            >
              <span style={styles.tabIcon}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        <div style={styles.headerRight}>
          <button
            onClick={engine.clear}
            style={styles.headerButton}
            title="Clear events"
          >
            ⟳
          </button>
          <span style={styles.eventBadge}>{engine.eventCount}</span>
          <button
            onClick={onClose}
            style={styles.headerButton}
            title="Close devtools"
          >
            ✕
          </button>
        </div>
      </div>

      <div style={styles.content} className="commiq-devtools-scroll">
        {activeTab === "events" && (
          <EventLog timeline={engine.timeline} storeNames={engine.storeNames} />
        )}
        {activeTab === "graph" && (
          <CausalityGraph
            timeline={engine.timeline}
            storeNames={engine.storeNames}
          />
        )}
        {activeTab === "timeline" && (
          <TimelineChart
            timeline={engine.timeline}
            storeNames={engine.storeNames}
          />
        )}
        {activeTab === "perf" && (
          <PerformanceTab
            timeline={engine.timeline}
            storeNames={engine.storeNames}
          />
        )}
        {activeTab === "state" && (
          <StoreStateView stores={stores} storeStates={engine.storeStates} />
        )}
      </div>
    </div>
  );
}

const scrollbarCSS = `
.commiq-devtools-scroll::-webkit-scrollbar,
.commiq-devtools-scroll *::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.commiq-devtools-scroll::-webkit-scrollbar-track,
.commiq-devtools-scroll *::-webkit-scrollbar-track {
  background: transparent;
}
.commiq-devtools-scroll::-webkit-scrollbar-thumb,
.commiq-devtools-scroll *::-webkit-scrollbar-thumb {
  background: ${colors.scrollThumb};
  border-radius: 3px;
}
.commiq-devtools-scroll::-webkit-scrollbar-thumb:hover,
.commiq-devtools-scroll *::-webkit-scrollbar-thumb:hover {
  background: ${colors.scrollThumbHover};
}
`;

const styles: Record<string, CSSProperties> = {
  panel: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 99999,
    display: "flex",
    flexDirection: "column",
    backgroundColor: colors.bg,
    borderTop: `1px solid ${colors.border}`,
    fontFamily: fonts.sans,
    color: colors.text,
    boxShadow: "0 -4px 30px rgba(0, 0, 0, 0.4)",
    pointerEvents: "auto" as const,
  },
  resizeHandle: {
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
    backgroundColor: colors.textMuted,
    opacity: 0.5,
    transition: "opacity 0.15s",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "0 12px",
    height: 40,
    backgroundColor: colors.bgHeader,
    borderBottom: `1px solid ${colors.border}`,
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginRight: 8,
  },
  logo: {
    fontSize: 16,
    color: colors.accent,
    lineHeight: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    color: colors.text,
    letterSpacing: -0.2,
  },
  titleSuffix: {
    fontSize: 13,
    fontWeight: 400,
    color: colors.textSecondary,
    letterSpacing: -0.2,
  },
  tabs: {
    display: "flex",
    gap: 2,
  },
  tab: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "5px 10px",
    fontSize: 11,
    fontWeight: 500,
    color: colors.tabInactive,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: 5,
    cursor: "pointer",
    fontFamily: fonts.sans,
    transition: "all 0.15s",
    whiteSpace: "nowrap" as const,
  },
  tabActive: {
    color: colors.textInverse,
    backgroundColor: colors.accent,
  },
  tabIcon: {
    fontSize: 10,
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginLeft: "auto",
  },
  headerButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    fontSize: 13,
    color: colors.textSecondary,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: 4,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  eventBadge: {
    fontSize: 10,
    fontFamily: fonts.mono,
    color: colors.accentLight,
    backgroundColor: colors.accentBg,
    padding: "2px 7px",
    borderRadius: 9999,
    fontWeight: 500,
  },
  content: {
    flex: 1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
};
