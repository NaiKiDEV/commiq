import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CommiqDevtools, type CommiqDevtoolsProps } from "./CommiqDevtools";

export type MountDevtoolsOptions = Omit<CommiqDevtoolsProps, "enabled">;

/**
 * Mount devtools imperatively without JSX or a provider.
 *
 * Call from anywhere — a store file, `main.ts`, or a plain script.
 * Returns an `unmount` function to remove the devtools.
 *
 * @example
 * ```ts
 * import { mountDevtools } from "@naikidev/commiq-devtools";
 * const unmount = mountDevtools({ stores: { counter: counterStore } });
 * ```
 */
export function mountDevtools(options: MountDevtoolsOptions): () => void {
  const container = document.createElement("div");
  container.id = "commiq-devtools-mount";
  document.body.appendChild(container);

  const root: Root = createRoot(container);
  root.render(createElement(CommiqDevtools, { ...options, enabled: true }));

  return () => {
    root.unmount();
    container.remove();
  };
}
