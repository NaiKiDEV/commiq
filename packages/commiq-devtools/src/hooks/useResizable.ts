import { useState, useRef, useEffect, useCallback } from "react";

type ResizableOptions = {
  initial: number;
  min?: number;
  max?: number;
}

type ResizableResult = {
  height: number;
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}

export function useResizable({
  initial,
  min = 80,
  max = 500,
}: ResizableOptions): ResizableResult {
  const [height, setHeight] = useState(initial);
  const [isDragging, setIsDragging] = useState(false);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true;
      setIsDragging(true);
      startY.current = e.clientY;
      startH.current = height;
      e.preventDefault();
    },
    [height],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startY.current - e.clientY;
      setHeight(Math.max(min, Math.min(max, startH.current + delta)));
    };
    const onUp = () => {
      dragging.current = false;
      setIsDragging(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [min, max]);

  return { height, isDragging, onMouseDown };
}
