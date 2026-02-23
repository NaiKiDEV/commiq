import { useState, useEffect, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { SealedStore } from "@naikidev/commiq";
import { colors, fonts } from "./theme";
import { useDevtoolsEngine } from "./useDevtoolsEngine";
import { DevtoolsPanel } from "./DevtoolsPanel";

export interface CommiqDevtoolsProps {
  /** Record of stores to monitor, keyed by display name */
  stores: Record<string, SealedStore<any>>;
  /**
   * Explicitly enable or disable devtools.
   * - `true` — always show (even in production).
   * - `false` — never show.
   * - `undefined` (default) — auto-detect via `process.env.NODE_ENV`.
   */
  enabled?: boolean;
  /**
   * Position of the floating trigger button.
   * @default "bottom-right"
   */
  position?: "bottom-left" | "bottom-right" | "top-left" | "top-right";
  /**
   * Whether the panel starts open.
   * @default false
   */
  initialOpen?: boolean;
  /**
   * Maximum events to keep in timeline.
   * @default 500
   */
  maxEvents?: number;
  /**
   * Panel height in pixels.
   * @default 360
   */
  panelHeight?: number;
  /** Additional styles for the trigger button. */
  buttonStyle?: CSSProperties;
}

/**
 * Floating devtools overlay for Commiq stores.
 *
 * Renders a small trigger button in a corner of the page.
 * Clicking it opens a panel with event log, causality graph, and store state views.
 *
 * In production builds, this component renders nothing.
 *
 * @example
 * ```tsx
 * <CommiqDevtools stores={{ counter: counterStore, todo: todoStore }} />
 * ```
 */
export function CommiqDevtools(props: CommiqDevtoolsProps) {
  const { enabled } = props;

  if (enabled === false) return null;

  if (enabled === true) return <CommiqDevtoolsInner {...props} />;

  try {
    if ((globalThis as any).process?.env?.NODE_ENV === "production") {
      return null;
    }
  } catch {}

  return <CommiqDevtoolsInner {...props} />;
}

function CommiqDevtoolsInner({
  stores,
  position = "bottom-right",
  initialOpen = false,
  maxEvents = 500,
  panelHeight = 360,
  buttonStyle,
}: CommiqDevtoolsProps) {
  const [open, setOpen] = useState(initialOpen);
  const [mounted, setMounted] = useState(false);
  const [hovered, setHovered] = useState(false);
  const portalRef = useRef<HTMLDivElement | null>(null);

  const engine = useDevtoolsEngine(stores, maxEvents);

  useEffect(() => {
    const el = document.createElement("div");
    el.id = "commiq-devtools-root";
    el.style.position = "fixed";
    el.style.zIndex = "99999";
    el.style.top = "0";
    el.style.left = "0";
    el.style.width = "0";
    el.style.height = "0";
    el.style.overflow = "visible";
    el.style.pointerEvents = "none";
    document.body.appendChild(el);
    portalRef.current = el;
    setMounted(true);

    return () => {
      document.body.removeChild(el);
    };
  }, []);

  if (!mounted || !portalRef.current) return null;

  const positionStyles = getPositionStyles(position);

  return createPortal(
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            ...styles.trigger,
            ...positionStyles,
            ...(hovered ? styles.triggerHover : {}),
            ...buttonStyle,
          }}
          title="Open Commiq Devtools"
          aria-label="Open Commiq Devtools"
        >
          <span style={styles.triggerIcon}>⬡</span>
          {engine.eventCount > 0 && (
            <span style={styles.triggerBadge}>
              {engine.eventCount > 99 ? "99+" : engine.eventCount}
            </span>
          )}
        </button>
      )}

      {open && (
        <DevtoolsPanel
          engine={engine}
          stores={stores}
          onClose={() => setOpen(false)}
          initialHeight={panelHeight}
        />
      )}
    </>,
    portalRef.current,
  );
}

function getPositionStyles(
  position: NonNullable<CommiqDevtoolsProps["position"]>,
): CSSProperties {
  const offset = 16;
  switch (position) {
    case "bottom-right":
      return { bottom: offset, right: offset };
    case "bottom-left":
      return { bottom: offset, left: offset };
    case "top-right":
      return { top: offset, right: offset };
    case "top-left":
      return { top: offset, left: offset };
  }
}

const styles: Record<string, CSSProperties> = {
  trigger: {
    position: "fixed",
    zIndex: 99999,
    width: 44,
    height: 44,
    borderRadius: "50%",
    border: "none",
    backgroundColor: colors.triggerBg,
    color: colors.textInverse,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: colors.triggerShadow,
    transition: "all 0.2s ease",
    pointerEvents: "auto" as const,
    padding: 0,
    outline: "none",
  },
  triggerHover: {
    backgroundColor: colors.triggerHover,
    transform: "scale(1.08)",
    boxShadow: "0 6px 24px rgba(99, 102, 241, 0.55)",
  },
  triggerIcon: {
    fontSize: 20,
    lineHeight: 1,
    fontFamily: fonts.sans,
  },
  triggerBadge: {
    position: "absolute" as const,
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9999,
    backgroundColor: colors.error,
    color: colors.textInverse,
    fontSize: 9,
    fontWeight: 700,
    fontFamily: fonts.mono,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 4px",
    lineHeight: 1,
    boxShadow: "0 2px 6px rgba(248, 113, 113, 0.4)",
  },
};
