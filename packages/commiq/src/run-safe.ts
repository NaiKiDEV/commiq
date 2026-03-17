export async function runSafe(fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
  } catch {}
}
