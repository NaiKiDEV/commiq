import { describe, it, expect } from "vitest";
import {
  DETAIL_HEIGHT,
  ROW_HEIGHT,
  computeRange,
  rowIndexAt,
  rowOffset,
  totalRowsHeight,
} from "../hooks/useVirtualRows";

describe("row geometry", () => {
  it("stacks rows at a uniform height when nothing is expanded", () => {
    expect(rowOffset(0, null)).toBe(0);
    expect(rowOffset(3, null)).toBe(3 * ROW_HEIGHT);
    expect(totalRowsHeight(10, null)).toBe(10 * ROW_HEIGHT);
  });

  it("shifts rows below the expanded row by the detail height", () => {
    expect(rowOffset(2, 5)).toBe(2 * ROW_HEIGHT);
    expect(rowOffset(5, 5)).toBe(5 * ROW_HEIGHT);
    expect(rowOffset(6, 5)).toBe(6 * ROW_HEIGHT + DETAIL_HEIGHT);
    expect(totalRowsHeight(10, 5)).toBe(10 * ROW_HEIGHT + DETAIL_HEIGHT);
  });

  it("ignores an expanded index outside the list when sizing", () => {
    expect(totalRowsHeight(3, 9)).toBe(3 * ROW_HEIGHT);
  });

  it("inverts rowOffset exactly", () => {
    for (const expanded of [null, 0, 4]) {
      for (let i = 0; i < 8; i += 1) {
        expect(rowIndexAt(rowOffset(i, expanded), expanded)).toBe(i);
      }
    }
  });

  it("maps every pixel of the detail block back to the expanded row", () => {
    const top = rowOffset(3, 3) + ROW_HEIGHT;
    expect(rowIndexAt(top, 3)).toBe(3);
    expect(rowIndexAt(top + DETAIL_HEIGHT - 1, 3)).toBe(3);
    expect(rowIndexAt(top + DETAIL_HEIGHT, 3)).toBe(4);
  });

  it("clamps negative scroll positions", () => {
    expect(rowIndexAt(-100, null)).toBe(0);
  });
});

describe("computeRange", () => {
  it("returns an empty window for an empty list", () => {
    expect(computeRange(0, 400, 0, null)).toEqual({ start: 0, end: 0 });
  });

  it("covers the visible rows plus overscan", () => {
    const range = computeRange(0, 100, 1000, null, 2);
    expect(range.start).toBe(0);
    expect(range.end).toBeGreaterThanOrEqual(Math.ceil(100 / ROW_HEIGHT));
    expect(range.end).toBeLessThan(1000);
  });

  it("windows far into a large list rather than rendering everything", () => {
    const range = computeRange(50_000, 300, 5000, null, 4);
    expect(range.start).toBeGreaterThan(1900);
    expect(range.end - range.start).toBeLessThan(30);
  });

  it("never exceeds the item count", () => {
    const range = computeRange(1_000_000, 500, 10, null);
    expect(range.end).toBeLessThanOrEqual(10);
    expect(range.start).toBeLessThanOrEqual(9);
  });
});
