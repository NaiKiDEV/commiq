import { Suspense, lazy, type CSSProperties } from "react";
import type { SealedStore } from "@naikidev/commiq";

const LazyDevtoolsInner = lazy(() => import("./CommiqDevtoolsInner"));

export type CommiqDevtoolsProps = {
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
 * The heavy devtools panel is lazily loaded so it never ends up
 * in the production bundle when the component short-circuits.
 *
 * @example
 * ```tsx
 * <CommiqDevtools stores={{ counter: counterStore, todo: todoStore }} />
 * ```
 */
export function CommiqDevtools(props: CommiqDevtoolsProps) {
  const { enabled } = props;

  if (enabled === false) return null;

  if (enabled === undefined) {
    try {
      if ((globalThis as any).process?.env?.NODE_ENV === "production") {
        return null;
      }
    } catch {}
  }

  return (
    <Suspense fallback={null}>
      <LazyDevtoolsInner {...props} />
    </Suspense>
  );
}
