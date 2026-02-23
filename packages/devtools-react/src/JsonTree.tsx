import { useState, type CSSProperties } from "react";
import { colors, fonts } from "./theme";

interface JsonTreeProps {
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

  return (
    <span>
      <span
        onClick={() => setExpanded(!expanded)}
        style={styles.toggle}
        role="button"
        tabIndex={0}
      >
        <span style={styles.chevron}>{expanded ? "▼" : "▶"}</span>
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

const styles: Record<string, CSSProperties> = {
  null: {
    color: colors.null,
    fontStyle: "italic",
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  string: {
    color: colors.string,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  number: {
    color: colors.number,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  boolean: {
    color: colors.boolean,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  bracket: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  key: {
    color: colors.key,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  index: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  text: {
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  row: {
    lineHeight: "20px",
  },
  toggle: {
    cursor: "pointer",
    userSelect: "none" as const,
    display: "inline",
  },
  chevron: {
    fontSize: 8,
    marginRight: 4,
    color: colors.textMuted,
    display: "inline-block",
    width: 10,
    fontFamily: fonts.mono,
  },
  collapsed: {
    color: colors.textMuted,
    fontStyle: "italic",
    marginLeft: 2,
    marginRight: 2,
  },
};
