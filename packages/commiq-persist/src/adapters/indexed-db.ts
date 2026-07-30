import type { StorageAdapter } from "../types";

export type IdbHandler = ((...args: never[]) => void) | null;

export type IdbRequestLike<T> = {
  result: T;
  error: unknown;
  onsuccess: IdbHandler;
  onerror: IdbHandler;
};

export type IdbObjectStoreLike = {
  get(key: string): IdbRequestLike<unknown>;
  put(value: string, key: string): IdbRequestLike<unknown>;
  delete(key: string): IdbRequestLike<unknown>;
};

export type IdbTransactionLike = {
  objectStore(name: string): IdbObjectStoreLike;
};

export type IdbDatabaseLike = {
  objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string): unknown;
  transaction(name: string, mode: "readonly" | "readwrite"): IdbTransactionLike;
};

export type IdbOpenRequestLike = IdbRequestLike<IdbDatabaseLike> & {
  onupgradeneeded: IdbHandler;
};

export type IdbFactoryLike = {
  open(name: string, version?: number): IdbOpenRequestLike;
};

export type IndexedDbAdapterOptions = {
  databaseName?: string;
  storeName?: string;
  factory?: IdbFactoryLike;
};

const defaultDatabaseName = "commiq-persist";
const defaultStoreName = "state";
const databaseVersion = 1;

function resolveFactory(): IdbFactoryLike | null {
  try {
    const factory: IDBFactory | undefined = globalThis.indexedDB;
    return factory ?? null;
  } catch {
    return null;
  }
}

function toError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error("IndexedDB request failed", { cause: error });
}

function awaitRequest<T>(request: IdbRequestLike<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(toError(request.error));
  });
}

function openDatabase(
  factory: IdbFactoryLike,
  databaseName: string,
  storeName: string,
): Promise<IdbDatabaseLike> {
  const request = factory.open(databaseName, databaseVersion);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(storeName)) {
      database.createObjectStore(storeName);
    }
  };
  return awaitRequest(request);
}

export function indexedDbAdapter(
  options: IndexedDbAdapterOptions = {},
): StorageAdapter {
  const databaseName = options.databaseName ?? defaultDatabaseName;
  const storeName = options.storeName ?? defaultStoreName;
  const factory = options.factory ?? resolveFactory();

  if (factory === null) {
    throw new Error(
      "indexedDbAdapter requires an IndexedDB implementation; none is available in this environment",
    );
  }

  let connection: Promise<IdbDatabaseLike> | null = null;

  const database = (): Promise<IdbDatabaseLike> => {
    connection ??= openDatabase(factory, databaseName, storeName).catch(
      (error: unknown) => {
        connection = null;
        throw toError(error);
      },
    );
    return connection;
  };

  const withStore = async <T>(
    mode: "readonly" | "readwrite",
    run: (store: IdbObjectStoreLike) => IdbRequestLike<T>,
  ): Promise<T> => {
    const db = await database();
    const store = db.transaction(storeName, mode).objectStore(storeName);
    return awaitRequest(run(store));
  };

  return {
    getItem: async (key) => {
      const value = await withStore("readonly", (store) => store.get(key));
      return typeof value === "string" ? value : null;
    },
    setItem: async (key, value) => {
      await withStore("readwrite", (store) => store.put(value, key));
    },
    removeItem: async (key) => {
      await withStore("readwrite", (store) => store.delete(key));
    },
  };
}
