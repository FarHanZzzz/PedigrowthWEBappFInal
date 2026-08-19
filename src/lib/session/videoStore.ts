// PEDI-GROWTH — Video & Results Store (IndexedDB)
// Temporary video storage + persistent result storage for analysis pipeline.
// Videos: stored as Blobs, keyed by session ID. Deleted after analysis.
// Results: stored as JSON, keyed by result ID. Persist across page refreshes.

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

// ── Video Storage ──

/**
 * Store a video file in IndexedDB.
 * Returns the key used for retrieval.
 */
export async function storeVideo(sessionId: string, file: File): Promise<string> {
  const db = await openDB();
  const key = `video_${sessionId}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE, 'readwrite');
    const store = tx.objectStore(VIDEO_STORE);

    store.put({
      blob: file,
      name: file.name,
      type: file.type,
      size: file.size,
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
      resolve(request.result || null);
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
