const PRIMARY_SESSION_KEY = "gaitbridge_session";
const LEGACY_SESSION_KEY = "pedigrowth_session";

const PRIMARY_RESULT_PREFIX = "gaitbridge_result_";
const LEGACY_RESULT_PREFIX = "pedigrowth_result_";

function getBrowserSessionStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.sessionStorage;
}

export function readSessionRaw(): string | null {
  const storage = getBrowserSessionStorage();
  if (!storage) {
    return null;
  }

  return storage.getItem(PRIMARY_SESSION_KEY) ?? storage.getItem(LEGACY_SESSION_KEY);
}

export function readSession<T>(): T | null {
  const raw = readSessionRaw();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeSession(value: unknown): void {
  const storage = getBrowserSessionStorage();
  if (!storage) {
    return;
  }

  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  storage.setItem(PRIMARY_SESSION_KEY, serialized);
  storage.setItem(LEGACY_SESSION_KEY, serialized);
}

function resultKeys(resultId: string): string[] {
  return [`${PRIMARY_RESULT_PREFIX}${resultId}`, `${LEGACY_RESULT_PREFIX}${resultId}`];
}

export function readResultRaw(resultId: string): string | null {
  const storage = getBrowserSessionStorage();
  if (!storage) {
    return null;
  }

  const [primaryKey, legacyKey] = resultKeys(resultId);
  return storage.getItem(primaryKey) ?? storage.getItem(legacyKey);
}

export function writeResultRaw(resultId: string, serialized: string): void {
  const storage = getBrowserSessionStorage();
  if (!storage) {
    return;
  }

  const [primaryKey, legacyKey] = resultKeys(resultId);
  storage.setItem(primaryKey, serialized);
  storage.setItem(legacyKey, serialized);
}

export function writeResult(resultId: string, value: unknown): void {
  writeResultRaw(resultId, JSON.stringify(value));
}

export function collectResultIds(storage: Storage): string[] {
  const ids = new Set<string>();

  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key) continue;

    if (key.startsWith(PRIMARY_RESULT_PREFIX)) {
      ids.add(key.replace(PRIMARY_RESULT_PREFIX, ""));
      continue;
    }

    if (key.startsWith(LEGACY_RESULT_PREFIX)) {
      ids.add(key.replace(LEGACY_RESULT_PREFIX, ""));
    }
  }

  return Array.from(ids);
}
