import { Suspense, lazy, type CSSProperties } from "react";
import type { SealedStore } from "@naikidev/commiq";

const LazyDevtoolsInner = lazy(() => import("./CommiqDevtoolsInner"));

export type CommiqDevtoolsProps = {
  stores: Record<string, SealedStore<unknown>>;
  enabled?: boolean;
  position?: "bottom-left" | "bottom-right" | "top-left" | "top-right";
  initialOpen?: boolean;
  maxEvents?: number;
  panelHeight?: number;
  buttonStyle?: CSSProperties;
}

export function CommiqDevtools(props: CommiqDevtoolsProps) {
  const { enabled } = props;

  if (enabled === false) return null;

  if (enabled === undefined) {
    try {
      const g = globalThis as { process?: { env?: { NODE_ENV?: string } } };
      if (g.process?.env?.NODE_ENV === "production") {
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
