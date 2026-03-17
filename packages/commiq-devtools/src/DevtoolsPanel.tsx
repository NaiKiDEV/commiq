import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type CSSProperties,
} from "react";
import type { SealedStore } from "@naikidev/commiq";
import type { TimelineEntry } from "@naikidev/commiq-devtools-core";
import { colors, fonts } from "./theme";
import { useResizable } from "./hooks/useResizable";
import { EventLog } from "./tabs/EventLog";
import { CausalityGraph } from "./tabs/CausalityGraph";
import { TimelineChart } from "./tabs/TimelineChart";
import { PerformanceTab } from "./tabs/PerformanceTab";
import { StoreStateView } from "./tabs/StoreStateView";
import { DependencyMap } from "./tabs/DependencyMap";
import { DispatchTab } from "./tabs/DispatchTab";
import type { DevtoolsEngine } from "./hooks/useDevtoolsEngine";

type Tab = "events" | "graph" | "timeline" | "perf" | "state" | "deps" | "dispatch";

type DevtoolsPanelProps = {
  engine: DevtoolsEngine;
  stores: Record<string, SealedStore<unknown>>;
  onClose: () => void;
  initialHeight: number;
  initialErrorFilter?: boolean;
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "events", label: "Events", icon: "≡" },
  { id: "graph", label: "Graph", icon: "◇" },
  { id: "timeline", label: "Timeline", icon: "◔" },
  { id: "perf", label: "Performance", icon: "⚡" },
  { id: "state", label: "State", icon: "◆" },
  { id: "deps", label: "Deps", icon: "◈" },
  { id: "dispatch", label: "Dispatch", icon: "▷" },
];

