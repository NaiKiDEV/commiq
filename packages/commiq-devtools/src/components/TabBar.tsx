import { useCallback, useRef, type CSSProperties } from "react";
import { colors, fonts } from "../theme";

export type TabId =
  | "events"
  | "graph"
  | "timeline"
  | "perf"
  | "state"
  | "deps"
  | "dispatch";

export type TabDescriptor = {
  id: TabId;
  label: string;
  icon: string;
}

export const TABS: readonly TabDescriptor[] = [
  { id: "events", label: "Events", icon: "≡" },
  { id: "graph", label: "Graph", icon: "◇" },
  { id: "timeline", label: "Timeline", icon: "◔" },
  { id: "perf", label: "Performance", icon: "⚡" },
  { id: "state", label: "State", icon: "◆" },
  { id: "deps", label: "Deps", icon: "◈" },
  { id: "dispatch", label: "Dispatch", icon: "▷" },
];

export function tabPanelId(tab: TabId): string {
  return `commiq-tabpanel-${tab}`;
}

function tabId(tab: TabId): string {
  return `commiq-tab-${tab}`;
}

const KEY_OFFSETS: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowLeft: -1,
};

type TabBarProps = {
  activeTab: TabId;
  onSelect: (tab: TabId) => void;
}

export function TabBar({ activeTab, onSelect }: TabBarProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const focusTab = useCallback((index: number) => {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("[role='tab']");
    buttons?.[index]?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const current = TABS.findIndex((t) => t.id === activeTab);
      const offset = KEY_OFFSETS[e.key];
      if (offset !== undefined) {
        e.preventDefault();
        const next = (current + offset + TABS.length) % TABS.length;
        onSelect(TABS[next].id);
        focusTab(next);
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        onSelect(TABS[0].id);
        focusTab(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        onSelect(TABS[TABS.length - 1].id);
        focusTab(TABS.length - 1);
      }
    },
    [activeTab, onSelect, focusTab],
  );

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Devtools sections"
      aria-orientation="horizontal"
      style={styles.tabs}
      className="commiq-devtools-tabs"
      onKeyDown={handleKeyDown}
    >
      {TABS.map((tab) => (
        <TabButton
          key={tab.id}
          tab={tab}
          active={tab.id === activeTab}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

type TabButtonProps = {
  tab: TabDescriptor;
  active: boolean;
  onSelect: (tab: TabId) => void;
}

function TabButton({ tab, active, onSelect }: TabButtonProps) {
  const handleClick = useCallback(() => onSelect(tab.id), [onSelect, tab.id]);

  return (
    <button
      type="button"
      role="tab"
      id={tabId(tab.id)}
      aria-selected={active}
      aria-controls={tabPanelId(tab.id)}
      tabIndex={active ? 0 : -1}
      className={`commiq-tab${active ? " active" : ""}`}
      onClick={handleClick}
      style={active ? { ...styles.tab, ...styles.tabActive } : styles.tab}
    >
      <span style={styles.tabIcon} aria-hidden="true">
        {tab.icon}
      </span>
      {tab.label}
    </button>
  );
}

const styles = {
  tabs: {
    display: "flex",
    gap: 2,
    flex: "1 1 0",
    minWidth: 0,
    overflow: "auto",
    scrollbarWidth: "none",
    msOverflowStyle: "none",
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
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
  tabActive: {
    color: colors.textInverse,
    backgroundColor: colors.tabActive,
  },
  tabIcon: {
    fontSize: 10,
  },
} satisfies Record<string, CSSProperties>;
