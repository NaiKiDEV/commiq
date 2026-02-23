import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type CSSProperties,
} from "react";
import type { SealedStore } from "@naikidev/commiq";
import type { TimelineEntry } from "@naikidev/commiq-devtools";
import { colors, fonts } from "./theme";
import { EventLog } from "./EventLog";
import { CausalityGraph } from "./CausalityGraph";
import { TimelineChart } from "./TimelineChart";
import { PerformanceTab } from "./PerformanceTab";
import { StoreStateView } from "./StoreStateView";
import { DependencyMap } from "./DependencyMap";
import type { DevtoolsEngine } from "./useDevtoolsEngine";

type Tab = "events" | "graph" | "timeline" | "perf" | "state" | "deps";

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
  const [isPanelDragging, setIsPanelDragging] = useState(false);
  const [importedTimeline, setImportedTimeline] = useState<
    TimelineEntry[] | null
  >(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeTimeline = importedTimeline ?? engine.timeline;
  const activeStoreNames = importedTimeline
    ? [...new Set(importedTimeline.map((e) => e.storeName))]
    : engine.storeNames;

  const handleExport = useCallback(() => {
    const data = JSON.stringify(engine.timeline, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `commiq-timeline-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [engine.timeline]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string) as TimelineEntry[];
          if (Array.isArray(data)) {
            setImportedTimeline(data);
          }
        } catch {
          /* ignore invalid files */
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      setIsPanelDragging(true);
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
      setIsPanelDragging(false);
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
    { id: "deps", label: "Deps", icon: "◈" },
  ];

  return (
    <div style={{ ...styles.panel, height: panelHeight }}>
      <style>{scrollbarCSS}</style>

      <div
        style={styles.resizeHandle}
        className={`commiq-resize-handle${isPanelDragging ? " dragging" : ""}`}
        onMouseDown={onMouseDown}
      >
        <div style={styles.resizeGrip} className="commiq-resize-grip" />
      </div>

      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logo}>⬡</span>
          <span style={styles.title}>Commiq</span>
          <span style={styles.titleSuffix}>devtools</span>
        </div>

        <div style={styles.tabs} className="commiq-devtools-tabs">
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
          {importedTimeline && (
            <button
              onClick={() => setImportedTimeline(null)}
              style={styles.importedBadge}
              title="Viewing imported data — click to return to live"
            >
              ⬤ imported
            </button>
          )}
          <button
            onClick={handleExport}
            style={styles.labelButton}
            title="Export timeline as JSON"
          >
            ↓ Export
          </button>
          <button
            onClick={handleImport}
            style={styles.labelButton}
            title="Import timeline from JSON"
          >
            ↑ Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
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
          <EventLog timeline={activeTimeline} storeNames={activeStoreNames} />
        )}
        {activeTab === "graph" && (
          <CausalityGraph
            timeline={activeTimeline}
            storeNames={activeStoreNames}
          />
        )}
        {activeTab === "timeline" && (
          <TimelineChart
            timeline={activeTimeline}
            storeNames={activeStoreNames}
          />
        )}
        {activeTab === "perf" && (
          <PerformanceTab
            timeline={activeTimeline}
            storeNames={activeStoreNames}
          />
        )}
        {activeTab === "state" && (
          <StoreStateView stores={stores} storeStates={engine.storeStates} />
        )}
        {activeTab === "deps" && (
          <DependencyMap
            timeline={activeTimeline}
            storeNames={activeStoreNames}
          />
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
.commiq-resize-grip {
  background-color: ${colors.textMuted};
  opacity: 0.5;
  transition: opacity 0.15s, background-color 0.15s;
}
.commiq-resize-handle {
  border-top: 1px solid transparent;
  transition: border-color 0.15s;
}
.commiq-resize-handle:hover .commiq-resize-grip,
.commiq-resize-handle.dragging .commiq-resize-grip {
  opacity: 1;
  background-color: ${colors.accent};
}
.commiq-resize-handle:hover,
.commiq-resize-handle.dragging {
  border-color: ${colors.accent};
}
.commiq-devtools-tabs::-webkit-scrollbar {
  display: none;
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
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 10px",
    height: 40,
    backgroundColor: colors.bgHeader,
    borderBottom: `1px solid ${colors.border}`,
    flexShrink: 0,
    overflow: "hidden",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginRight: 4,
    flexShrink: 0,
  },
  logo: {
    fontSize: 16,
    color: colors.accent,
    lineHeight: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    color: colors.accentLight,
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
    flex: "1 1 0",
    minWidth: 0,
    overflow: "auto" as const,
    scrollbarWidth: "none" as any,
    msOverflowStyle: "none" as any,
  },
  tab: {
    display: "flex",
    alignItems: "center",
    gap: 3,
    padding: "5px 8px",
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
    flexShrink: 0,
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
    gap: 5,
    marginLeft: "auto",
    flexShrink: 0,
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
    flexShrink: 0,
  },
  labelButton: {
    display: "flex",
    alignItems: "center",
    gap: 3,
    padding: "3px 8px",
    fontSize: 10,
    fontWeight: 500,
    color: colors.textSecondary,
    backgroundColor: colors.bgPanel,
    borderWidth: 0,
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: fonts.sans,
    transition: "all 0.15s",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
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
  importedBadge: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 9,
    fontFamily: fonts.mono,
    color: "#fbbf24",
    backgroundColor: "rgba(251, 191, 36, 0.1)",
    padding: "2px 8px",
    borderRadius: 9999,
    fontWeight: 500,
    borderWidth: 0,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  content: {
    flex: 1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
};
