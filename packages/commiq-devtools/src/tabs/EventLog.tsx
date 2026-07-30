import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { TimelineEntry } from "@naikidev/commiq-devtools-core";
import { colors, fonts, matchesSearch, sharedStyles } from "../theme";
import { BUILTIN_EVENT_NAMES, isErrorEventName } from "../event-names";
import { FilterToolbar } from "../components/FilterToolbar";
import { entryKey, type PinActions } from "../types";
import { DETAIL_HEIGHT, ROW_HEIGHT, useVirtualRows } from "../hooks/useVirtualRows";
import { EventLogDetail, EventLogRow } from "./EventLogRow";

type EventLogProps = {
  timeline: readonly TimelineEntry[];
  storeNames: string[];
  onSelectCorrelation?: (id: string) => void;
  errorFilter?: boolean;
  onClearErrorFilter?: () => void;
  pinActions?: PinActions;
}

type FilterState = {
  showBuiltins: boolean;
  storeFilter: string | null;
  searchQuery: string;
  pinnedOnly: boolean;
  errorFilter: boolean;
  pinnedKeys: Set<string> | undefined;
}

export function filterTimeline(
  timeline: readonly TimelineEntry[],
  state: FilterState,
): TimelineEntry[] {
  return timeline.filter((entry) => {
    if (state.pinnedOnly && state.pinnedKeys && !state.pinnedKeys.has(entryKey(entry))) {
      return false;
    }
    if (state.errorFilter && !isErrorEventName(entry.name)) return false;
    if (!state.showBuiltins && BUILTIN_EVENT_NAMES.has(entry.name)) return false;
    if (state.storeFilter && entry.storeName !== state.storeFilter) return false;
    return matchesSearch(entry, state.searchQuery);
  });
}

export function EventLog({
  timeline,
  storeNames,
  onSelectCorrelation,
  errorFilter = false,
  onClearErrorFilter,
  pinActions,
}: EventLogProps) {
  const [showBuiltins, setShowBuiltins] = useState(true);
  const [storeFilter, setStoreFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const pinnedKeys = pinActions?.pinnedKeys;

  const filtered = useMemo(
    () =>
      filterTimeline(timeline, {
        showBuiltins,
        storeFilter,
        searchQuery,
        pinnedOnly,
        errorFilter,
        pinnedKeys,
      }),
    [timeline, showBuiltins, storeFilter, searchQuery, pinnedOnly, errorFilter, pinnedKeys],
  );

  const expandedIndex = useMemo(() => {
    if (expandedId === null) return null;
    const index = filtered.findIndex((entry) => entryKey(entry) === expandedId);
    return index === -1 ? null : index;
  }, [filtered, expandedId]);

  const { containerRef, range, totalHeight, offsetOf, handleScroll, scrollToBottom } =
    useVirtualRows({ count: filtered.length, expandedIndex });

  useEffect(() => {
    if (autoScroll) scrollToBottom();
  }, [filtered.length, autoScroll, scrollToBottom]);

  const handleToggleExpand = useCallback((key: string) => {
    setExpandedId((prev) => (prev === key ? null : key));
  }, []);

  const handleTogglePin = useCallback(
    (key: string) => pinActions?.onTogglePin(key),
    [pinActions],
  );

  const handleAutoScrollChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAutoScroll(e.target.checked);
  }, []);

  const handlePinnedOnlyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPinnedOnly(e.target.checked);
  }, []);

  const visible = filtered.slice(range.start, range.end);
  const expandedEntry = expandedIndex === null ? null : filtered[expandedIndex];

  return (
    <div style={sharedStyles.container}>
      <FilterToolbar
        showBuiltins={showBuiltins}
        onShowBuiltinsChange={setShowBuiltins}
        storeFilter={storeFilter}
        onStoreFilterChange={setStoreFilter}
        storeNames={storeNames}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        extraLeft={
          <>
            <label className="commiq-check" style={styles.checkLabel}>
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={handleAutoScrollChange}
                style={styles.checkbox}
              />
              Auto-scroll
            </label>
            {pinnedKeys && pinnedKeys.size > 0 && (
              <label className="commiq-check" style={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={pinnedOnly}
                  onChange={handlePinnedOnlyChange}
                  style={styles.checkbox}
                />
                Pinned ({pinnedKeys.size})
              </label>
            )}
          </>
        }
        trailing={
          <div style={styles.trailing}>
            {errorFilter && (
              <button
                type="button"
                className="commiq-error-pill"
                onClick={onClearErrorFilter}
                style={styles.errorFilterBadge}
                title="Showing errors only — click to clear"
              >
                ✕ errors only
              </button>
            )}
            <span style={styles.eventCount}>{filtered.length} events</span>
          </div>
        }
      />

      <div ref={containerRef} style={styles.scrollArea} onScroll={handleScroll}>
        {filtered.length === 0 && (
          <div style={sharedStyles.empty}>
            {timeline.length === 0
              ? "No events yet. Interact with your stores to generate events."
              : "No events match the current filter. Try enabling builtin events."}
          </div>
        )}

        <div style={{ ...styles.viewport, height: totalHeight }}>
          {visible.map((entry, offset) => {
            const index = range.start + offset;
            const key = entryKey(entry);
            return (
              <EventLogRow
                key={key}
                entry={entry}
                entryKeyValue={key}
                expanded={expandedId === key}
                pinned={pinnedKeys?.has(key) ?? false}
                pinnable={pinActions !== undefined}
                style={{ ...styles.absoluteRow, top: offsetOf(index) }}
                onToggleExpand={handleToggleExpand}
                onTogglePin={handleTogglePin}
                onSelectCorrelation={onSelectCorrelation}
              />
            );
          })}

          {expandedEntry && expandedIndex !== null && (
            <EventLogDetail
              entry={expandedEntry}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: offsetOf(expandedIndex) + ROW_HEIGHT,
                height: DETAIL_HEIGHT,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  checkLabel: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    color: colors.textSecondary,
    cursor: "pointer",
    fontFamily: fonts.sans,
    userSelect: "none",
    whiteSpace: "nowrap",
  },
  checkbox: {
    accentColor: colors.accent,
    cursor: "pointer",
    margin: 0,
  },
  trailing: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  eventCount: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fonts.mono,
    whiteSpace: "nowrap",
  },
  errorFilterBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 10,
    fontFamily: fonts.mono,
    fontWeight: 600,
    color: colors.error,
    backgroundColor: colors.errorBg,
    padding: "2px 8px",
    borderRadius: 9999,
    borderWidth: 0,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto",
    overflowX: "hidden",
    position: "relative",
  },
  viewport: {
    position: "relative",
    width: "100%",
  },
  absoluteRow: {
    position: "absolute",
    left: 0,
    right: 0,
    height: ROW_HEIGHT,
  },
} satisfies Record<string, CSSProperties>;
