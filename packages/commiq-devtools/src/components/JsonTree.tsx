import { useCallback, useState, type CSSProperties } from "react";
import { colors, fonts } from "../theme";

type JsonTreeProps = {
  data: unknown;
  depth?: number;
  initialExpanded?: boolean;
}

export function JsonTree({
  data,
  depth = 0,
  initialExpanded = true,
}: JsonTreeProps) {
  if (data === null) return <span style={styles.null}>null</span>;
  if (data === undefined) return <span style={styles.null}>undefined</span>;

  if (typeof data === "string") {
    return <span style={styles.string}>"{data}"</span>;
  }
  if (typeof data === "number") {
    return <span style={styles.number}>{String(data)}</span>;
  }
  if (typeof data === "boolean") {
    return <span style={styles.boolean}>{String(data)}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span style={styles.bracket}>[]</span>;
    return (
      <CollapsibleNode
        label={`Array(${data.length})`}
        bracketOpen="["
        bracketClose="]"
        depth={depth}
        initialExpanded={initialExpanded && depth < 2}
      >
        {data.map((item, i) => (
          <div key={i} style={styles.row}>
            <span style={styles.index}>{i}: </span>
            <JsonTree data={item} depth={depth + 1} initialExpanded={false} />
          </div>
        ))}
      </CollapsibleNode>
    );
  }

  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return <span style={styles.bracket}>{"{}"}</span>;
    return (
      <CollapsibleNode
        label={`{${entries.length}}`}
        bracketOpen="{"
        bracketClose="}"
        depth={depth}
        initialExpanded={initialExpanded && depth < 2}
      >
        {entries.map(([key, value]) => (
          <div key={key} style={styles.row}>
            <span style={styles.key}>{key}: </span>
            <JsonTree data={value} depth={depth + 1} initialExpanded={false} />
          </div>
        ))}
      </CollapsibleNode>
    );
  }

  return <span style={styles.text}>{String(data)}</span>;
}

function CollapsibleNode({
  label,
  bracketOpen,
  bracketClose,
  children,
  depth,
  initialExpanded,
}: {
  label: string;
  bracketOpen: string;
  bracketClose: string;
  children: React.ReactNode;
  depth: number;
  initialExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(initialExpanded);

  const handleToggle = useCallback(() => setExpanded((prev) => !prev), []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    setExpanded((prev) => !prev);
  }, []);

  return (
    <span>
      <span
        className="commiq-json-toggle"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        style={styles.toggle}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={label}
      >
        <span className="commiq-expand" style={styles.chevron}>{expanded ? "▼" : "▶"}</span>
        {!expanded && (
          <span style={styles.bracket}>
            {bracketOpen}
            <span style={styles.collapsed}>{label}</span>
            {bracketClose}
          </span>
        )}
        {expanded && <span style={styles.bracket}>{bracketOpen}</span>}
      </span>
      {expanded && (
        <>
          <div style={{ paddingLeft: 16 }}>{children}</div>
          <span style={styles.bracket}>{bracketClose}</span>
        </>
      )}
    </span>
  );
}

const styles = {
  null: {
    color: colors.null,
    fontStyle: "italic",
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 1,
  },
  string: {
    color: colors.string,
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 1,
  },
  number: {
    color: colors.number,
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 1,
  },
  boolean: {
    color: colors.boolean,
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 1,
  },
  bracket: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 1,
  },
  key: {
    color: colors.key,
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 1,
  },
  index: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 1,
  },
  text: {
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 1,
  },
  row: {
    lineHeight: 1,
  },
  toggle: {
    cursor: "pointer",
    userSelect: "none" as const,
    display: "inline",
    lineHeight: 1,
  },
  chevron: {
    fontSize: 8,
    marginRight: 4,
    color: colors.textMuted,
    display: "inline-block",
    width: 10,
    fontFamily: fonts.mono,
    verticalAlign: "middle",
  },
  collapsed: {
    color: colors.textMuted,
    fontStyle: "italic",
    marginLeft: 2,
    marginRight: 2,
  },
} satisfies Record<string, CSSProperties>;
