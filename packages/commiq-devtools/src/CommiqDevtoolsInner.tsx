import { useState, useEffect, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { colors, fonts } from "./theme";
import { useDevtoolsEngine } from "./hooks/useDevtoolsEngine";
import { DevtoolsPanel } from "./DevtoolsPanel";
import type { CommiqDevtoolsProps } from "./CommiqDevtools";

type Toast = {
  id: number;
  name: string;
  storeName: string;
}

const MAX_TOASTS = 3;
const TOAST_DURATION = 4000;

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
  const [errorFilter, setErrorFilter] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const lastErrorCountRef = useRef(0);

  const engine = useDevtoolsEngine(stores, maxEvents);

  useEffect(() => {
    lastErrorCountRef.current = 0;
    setToasts([]);
    setErrorFilter(false);
  }, [engine.clearCount]);

  useEffect(() => {
    const newErrors = engine.errors.filter((e) => e.id >= lastErrorCountRef.current);
    if (newErrors.length === 0) return;
    lastErrorCountRef.current = engine.errors.length > 0
      ? engine.errors[engine.errors.length - 1].id + 1
      : 0;

    const newToasts = newErrors.map((err) => ({
      id: err.id,
      name: err.entry.name,
      storeName: err.entry.storeName,
    }));

    setToasts((prev) => [...prev, ...newToasts].slice(-MAX_TOASTS));

    const timers = newToasts.map((t) =>
      setTimeout(() => {
        setToasts((prev) => prev.filter((p) => p.id !== t.id));
      }, TOAST_DURATION),
    );

    return () => timers.forEach(clearTimeout);
  }, [engine.errors]);

  function handleClose() {
    setOpen(false);
    setErrorFilter(false);
  }

  function handleToastClick() {
    setToasts([]);
    setErrorFilter(true);
    setOpen(true);
  }

  function handleDismissToast(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

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

  const toastPosition = position.startsWith("bottom") ? "bottom" : "top";
  const toastAlign = position.endsWith("right") ? "right" : "left";

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
          {engine.errorCount > 0 && (
            <span style={styles.triggerErrorBadge}>
              {engine.errorCount > 99 ? "99+" : engine.errorCount}
            </span>
          )}
        </button>
      )}

      {open && (
        <DevtoolsPanel
          engine={engine}
          stores={stores}
          onClose={handleClose}
          initialHeight={panelHeight}
          initialErrorFilter={errorFilter}
        />
      )}

      {toasts.length > 0 && (
        <div
          style={{
            ...styles.toastContainer,
            [toastPosition]: open ? panelHeight + 12 : 76,
            [toastAlign]: 16,
          }}
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="commiq-toast"
              style={styles.toast}
              onClick={handleToastClick}
            >
              <span style={styles.toastIcon}>●</span>
              <span style={styles.toastText}>
                <strong>{toast.name}</strong> in {toast.storeName}
              </span>
              <span
                className="commiq-toast-close"
                style={styles.toastClose}
                onClick={(e) => handleDismissToast(toast.id, e)}
              >
                ✕
              </span>
            </div>
          ))}
        </div>
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
    borderWidth: 0,
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
    backgroundColor: colors.accent,
    color: colors.textInverse,
    fontSize: 9,
    fontWeight: 700,
    fontFamily: fonts.mono,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 4px",
    lineHeight: 1,
    boxShadow: "0 2px 6px rgba(99, 102, 241, 0.4)",
  },
  triggerErrorBadge: {
    position: "absolute" as const,
    top: -4,
    left: -4,
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
  toastContainer: {
    position: "fixed" as const,
    zIndex: 100000,
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
    pointerEvents: "auto" as const,
  },
  toast: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    backgroundColor: colors.bgHeader,
    border: `1px solid ${colors.error}`,
    borderRadius: 8,
    boxShadow: "0 4px 20px rgba(248, 113, 113, 0.25)",
    cursor: "pointer",
    minWidth: 220,
    maxWidth: 360,
    animation: "commiq-toast-in 0.2s ease-out",
  },
  toastIcon: {
    color: colors.error,
    fontSize: 10,
    flexShrink: 0,
  },
  toastText: {
    fontSize: 11,
    fontFamily: fonts.sans,
    color: colors.text,
    flex: 1,
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const,
  },
  toastClose: {
    fontSize: 10,
    color: colors.textMuted,
    flexShrink: 0,
    padding: "0 2px",
  },
};

export default CommiqDevtoolsInner;
