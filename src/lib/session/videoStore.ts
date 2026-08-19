// PEDI-GROWTH — Video & Results Store (IndexedDB)
// Temporary video storage + persistent result storage for analysis pipeline.
// Videos: stored as ArrayBuffers (iOS Safari does not reliably persist File/Blob),
// keyed by session ID. Results: stored as JSON, keyed by result ID.

const DB_NAME = 'pedigrowth_video_store';
const DB_VERSION = 2; // v2: adds 'results' store
const VIDEO_STORE = 'videos';
const RESULT_STORE = 'results';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VIDEO_STORE)) {
        db.createObjectStore(VIDEO_STORE);
      }
      if (!db.objectStoreNames.contains(RESULT_STORE)) {
        db.createObjectStore(RESULT_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function toPlayableBlob(entry: {
  blob?: Blob;
  buffer?: ArrayBuffer;
  type?: string;
} | null): Blob | null {
  if (!entry) return null;

  const type = entry.type || 'video/mp4';

  if (entry.blob instanceof Blob && entry.blob.size > 0) {
    // Clone so iOS Safari can create a usable object URL after navigation.
    return entry.blob.slice(0, entry.blob.size, entry.blob.type || type);
  }

  if (entry.buffer instanceof ArrayBuffer && entry.buffer.byteLength > 0) {
    return new Blob([entry.buffer], { type });
  }

  return null;
}

// ── Video Storage ──

/**
 * Store a video file in IndexedDB.
 * Returns the key used for retrieval.
 */
export async function storeVideo(sessionId: string, file: File | Blob): Promise<string> {
  const db = await openDB();
  const key = `video_${sessionId}`;
  const type = file.type || 'video/mp4';
  const name = file instanceof File && file.name ? file.name : 'capture.mp4';
  const size = file.size;
  const buffer = await file.arrayBuffer();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE, 'readwrite');
    const store = tx.objectStore(VIDEO_STORE);

    store.put({
      buffer,
      name,
      type,
      size,
      storedAt: Date.now(),
    }, key);

    tx.oncomplete = () => {
      db.close();
      resolve(key);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/**
 * Retrieve a stored video Blob.
 */
export async function getVideo(sessionId: string): Promise<{ blob: Blob; name: string; type: string; size: number } | null> {
  const db = await openDB();
  const key = `video_${sessionId}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE, 'readonly');
    const store = tx.objectStore(VIDEO_STORE);
    const request = store.get(key);

    request.onsuccess = () => {
      db.close();
      const entry = request.result as {
        blob?: Blob;
        buffer?: ArrayBuffer;
        name?: string;
        type?: string;
        size?: number;
      } | undefined;
      const blob = toPlayableBlob(entry ?? null);
      if (!blob) {
        resolve(null);
        return;
      }
      resolve({
        blob,
        name: entry?.name || 'capture.mp4',
        type: entry?.type || blob.type || 'video/mp4',
        size: entry?.size ?? blob.size,
      });
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/**
 * Delete a video after analysis is complete.
 */
export async function deleteVideo(sessionId: string): Promise<void> {
  const db = await openDB();
  const key = `video_${sessionId}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE, 'readwrite');
    const store = tx.objectStore(VIDEO_STORE);
    store.delete(key);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

// ── Analysis Result Persistence ──

/**
 * Save an analysis result to IndexedDB for persistence across page refreshes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function saveResult(resultId: string, result: any): Promise<void> {
  const db = await openDB();
  const key = `result_${resultId}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(RESULT_STORE, 'readwrite');
    const store = tx.objectStore(RESULT_STORE);

    store.put({
      data: result,
      savedAt: Date.now(),
    }, key);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/**
 * Retrieve a saved analysis result from IndexedDB.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getResult(resultId: string): Promise<any | null> {
  const db = await openDB();
  const key = `result_${resultId}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(RESULT_STORE, 'readonly');
    const store = tx.objectStore(RESULT_STORE);
    const request = store.get(key);

    request.onsuccess = () => {
      db.close();
      const entry = request.result;
      resolve(entry?.data ?? null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/**
 * Delete an analysis result from IndexedDB.
 */
export async function deleteResult(resultId: string): Promise<void> {
  const db = await openDB();
  const key = `result_${resultId}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(RESULT_STORE, 'readwrite');
    const store = tx.objectStore(RESULT_STORE);
    store.delete(key);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
