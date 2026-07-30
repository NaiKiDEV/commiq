import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { TimelineEntry } from "@naikidev/commiq-devtools-core";
import { colors, fonts, truncId } from "./theme";
import { PANEL_CSS } from "./panel-css";
import { safeStringifyPretty } from "./safe-stringify";
import { buildCausalityIndex, collectChainIds } from "./causality";
import { useResizable } from "./hooks/useResizable";
import { TabBar, tabPanelId, type TabId } from "./components/TabBar";
import { TabContent } from "./TabContent";
import type { DevtoolsEngine } from "./hooks/useDevtoolsEngine";
import type { DevtoolsStoreRegistry } from "./types";

const MIN_PANEL_HEIGHT = 120;
const VIEWPORT_RESERVE = 60;
const FALLBACK_MAX_HEIGHT = 800;

type ChainFocus = {
  correlationId: string;
  entries: readonly TimelineEntry[];
}

type DevtoolsPanelProps = {
  engine: DevtoolsEngine;
  stores: DevtoolsStoreRegistry;
  onClose: () => void;
  initialHeight: number;
  onHeightChange?: (height: number) => void;
  activeTab: TabId;
  onActiveTabChange: (tab: TabId) => void;
  errorFilter: boolean;
  onErrorFilterChange: (value: boolean) => void;
}

function maxPanelHeight(): number {
  if (typeof window === "undefined") return FALLBACK_MAX_HEIGHT;
  return Math.max(MIN_PANEL_HEIGHT, window.innerHeight - VIEWPORT_RESERVE);
}

