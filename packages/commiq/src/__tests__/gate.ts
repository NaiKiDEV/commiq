type Flushable = {
  flush: () => Promise<void>;
};

export type Gate = {
  wait: () => Promise<void>;
  release: () => void;
  parked: () => Promise<void>;
};

const MAX_DRAIN_STEPS = 100;

export function createGate(): Gate {
  const parkedResolvers: Array<() => void> = [];
  const arrivalResolvers: Array<() => void> = [];

  const wait = (): Promise<void> =>
    new Promise<void>((resolve) => {
      parkedResolvers.push(() => resolve());
      for (const notify of arrivalResolvers.splice(0)) notify();
    });

  const release = (): void => {
    for (const resolve of parkedResolvers.splice(0)) resolve();
  };

  const parked = (): Promise<void> => {
    if (parkedResolvers.length > 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      arrivalResolvers.push(() => resolve());
    });
  };

  return { wait, release, parked };
}

export async function drain(store: Flushable, gate: Gate): Promise<void> {
  const flushed = store.flush();
  let isSettled = false;
  void flushed.then(() => {
    isSettled = true;
  });

  for (let step = 0; step < MAX_DRAIN_STEPS && !isSettled; step += 1) {
    await Promise.race([flushed, gate.parked()]);
    if (isSettled) break;
    gate.release();
  }

  if (!isSettled) {
    throw new Error(
      `drain: queue did not settle after ${MAX_DRAIN_STEPS} gate releases`,
    );
  }

  await flushed;
}
