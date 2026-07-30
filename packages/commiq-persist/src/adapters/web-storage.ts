import type { StorageAdapter } from "../types";

type AreaName = "localStorage" | "sessionStorage";

type StorageEventLike = {
  key: string | null;
  newValue: string | null;
  storageArea: unknown;
};

function resolveArea(name: AreaName): Storage | null {
  try {
    const area: Storage | undefined = globalThis[name];
    return area ?? null;
  } catch {
    return null;
  }
}

function hasWindowEvents(): boolean {
  return (
    typeof globalThis.addEventListener === "function" &&
    typeof globalThis.removeEventListener === "function"
  );
}

function readString(event: Event, prop: string): string | null {
  const value: unknown = Reflect.get(event, prop);
  return typeof value === "string" ? value : null;
}

function readStorageEvent(event: Event): StorageEventLike {
  return {
    key: readString(event, "key"),
    newValue: readString(event, "newValue"),
    storageArea: Reflect.get(event, "storageArea"),
  };
}

export function noopStorageAdapter(): StorageAdapter {
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
}

export function memoryStorageAdapter(): StorageAdapter {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
}

export function webStorageAdapter(area: Storage): StorageAdapter {
  return {
    getItem: (key) => area.getItem(key),
    setItem: (key, value) => {
      area.setItem(key, value);
    },
    removeItem: (key) => {
      area.removeItem(key);
    },
    subscribe: (key, onChange) => {
      if (!hasWindowEvents()) return () => {};
      const handle = (event: Event) => {
        const detail = readStorageEvent(event);
        if (detail.storageArea != null && detail.storageArea !== area) return;
        if (detail.key === null) {
          onChange(null);
          return;
        }
        if (detail.key !== key) return;
        onChange(detail.newValue);
      };
      globalThis.addEventListener("storage", handle);
      return () => globalThis.removeEventListener("storage", handle);
    },
  };
}

export function localStorageAdapter(): StorageAdapter {
  const area = resolveArea("localStorage");
  return area === null ? noopStorageAdapter() : webStorageAdapter(area);
}

export function sessionStorageAdapter(): StorageAdapter {
  const area = resolveArea("sessionStorage");
  return area === null ? noopStorageAdapter() : webStorageAdapter(area);
}

export function defaultStorageAdapter(): StorageAdapter {
  return localStorageAdapter();
}
