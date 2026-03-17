import { useState, useMemo, type CSSProperties } from "react";
import type { SealedStore } from "@naikidev/commiq";
import type { StateSnapshot } from "@naikidev/commiq-devtools-core";
import { colors, fonts, formatTime, sharedStyles } from "../theme";
import { JsonTree } from "../components/JsonTree";
import { StateDiff } from "../components/StateDiff";

type StoreStateViewProps = {
  stores: Record<string, SealedStore<unknown>>;
  storeStates: Record<string, unknown>;
  getStateHistory: (storeName: string) => StateSnapshot[];
}

type Mode = "live" | "history";

export function StoreStateView({
  stores,
  storeStates,
  getStateHistory,
}: StoreStateViewProps) {
  const storeNames = Object.keys(stores);
  const [mode, setMode] = useState<Mode>("live");
  const [selectedStore, setSelectedStore] = useState<string | null>(
    storeNames.length === 1 ? storeNames[0] : null,
  );
  const [snapshotIndex, setSnapshotIndex] = useState<number | null>(null);

  const history = useMemo(() => {
    if (!selectedStore) return [];
    return getStateHistory(selectedStore);
  }, [selectedStore, getStateHistory]);

  const currentIndex = snapshotIndex ?? (history.length > 0 ? history.length - 1 : 0);
  const currentSnapshot = history[currentIndex];
  const previousSnapshot = currentIndex > 0 ? history[currentIndex - 1] : undefined;
  const isLatest = currentIndex === history.length - 1;

  function handleModeChange(newMode: Mode) {
    setMode(newMode);
    setSnapshotIndex(null);
  }

  function handleStoreChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value === "__all__" ? null : e.target.value;
    setSelectedStore(value);
    setSnapshotIndex(null);
  }

  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSnapshotIndex(Number(e.target.value));
  }

  function handleStepBack() {
    if (currentIndex > 0) setSnapshotIndex(currentIndex - 1);
  }

  function handleStepForward() {
    if (currentIndex < history.length - 1) setSnapshotIndex(currentIndex + 1);
  }

  function handleGoToLatest() {
    setSnapshotIndex(null);
  }

  return (
    <div style={sharedStyles.container}>
      <div style={styles.toolbar}>
        <div style={styles.modeToggle}>
          <button
            className={`commiq-label-btn${mode === "live" ? "" : ""}`}
            style={{
              ...styles.modeButton,
              ...(mode === "live" ? styles.modeButtonActive : {}),
            }}
            onClick={() => handleModeChange("live")}
          >
            Live
          </button>
          <button
            className={`commiq-label-btn${mode === "history" ? "" : ""}`}
            style={{
              ...styles.modeButton,
              ...(mode === "history" ? styles.modeButtonActive : {}),
            }}
            onClick={() => handleModeChange("history")}
          >
            History
          </button>
        </div>

        {mode === "history" && (
          <select
            className="commiq-select"
            value={selectedStore ?? "__all__"}
            onChange={handleStoreChange}
            style={styles.select}
          >
            <option value="__all__">Select store</option>
            {storeNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        )}
      </div>

      {mode === "live" && (
        <div style={styles.scrollArea}>
          {storeNames.length === 0 && (
            <div style={sharedStyles.empty}>No stores connected.</div>
          )}

          {storeNames.map((name) => (
            <div key={name} style={styles.storeCard}>
              <div style={styles.storeHeader}>
                <span style={styles.storeIcon}>◆</span>
                <span style={styles.storeName}>{name}</span>
                <span style={styles.storeType}>
                  {getStateType(storeStates[name])}
                </span>
              </div>
              <div style={styles.storeBody}>
                <JsonTree data={storeStates[name]} initialExpanded={true} />
              </div>
            </div>
          ))}
        </div>
      )}

      {mode === "history" && !selectedStore && (
        <div style={sharedStyles.empty}>Select a store to browse its state history.</div>
      )}

      {mode === "history" && selectedStore && history.length === 0 && (
        <div style={sharedStyles.empty}>
          No state changes recorded for {selectedStore} yet.
        </div>
      )}

      {mode === "history" && selectedStore && history.length > 0 && (
        <>
          <div style={styles.scrubber}>
            <button
              className="commiq-icon-btn"
              style={styles.stepButton}
              onClick={handleStepBack}
              disabled={currentIndex === 0}
              title="Previous snapshot"
            >
              ◀
            </button>

            <input
              type="range"
              min={0}
              max={history.length - 1}
              value={currentIndex}
              onChange={handleSliderChange}
              style={styles.slider}
            />

            <button
              className="commiq-icon-btn"
              style={styles.stepButton}
              onClick={handleStepForward}
              disabled={isLatest}
              title="Next snapshot"
            >
              ▶
            </button>

            <div style={styles.scrubberInfo}>
              <span style={styles.snapshotCount}>
                {currentIndex + 1} / {history.length}
              </span>
              {currentSnapshot && (
                <span style={styles.snapshotTime}>
                  {formatTime(currentSnapshot.timestamp)}
                </span>
              )}
              {!isLatest && (
                <button
                  className="commiq-label-btn"
                  style={styles.latestButton}
                  onClick={handleGoToLatest}
                >
                  ↦ Latest
                </button>
              )}
            </div>
          </div>

          {!isLatest && (
            <div style={styles.historyBanner}>
              Viewing historical state — {history.length - 1 - currentIndex} snapshot(s) behind live
            </div>
          )}

          <div style={styles.scrollArea}>
            <div style={styles.storeCard}>
              <div style={styles.storeHeader}>
                <span style={styles.storeIcon}>◆</span>
                <span style={styles.storeName}>{selectedStore}</span>
                <span style={styles.storeType}>
                  {currentSnapshot ? getStateType(currentSnapshot.state) : "—"}
                </span>
              </div>
              <div style={styles.storeBody}>
                {currentSnapshot && (
                  <JsonTree data={currentSnapshot.state} initialExpanded={true} />
                )}
              </div>
            </div>

            {previousSnapshot && currentSnapshot && (
              <div style={styles.storeCard}>
                <div style={styles.storeHeader}>
                  <span style={styles.storeIcon}>△</span>
                  <span style={styles.storeName}>Changes from snapshot {currentIndex}</span>
                  <span style={styles.storeType}>
                    {formatTime(previousSnapshot.timestamp)} → {formatTime(currentSnapshot.timestamp)}
                  </span>
                </div>
                <div style={styles.storeBody}>
                  <StateDiff
                    before={previousSnapshot.state}
                    after={currentSnapshot.state}
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function getStateType(state: unknown): string {
  if (state === null) return "null";
  if (state === undefined) return "undefined";
  if (Array.isArray(state)) return `Array(${state.length})`;
  if (typeof state === "object") {
    const keys = Object.keys(state as object);
    return `{${keys.length} keys}`;
  }
  return typeof state;
}

const styles: Record<string, CSSProperties> = {
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 12px",
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.bgToolbar,
    flexShrink: 0,
  },
  modeToggle: {
    display: "flex",
    gap: 2,
    backgroundColor: colors.bgInput,
    borderRadius: 5,
    padding: 2,
    border: `1px solid ${colors.border}`,
  },
  modeButton: {
    padding: "3px 10px",
    fontSize: 11,
    fontWeight: 500,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: 3,
    cursor: "pointer",
  },
  modeButtonActive: {
    color: colors.textInverse,
    backgroundColor: colors.accent,
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
  scrubber: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.bgPanel,
    flexShrink: 0,
  },
  stepButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    fontSize: 10,
    color: colors.textSecondary,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: 4,
    cursor: "pointer",
    flexShrink: 0,
  },
  slider: {
    flex: 1,
    height: 4,
    accentColor: colors.accent,
    cursor: "pointer",
  },
  scrubberInfo: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  snapshotCount: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: colors.text,
    fontWeight: 600,
  },
  snapshotTime: {
    fontSize: 10,
    fontFamily: fonts.mono,
    color: colors.textMuted,
  },
  latestButton: {
    padding: "2px 8px",
    fontSize: 10,
    fontWeight: 500,
    fontFamily: fonts.sans,
    color: colors.textSecondary,
    backgroundColor: colors.bgActive,
    borderWidth: 0,
    borderRadius: 4,
    cursor: "pointer",
  },
  historyBanner: {
    padding: "5px 12px",
    fontSize: 10,
    fontFamily: fonts.sans,
    fontWeight: 500,
    color: colors.stateChange,
    backgroundColor: colors.stateChangeBg,
    borderBottom: `1px solid rgba(251, 191, 36, 0.2)`,
    flexShrink: 0,
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto" as const,
    padding: 12,
  },
  storeCard: {
    marginBottom: 12,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.bgPanel,
  },
  storeHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.bgHeader,
  },
  storeIcon: {
    color: colors.accent,
    fontSize: 10,
  },
  storeName: {
    fontSize: 12,
    fontWeight: 600,
    color: colors.text,
    fontFamily: fonts.sans,
  },
  storeType: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: fonts.mono,
    marginLeft: "auto",
  },
  storeBody: {
    padding: "10px 14px",
    overflow: "auto",
    lineHeight: "20px",
  },
};
