export type ErrorSink = (error: unknown) => void;

type ProcessLike = { env?: { NODE_ENV?: string } };

function isProductionEnv(): boolean {
  const scope = globalThis as { process?: ProcessLike };
  return scope.process?.env?.NODE_ENV === "production";
}

export function reportToConsole(message: string, error: unknown): void {
  if (isProductionEnv()) return;
  console.error(message, error);
}

export async function runSafe(
  fn: () => void | Promise<void>,
  onError?: ErrorSink,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    onError?.(error);
  }
}
