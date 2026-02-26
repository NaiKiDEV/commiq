import { BuiltinEventName } from "@naikidev/commiq";

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
  textSecondary: "#8b93a8",
  textMuted: "#4d5568",
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

  string: "#a5d6ff",
  number: "#79c0ff",
  boolean: "#d2a8ff",
  null: "#6b7385",
  key: "#c8cede",

  scrollThumb: "#2a3040",
  scrollThumbHover: "#3a4560",
  resizeHandle: "#6366f1",

  badge: "#232940",
  badgeText: "#8b93a8",

  triggerBg: "#6366f1",
  triggerHover: "#4f46e5",
  triggerShadow: "0 4px 20px rgba(99, 102, 241, 0.45)",

  tabActive: "#6366f1",
  tabInactive: "#6b7385",
  tabHover: "#8b93a8",
} as const;

export const fonts = {
  mono: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', Menlo, Monaco, Consolas, monospace",
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
} as const;

export const BUILTIN_EVENTS: Set<string> = new Set(Object.values(BuiltinEventName));

export function getEventColor(name: string, type: "command" | "event") {
  if (name === BuiltinEventName.CommandHandlingError || name === BuiltinEventName.InvalidCommand)
    return { fg: colors.error, bg: colors.errorBg };
  if (name === BuiltinEventName.StateChanged)
    return { fg: colors.stateChange, bg: colors.stateChangeBg };
  if (type === "command") return { fg: colors.command, bg: colors.commandBg };
  return { fg: colors.event, bg: colors.eventBg };
}

export function truncId(id: string | null | undefined): string {
  if (!id) return "—";
  return id.slice(0, 8);
}

export function formatTime(ts: number): string {
  return new Date(ts).toISOString().slice(11, 23);
}
