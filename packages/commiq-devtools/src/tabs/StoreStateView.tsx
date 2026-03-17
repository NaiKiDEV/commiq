import type { CSSProperties } from "react";
import type { SealedStore } from "@naikidev/commiq";
import { colors, fonts, sharedStyles } from "../theme";
import { JsonTree } from "../components/JsonTree";

type StoreStateViewProps = {
  stores: Record<string, SealedStore<unknown>>;
  storeStates: Record<string, unknown>;
}

export function StoreStateView({ stores, storeStates }: StoreStateViewProps) {
  const storeNames = Object.keys(stores);

  return (
    <div style={sharedStyles.container}>
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
