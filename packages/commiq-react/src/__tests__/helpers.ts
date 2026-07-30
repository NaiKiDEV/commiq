import type { SealedStore, StreamListener, Unsubscribe } from "@naikidev/commiq";

export type SubscriptionSpy<S> = {
  store: SealedStore<S>;
  openCount: () => number;
  unsubscribeCount: () => number;
  closeCount: () => number;
  activeCount: () => number;
}

export function spyOnSubscriptions<S>(
  sealed: SealedStore<S>,
): SubscriptionSpy<S> {
  let opened = 0;
  let unsubscribed = 0;
  let closed = 0;

  const store: SealedStore<S> = {
    get state() {
      return sealed.state;
    },
    queue: sealed.queue,
    flush: () => sealed.flush(),
    openStream: (listener: StreamListener): Unsubscribe => {
      opened += 1;
      const unsubscribe = sealed.openStream(listener);
      return () => {
        unsubscribed += 1;
        unsubscribe();
      };
    },
    closeStream: (listener: StreamListener) => {
      closed += 1;
      sealed.closeStream(listener);
    },
  };

  return {
    store,
    openCount: () => opened,
    unsubscribeCount: () => unsubscribed,
    closeCount: () => closed,
    activeCount: () => opened - unsubscribed - closed,
  };
}

export type UncaughtCapture = {
  errors: unknown[];
  restore: () => void;
}

export function captureUncaught(): UncaughtCapture {
  const errors: unknown[] = [];
  const onError = (error: unknown) => {
    errors.push(error);
  };
  process.on("uncaughtException", onError);

  return {
    errors,
    restore: () => {
      process.off("uncaughtException", onError);
    },
  };
}

export function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
