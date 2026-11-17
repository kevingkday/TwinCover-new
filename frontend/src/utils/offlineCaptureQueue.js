/**
 * Cross-Browser Offline Field Capture Queue (IndexedDB)
 * Persists pending capture bundles (`submissionId`, `blobs`, `notes`, `capturedAt`, `status`)
 * in the `twincover_offline_captures` store so producers never lose site photos, voice memos,
 * or notes when cellular connectivity drops or a mobile screen locks.
 */

const DB_NAME = 'twincover_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'twincover_offline_captures';

function openOfflineDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this browser environment.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('submissionId', 'submissionId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const offlineCaptureQueue = {
  /**
   * Persist a capture bundle to IndexedDB BEFORE attempting network upload.
   * Converts File objects into `{ name, type, size, blob }` for safe cross-browser storage.
   */
  async enqueueCapture({ submissionId, files = [], textNote = '', noteTitle = '' }) {
    const db = await openOfflineDb();
    const id = `cap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const serializedBlobs = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        blob: file instanceof Blob ? file : new Blob([await file.arrayBuffer()], { type: file.type }),
      }))
    );

    const record = {
      id,
      submissionId: Number(submissionId),
      blobs: serializedBlobs,
      notes: {
        textNote: textNote || '',
        noteTitle: noteTitle || 'producer_site_note.txt',
      },
      capturedAt: new Date().toISOString(),
      status: 'pending',
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = () => reject(req.error);
    });
  },

  /**
   * List all pending capture bundles (optionally filtered by submissionId).
   */
  async listPendingCaptures(submissionId = null) {
    try {
      const db = await openOfflineDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          const all = req.result || [];
          const filtered = submissionId
            ? all.filter((r) => Number(r.submissionId) === Number(submissionId))
            : all;
          resolve(filtered.sort((a, b) => (a.capturedAt < b.capturedAt ? -1 : 1)));
        };
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return [];
    }
  },

  /**
   * Reconstruct File objects from stored IndexedDB blobs for upload.
   */
  reconstructFiles(record) {
    return (record.blobs || []).map(
      (b) => new File([b.blob], b.name, { type: b.type || 'application/octet-stream' })
    );
  },

  /**
   * Delete a capture bundle from IndexedDB ONLY after HTTP 200/202 confirmation from backend.
   */
  async removeCapture(captureId) {
    const db = await openOfflineDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(captureId);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  },
};