export function DevtoolsPanel({
  engine,
  stores,
  onClose,
  initialHeight,
  onHeightChange,
  activeTab,
  onActiveTabChange,
  errorFilter,
  onErrorFilterChange,
}: DevtoolsPanelProps) {
  const [pinnedKeys, setPinnedKeys] = useState<Set<string>>(new Set());
  const [importedTimeline, setImportedTimeline] = useState<TimelineEntry[] | null>(null);
  const [chainFocus, setChainFocus] = useState<ChainFocus | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastClearCountRef = useRef(engine.clearCount);

  useEffect(() => {
    if (lastClearCountRef.current === engine.clearCount) return;
    lastClearCountRef.current = engine.clearCount;
    onErrorFilterChange(false);
    setPinnedKeys(new Set());
    setImportedTimeline(null);
    setChainFocus(null);
  }, [engine.clearCount, onErrorFilterChange]);

  const { height: panelHeight, isDragging, separatorProps } = useResizable({
    initial: initialHeight,
    min: MIN_PANEL_HEIGHT,
    max: maxPanelHeight,
    label: "Resize devtools panel",
  });

  useEffect(() => {
    onHeightChange?.(panelHeight);
  }, [panelHeight, onHeightChange]);

  const handleErrorBadgeClick = useCallback(() => {
    onActiveTabChange("events");
    onErrorFilterChange(true);
  }, [onActiveTabChange, onErrorFilterChange]);

  const handleClearErrorFilter = useCallback(() => {
    onErrorFilterChange(false);
  }, [onErrorFilterChange]);

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

  const pinActions = useMemo(
    () => ({ pinnedKeys, onTogglePin: handleTogglePin }),
    [pinnedKeys, handleTogglePin],
  );

  const liveTimeline = importedTimeline ?? engine.timeline;

  const handleSelectCorrelation = useCallback(
    (correlationId: string) => {
      const entries = importedTimeline
        ? chainFromTimeline(importedTimeline, correlationId)
        : engine.getChain(correlationId);
      if (entries.length === 0) return;
      setChainFocus({ correlationId, entries });
      onActiveTabChange("graph");
    },
    [importedTimeline, engine, onActiveTabChange],
  );

  const handleClearChainFocus = useCallback(() => setChainFocus(null), []);

  const activeTimeline = chainFocus ? chainFocus.entries : liveTimeline;

  const activeStoreNames = useMemo(() => {
    if (!importedTimeline && !chainFocus) return engine.storeNames;
    return [...new Set(activeTimeline.map((e) => e.storeName))];
  }, [importedTimeline, chainFocus, engine.storeNames, activeTimeline]);

  const handleExport = useCallback(() => {
    const blob = new Blob([safeStringifyPretty(engine.timeline)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `commiq-timeline-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [engine.timeline]);

  const handleImport = useCallback(() => fileInputRef.current?.click(), []);

  const handleClearImported = useCallback(() => {
    setImportedTimeline(null);
    setChainFocus(null);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseTimeline(reader.result);
      if (parsed) {
        setChainFocus(null);
        setImportedTimeline(parsed);
      }
    };
    reader.readAsText(file);
  }, []);

  return (
    <div style={{ ...styles.panel, height: panelHeight }}>
      <style>{PANEL_CSS}</style>

      <div
        style={styles.resizeHandle}
        className={`commiq-resize-handle${isDragging ? " dragging" : ""}`}
        {...separatorProps}
      >
        <div style={styles.resizeGrip} className="commiq-resize-grip" />
      </div>

      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logo} aria-hidden="true">⬡</span>
          <span style={styles.title}>Commiq</span>
          <span style={styles.titleSuffix}>devtools</span>
        </div>

        <TabBar activeTab={activeTab} onSelect={onActiveTabChange} />

        <div style={styles.headerRight}>
          {chainFocus && (
            <button
              type="button"
              className="commiq-imported"
              onClick={handleClearChainFocus}
              style={styles.chainBadge}
              title="Viewing a single causality chain — click to show everything"
            >
              ⬤ chain {truncId(chainFocus.correlationId)}
            </button>
          )}
          {importedTimeline && (
            <button
              type="button"
              className="commiq-imported"
              onClick={handleClearImported}
              style={styles.importedBadge}
              title="Viewing imported data — click to return to live"
            >
              ⬤ imported
            </button>
          )}
          <button
            type="button"
            className="commiq-label-btn"
            onClick={handleExport}
            style={styles.labelButton}
            title="Export timeline as JSON"
          >
            ↓ Export
          </button>
          <button
            type="button"
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
            aria-label="Import timeline from JSON"
          />
          <button
            type="button"
            className="commiq-icon-btn"
            onClick={engine.clear}
            style={styles.headerButton}
            title="Clear events"
            aria-label="Clear events"
          >
            ⟳
          </button>
          {engine.errorCount > 0 && (
            <button
              type="button"
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
            type="button"
            className="commiq-icon-btn"
            onClick={onClose}
            style={styles.headerButton}
            title="Close devtools"
            aria-label="Close devtools"
          >
            ✕
          </button>
        </div>
      </div>

      <div
        key={engine.clearCount}
        id={tabPanelId(activeTab)}
        role="tabpanel"
        aria-labelledby={`commiq-tab-${activeTab}`}
        style={styles.content}
        className="commiq-devtools-scroll"
      >
        <TabContent
          activeTab={activeTab}
          timeline={activeTimeline}
          storeNames={activeStoreNames}
          stores={stores}
          storeStates={engine.storeStates}
          getStateHistory={engine.getStateHistory}
          errorFilter={errorFilter}
          onClearErrorFilter={handleClearErrorFilter}
          onSelectCorrelation={handleSelectCorrelation}
          pinActions={pinActions}
        />
      </div>
    </div>
  );
}

function chainFromTimeline(
  timeline: readonly TimelineEntry[],
  correlationId: string,
): readonly TimelineEntry[] {
  const ids = collectChainIds(buildCausalityIndex(timeline), correlationId);
  return timeline.filter((entry) => ids.has(entry.correlationId));
}

function parseTimeline(raw: string | ArrayBuffer | null): TimelineEntry[] | null {
  if (typeof raw !== "string") return null;
  try {
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? (data as TimelineEntry[]) : null;
  } catch {
    return null;
  }
}

const styles = {
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
    pointerEvents: "auto",
  },
  resizeHandle: {
    position: "absolute",
    top: -4,
    left: 0,
    right: 0,
    height: 8,
    cursor: "ns-resize",
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    touchAction: "none",
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
    color: colors.accentLight,
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
    whiteSpace: "nowrap",
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
    color: colors.stateChange,
    backgroundColor: colors.stateChangeBg,
    padding: "2px 8px",
    borderRadius: 9999,
    fontWeight: 500,
    borderWidth: 0,
    cursor: "pointer",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  },
  chainBadge: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 9,
    fontFamily: fonts.mono,
    color: colors.accentLight,
    backgroundColor: colors.accentBg,
    padding: "2px 8px",
    borderRadius: 9999,
    fontWeight: 500,
    borderWidth: 0,
    cursor: "pointer",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  },
  content: {
    flex: 1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
} satisfies Record<string, CSSProperties>;
