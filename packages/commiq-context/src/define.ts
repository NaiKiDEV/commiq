import type { ContextExtensionDef } from "@naikidev/commiq";

export function defineContextExtension<S, T extends Record<string, unknown>>(
  def: ContextExtensionDef<S, T>,
): ContextExtensionDef<S, T> {
  return def;
}
