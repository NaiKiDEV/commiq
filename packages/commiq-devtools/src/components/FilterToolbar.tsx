import type { CSSProperties, ReactNode } from "react";
import { colors, fonts } from "../theme";

type FilterToolbarProps = {
  showBuiltins: boolean;
  onShowBuiltinsChange: (value: boolean) => void;
  storeFilter: string | null;
  onStoreFilterChange: (value: string | null) => void;
  storeNames: string[];
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  extraLeft?: ReactNode;
  trailing?: ReactNode;
}

export function FilterToolbar({
  showBuiltins,
  onShowBuiltinsChange,
  storeFilter,
  onStoreFilterChange,
  storeNames,
  searchQuery,
  onSearchChange,
  extraLeft,
  trailing,
}: FilterToolbarProps) {
  function handleStoreChange(e: React.ChangeEvent<HTMLSelectElement>) {
    onStoreFilterChange(e.target.value === "__all__" ? null : e.target.value);
  }

  function handleBuiltinsChange(e: React.ChangeEvent<HTMLInputElement>) {
    onShowBuiltinsChange(e.target.checked);
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    onSearchChange?.(e.target.value);
  }

  return (
    <div style={styles.toolbar}>
      <div style={styles.toolbarLeft}>
        <label className="commiq-check" style={styles.checkLabel}>
          <input
            type="checkbox"
            checked={showBuiltins}
            onChange={handleBuiltinsChange}
            style={styles.checkbox}
          />
          Show builtins
        </label>

        <select
          className="commiq-select"
          value={storeFilter ?? "__all__"}
          onChange={handleStoreChange}
          style={styles.select}
        >
          <option value="__all__">All stores</option>
          {storeNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        {onSearchChange && (
          <input
            className="commiq-input"
            type="text"
            value={searchQuery ?? ""}
            onChange={handleSearchChange}
            placeholder="Search events…"
            style={styles.searchInput}
          />
        )}

        {extraLeft}
      </div>

      {trailing}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.bgToolbar,
    flexShrink: 0,
    gap: 8,
  },
  toolbarLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
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
  searchInput: {
    fontSize: 11,
    backgroundColor: colors.bgInput,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: 4,
    padding: "3px 8px",
    fontFamily: fonts.sans,
    outline: "none",
    width: 160,
  },
};
