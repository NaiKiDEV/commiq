import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createCommand } from "@naikidev/commiq";
import type { TimelineEntry } from "@naikidev/commiq-devtools-core";
import { colors, fonts, formatTime, sharedStyles } from "../theme";
import { safeStringify, safeStringifyPretty } from "../safe-stringify";
import { getCommandFromEntry, type DevtoolsStoreRegistry } from "../types";

type DispatchTabProps = {
  timeline: readonly TimelineEntry[];
  stores: DevtoolsStoreRegistry;
  storeNames: string[];
}

const DISPATCH_FLASH_MS = 1500;

type KnownCommand = {
  name: string;
  storeName: string;
  count: number;
  lastData: unknown;
  lastTimestamp: number;
}

export function DispatchTab({ timeline, stores, storeNames }: DispatchTabProps) {
  const [storeFilter, setStoreFilter] = useState<string | null>(
    storeNames.length === 1 ? storeNames[0] : null,
  );
  const [selectedCommand, setSelectedCommand] = useState<KnownCommand | null>(null);
  const [customName, setCustomName] = useState("");
  const [dataText, setDataText] = useState("");
  const [dataError, setDataError] = useState<string | null>(null);
  const [dispatched, setDispatched] = useState<string | null>(null);
  const dispatchedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (dispatchedTimerRef.current !== null) clearTimeout(dispatchedTimerRef.current);
    };
  }, []);

  const knownCommands = useMemo(() => {
    const map = new Map<string, KnownCommand>();

    for (const entry of timeline) {
      const command = getCommandFromEntry(entry);
      if (!command) continue;

      const key = `${entry.storeName}::${command.name}`;
      const existing = map.get(key);
      if (existing) {
        existing.count++;
        if (entry.timestamp > existing.lastTimestamp) {
          existing.lastData = command.data;
          existing.lastTimestamp = entry.timestamp;
        }
      } else {
        map.set(key, {
          name: command.name,
          storeName: entry.storeName,
          count: 1,
          lastData: command.data,
          lastTimestamp: entry.timestamp,
        });
      }
    }

    const result = [...map.values()];
    result.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
    return result;
  }, [timeline]);

  const filteredCommands = storeFilter
    ? knownCommands.filter((c) => c.storeName === storeFilter)
    : knownCommands;

  const handleSelectCommand = useCallback((cmd: KnownCommand) => {
    setSelectedCommand(cmd);
    setCustomName(cmd.name);
    setDataText(formatData(cmd.lastData));
    setDataError(null);
    setStoreFilter(cmd.storeName);
  }, []);

  function handleDispatch() {
    const targetStore = storeFilter;
    const name = selectedCommand?.name ?? customName.trim();
    if (!targetStore || !name || !stores[targetStore]) return;

    let data: unknown = undefined;
    if (dataText.trim()) {
      try {
        data = JSON.parse(dataText);
        setDataError(null);
      } catch (e) {
        setDataError(e instanceof Error ? e.message : "Invalid JSON");
        return;
      }
    }

    const command = createCommand(name, data);
    stores[targetStore].queue(command);

    setDispatched(name);
    if (dispatchedTimerRef.current !== null) clearTimeout(dispatchedTimerRef.current);
    dispatchedTimerRef.current = setTimeout(() => {
      dispatchedTimerRef.current = null;
      setDispatched(null);
    }, DISPATCH_FLASH_MS);
  }

  function handleStoreChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setStoreFilter(e.target.value === "__all__" ? null : e.target.value);
  }

  function handleCustomNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    setCustomName(e.target.value);
    setSelectedCommand(null);
  }

  function handleDataChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDataText(e.target.value);
    setDataError(null);
  }

  const canDispatch = storeFilter
    && stores[storeFilter]
    && (selectedCommand?.name ?? customName.trim());

  return (
    <div style={sharedStyles.container}>
      <div style={styles.toolbar}>
        <select
          className="commiq-select"
          value={storeFilter ?? "__all__"}
          onChange={handleStoreChange}
          style={styles.select}
        >
          <option value="__all__">Select store</option>
          {storeNames.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      <div style={styles.body}>
        <div style={styles.commandList}>
          <div style={styles.sectionLabel}>Recent commands</div>

          {filteredCommands.length === 0 && (
            <div style={styles.emptyHint}>
              {timeline.length === 0
                ? "No commands recorded yet. Interact with your stores first."
                : storeFilter
                  ? "No commands recorded for this store."
                  : "Select a store to see its commands."}
            </div>
          )}

          <div style={styles.scrollArea}>
            {filteredCommands.map((cmd) => (
              <CommandCard
                key={`${cmd.storeName}::${cmd.name}`}
                command={cmd}
                selected={
                  selectedCommand?.name === cmd.name &&
                  selectedCommand?.storeName === cmd.storeName
                }
                onSelect={handleSelectCommand}
              />
            ))}
          </div>
        </div>

        <div style={styles.editor}>
          <div style={styles.sectionLabel}>Dispatch</div>

          {!storeFilter && (
            <div style={styles.emptyHint}>Select a store first.</div>
          )}

          {storeFilter && (
            <>
              <div style={styles.field}>
                <label style={styles.fieldLabel}>Command</label>
                <input
                  className="commiq-input"
                  type="text"
                  value={selectedCommand?.name ?? customName}
                  onChange={handleCustomNameChange}
                  placeholder="Command name"
                  style={styles.input}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.fieldLabel}>Data</label>
                <textarea
                  className="commiq-input"
                  value={dataText}
                  onChange={handleDataChange}
                  placeholder='{ "key": "value" }'
                  style={{
                    ...styles.textarea,
                    ...(dataError ? styles.textareaError : {}),
                  }}
                  spellCheck={false}
                />
                {dataError && (
                  <span style={styles.errorText}>{dataError}</span>
                )}
              </div>

              <button
                className="commiq-dispatch-btn"
                onClick={handleDispatch}
                disabled={!canDispatch}
                style={{
                  ...styles.dispatchButton,
                  ...(!canDispatch ? styles.dispatchButtonDisabled : {}),
                  ...(dispatched ? styles.dispatchButtonSuccess : {}),
                }}
              >
                {dispatched ? `Dispatched ${dispatched}` : "Dispatch"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

type CommandCardProps = {
  command: KnownCommand;
  selected: boolean;
  onSelect: (command: KnownCommand) => void;
}

function CommandCard({ command, selected, onSelect }: CommandCardProps) {
  const handleClick = useCallback(() => onSelect(command), [onSelect, command]);

  return (
    <div
      className="commiq-cmd-card"
      style={selected ? { ...styles.commandCard, ...styles.commandCardSelected } : styles.commandCard}
      onClick={handleClick}
    >
      <div style={styles.commandHeader}>
        <span style={styles.commandName}>{command.name}</span>
        <span style={styles.commandMeta}>
          ×{command.count} · {formatTime(command.lastTimestamp)}
        </span>
      </div>
      <div style={styles.commandPreview}>{formatPreview(command.lastData)}</div>
    </div>
  );
}

function formatData(data: unknown): string {
  if (data === undefined || data === null) return "";
  return safeStringifyPretty(data);
}

function formatPreview(data: unknown): string {
  if (data === undefined || data === null) return "no data";
  const str = safeStringify(data);
  if (str.length > PREVIEW_LIMIT) return str.slice(0, PREVIEW_LIMIT - 3) + "…";
  return str;
}

const PREVIEW_LIMIT = 80;

const styles = {
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 12px",
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.bgToolbar,
    flexShrink: 0,
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
  body: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  },
  commandList: {
    flex: "1 1 50%",
    display: "flex",
    flexDirection: "column",
    borderRight: `1px solid ${colors.border}`,
    overflow: "hidden",
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "0 8px 8px",
  },
  sectionLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
    padding: "8px 10px 4px",
    flexShrink: 0,
  },
  emptyHint: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    padding: "12px 10px",
  },
  commandCard: {
    padding: "6px 10px",
    borderRadius: 5,
    cursor: "pointer",
    transition: "background-color 0.1s",
    marginBottom: 2,
  },
  commandCardSelected: {
    backgroundColor: colors.bgSelected,
  },
  commandHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  commandName: {
    fontSize: 11,
    fontWeight: 600,
    fontFamily: fonts.mono,
    color: colors.command,
  },
  commandMeta: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: fonts.mono,
    flexShrink: 0,
  },
  commandPreview: {
    fontSize: 10,
    color: colors.textSecondary,
    fontFamily: fonts.mono,
    marginTop: 2,
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const,
  },
  editor: {
    flex: "1 1 50%",
    display: "flex",
    flexDirection: "column",
    overflow: "auto" as const,
  },
  field: {
    padding: "0 10px",
    marginBottom: 8,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  fieldLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontWeight: 500,
  },
  input: {
    fontSize: 11,
    fontFamily: fonts.mono,
    backgroundColor: colors.bgInput,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: 4,
    padding: "5px 8px",
    outline: "none",
  },
  textarea: {
    fontSize: 11,
    fontFamily: fonts.mono,
    backgroundColor: colors.bgInput,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: 4,
    padding: "6px 8px",
    outline: "none",
    resize: "vertical" as const,
    minHeight: 80,
    lineHeight: 1.5,
  },
  textareaError: {
    borderColor: colors.error,
  },
  errorText: {
    fontSize: 10,
    color: colors.error,
    fontFamily: fonts.mono,
  },
  dispatchButton: {
    margin: "4px 10px 10px",
    padding: "6px 14px",
    fontSize: 11,
    fontWeight: 600,
    fontFamily: fonts.sans,
    backgroundColor: colors.accent,
    color: colors.textInverse,
    borderWidth: 0,
    borderRadius: 5,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  dispatchButtonDisabled: {
    opacity: 0.4,
    cursor: "default",
  },
  dispatchButtonSuccess: {
    backgroundColor: "#15803d",
  },
} satisfies Record<string, CSSProperties>;
