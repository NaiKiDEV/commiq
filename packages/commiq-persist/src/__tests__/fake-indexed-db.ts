import type {
  IdbDatabaseLike,
  IdbFactoryLike,
  IdbObjectStoreLike,
  IdbOpenRequestLike,
  IdbRequestLike,
  IdbTransactionLike,
} from "../index";

export type FakeIndexedDb = IdbFactoryLike & {
  entries: Map<string, string>;
};

export type FakeIndexedDbOptions = {
  failOn?: "open" | "get" | "put" | "delete";
};

function makeRequest<T>(result: T, error?: unknown): IdbRequestLike<T> {
  const request: IdbRequestLike<T> = {
    result,
    error: error ?? null,
    onsuccess: null,
    onerror: null,
  };
  queueMicrotask(() => {
    if (error !== undefined) request.onerror?.();
    else request.onsuccess?.();
  });
  return request;
}

function failure(
  options: FakeIndexedDbOptions,
  stage: FakeIndexedDbOptions["failOn"],
): Error | undefined {
  return options.failOn === stage
    ? new Error(`fake indexeddb ${String(stage)} failed`)
    : undefined;
}

export function createFakeIndexedDb(
  options: FakeIndexedDbOptions = {},
): FakeIndexedDb {
  const entries = new Map<string, string>();
  const storeNames = new Set<string>();

  const objectStore: IdbObjectStoreLike = {
    get: (key) => makeRequest<unknown>(entries.get(key), failure(options, "get")),
    put: (value, key) => {
      const error = failure(options, "put");
      if (error === undefined) entries.set(key, value);
      return makeRequest<unknown>(undefined, error);
    },
    delete: (key) => {
      const error = failure(options, "delete");
      if (error === undefined) entries.delete(key);
      return makeRequest<unknown>(undefined, error);
    },
  };

  const transaction: IdbTransactionLike = { objectStore: () => objectStore };

  const database: IdbDatabaseLike = {
    objectStoreNames: { contains: (name) => storeNames.has(name) },
    createObjectStore: (name) => storeNames.add(name),
    transaction: () => transaction,
  };

  const open = (): IdbOpenRequestLike => {
    const error = failure(options, "open");
    const request: IdbOpenRequestLike = {
      result: database,
      error: error ?? null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    };
    queueMicrotask(() => {
      if (error !== undefined) {
        request.onerror?.();
        return;
      }
      request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  };

  return { open, entries };
}
