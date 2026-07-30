import { useCallback, useMemo, useState, type CSSProperties } from "react";
import type { TimelineEntry } from "@naikidev/commiq-devtools-core";
import {
  colors,
  fonts,
  getEventColor,
  truncId,
  formatTime,
  matchesSearch,
  sharedStyles,
} from "../theme";
import { BUILTIN_EVENT_NAMES } from "../event-names";
import { buildCausalityIndex, buildCommandGroups, type CommandGroup } from "../causality";
import { FilterToolbar } from "../components/FilterToolbar";
import { DetailPanel } from "../components/DetailPanel";
import { entryKey, type PinActions } from "../types";

const MAX_RENDER_DEPTH = 32;

type CausalityGraphProps = {
  timeline: readonly TimelineEntry[];
  storeNames: string[];
  pinActions?: PinActions;
}

export function CausalityGraph({ timeline, storeNames, pinActions }: CausalityGraphProps) {
  const [showBuiltins, setShowBuiltins] = useState(true);
  const [storeFilter, setStoreFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<TimelineEntry | null>(null);

  const chains = useMemo(
    () => buildCommandGroups(buildCausalityIndex(timeline), timeline),
    [timeline],
  );

  const filteredChains = useMemo(
    () =>
      chains
        .map((chain) => filterChain(chain, showBuiltins, storeFilter, searchQuery))
        .filter((chain): chain is CommandGroup => chain !== null),
    [chains, showBuiltins, storeFilter, searchQuery],
  );

  const handleCloseDetail = useCallback(() => setSelectedEvent(null), []);

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
        trailing={<span style={styles.chainCount}>{filteredChains.length} chains</span>}
      />

      <div style={styles.scrollArea}>
        {filteredChains.length === 0 && (
          <div style={sharedStyles.empty}>
            {timeline.length === 0
              ? "No events yet. Interact with your stores to see causality chains."
              : "No chains match the current filter."}
          </div>
        )}

        {filteredChains.map((chain) => (
          <ChainNode
            key={chain.commandId}
            group={chain}
            depth={0}
            selectedEvent={selectedEvent}
            onSelectEvent={setSelectedEvent}
            showBuiltins={showBuiltins}
            pinActions={pinActions}
          />
        ))}
      </div>

      {selectedEvent && <DetailPanel event={selectedEvent} onClose={handleCloseDetail} />}
    </div>
  );
}

type ChainNodeProps = {
  group: CommandGroup;
  depth: number;
  selectedEvent: TimelineEntry | null;
  onSelectEvent: (entry: TimelineEntry) => void;
  showBuiltins: boolean;
  pinActions?: PinActions;
}

