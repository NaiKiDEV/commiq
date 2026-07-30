import type { CSSProperties } from "react";
import { BuiltinEventName } from "@naikidev/commiq";
import { safeStringify } from "./safe-stringify";

export const colors = {
  bg: "#0d1117",
  bgPanel: "#151921",
  bgHeader: "#1c2130",
  bgToolbar: "#161b24",
  bgHover: "#1c2233",
  bgActive: "#232940",
  bgSelected: "#1e2550",
  bgInput: "#0d1117",

  border: "#2a3040",
  borderLight: "#1f2737",
  borderSelected: "#4f56b0",

  text: "#d4d8e8",
  textSecondary: "#9ba3b8",
  textMuted: "#8b94a8",
  textInverse: "#ffffff",

  accent: "#6366f1",
  accentHover: "#4f46e5",
  accentLight: "#818cf8",
  accentBg: "rgba(99, 102, 241, 0.12)",

  command: "#818cf8",
  commandBg: "rgba(129, 140, 248, 0.12)",
  event: "#34d399",
  eventBg: "rgba(52, 211, 153, 0.12)",
  stateChange: "#fbbf24",
  stateChangeBg: "rgba(251, 191, 36, 0.10)",
  error: "#f87171",
  errorBg: "rgba(248, 113, 113, 0.10)",
  interrupted: "#fb923c",
  interruptedBg: "rgba(251, 146, 60, 0.10)",

  string: "#a5d6ff",
  number: "#79c0ff",
  boolean: "#d2a8ff",
  null: "#7d879b",
  key: "#c8cede",

  scrollThumb: "#3a4560",
  scrollThumbHover: "#4d5a78",
  resizeHandle: "#6366f1",

  badge: "#282f45",
  badgeText: "#9ba3b8",

  triggerBg: "#6366f1",
  triggerHover: "#4f46e5",
  triggerShadow: "0 4px 20px rgba(99, 102, 241, 0.45)",

  tabActive: "#4f46e5",
  tabInactive: "#8b94a8",
  tabHover: "#c8cede",
} as const;

export const fonts = {
  mono: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', Menlo, Monaco, Consolas, monospace",
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
} as const;

export type EventColor = { fg: string; bg: string }

const ERROR_COLOR: EventColor = { fg: colors.error, bg: colors.errorBg };

const EVENT_COLORS: Readonly<Record<string, EventColor>> = {
  [BuiltinEventName.CommandHandlingError]: ERROR_COLOR,
  [BuiltinEventName.InvalidCommand]: ERROR_COLOR,
  [BuiltinEventName.EventHandlingError]: ERROR_COLOR,
  [BuiltinEventName.UnhandledError]: ERROR_COLOR,
  [BuiltinEventName.CommandInterrupted]: {
    fg: colors.interrupted,
    bg: colors.interruptedBg,
  },
  [BuiltinEventName.StateChanged]: {
    fg: colors.stateChange,
    bg: colors.stateChangeBg,
  },
};

const COMMAND_COLOR: EventColor = { fg: colors.command, bg: colors.commandBg };
const DEFAULT_EVENT_COLOR: EventColor = { fg: colors.event, bg: colors.eventBg };

export function getEventColor(name: string, type: "command" | "event"): EventColor {
  const known = EVENT_COLORS[name];
  if (known) return known;
  return type === "command" ? COMMAND_COLOR : DEFAULT_EVENT_COLOR;
}

export function truncId(id: string | null | undefined): string {
  if (!id) return "—";
  return id.slice(0, 8);
}

export function formatTime(ts: number): string {
  return new Date(ts).toISOString().slice(11, 23);
}

export function matchesSearch(
  entry: { name: string; storeName: string; correlationId: string; causedBy?: string | null; data?: unknown },
  query: string,
): boolean {
  if (!query) return true;
  const lower = query.toLowerCase();
  if (entry.name.toLowerCase().includes(lower)) return true;
  if (entry.storeName.toLowerCase().includes(lower)) return true;
  if (entry.correlationId.toLowerCase().includes(lower)) return true;
  if (entry.causedBy?.toLowerCase().includes(lower)) return true;
  if (entry.data !== undefined && safeStringify(entry.data).toLowerCase().includes(lower)) return true;
  return false;
}

export const sharedStyles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto" as const,
    overflowX: "hidden" as const,
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
} satisfies Record<string, CSSProperties>;
