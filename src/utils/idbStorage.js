/**
 * IndexedDB storage helper for large documents and files (PDFs, images).
 * IndexedDB avoids the 5MB browser quota limit of localStorage.
 */

const DB_NAME = 'WorkshopStorageDB';
const DB_VERSION = 1;
const STORE_INVOICE_PDFS = 'invoice_pdfs';

let dbPromise = null;

const getDB = () => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      console.warn('IndexedDB no está soportado en este navegador.');
      return resolve(null);
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_INVOICE_PDFS)) {
        db.createObjectStore(STORE_INVOICE_PDFS, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target.error);
      resolve(null);
    };
  });

  return dbPromise;
};

/**
 * Guarda o actualiza el PDF de una factura en IndexedDB.
 */
export const saveInvoicePdf = async (id, pdfUrl, pdfName = '') => {
  if (!id) return;
  try {
    const db = await getDB();
    if (!db) return;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_INVOICE_PDFS, 'readwrite');
      const store = tx.objectStore(STORE_INVOICE_PDFS);
      const record = {
        id,
        pdfUrl: pdfUrl || '',
        pdfName: pdfName || '',
        updatedAt: new Date().toISOString()
      };
      const req = store.put(record);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => {
        console.warn('Error saving PDF to IndexedDB:', e.target.error);
        resolve(false);
      };
    });
  } catch (err) {
    console.warn('IndexedDB saveInvoicePdf exception:', err);
  }
};

/**
 * Obtiene el PDF de una factura por ID desde IndexedDB.
 */
export const getInvoicePdf = async (id) => {
  if (!id) return null;
  try {
    const db = await getDB();
    if (!db) return null;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_INVOICE_PDFS, 'readonly');
      const store = tx.objectStore(STORE_INVOICE_PDFS);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('IndexedDB getInvoicePdf exception:', err);
    return null;
  }
};

/**
 * Obtiene todos los PDFs de facturas guardados en IndexedDB como un Map { [id]: { pdfUrl, pdfName } }.
 */
export const getAllInvoicePdfsMap = async () => {
  try {
    const db = await getDB();
    if (!db) return {};

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_INVOICE_PDFS, 'readonly');
      const store = tx.objectStore(STORE_INVOICE_PDFS);
      const req = store.getAll();
      req.onsuccess = () => {
        const results = req.result || [];
        const map = {};
        results.forEach(item => {
          if (item && item.id && item.pdfUrl) {
            map[item.id] = { pdfUrl: item.pdfUrl, pdfName: item.pdfName };
          }
        });
        resolve(map);
      };
      req.onerror = () => resolve({});
    });
  } catch (err) {
    console.warn('IndexedDB getAllInvoicePdfsMap exception:', err);
    return {};
  }
};

/**
 * Elimina el PDF de una factura en IndexedDB.
 */
export const deleteInvoicePdf = async (id) => {
  if (!id) return;
  try {
    const db = await getDB();
    if (!db) return;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_INVOICE_PDFS, 'readwrite');
      const store = tx.objectStore(STORE_INVOICE_PDFS);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('IndexedDB deleteInvoicePdf exception:', err);
  }
};