function ChainNode({
  group,
  depth,
  selectedEvent,
  onSelectEvent,
  showBuiltins,
  pinActions,
}: ChainNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);

  const handleToggle = useCallback(() => setExpanded((prev) => !prev), []);

  const visibleEvents = showBuiltins
    ? group.events
    : group.events.filter((e) => !BUILTIN_EVENT_NAMES.has(e.name));

  if (depth > MAX_RENDER_DEPTH) return null;

  return (
    <div style={depth === 0 ? styles.chain : styles.chainNested}>
      <div className="commiq-chain-header" style={styles.chainHeader} onClick={handleToggle}>
        <span className="commiq-expand" style={styles.chainChevron}>
          {expanded ? "▼" : "▶"}
        </span>
        <span style={styles.chainName}>{group.commandName}</span>
        <span
          style={{
            ...styles.chainBadge,
            backgroundColor: colors.badge,
            color: colors.badgeText,
          }}
        >
          {group.storeName}
        </span>
        <span style={styles.chainMeta}>
          {group.events.length} events · {formatTime(group.timestamp)}
        </span>
      </div>

      {expanded && (
        <div style={styles.chainBody}>
          {visibleEvents.map((entry) => (
            <ChainEvent
              key={entryKey(entry)}
              entry={entry}
              selected={selectedEvent?.correlationId === entry.correlationId}
              pinActions={pinActions}
              onSelectEvent={onSelectEvent}
            />
          ))}

          {group.children.map((child) => (
            <ChainNode
              key={child.commandId}
              group={child}
              depth={depth + 1}
              selectedEvent={selectedEvent}
              onSelectEvent={onSelectEvent}
              showBuiltins={showBuiltins}
              pinActions={pinActions}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type ChainEventProps = {
  entry: TimelineEntry;
  selected: boolean;
  pinActions?: PinActions;
  onSelectEvent: (entry: TimelineEntry) => void;
}

function ChainEvent({ entry, selected, pinActions, onSelectEvent }: ChainEventProps) {
  const color = getEventColor(entry.name, entry.type);
  const key = entryKey(entry);
  const pinned = pinActions?.pinnedKeys.has(key) ?? false;

  const handleSelect = useCallback(() => onSelectEvent(entry), [onSelectEvent, entry]);

  const handleTogglePin = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      pinActions?.onTogglePin(key);
    },
    [pinActions, key],
  );

  return (
    <div
      className={`commiq-row${selected ? " selected" : ""}`}
      style={{
        ...styles.eventNode,
        ...(pinned ? styles.eventNodePinned : {}),
        ...(selected ? styles.eventNodeSelected : {}),
      }}
      onClick={handleSelect}
    >
      {pinActions && (
        <span
          className="commiq-pin"
          style={pinned ? { ...styles.pinButton, ...styles.pinButtonActive } : styles.pinButton}
          onClick={handleTogglePin}
        >
          ●
        </span>
      )}
      <span style={{ ...styles.eventDot, backgroundColor: color.fg }} />
      <span style={{ ...styles.eventBadge, backgroundColor: color.bg, color: color.fg }}>
        {entry.name}
      </span>
      <span style={styles.eventStore}>{entry.storeName}</span>
      <span style={styles.eventCorr}>{truncId(entry.correlationId)}</span>
      <span style={styles.eventTime}>{formatTime(entry.timestamp)}</span>
    </div>
  );
}

function filterChain(
  chain: CommandGroup,
  showBuiltins: boolean,
  storeFilter: string | null,
  searchQuery: string,
): CommandGroup | null {
  const filteredChildren = chain.children
    .map((child) => filterChain(child, showBuiltins, storeFilter, searchQuery))
    .filter((child): child is CommandGroup => child !== null);

  const visibleEvents = chain.events.filter((e) => {
    if (!showBuiltins && BUILTIN_EVENT_NAMES.has(e.name)) return false;
    if (storeFilter && e.storeName !== storeFilter) return false;
    return matchesSearch(e, searchQuery);
  });

  if (visibleEvents.length === 0 && filteredChildren.length === 0) return null;

  return { ...chain, events: visibleEvents, children: filteredChildren };
}

const styles = {
  chainCount: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fonts.mono,
    marginLeft: "auto",
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto",
    overflowX: "hidden",
    padding: "8px 10px",
  },
  chain: {
    marginBottom: 6,
    borderRadius: 6,
    border: `1px solid ${colors.borderLight}`,
    backgroundColor: colors.bgPanel,
    overflow: "hidden",
  },
  chainNested: {
    marginLeft: 14,
    marginTop: 2,
    marginBottom: 2,
  },
  chainHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 12px",
    cursor: "pointer",
    transition: "background-color 0.1s",
  },
  chainChevron: {
    fontSize: 8,
    color: colors.textMuted,
    width: 12,
    flexShrink: 0,
    fontFamily: fonts.mono,
  },
  chainName: {
    fontSize: 12,
    fontWeight: 600,
    color: colors.text,
    fontFamily: fonts.sans,
  },
  chainBadge: {
    fontSize: 10,
    fontWeight: 500,
    padding: "1px 6px",
    borderRadius: 9999,
    fontFamily: fonts.sans,
  },
  chainMeta: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: fonts.mono,
    marginLeft: "auto",
  },
  chainBody: {
    padding: "0 4px 4px",
  },
  eventNode: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 10px",
    borderLeft: "2px solid transparent",
    cursor: "pointer",
    borderRadius: 3,
    fontSize: 11,
    fontFamily: fonts.sans,
    transition: "background-color 0.1s, border-color 0.1s",
  },
  eventNodePinned: {
    borderLeftColor: colors.accent,
    backgroundColor: "rgba(99, 102, 241, 0.05)",
  },
  eventNodeSelected: {
    backgroundColor: colors.bgSelected,
  },
  pinButton: {
    fontSize: 8,
    color: colors.textMuted,
    cursor: "pointer",
    flexShrink: 0,
    width: 14,
    textAlign: "center",
    transition: "color 0.1s",
  },
  pinButtonActive: {
    color: colors.accent,
  },
  eventDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    flexShrink: 0,
  },
  eventBadge: {
    fontSize: 10,
    fontWeight: 500,
    padding: "1px 6px",
    borderRadius: 9999,
    whiteSpace: "nowrap",
    fontFamily: fonts.sans,
  },
  eventStore: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: fonts.sans,
  },
  eventCorr: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: fonts.mono,
    marginLeft: "auto",
  },
  eventTime: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: fonts.mono,
    flexShrink: 0,
  },
} satisfies Record<string, CSSProperties>;
