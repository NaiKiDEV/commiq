import { useState, useMemo, type CSSProperties } from "react";
import type { TimelineEntry } from "@naikidev/commiq-devtools-core";
import {
  colors,
  fonts,
  BUILTIN_EVENTS,
  getEventColor,
  truncId,
  formatTime,
  matchesSearch,
  sharedStyles,
} from "../theme";
import { FilterToolbar } from "../components/FilterToolbar";
import { DetailPanel } from "../components/DetailPanel";
import { getCommandFromEntry, entryKey, type PinActions } from "../types";

type CausalityGraphProps = {
  timeline: TimelineEntry[];
  storeNames: string[];
  pinActions?: PinActions;
}

type CommandGroup = {
  commandId: string;
  commandName: string;
  storeName: string;
  events: TimelineEntry[];
  children: CommandGroup[];
  timestamp: number;
}

export function CausalityGraph({ timeline, storeNames, pinActions }: CausalityGraphProps) {
  const [showBuiltins, setShowBuiltins] = useState(true);
  const [storeFilter, setStoreFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<TimelineEntry | null>(
    null,
  );

  const chains = useMemo(() => buildChains(timeline), [timeline]);

  const filteredChains = useMemo(() => {
    return chains
      .map((chain) => filterChain(chain, showBuiltins, storeFilter, searchQuery))
      .filter(Boolean) as CommandGroup[];
  }, [chains, showBuiltins, storeFilter, searchQuery]);

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
        trailing={
          <span style={styles.chainCount}>{filteredChains.length} chains</span>
        }
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

      {selectedEvent && (
        <DetailPanel
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}

function ChainNode({
  group,
  depth,
  selectedEvent,
  onSelectEvent,
  showBuiltins,
  pinActions,
}: {
  group: CommandGroup;
  depth: number;
  selectedEvent: TimelineEntry | null;
  onSelectEvent: (e: TimelineEntry) => void;
  showBuiltins: boolean;
  pinActions?: PinActions;
}) {
  const [expanded, setExpanded] = useState(depth < 2);

  const visibleEvents = showBuiltins
    ? group.events
    : group.events.filter((e) => !BUILTIN_EVENTS.has(e.name));

  const isRoot = depth === 0;

  return (
    <div style={isRoot ? styles.chain : styles.chainNested}>
      <div className="commiq-chain-header" style={styles.chainHeader} onClick={() => setExpanded(!expanded)}>
        <span className="commiq-expand" style={styles.chainChevron}>{expanded ? "▼" : "▶"}</span>

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
          {visibleEvents.map((entry, i) => {
            const ec = getEventColor(entry.name, entry.type);
            const isSelected =
              selectedEvent?.correlationId === entry.correlationId;
            const isPinned = pinActions?.pinnedKeys.has(entryKey(entry)) ?? false;

            return (
              <div
                key={`${entry.correlationId}-${i}`}
                className={`commiq-row${isSelected ? " selected" : ""}`}
                style={{
                  ...styles.eventNode,
                  ...(isPinned ? styles.eventNodePinned : {}),
                  ...(isSelected ? styles.eventNodeSelected : {}),
                }}
                onClick={() => onSelectEvent(entry)}
              >
                {pinActions && (
                  <span
                    className="commiq-pin"
                    style={{
                      ...styles.pinButton,
                      ...(isPinned ? styles.pinButtonActive : {}),
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      pinActions.onTogglePin(entryKey(entry));
                    }}
                  >
                    ●
                  </span>
                )}
                <span
                  style={{
                    ...styles.eventDot,
                    backgroundColor: ec.fg,
                  }}
                />
                <span
                  style={{
                    ...styles.eventBadge,
                    backgroundColor: ec.bg,
                    color: ec.fg,
                  }}
                >
                  {entry.name}
                </span>
                <span style={styles.eventStore}>{entry.storeName}</span>
                <span style={styles.eventCorr}>
                  {truncId(entry.correlationId)}
                </span>
                <span style={styles.eventTime}>
                  {formatTime(entry.timestamp)}
                </span>
              </div>
            );
          })}

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

function buildChains(timeline: TimelineEntry[]): CommandGroup[] {
  if (timeline.length === 0) return [];

  const entryMap = new Map<string, TimelineEntry>();
  for (const e of timeline) {
    entryMap.set(e.correlationId, e);
  }

  const groups = new Map<string, TimelineEntry[]>();
  for (const entry of timeline) {
    const key = entry.causedBy ?? "__root_" + entry.correlationId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(entry);
  }

  const commandGroups = new Map<string, CommandGroup>();

  for (const [commandId, events] of groups) {
    const sorted = events.sort((a, b) => a.timestamp - b.timestamp);
    const commandStarted = sorted.find((e) => e.name === "commandStarted");
    const command = commandStarted ? getCommandFromEntry(commandStarted) : undefined;

    const commandName = command?.name ?? sorted[0]?.name ?? "unknown";
    const storeName = sorted[0]?.storeName ?? "unknown";

    commandGroups.set(commandId, {
      commandId,
      commandName,
      storeName,
      events: sorted,
      children: [],
      timestamp: sorted[0]?.timestamp ?? 0,
    });
  }

  const roots: CommandGroup[] = [];

  for (const [, group] of commandGroups) {
    const commandStarted = group.events.find(
      (e) => e.name === "commandStarted",
    );
    const command = commandStarted ? getCommandFromEntry(commandStarted) : undefined;
    const parentEventId = command?.causedBy;

    if (parentEventId && entryMap.has(parentEventId)) {
      const parentEntry = entryMap.get(parentEventId)!;
      const parentGroup = Array.from(commandGroups.values()).find((g) =>
        g.events.some((e) => e.correlationId === parentEntry.correlationId),
      );
      if (parentGroup && parentGroup !== group) {
        parentGroup.children.push(group);
        continue;
      }
    }
    roots.push(group);
  }

  roots.sort((a, b) => b.timestamp - a.timestamp);

  return roots;
}

function filterChain(
  chain: CommandGroup,
  showBuiltins: boolean,
  storeFilter: string | null,
  searchQuery: string,
): CommandGroup | null {
  const filteredChildren = chain.children
    .map((c) => filterChain(c, showBuiltins, storeFilter, searchQuery))
    .filter(Boolean) as CommandGroup[];

  const visibleEvents = chain.events.filter((e) => {
    if (!showBuiltins && BUILTIN_EVENTS.has(e.name)) return false;
    if (storeFilter && e.storeName !== storeFilter) return false;
    if (!matchesSearch(e, searchQuery)) return false;
    return true;
  });

  if (visibleEvents.length === 0 && filteredChildren.length === 0) return null;

  return {
    ...chain,
    events: visibleEvents,
    children: filteredChildren,
  };
}

const styles: Record<string, CSSProperties> = {
  chainCount: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fonts.mono,
    marginLeft: "auto",
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto" as const,
    overflowX: "hidden" as const,
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
    textAlign: "center" as const,
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
    whiteSpace: "nowrap" as const,
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
};
