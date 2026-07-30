import { useCallback, useEffect, useRef, useState } from "react";

export const ROW_HEIGHT = 25;
export const DETAIL_HEIGHT = 220;
export const DEFAULT_OVERSCAN = 8;

export type VirtualRange = {
  start: number;
  end: number;
}

export type VirtualRowsOptions = {
  count: number;
  expandedIndex: number | null;
  overscan?: number;
}

export type VirtualRows = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  range: VirtualRange;
  totalHeight: number;
  offsetOf: (index: number) => number;
  handleScroll: () => void;
  scrollToBottom: () => void;
}

export function totalRowsHeight(count: number, expandedIndex: number | null): number {
  const detail = expandedIndex !== null && expandedIndex >= 0 && expandedIndex < count
    ? DETAIL_HEIGHT
    : 0;
  return count * ROW_HEIGHT + detail;
}

export function rowOffset(index: number, expandedIndex: number | null): number {
  const shifted = expandedIndex !== null && index > expandedIndex ? DETAIL_HEIGHT : 0;
  return index * ROW_HEIGHT + shifted;
}

export function rowIndexAt(y: number, expandedIndex: number | null): number {
  const clamped = Math.max(0, y);
  if (expandedIndex === null) return Math.floor(clamped / ROW_HEIGHT);

  const detailTop = (expandedIndex + 1) * ROW_HEIGHT;
  if (clamped < detailTop) return Math.floor(clamped / ROW_HEIGHT);
  if (clamped < detailTop + DETAIL_HEIGHT) return expandedIndex;
  return Math.floor((clamped - DETAIL_HEIGHT) / ROW_HEIGHT);
}

export function computeRange(
  scrollTop: number,
  viewportHeight: number,
  count: number,
  expandedIndex: number | null,
  overscan: number = DEFAULT_OVERSCAN,
): VirtualRange {
  if (count === 0) return { start: 0, end: 0 };
  const first = rowIndexAt(scrollTop, expandedIndex) - overscan;
  const last = rowIndexAt(scrollTop + Math.max(0, viewportHeight), expandedIndex) + overscan;
  return {
    start: Math.max(0, Math.min(count - 1, first)),
    end: Math.max(0, Math.min(count, last + 1)),
  };
}

export function useVirtualRows({
  count,
  expandedIndex,
  overscan = DEFAULT_OVERSCAN,
}: VirtualRowsOptions): VirtualRows {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = useState({ scrollTop: 0, viewportHeight: 0 });

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setMetrics((prev) => {
      if (prev.scrollTop === el.scrollTop && prev.viewportHeight === el.clientHeight) {
        return prev;
      }
      return { scrollTop: el.scrollTop, viewportHeight: el.clientHeight };
    });
  }, []);

  useEffect(() => {
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    measure();
  }, [measure]);

  const offsetOf = useCallback(
    (index: number) => rowOffset(index, expandedIndex),
    [expandedIndex],
  );

  return {
    containerRef,
    range: computeRange(
      metrics.scrollTop,
      metrics.viewportHeight,
      count,
      expandedIndex,
      overscan,
    ),
    totalHeight: totalRowsHeight(count, expandedIndex),
    offsetOf,
    handleScroll: measure,
    scrollToBottom,
  };
}
