import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StateDiff } from "../components/StateDiff";

afterEach(cleanup);

describe("StateDiff", () => {
  it("reports no changes for identical state", () => {
    render(<StateDiff before={{ a: 1 }} after={{ a: 1 }} />);
    expect(screen.getByText("No state changes detected")).toBeTruthy();
  });

  it("lists added, removed and changed paths", () => {
    render(<StateDiff before={{ a: 1, gone: true }} after={{ a: 2, fresh: "x" }} />);
    expect(screen.getByText("a")).toBeTruthy();
    expect(screen.getByText("gone")).toBeTruthy();
    expect(screen.getByText("fresh")).toBeTruthy();
  });

  it("does not stack-overflow on two cyclic snapshots (DT-9)", () => {
    const before: Record<string, unknown> = { id: 1 };
    before.self = before;
    const after: Record<string, unknown> = { id: 2 };
    after.self = after;

    expect(() => render(<StateDiff before={before} after={after} />)).not.toThrow();
    expect(screen.getByText("id")).toBeTruthy();
  });

  it("does not stack-overflow on a deeply nested structure", () => {
    const deep = (leaf: number): Record<string, unknown> => {
      let node: Record<string, unknown> = { leaf };
      for (let i = 0; i < 200; i += 1) node = { child: node };
      return node;
    };

    expect(() => render(<StateDiff before={deep(1)} after={deep(2)} />)).not.toThrow();
  });

  it("diffs arrays by index", () => {
    render(<StateDiff before={{ items: [1, 2] }} after={{ items: [1, 3, 4] }} />);
    expect(screen.getByText("items[1]")).toBeTruthy();
    expect(screen.getByText("items[2]")).toBeTruthy();
  });
});
