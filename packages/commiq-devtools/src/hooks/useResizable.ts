import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const KEY_STEP = 16;
const KEY_STEP_LARGE = 64;

type ResizableOptions = {
  initial: number;
  min?: number;
  max?: number | (() => number);
  label?: string;
}

export type SeparatorProps = {
  role: "separator";
  tabIndex: number;
  "aria-orientation": "horizontal";
  "aria-valuenow": number;
  "aria-valuemin": number;
  "aria-valuemax": number;
  "aria-label": string;
  onPointerDown: (e: React.PointerEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

type ResizableResult = {
  height: number;
  isDragging: boolean;
  separatorProps: SeparatorProps;
}

export function useResizable({
  initial,
  min = 80,
  max = 500,
  label = "Resize panel",
}: ResizableOptions): ResizableResult {
  const [height, setHeight] = useState(initial);
  const [isDragging, setIsDragging] = useState(false);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const resolveMax = useCallback(() => (typeof max === "function" ? max() : max), [max]);

  const clamp = useCallback(
    (value: number) => Math.max(min, Math.min(resolveMax(), value)),
    [min, resolveMax],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setHeight((current) => clamp(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      dragging.current = true;
      setIsDragging(true);
      startY.current = e.clientY;
      startHeight.current = height;
      e.preventDefault();
    },
    [height],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const delta = KEY_DELTAS[e.key];
      if (delta !== undefined) {
        e.preventDefault();
        const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
        setHeight((current) => clamp(current + delta * step));
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        setHeight(clamp(min));
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        setHeight(clamp(resolveMax()));
      }
    },
    [clamp, min, resolveMax],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      setHeight(clamp(startHeight.current + (startY.current - e.clientY)));
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      setIsDragging(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [clamp]);

  const separatorProps = useMemo<SeparatorProps>(
    () => ({
      role: "separator",
      tabIndex: 0,
      "aria-orientation": "horizontal",
      "aria-valuenow": Math.round(height),
      "aria-valuemin": min,
      "aria-valuemax": Math.round(resolveMax()),
      "aria-label": label,
      onPointerDown,
      onKeyDown,
    }),
    [height, min, resolveMax, label, onPointerDown, onKeyDown],
  );

  return { height, isDragging, separatorProps };
}

const KEY_DELTAS: Readonly<Record<string, number>> = {
  ArrowUp: 1,
  ArrowDown: -1,
  PageUp: 4,
  PageDown: -4,
};
