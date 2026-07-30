import { describe, it, expect } from "vitest";
import {
  NODE_W,
  clampZoom,
  computeFit,
  computeLayout,
  findComponents,
  forceLayout,
  getBounds,
  mergePositions,
  type Vec,
} from "../tabs/dependency-layout";

describe("findComponents", () => {
  it("splits disconnected subgraphs", () => {
    const components = findComponents(
      ["a", "b", "c", "d"],
      [
        { from: "a", to: "b" },
        { from: "c", to: "d" },
      ],
    );

    expect(components).toHaveLength(2);
    expect(components.map((c) => [...c].sort())).toEqual(
      expect.arrayContaining([
        ["a", "b"],
        ["c", "d"],
      ]),
    );
  });

  it("treats an isolated node as its own component", () => {
    expect(findComponents(["solo"], [])).toEqual([["solo"]]);
  });
});

describe("forceLayout", () => {
  it("places a single node at the origin", () => {
    expect(forceLayout(["only"], [])).toEqual(new Map([["only", { x: 0, y: 0 }]]));
  });

  it("is deterministic for the same input", () => {
    const nodes = ["a", "b", "c"];
    const edges = [{ from: "a", to: "b" }];
    expect([...forceLayout(nodes, edges, 20)]).toEqual([...forceLayout(nodes, edges, 20)]);
  });

  it("keeps nodes apart", () => {
    const positions = forceLayout(["a", "b"], [{ from: "a", to: "b" }], 60);
    const a = positions.get("a")!;
    const b = positions.get("b")!;
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(NODE_W * 0.5);
  });
});

describe("computeLayout", () => {
  it("positions every store exactly once", () => {
    const layout = computeLayout(["a", "b", "lonely"], [{ from: "a", to: "b" }]);
    expect([...layout.keys()].sort()).toEqual(["a", "b", "lonely"]);
  });

  it("returns an empty map with no stores", () => {
    expect(computeLayout([], []).size).toBe(0);
  });

  it("centres the connected cluster around the origin", () => {
    const layout = computeLayout(["a", "b"], [{ from: "a", to: "b" }]);
    const bounds = getBounds(layout);
    const centreX = (bounds.minX + bounds.maxX) / 2;
    expect(Math.abs(centreX)).toBeLessThan(1);
  });
});

describe("mergePositions", () => {
  it("keeps a user-dragged position for a node that still exists", () => {
    const previous = new Map<string, Vec>([["a", { x: 999, y: -999 }]]);
    const next = new Map<string, Vec>([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 10, y: 10 }],
    ]);

    const merged = mergePositions(previous, next);

    expect(merged.get("a")).toEqual({ x: 999, y: -999 });
    expect(merged.get("b")).toEqual({ x: 10, y: 10 });
  });

  it("drops nodes that are gone from the new layout", () => {
    const merged = mergePositions(
      new Map<string, Vec>([["stale", { x: 1, y: 1 }]]),
      new Map<string, Vec>([["fresh", { x: 2, y: 2 }]]),
    );
    expect([...merged.keys()]).toEqual(["fresh"]);
  });
});

describe("computeFit", () => {
  it("falls back to identity for an empty layout", () => {
    expect(computeFit(new Map(), 100, 100)).toEqual({ pan: { x: 0, y: 0 }, zoom: 1 });
  });

  it("centres a single node in the viewport", () => {
    const fit = computeFit(new Map([["a", { x: 0, y: 0 }]]), 400, 200);
    expect(fit.pan).toEqual({ x: 200, y: 100 });
  });

  it("clamps zoom into range", () => {
    expect(clampZoom(50)).toBeLessThanOrEqual(3);
    expect(clampZoom(0)).toBeGreaterThanOrEqual(0.2);
  });
});
