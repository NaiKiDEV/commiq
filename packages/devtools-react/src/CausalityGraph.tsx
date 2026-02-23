import {
  useState,
  useMemo,
  useRef,
  useCallback,
  useEffect,
  type CSSProperties,
} from "react";
import type { TimelineEntry } from "@naikidev/commiq-devtools";
import {
  colors,
  fonts,
  BUILTIN_EVENTS,
  getEventColor,
  truncId,
  formatTime,
} from "./theme";
import { JsonTree } from "./JsonTree";
import { StateDiff } from "./StateDiff";

interface CausalityGraphProps {
  timeline: TimelineEntry[];
  storeNames: string[];
}

/** A group of events spawned by a single command dispatch */
interface CommandGroup {
  commandId: string;
  commandName: string;
  storeName: string;
  events: TimelineEntry[];
  children: CommandGroup[];
  timestamp: number;
}

export function CausalityGraph({ timeline, storeNames }: CausalityGraphProps) {
  const [showBuiltins, setShowBuiltins] = useState(true);
  const [storeFilter, setStoreFilter] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEntry | null>(
    null,
  );
  const [detailHeight, setDetailHeight] = useState(180);
  const [isDetailDragging, setIsDetailDragging] = useState(false);
  const detailDragging = useRef(false);
  const detailStartY = useRef(0);
  const detailStartH = useRef(0);

  const onDetailMouseDown = useCallback(
    (e: React.MouseEvent) => {
      detailDragging.current = true;
      setIsDetailDragging(true);
      detailStartY.current = e.clientY;
      detailStartH.current = detailHeight;
      e.preventDefault();
    },
    [detailHeight],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!detailDragging.current) return;
      const delta = detailStartY.current - e.clientY;
      setDetailHeight(
        Math.max(80, Math.min(500, detailStartH.current + delta)),
      );
    };
    const onUp = () => {
      detailDragging.current = false;
      setIsDetailDragging(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const chains = useMemo(() => buildChains(timeline), [timeline]);

  const filteredChains = useMemo(() => {
    return chains
      .map((chain) => filterChain(chain, showBuiltins, storeFilter))
      .filter(Boolean) as CommandGroup[];
  }, [chains, showBuiltins, storeFilter]);

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <label style={styles.checkLabel}>
          <input
            type="checkbox"
            checked={showBuiltins}
            onChange={(e) => setShowBuiltins(e.target.checked)}
            style={styles.checkbox}
          />
          Show builtins
        </label>

        <select
          value={storeFilter ?? "__all__"}
          onChange={(e) =>
            setStoreFilter(e.target.value === "__all__" ? null : e.target.value)
          }
          style={styles.select}
        >
          <option value="__all__">All stores</option>
          {storeNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <span style={styles.chainCount}>{filteredChains.length} chains</span>
      </div>

      <div style={styles.scrollArea}>
        {filteredChains.length === 0 && (
          <div style={styles.empty}>
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
          />
        ))}
      </div>

      {selectedEvent && (
        <div style={{ ...styles.detailPanel, height: detailHeight }}>
          <div
            style={styles.detailResize}
            className={`commiq-resize-handle${isDetailDragging ? " dragging" : ""}`}
            onMouseDown={onDetailMouseDown}
          >
            <div
              style={styles.detailResizeGrip}
              className="commiq-resize-grip"
            />
          </div>
          <div style={styles.detailHeader}>
            <span style={styles.detailTitle}>{selectedEvent.name}</span>
            <button
              onClick={() => setSelectedEvent(null)}
              style={styles.detailClose}
            >
              ✕
            </button>
          </div>
          <div style={styles.detailBody}>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Store</span>
              <span style={styles.detailValue}>{selectedEvent.storeName}</span>
            </div>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Correlation</span>
              <span style={{ ...styles.detailValue, fontFamily: fonts.mono }}>
                {selectedEvent.correlationId}
              </span>
            </div>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Caused By</span>
              <span style={{ ...styles.detailValue, fontFamily: fonts.mono }}>
                {selectedEvent.causedBy ?? "—"}
              </span>
            </div>
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Time</span>
              <span style={styles.detailValue}>
                {new Date(selectedEvent.timestamp).toISOString()}
              </span>
            </div>
            {selectedEvent.data !== undefined && (
              <div style={{ marginTop: 8 }}>
                <div style={styles.detailSectionLabel}>Data</div>
                <div style={styles.detailContent}>
                  <JsonTree data={selectedEvent.data} initialExpanded />
                </div>
              </div>
            )}
            {selectedEvent.stateBefore !== undefined &&
              selectedEvent.stateAfter !== undefined && (
                <div style={{ marginTop: 8 }}>
                  <div style={styles.detailSectionLabel}>State Diff</div>
                  <div style={styles.detailContent}>
                    <StateDiff
                      before={selectedEvent.stateBefore}
                      after={selectedEvent.stateAfter}
                    />
                  </div>
                </div>
              )}
          </div>
        </div>
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
}: {
  group: CommandGroup;
  depth: number;
  selectedEvent: TimelineEntry | null;
  onSelectEvent: (e: TimelineEntry) => void;
  showBuiltins: boolean;
}) {
  const [expanded, setExpanded] = useState(depth < 2);

  const visibleEvents = showBuiltins
    ? group.events
    : group.events.filter((e) => !BUILTIN_EVENTS.has(e.name));

  const isRoot = depth === 0;

  return (
    <div
      style={{
        ...(isRoot ? styles.chain : styles.chainNested),
      }}
    >
      <div style={styles.chainHeader} onClick={() => setExpanded(!expanded)}>
        <span style={styles.chainChevron}>{expanded ? "▼" : "▶"}</span>

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

            return (
              <div
                key={`${entry.correlationId}-${i}`}
                style={{
                  ...styles.eventNode,
                  ...(isSelected ? styles.eventNodeSelected : {}),
                }}
                onClick={() => onSelectEvent(entry)}
              >
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

    const commandName = commandStarted
      ? ((commandStarted.data as any)?.command?.name ?? "unknown")
      : (sorted[0]?.name ?? "unknown");

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
    const cmd = commandStarted ? (commandStarted.data as any)?.command : null;
    const parentEventId = cmd?.causedBy;

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
): CommandGroup | null {
  const filteredChildren = chain.children
    .map((c) => filterChain(c, showBuiltins, storeFilter))
    .filter(Boolean) as CommandGroup[];

  const visibleEvents = chain.events.filter((e) => {
    if (!showBuiltins && BUILTIN_EVENTS.has(e.name)) return false;
    if (storeFilter && e.storeName !== storeFilter) return false;
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
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 12px",
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.bgToolbar,
    flexShrink: 0,
  },
  checkLabel: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    color: colors.textSecondary,
    cursor: "pointer",
    fontFamily: fonts.sans,
    userSelect: "none" as const,
    whiteSpace: "nowrap" as const,
  },
  checkbox: {
    accentColor: colors.accent,
    cursor: "pointer",
    margin: 0,
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
    cursor: "pointer",
    borderRadius: 3,
    fontSize: 11,
    fontFamily: fonts.sans,
    transition: "background-color 0.1s",
  },
  eventNodeSelected: {
    backgroundColor: colors.bgSelected,
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
  detailPanel: {
    flexShrink: 0,
    borderTop: `1px solid ${colors.border}`,
    backgroundColor: colors.bgActive,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    position: "relative" as const,
  },
  detailResize: {
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
  detailResizeGrip: {
    width: 36,
    height: 3,
    borderRadius: 2,
  },
  detailHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 12px",
    borderBottom: `1px solid ${colors.border}`,
  },
  detailTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: colors.text,
    fontFamily: fonts.sans,
  },
  detailClose: {
    backgroundColor: "transparent",
    borderWidth: 0,
    color: colors.textMuted,
    cursor: "pointer",
    fontSize: 12,
    padding: "2px 6px",
    borderRadius: 4,
  },
  detailBody: {
    padding: "8px 12px",
    overflow: "auto" as const,
    flex: 1,
  },
  detailRow: {
    display: "flex",
    gap: 12,
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontWeight: 500,
    width: 90,
    flexShrink: 0,
  },
  detailValue: {
    fontSize: 11,
    color: colors.text,
    fontFamily: fonts.sans,
    wordBreak: "break-all" as const,
  },
  detailSectionLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  detailContent: {
    padding: "6px 10px",
    backgroundColor: colors.bg,
    borderRadius: 6,
    border: `1px solid ${colors.border}`,
    overflow: "auto",
  },
};
