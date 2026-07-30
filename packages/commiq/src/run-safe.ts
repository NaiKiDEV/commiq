import { isProductionEnv } from "./env";

export type ErrorSink = (error: unknown) => void;

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
