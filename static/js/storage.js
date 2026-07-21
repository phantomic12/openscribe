// OpenScribe — IndexedDB storage layer
// Persists documents, annotations, reading state, drafts offline.

const DB_NAME = 'openscribe';
const DB_VERSION = 1;

class OpenScribeDB {
  constructor() {
    this.db = null;
    this.ready = this._init();
  }

  async _init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('documents')) {
          const docs = db.createObjectStore('documents', { keyPath: 'id' });
          docs.createIndex('title', 'title', { unique: false });
          docs.createIndex('updated', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('annotations')) {
          const anns = db.createObjectStore('annotations', { keyPath: 'id' });
          anns.createIndex('documentId', 'documentId', { unique: false });
          anns.createIndex('pageIndex', 'pageIndex', { unique: false });
        }
        if (!db.objectStoreNames.contains('readingState')) {
          db.createObjectStore('readingState', { keyPath: 'documentId' });
        }
        if (!db.objectStoreNames.contains('drafts')) {
          const drafts = db.createObjectStore('drafts', { keyPath: 'id' });
          drafts.createIndex('type', 'type', { unique: false });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // ── Documents ────────────────────────────────────────────
  async saveDocument(doc) {
    await this.ready;
    doc.updatedAt = Date.now();
    if (!doc.createdAt) doc.createdAt = Date.now();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put(doc);
      tx.oncomplete = () => resolve(doc);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async listDocuments() {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('documents', 'readonly');
      const req = tx.objectStore('documents').getAll();
      req.onsuccess = () => resolve(req.result.sort((a,b) => b.updatedAt - a.updatedAt));
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getDocument(id) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('documents', 'readonly');
      const req = tx.objectStore('documents').get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteDocument(id) {
    await this.ready;
    const tx = this.db.transaction(['documents','annotations','readingState'], 'readwrite');
    tx.objectStore('documents').delete(id);
    // Cascade delete annotations
    const annIdx = tx.objectStore('annotations').index('documentId');
    const cursor = annIdx.openCursor(IDBKeyRange.only(id));
    cursor.onsuccess = (e) => {
      const c = e.target.result;
      if (c) { c.delete(); c.continue(); }
    };
    tx.objectStore('readingState').delete(id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // ── Annotations ──────────────────────────────────────────
  async saveAnnotation(ann) {
    await this.ready;
    if (!ann.id) ann.id = crypto.randomUUID();
    ann.createdAt = Date.now();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('annotations', 'readwrite');
      tx.objectStore('annotations').put(ann);
      tx.oncomplete = () => resolve(ann);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async getAnnotations(documentId, pageIndex = null) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('annotations', 'readonly');
      const idx = tx.objectStore('annotations').index('documentId');
      const req = idx.getAll(documentId);
      req.onsuccess = () => {
        let anns = req.result;
        if (pageIndex !== null) anns = anns.filter(a => a.pageIndex === pageIndex);
        resolve(anns);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteAnnotation(id) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('annotations', 'readwrite');
      tx.objectStore('annotations').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteAnnotationsForDocument(documentId) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('annotations', 'readwrite');
      const idx = tx.objectStore('annotations').index('documentId');
      const cursor = idx.openCursor(IDBKeyRange.only(documentId));
      cursor.onsuccess = (e) => {
        const c = e.target.result;
        if (c) { c.delete(); c.continue(); }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // ── Reading State ────────────────────────────────────────
  async getReadingState(documentId) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('readingState', 'readonly');
      const req = tx.objectStore('readingState').get(documentId);
      req.onsuccess = () => resolve(req.result || { documentId, currentPage: 0, currentWordIndex: 0, voice: null, speed: 1.0, chunkSize: 'sentence' });
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async saveReadingState(state) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('readingState', 'readwrite');
      tx.objectStore('readingState').put(state);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // ── Drafts ───────────────────────────────────────────────
  async saveDraft(draft) {
    await this.ready;
    if (!draft.id) draft.id = crypto.randomUUID();
    draft.updatedAt = Date.now();
    if (!draft.createdAt) draft.createdAt = Date.now();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put(draft);
      tx.oncomplete = () => resolve(draft);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async listDrafts(type = null) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('drafts', 'readonly');
      const req = tx.objectStore('drafts').getAll();
      req.onsuccess = () => {
        let drafts = req.result;
        if (type) drafts = drafts.filter(d => d.type === type);
        resolve(drafts.sort((a,b) => b.updatedAt - a.updatedAt));
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteDraft(id) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // ── Settings ─────────────────────────────────────────────
  async getSetting(key, defaultValue = null) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('settings', 'readonly');
      const req = tx.objectStore('settings').get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : defaultValue);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async setSetting(key, value) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // ── Export/Import .kesx ──────────────────────────────────
  async exportKesx(documentId) {
    const doc = await this.getDocument(documentId);
    if (!doc) throw new Error('Document not found');
    const pages = doc.pages || [];
    const annotations = await this.getAnnotations(documentId);
    const state = await this.getReadingState(documentId);

    // Build .kesx manifest
    const kesx = {
      manifest: {
        version: '1.0.0',
        title: doc.title,
        author: doc.author || '',
        language: doc.language || 'en',
        created: new Date(doc.createdAt).toISOString(),
        modified: new Date(doc.updatedAt).toISOString(),
        source: doc.sourceFormat ? { format: doc.sourceFormat, filename: doc.sourceFilename, page_count: pages.length } : undefined,
        tags: doc.tags || []
      },
      pages: pages.map((p, i) => ({
        index: i + 1,
        image: p.imageDataUrl || '',
        dimensions: p.dimensions || { width: 800, height: 600 },
        ocr: p.ocr || null,
        annotations: annotations.filter(a => a.pageIndex === i)
      })),
      outline: doc.outline || [],
      reading_state: state
    };
    return kesx;
  }

  async importKesx(kesxData) {
    const m = kesxData.manifest;
    const doc = {
      id: crypto.randomUUID(),
      title: m.title,
      author: m.author || '',
      language: m.language || 'en',
      sourceFormat: m.source?.format || 'kesx',
      sourceFilename: m.source?.filename || '',
      pages: (kesxData.pages || []).map(p => ({
        imageDataUrl: p.image || '',
        text: p.ocr?.blocks?.map(b => b.text).join('\n') || '',
        ocr: p.ocr || null,
        dimensions: p.dimensions || { width: 800, height: 600 }
      })),
      outline: kesxData.outline || [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await this.saveDocument(doc);

    // Restore annotations
    for (const page of (kesxData.pages || [])) {
      for (const ann of (page.annotations || [])) {
        ann.documentId = doc.id;
        ann.pageIndex = (page.index || 1) - 1;
        if (!ann.id) ann.id = crypto.randomUUID();
        await this.saveAnnotation(ann);
      }
    }
    return doc;
  }
}

// Singleton
window.OSDB = new OpenScribeDB();
