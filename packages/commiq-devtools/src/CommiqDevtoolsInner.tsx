import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { colors, fonts } from "./theme";
import { TOAST_CSS } from "./panel-css";
import { useDevtoolsEngine, type ErrorEntry } from "./hooks/useDevtoolsEngine";
import { DevtoolsPanel } from "./DevtoolsPanel";
import type { TabId } from "./components/TabBar";
import type { CommiqDevtoolsProps } from "./CommiqDevtools";

const MAX_TOASTS = 3;
const TOAST_DURATION = 4000;
const TRIGGER_OFFSET = 76;
const PANEL_TOAST_GAP = 12;

type Toast = {
  id: number;
  name: string;
  storeName: string;
}

function toToast(error: ErrorEntry): Toast {
  return { id: error.id, name: error.name, storeName: error.storeName };
}

export function CommiqDevtoolsInner({
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
  const [activeTab, setActiveTab] = useState<TabId>("events");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [liveHeight, setLiveHeight] = useState(panelHeight);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const nextToastIdRef = useRef(0);
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const engine = useDevtoolsEngine(stores, maxEvents);

  const dismissToast = useCallback((id: number) => {
    const timers = timersRef.current;
    const timer = timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    for (const timer of timersRef.current.values()) {
      clearTimeout(timer);
    }
    timersRef.current.clear();
    setToasts([]);
  }, []);

  useEffect(() => clearAllToasts, [clearAllToasts]);

  useEffect(() => {
    nextToastIdRef.current = 0;
    clearAllToasts();
    setErrorFilter(false);
  }, [engine.clearCount, clearAllToasts]);

  useEffect(() => {
    const fresh = engine.errors.filter((e) => e.id >= nextToastIdRef.current);
    if (fresh.length === 0) return;
    nextToastIdRef.current = fresh[fresh.length - 1].id + 1;

    const added = fresh.map(toToast);
    const timers = timersRef.current;

    setToasts((prev) => {
      const next = [...prev, ...added];
      const kept = next.slice(-MAX_TOASTS);
      for (const dropped of next.slice(0, next.length - kept.length)) {
        const timer = timers.get(dropped.id);
        if (timer !== undefined) {
          clearTimeout(timer);
          timers.delete(dropped.id);
        }
      }
      return kept;
    });

    for (const toast of added) {
      timers.set(
        toast.id,
        setTimeout(() => {
          timers.delete(toast.id);
          setToasts((prev) => prev.filter((t) => t.id !== toast.id));
        }, TOAST_DURATION),
      );
    }
  }, [engine.errors]);

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleHoverOn = useCallback(() => setHovered(true), []);
  const handleHoverOff = useCallback(() => setHovered(false), []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setErrorFilter(false);
  }, []);

  const handleToastClick = useCallback(() => {
    clearAllToasts();
    setActiveTab("events");
    setErrorFilter(true);
    setOpen(true);
  }, [clearAllToasts]);

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

  const toastEdge = position.startsWith("bottom") ? "bottom" : "top";
  const toastAlign = position.endsWith("right") ? "right" : "left";

  return createPortal(
    <>
      <style>{TOAST_CSS}</style>

      {!open && (
        <button
          type="button"
          onClick={handleOpen}
          onMouseEnter={handleHoverOn}
          onMouseLeave={handleHoverOff}
          style={{
            ...styles.trigger,
            ...getPositionStyles(position),
            ...(hovered ? styles.triggerHover : {}),
            ...buttonStyle,
          }}
          title="Open Commiq Devtools"
          aria-label="Open Commiq Devtools"
        >
          <span style={styles.triggerIcon} aria-hidden="true">⬡</span>
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
          onHeightChange={setLiveHeight}
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
          errorFilter={errorFilter}
          onErrorFilterChange={setErrorFilter}
        />
      )}

      {toasts.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          style={{
            ...styles.toastContainer,
            [toastEdge]: open ? liveHeight + PANEL_TOAST_GAP : TRIGGER_OFFSET,
            [toastAlign]: 16,
          }}
        >
          {toasts.map((toast) => (
            <ToastRow key={toast.id} toast={toast} onOpen={handleToastClick} onDismiss={dismissToast} />
          ))}
        </div>
      )}
    </>,
    portalRef.current,
  );
}

type ToastRowProps = {
  toast: Toast;
  onOpen: () => void;
  onDismiss: (id: number) => void;
}

function ToastRow({ toast, onOpen, onDismiss }: ToastRowProps) {
  const handleDismiss = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDismiss(toast.id);
    },
    [onDismiss, toast.id],
  );

  return (
    <div className="commiq-toast" style={styles.toast} onClick={onOpen}>
      <span style={styles.toastIcon} aria-hidden="true">●</span>
      <span style={styles.toastText}>
        <strong>{toast.name}</strong> in {toast.storeName}
      </span>
      <button
        type="button"
        className="commiq-toast-close"
        style={styles.toastClose}
        onClick={handleDismiss}
        aria-label="Dismiss error notification"
      >
        ✕
      </button>
    </div>
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

const styles = {
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
    pointerEvents: "auto",
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
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9999,
    backgroundColor: colors.accentHover,
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
    position: "absolute",
    top: -4,
    left: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9999,
    backgroundColor: "#b91c1c",
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
    position: "fixed",
    zIndex: 100000,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    pointerEvents: "auto",
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
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  toastClose: {
    fontSize: 10,
    color: colors.textMuted,
    flexShrink: 0,
    padding: "0 2px",
    background: "transparent",
    borderWidth: 0,
    cursor: "pointer",
  },
} satisfies Record<string, CSSProperties>;
