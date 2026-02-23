import { type CSSProperties } from "react";
import type { SealedStore } from "@naikidev/commiq";
import { colors, fonts } from "./theme";
import { JsonTree } from "./JsonTree";

interface StoreStateViewProps {
  stores: Record<string, SealedStore<any>>;
  storeStates: Record<string, unknown>;
}

export function StoreStateView({ stores, storeStates }: StoreStateViewProps) {
  const storeNames = Object.keys(stores);

  return (
    <div style={styles.container}>
      <div style={styles.scrollArea}>
        {storeNames.length === 0 && (
          <div style={styles.empty}>No stores connected.</div>
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
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto" as const,
    padding: 12,
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
    maxHeight: 300,
    lineHeight: "20px",
  },
};
