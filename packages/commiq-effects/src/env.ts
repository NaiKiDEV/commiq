type ProcessLike = { env?: { NODE_ENV?: string } };

export function isProductionEnv(): boolean {
  const scope = globalThis as { process?: ProcessLike };
  return scope.process?.env?.NODE_ENV === "production";
}