export function DevtoolsPanel({
  engine,
  stores,
  onClose,
  initialHeight,
  initialErrorFilter = false,
}: DevtoolsPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("events");
  const [errorFilter, setErrorFilter] = useState(initialErrorFilter);
  const [pinnedKeys, setPinnedKeys] = useState<Set<string>>(new Set());
  const [importedTimeline, setImportedTimeline] = useState<
    TimelineEntry[] | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setErrorFilter(false);
    setPinnedKeys(new Set());
    setImportedTimeline(null);
  }, [engine.clearCount]);

  const { height: panelHeight, isDragging: isPanelDragging, onMouseDown } = useResizable({
    initial: initialHeight,
    min: 120,
    max: typeof window !== "undefined" ? window.innerHeight - 60 : 800,
  });

  function handleErrorBadgeClick() {
    setActiveTab("events");
    setErrorFilter(true);
  }

  function handleClearErrorFilter() {
    setErrorFilter(false);
  }

  const handleTogglePin = useCallback((key: string) => {
    setPinnedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const pinActions = useMemo(() => ({
    pinnedKeys,
    onTogglePin: handleTogglePin,
  }), [pinnedKeys, handleTogglePin]);

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

  function handleImport() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as TimelineEntry[];
        if (Array.isArray(data)) {
          setImportedTimeline(data);
        }
      } catch {}
    };
    reader.readAsText(file);
    e.target.value = "";
  }

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
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`commiq-tab${activeTab === tab.id ? " active" : ""}`}
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
              className="commiq-imported"
              onClick={() => setImportedTimeline(null)}
              style={styles.importedBadge}
              title="Viewing imported data — click to return to live"
            >
              ⬤ imported
            </button>
          )}
          <button
            className="commiq-label-btn"
            onClick={handleExport}
            style={styles.labelButton}
            title="Export timeline as JSON"
          >
            ↓ Export
          </button>
          <button
            className="commiq-label-btn"
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
            className="commiq-icon-btn"
            onClick={engine.clear}
            style={styles.headerButton}
            title="Clear events"
          >
            ⟳
          </button>
          {engine.errorCount > 0 && (
            <button
              className="commiq-error-badge"
              onClick={handleErrorBadgeClick}
              style={styles.errorBadge}
              title={`${engine.errorCount} error(s) — click to filter`}
            >
              {engine.errorCount > 99 ? "99+" : engine.errorCount}
            </button>
          )}
          <span style={styles.eventBadge}>{engine.eventCount}</span>
          <button
            className="commiq-icon-btn"
            onClick={onClose}
            style={styles.headerButton}
            title="Close devtools"
          >
            ✕
          </button>
        </div>
      </div>

      <div key={engine.clearCount} style={styles.content} className="commiq-devtools-scroll">
        {activeTab === "events" && (
          <EventLog
            timeline={activeTimeline}
            storeNames={activeStoreNames}
            errorFilter={errorFilter}
            onClearErrorFilter={handleClearErrorFilter}
            pinActions={pinActions}
          />
        )}
        {activeTab === "graph" && (
          <CausalityGraph
            timeline={activeTimeline}
            storeNames={activeStoreNames}
            pinActions={pinActions}
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
          <StoreStateView stores={stores} storeStates={engine.storeStates} getStateHistory={engine.getStateHistory} />
        )}
        {activeTab === "deps" && (
          <DependencyMap
            timeline={activeTimeline}
            storeNames={activeStoreNames}
          />
        )}
        {activeTab === "dispatch" && (
          <DispatchTab
            timeline={activeTimeline}
            stores={stores}
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

/* Base transitions for all interactive elements */
.commiq-row,
.commiq-pin,
.commiq-link,
.commiq-icon-btn,
.commiq-label-btn,
.commiq-tab,
.commiq-error-badge,
.commiq-error-pill,
.commiq-select,
.commiq-input,
.commiq-cmd-card,
.commiq-dispatch-btn,
.commiq-close-btn,
.commiq-toast,
.commiq-toast-close,
.commiq-imported,
.commiq-chain-header,
.commiq-check,
.commiq-expand,
.commiq-badge,
.commiq-json-toggle {
  transition: background-color 0.15s, color 0.15s, border-color 0.15s, filter 0.15s, opacity 0.15s !important;
}

/* Row hovers */
.commiq-row:hover { background-color: ${colors.bgHover} !important; }
.commiq-row.selected:hover { background-color: ${colors.bgSelected} !important; }

/* Pin button hover */
.commiq-pin:hover { color: ${colors.accentLight} !important; }

/* Inline link hovers */
.commiq-link:hover { text-decoration: underline !important; }

/* Header icon buttons */
.commiq-icon-btn:hover { background-color: ${colors.bgHover} !important; color: ${colors.text} !important; }

/* Label buttons (export/import) */
.commiq-label-btn:hover { background-color: ${colors.bgActive} !important; color: ${colors.text} !important; }

/* Tab buttons */
.commiq-tab:hover:not(.active) { color: ${colors.tabHover} !important; background-color: ${colors.bgHover} !important; }

/* Error badge */
.commiq-error-badge:hover { background-color: rgba(248, 113, 113, 0.2) !important; }

/* Error filter pill */
.commiq-error-pill:hover { background-color: rgba(248, 113, 113, 0.2) !important; }

/* Selects & inputs */
.commiq-select:hover, .commiq-input:hover { border-color: ${colors.textMuted} !important; }
.commiq-input:focus, .commiq-select:focus { border-color: ${colors.accent} !important; }

/* Dispatch command cards */
.commiq-cmd-card:hover { background-color: ${colors.bgHover} !important; }

/* Dispatch button */
.commiq-dispatch-btn:hover:not(:disabled) { background-color: ${colors.accentHover} !important; }

/* Close / dismiss buttons */
.commiq-close-btn:hover { background-color: ${colors.bgHover} !important; color: ${colors.text} !important; }

/* Toast hover */
.commiq-toast:hover { border-color: ${colors.error} !important; background-color: ${colors.bgHover} !important; }
.commiq-toast-close:hover { color: ${colors.text} !important; }

/* Imported badge */
.commiq-imported:hover { background-color: rgba(251, 191, 36, 0.2) !important; }

/* Chain header in causality graph */
.commiq-chain-header:hover { background-color: ${colors.bgHover} !important; }

/* Checkboxes */
.commiq-check:hover { color: ${colors.text} !important; }

/* Expand icon */
.commiq-expand:hover { color: ${colors.text} !important; }

/* Event badge pills */
.commiq-badge:hover { filter: brightness(1.2); }

/* JsonTree toggle */
.commiq-json-toggle:hover { color: ${colors.text} !important; }
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
    scrollbarWidth: "none" as CSSProperties["scrollbarWidth"],
    msOverflowStyle: "none" as CSSProperties["msOverflowStyle"],
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
  errorBadge: {
    fontSize: 10,
    fontFamily: fonts.mono,
    color: colors.error,
    backgroundColor: colors.errorBg,
    padding: "2px 7px",
    borderRadius: 9999,
    fontWeight: 600,
    borderWidth: 0,
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
