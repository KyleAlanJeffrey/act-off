// IndexedDB persistence for recorded takes, so a reload mid-session resumes
// where the player left off. Keyed `${sceneId}:${lineIndex}`; entries older
// than MAX_AGE_MS are pruned on read.

const DB_NAME = "dub-off";
const STORE = "takes";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type StoredTake = { sceneId: string; lineIndex: number; blob: Blob; updatedAt: number };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function saveTake(
  sceneId: string,
  lineIndex: number,
  blob: Blob
): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const value: StoredTake = { sceneId, lineIndex, blob, updatedAt: Date.now() };
    tx.objectStore(STORE).put(value, `${sceneId}:${lineIndex}`);
    await txDone(tx);
    db.close();
  } catch {
    // Persistence is best-effort — recording still works without it.
  }
}

/** All fresh takes for a scene; stale entries are deleted as they're found. */
export async function loadTakes(
  sceneId: string
): Promise<{ lineIndex: number; blob: Blob }[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const out: { lineIndex: number; blob: Blob }[] = [];
    await new Promise<void>((resolve, reject) => {
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return resolve();
        const value = cursor.value as StoredTake;
        if (Date.now() - value.updatedAt > MAX_AGE_MS) {
          cursor.delete();
        } else if (value.sceneId === sceneId) {
          out.push({ lineIndex: value.lineIndex, blob: value.blob });
        }
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
    await txDone(tx);
    db.close();
    return out;
  } catch {
    return [];
  }
}
