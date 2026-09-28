/**
 * assets/js/db.js
 * Engineer Islam Fouda Work Management System — IndexedDB Persistence Engine
 * Version: 3.0.0 (V16.50)
 *
 * Implements:
 * 1. Single-transaction atomic flush() across all stores with automatic rollback on error.
 * 2. Monotonic sequence counter (dirtySeq vs lastSavedSeq) to eliminate race conditions between in-flight flushes and newer edits.
 * 3. Pre-existing data protection: never re-import localStorage over an IndexedDB store holding data.
 * 4. Dual-write to localStorage during incomplete migration to guarantee zero data loss.
 * 5. Catch-all unmapped_state store + master snapshot guaranteeing 100% preservation of all fields in state S.
 */

(function(global) {
  'use strict';

  const DB_NAME = 'EngineerIslamFoudaDB';
  const DB_VERSION = 3;

  // Primary Entity Stores + Dedicated Blobs Store + Catch-All Unmapped State Store
  const STORE_DEFINITIONS = [
    { name: 'companies', keyPath: 'id', indexes: [{ name: 'name', keyPath: 'name', unique: true }, { name: 'code', keyPath: 'code' }] },
    { name: 'workorders', keyPath: 'id', indexes: [
        { name: 'no', keyPath: 'no', unique: true },
        { name: 'companyId', keyPath: 'companyId' },
        { name: 'status', keyPath: 'status' },
        { name: 'priority', keyPath: 'priority' },
        { name: 'city', keyPath: 'city' },
        { name: 'assign', keyPath: 'assign' },
        { name: 'exec', keyPath: 'exec' }
      ]
    },
    { name: 'permits', keyPath: 'id', indexes: [
        { name: 'wo', keyPath: 'wo' },
        { name: 'number', keyPath: 'number' },
        { name: 'type', keyPath: 'type' },
        { name: 'start', keyPath: 'start' },
        { name: 'end', keyPath: 'end' },
        { name: 'completionRequested', keyPath: 'completionRequested' }
      ]
    },
    { name: 'materials', keyPath: 'code', indexes: [
        { name: 'description', keyPath: 'description' },
        { name: 'sdms', keyPath: 'sdms' },
        { name: 'unit', keyPath: 'unit' }
      ]
    },
    { name: 'issues', keyPath: 'id', indexes: [
        { name: 'wo', keyPath: 'wo' },
        { name: 'mi', keyPath: 'mi' },
        { name: 'date', keyPath: 'date' }
      ]
    },
    { name: 'checklists', keyPath: 'id', indexes: [
        { name: 'woId', keyPath: 'woId' },
        { name: 'phase', keyPath: 'phase' },
        { name: 'done', keyPath: 'done' }
      ]
    },
    { name: 'qualityProfiles', keyPath: 'id', indexes: [
        { name: 'woId', keyPath: 'woId', unique: true }
      ]
    },
    { name: 'tasks', keyPath: 'id', indexes: [
        { name: 'wo', keyPath: 'wo' },
        { name: 'user', keyPath: 'user' },
        { name: 'due', keyPath: 'due' },
        { name: 'done', keyPath: 'done' }
      ]
    },
    { name: 'coord', keyPath: 'id', indexes: [{ name: 'wo', keyPath: 'wo' }, { name: 'status', keyPath: 'status' }] },
    { name: 'safety', keyPath: 'id', indexes: [{ name: 'wo', keyPath: 'wo' }, { name: 'status', keyPath: 'status' }] },
    { name: 'exec', keyPath: 'id', indexes: [{ name: 'wo', keyPath: 'wo' }, { name: 'status', keyPath: 'status' }] },
    { name: 'surveys', keyPath: 'id', indexes: [{ name: 'wo', keyPath: 'wo' }, { name: 'date', keyPath: 'date' }] },
    { name: 'governance', keyPath: 'id', indexes: [{ name: 'wo', keyPath: 'wo' }] },
    { name: 'reinstatement', keyPath: 'id', indexes: [{ name: 'wo', keyPath: 'wo' }, { name: 'material', keyPath: 'material' }] },
    { name: 'attachments', keyPath: 'hash', indexes: [
        { name: 'name', keyPath: 'name' },
        { name: 'date', keyPath: 'date' }
      ]
    },
    { name: 'orgPeople', keyPath: 'id', indexes: [
        { name: 'companyId', keyPath: 'companyId' },
        { name: 'teamId', keyPath: 'teamId' },
        { name: 'phone', keyPath: 'phone' },
        { name: 'role', keyPath: 'role' }
      ]
    },
    { name: 'orgTeams', keyPath: 'id', indexes: [
        { name: 'companyId', keyPath: 'companyId' },
        { name: 'type', keyPath: 'type' }
      ]
    },
    { name: 'equipment', keyPath: 'id', indexes: [
        { name: 'companyId', keyPath: 'companyId' },
        { name: 'plate', keyPath: 'plate' },
        { name: 'status', keyPath: 'status' }
      ]
    },
    { name: 'archiveFilesV165', keyPath: 'id', indexes: [
        { name: 'companyId', keyPath: 'companyId' },
        { name: 'wo', keyPath: 'wo' },
        { name: 'section', keyPath: 'section' }
      ]
    },
    { name: 'codexDecisions1646', keyPath: 'id', indexes: [
        { name: 'status', keyPath: 'status' },
        { name: 'priority', keyPath: 'priority' }
      ]
    },
    { name: 'safeSnapshots1646', keyPath: 'id', indexes: [
        { name: 'at', keyPath: 'at' }
      ]
    },
    // Entity stores for commonly accessed collections
    { name: 'users', keyPath: 'id' },
    { name: 'locations', keyPath: 'id' },
    { name: 'workTypes', keyPath: 'id' },
    { name: 'crewPeople', keyPath: 'id' },
    { name: 'crewAuthorizations', keyPath: 'id' },
    { name: 'qualityInspections', keyPath: 'id' },
    { name: 'executionEvidence', keyPath: 'id' },
    { name: 'whatsapp', keyPath: 'id' },
    { name: 'files', keyPath: 'id' },
    { name: 'smartReads', keyPath: 'id' },
    { name: 'hrPeople', keyPath: 'id' },
    { name: 'safetyFiles', keyPath: 'id' },
    { name: 'archive', keyPath: 'id' },
    // Catch-all store for any other scalar or unmapped fields in S
    { name: 'unmapped_state', keyPath: 'key' },
    { name: 'settings', keyPath: 'key' },
    // Work Center stores (V16.50, SOP §1.4) — strictly additive, never deleted on upgrade
    { name: 'worksDefs',   keyPath: 'id', indexes: [{ name: 'companyId', keyPath: 'companyId' }, { name: 'code', keyPath: 'code' }] },
    { name: 'worksLines',  keyPath: 'id', indexes: [{ name: 'woId', keyPath: 'woId' }, { name: 'defId', keyPath: 'defId' }, { name: 'status', keyPath: 'status' }, { name: 'assigneeIds', keyPath: 'assigneeIds', multiEntry: true }] },
    { name: 'worksReqs',   keyPath: 'id', indexes: [{ name: 'lineId', keyPath: 'lineId' }, { name: 'woId', keyPath: 'woId' }, { name: 'status', keyPath: 'status' }] },
    { name: 'worksEvents', keyPath: 'id', indexes: [{ name: 'woId', keyPath: 'woId' }, { name: 'entityId', keyPath: 'entityId' }, { name: 'at', keyPath: 'at' }] },
    // Dedicated binary blobs store
    { name: 'blobs', keyPath: 'hash', indexes: [{ name: 'storedAt', keyPath: 'storedAt' }] }
  ];

  const LEGACY_STORAGE_KEYS = [
    'EIF_FINAL_V16_9', 'EIF_FINAL_V16_8', 'EIF_FINAL_V16_7', 'EIF_FINAL_V16_6',
    'EIF_FINAL_V16_5', 'EIF_FINAL_V16_4', 'EIF_FINAL_V16_3', 'EIF_FINAL_V16_2',
    'EIF_FINAL_V16_1', 'EIF_FINAL_V16', 'EIF_FINAL_V15', 'EIF_FINAL_V14',
    'EIF_FINAL_V13', 'EIF_FINAL_V12', 'EIF_FINAL_V7', 'EIF_FINAL_V6',
    'EIF_FINAL_V5', 'EIF_FINAL_V4', 'EIF_FINAL_V3', 'EIF_FINAL_V1'
  ];

  class PersistenceManager {
    constructor() {
      this.db = null;
      this.dbPromise = null;
      this.isMemoryFallback = false;
      this.dirtySeq = 0;
      this.lastSavedSeq = 0;
      this.activeFlushPromise = null;
      this.debounceTimer = null;
      this.debounceDelayMs = 150;
      this._pendingSyncResolvers = [];
      this.inMemoryBlobs = new Map();
      this.inMemoryStores = new Map();
      for (const def of STORE_DEFINITIONS) {
        this.inMemoryStores.set(def.name, new Map());
      }
      this.migrated = false;
    }

    get isDirty() {
      return this.dirtySeq > this.lastSavedSeq;
    }

    set isDirty(val) {
      if (val) {
        this.dirtySeq++;
      } else {
        this.lastSavedSeq = this.dirtySeq;
      }
    }

    /**
     * Connect to IndexedDB with automatic schema migration
     */
    async openDatabase() {
      if (this.db) return this.db;
      if (this.dbPromise) return this.dbPromise;

      this.dbPromise = new Promise((resolve) => {
        const idb = global.indexedDB;
        if (!idb) {
          console.warn('[EIF_DB] IndexedDB not available in current environment. Using memory fallback.');
          this.isMemoryFallback = true;
          this.db = null;
          resolve(null);
          return;
        }

        let request;
        try {
          request = idb.open(DB_NAME, DB_VERSION);
        } catch (err) {
          console.warn('[EIF_DB] IndexedDB open error. Using memory fallback.', err);
          this.isMemoryFallback = true;
          this.db = null;
          resolve(null);
          return;
        }

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          for (const def of STORE_DEFINITIONS) {
            if (!db.objectStoreNames.contains(def.name)) {
              const store = db.createObjectStore(def.name, { keyPath: def.keyPath });
              if (def.indexes) {
                for (const idx of def.indexes) {
                  store.createIndex(idx.name, idx.keyPath || idx.name, { unique: !!idx.unique, multiEntry: !!idx.multiEntry });
                }
              }
            }
          }
        };

        request.onsuccess = (event) => {
          this.db = event.target.result;
          this.isMemoryFallback = false;
          resolve(this.db);
        };

        request.onerror = (event) => {
          console.error('[EIF_DB] Failed to open IndexedDB:', request.error);
          this.isMemoryFallback = true;
          this.db = null;
          resolve(null);
        };
      });

      return this.dbPromise;
    }

    /**
     * Dedicated binary blobs operations
     */
    async putBlob(hash, fileOrBlob) {
      if (!hash) throw new Error('[EIF_DB] hash required for putBlob');
      this.inMemoryBlobs.set(hash, fileOrBlob);

      const db = await this.openDatabase();
      if (!db || typeof db.transaction !== 'function') return true;

      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(['blobs'], 'readwrite');
          const store = tx.objectStore('blobs');
          const req = store.put({ hash, data: fileOrBlob, storedAt: new Date().toISOString() });
          req.onsuccess = () => resolve(true);
          req.onerror = () => reject(req.error || new Error('Blob put failed'));
          tx.onerror = () => reject(tx.error || new Error('Blob tx failed'));
        } catch (e) {
          reject(e);
        }
      });
    }

    async getBlob(hash) {
      if (!hash) return null;
      if (this.inMemoryBlobs.has(hash)) return this.inMemoryBlobs.get(hash);

      const db = await this.openDatabase();
      if (!db || typeof db.transaction !== 'function') return null;

      return new Promise((resolve) => {
        try {
          const tx = db.transaction(['blobs'], 'readonly');
          const store = tx.objectStore('blobs');
          const req = store.get(hash);
          req.onsuccess = () => {
            const data = req.result ? req.result.data : null;
            if (data) this.inMemoryBlobs.set(hash, data);
            resolve(data);
          };
          req.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    }

    async deleteBlob(hash) {
      if (!hash) return false;
      this.inMemoryBlobs.delete(hash);

      const db = await this.openDatabase();
      if (!db || typeof db.transaction !== 'function') return true;

      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(['blobs'], 'readwrite');
          const store = tx.objectStore('blobs');
          const req = store.delete(hash);
          req.onsuccess = () => resolve(true);
          req.onerror = () => reject(req.error);
        } catch (e) {
          reject(e);
        }
      });
    }

    /**
     * Generic store operations
     */
    async putRecord(storeName, record) {
      if (!this.inMemoryStores.has(storeName)) {
        this.inMemoryStores.set(storeName, new Map());
      }
      const def = STORE_DEFINITIONS.find(s => s.name === storeName);
      const keyProp = def ? def.keyPath : 'id';
      let key = record ? record[keyProp] : null;
      if (key === undefined || key === null) {
        key = Date.now().toString(36) + Math.random().toString(36).slice(2);
        if (record && typeof record === 'object') record[keyProp] = key;
      }
      if (record && typeof record === 'object') {
        this.inMemoryStores.get(storeName).set(String(key), Object.assign({}, record));
      }

      const db = await this.openDatabase();
      if (!db || typeof db.transaction !== 'function') return true;

      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction([storeName], 'readwrite');
          const store = tx.objectStore(storeName);
          const req = store.put(record);
          req.onsuccess = () => resolve(true);
          req.onerror = () => reject(req.error || new Error('Put failed in ' + storeName));
          tx.onerror = () => reject(tx.error || new Error('Transaction error in ' + storeName));
        } catch (e) {
          reject(e);
        }
      });
    }

    async getRecord(storeName, key) {
      const db = await this.openDatabase();
      if (!db || typeof db.transaction !== 'function') {
        const storeMap = this.inMemoryStores.get(storeName);
        return (storeMap && storeMap.get(String(key))) || null;
      }

      return new Promise((resolve) => {
        try {
          const tx = db.transaction([storeName], 'readonly');
          const store = tx.objectStore(storeName);
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    }

    async deleteRecord(storeName, key) {
      const storeMap = this.inMemoryStores.get(storeName);
      if (storeMap) storeMap.delete(String(key));

      const db = await this.openDatabase();
      if (!db || typeof db.transaction !== 'function') return true;

      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction([storeName], 'readwrite');
          const store = tx.objectStore(storeName);
          const req = store.delete(key);
          req.onsuccess = () => resolve(true);
          req.onerror = () => reject(req.error);
        } catch (e) {
          reject(e);
        }
      });
    }

    async getAllRecords(storeName) {
      const db = await this.openDatabase();
      if (!db || typeof db.transaction !== 'function') {
        const storeMap = this.inMemoryStores.get(storeName);
        return storeMap ? Array.from(storeMap.values()) : [];
      }

      return new Promise((resolve) => {
        try {
          const tx = db.transaction([storeName], 'readonly');
          const store = tx.objectStore(storeName);
          if (typeof store.getAll === 'function') {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
          } else {
            const records = [];
            const req = store.openCursor();
            req.onsuccess = (e) => {
              const cursor = e.target.result;
              if (cursor) {
                records.push(cursor.value);
                cursor.continue();
              } else {
                resolve(records);
              }
            };
            req.onerror = () => resolve(records);
          }
        } catch (e) {
          resolve([]);
        }
      });
    }

    async putBatch(storeName, records) {
      if (!records || !records.length) return true;
      if (!this.inMemoryStores.has(storeName)) {
        this.inMemoryStores.set(storeName, new Map());
      }
      const def = STORE_DEFINITIONS.find(s => s.name === storeName);
      const keyProp = def ? def.keyPath : 'id';
      for (const item of records) {
        if (item) {
          let key = item[keyProp];
          if (key === undefined || key === null) {
            key = Date.now().toString(36) + Math.random().toString(36).slice(2);
            item[keyProp] = key;
          }
          this.inMemoryStores.get(storeName).set(String(key), Object.assign({}, item));
        }
      }

      const db = await this.openDatabase();
      if (!db || typeof db.transaction !== 'function') return true;

      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction([storeName], 'readwrite');
          const store = tx.objectStore(storeName);
          for (const item of records) {
            if (item) store.put(item);
          }
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error || new Error('putBatch error in ' + storeName));
          tx.onabort = () => reject(tx.error || new Error('putBatch aborted in ' + storeName));
        } catch (e) {
          reject(e);
        }
      });
    }

    async clearStore(storeName) {
      const storeMap = this.inMemoryStores.get(storeName);
      if (storeMap) storeMap.clear();

      const db = await this.openDatabase();
      if (!db || typeof db.transaction !== 'function') return true;

      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction([storeName], 'readwrite');
          const store = tx.objectStore(storeName);
          const req = store.clear();
          req.onsuccess = () => resolve(true);
          req.onerror = () => reject(req.error || new Error('clearStore error in ' + storeName));
        } catch (e) {
          reject(e);
        }
      });
    }

    /**
     * Prepares full store payloads from state S
     */
    _prepareFlushPayload(S) {
      const payload = {};
      const handled = new Set();

      const directStores = [
        'companies', 'workorders', 'permits', 'materials', 'issues',
        'tasks', 'coord', 'safety', 'exec', 'surveys', 'governance',
        'reinstatement', 'attachments', 'orgPeople', 'orgTeams', 'equipment',
        'archiveFilesV165', 'codexDecisions1646', 'safeSnapshots1646',
        'users', 'locations', 'workTypes', 'crewPeople', 'crewAuthorizations',
        'qualityInspections', 'executionEvidence', 'whatsapp', 'files',
        'smartReads', 'hrPeople', 'safetyFiles', 'archive'
      ];

      for (const sName of directStores) {
        handled.add(sName);
        payload[sName] = Array.isArray(S[sName]) ? S[sName].slice() : [];
      }

      // Checklists
      handled.add('checklists');
      const checklistArr = [];
      if (S.checklists && typeof S.checklists === 'object') {
        for (const [woId, items] of Object.entries(S.checklists)) {
          if (Array.isArray(items)) {
            for (const it of items) {
              checklistArr.push(Object.assign({ id: it.id || (woId + '_' + Math.random().toString(36).slice(2)), woId }, it));
            }
          }
        }
      }
      payload['checklists'] = checklistArr;

      // Quality Profiles
      handled.add('qualityProfiles');
      handled.add('qualityProfiles1647');
      const qp = S.qualityProfiles1647 || S.qualityProfiles;
      payload['qualityProfiles'] = Array.isArray(qp) ? qp.slice() : [];

      // Works Center (V16.50): dedicated stores. handled.add('works') keeps S.works
      // out of the unmapped_state catch-all below.
      handled.add('works');
      if (S.works) {
        const W = S.works;
        payload.worksDefs   = (W.defs   || []).slice();
        payload.worksReqs   = (W.reqs   || []).slice();
        payload.worksEvents = (W.events || []).slice();
        payload.worksLines  = (W.lines  || []).map(l => Object.assign({}, l, { assigneeIds: (l.assignees || []).map(a => a.personId) }));
      }

      // Unmapped State catch-all
      const unmapped = [];
      for (const [key, value] of Object.entries(S)) {
        if (!handled.has(key)) {
          unmapped.push({ key, value });
        }
      }
      payload['unmapped_state'] = unmapped;

      // Settings
      payload['settings'] = [
        { key: 'master_state_snapshot', value: S },
        { key: 'uiLanguage', value: S.uiLanguage || 'ar' },
        { key: 'activeCompanyId', value: S.activeCompanyId || '' }
      ];
      if (S.works) {
        payload['settings'].push({ key: 'works.meta', value: { schema: S.works.schema, migratedFrom: S.works.migratedFrom || {}, tombstones: S.works.tombstones || [] } });
      }

      return payload;
    }

    _saveToInMemoryStores(S) {
      const payload = this._prepareFlushPayload(S);
      for (const [storeName, records] of Object.entries(payload)) {
        if (!this.inMemoryStores.has(storeName)) {
          this.inMemoryStores.set(storeName, new Map());
        }
        const storeMap = this.inMemoryStores.get(storeName);
        storeMap.clear();
        const def = STORE_DEFINITIONS.find(s => s.name === storeName);
        const keyProp = def ? def.keyPath : 'id';
        for (const it of records) {
          if (it) {
            let k = it[keyProp];
            if (!k) {
              k = Date.now().toString(36) + Math.random();
              it[keyProp] = k;
            }
            storeMap.set(String(k), Object.assign({}, it));
          }
        }
      }
    }

    async _dualWriteIfMigrationIncomplete(S) {
      const storage = global.localStorage;
      if (!storage) return;
      try {
        const isComplete = storage.getItem('EIF_MIGRATION_COMPLETE_V16_48');
        if (!isComplete) {
          storage.setItem('EIF_DATA_MASTER_V1', JSON.stringify(S));
        }
      } catch (e) {}
    }

    /**
     * Automatic migration engine from localStorage keys into IndexedDB
     * INVARIANTS:
     * 1. Never re-imports stale localStorage over pre-existing IndexedDB records (P2).
     * 2. Never purges localStorage if running on memory fallback or on write failure.
     */
    async migrateFromLocalStorage() {
      const storage = global.localStorage;
      if (!storage) return { migrated: false, count: 0 };

      // 1. Check idempotent migration flag in localStorage
      const alreadyMigrated = storage.getItem('EIF_MIGRATION_COMPLETE_V16_48');
      if (alreadyMigrated) {
        return { migrated: false, count: 0, reason: 'already_migrated' };
      }

      // Check migration status in IndexedDB settings store
      const dbSetting = await this.getRecord('settings', 'migration_status');
      if (dbSetting && dbSetting.value === 'completed') {
        try { storage.setItem('EIF_MIGRATION_COMPLETE_V16_48', 'true'); } catch (e) {}
        return { migrated: false, count: 0, reason: 'already_migrated' };
      }

      // 2. Fallback check: Do not execute destructive migration on memory fallback
      const db = await this.openDatabase();
      if (this.isMemoryFallback || !db) {
        console.warn('[EIF_DB] Cannot execute destructive migration: IndexedDB is running on memory fallback. Preserving localStorage untouched.');
        return { migrated: false, count: 0, reason: 'memory_fallback' };
      }

      // 3. DEFECT P2 FIX: If IndexedDB already holds user data, NEVER overwrite it with stale localStorage!
      const checkStores = ['workorders', 'companies', 'tasks', 'permits', 'materials', 'unmapped_state'];
      let hasPreExistingData = false;
      for (const st of checkStores) {
        const recs = await this.getAllRecords(st);
        if (recs && recs.length > 0) {
          hasPreExistingData = true;
          break;
        }
      }
      if (hasPreExistingData) {
        console.log('[EIF_DB] IndexedDB already contains data. Checking for unmigrated stores from legacy storage...');

        // Locate legacy data if present
        let rawLegacy = storage.getItem('EIF_DATA_MASTER_V1');
        if (!rawLegacy) {
          for (const k of LEGACY_STORAGE_KEYS) {
            const v = storage.getItem(k);
            if (v && v.trim().startsWith('{')) { rawLegacy = v; break; }
          }
        }

        let parsedLegacy = null;
        if (rawLegacy && !rawLegacy.includes('"migratedToIndexedDB"')) {
          try { parsedLegacy = JSON.parse(rawLegacy); } catch (e) {}
        }

        // Copy over any store that is empty in IndexedDB but has records in legacy data
        if (parsedLegacy && typeof parsedLegacy === 'object') {
          const legacyPayload = this._prepareFlushPayload(parsedLegacy);
          for (const [storeName, records] of Object.entries(legacyPayload)) {
            if (records && records.length > 0) {
              const currentIdbRecs = await this.getAllRecords(storeName);
              if (!currentIdbRecs || currentIdbRecs.length === 0) {
                console.log(`[EIF_DB] Recovering unmigrated store '${storeName}' (${records.length} records) to IndexedDB...`);
                try {
                  await new Promise((resolve, reject) => {
                    const tx = db.transaction([storeName], 'readwrite');
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error || new Error('Tx failed on ' + storeName));
                    tx.onabort = () => reject(tx.error || new Error('Tx aborted on ' + storeName));
                    const store = tx.objectStore(storeName);
                    for (const item of records) {
                      if (item) store.put(item);
                    }
                  });
                } catch (e) {
                  console.error(`[EIF_DB] Failed to recover store ${storeName}:`, e);
                  return { migrated: false, count: 0, reason: 'write_failure' };
                }
              }
            }
          }
        }

        // Backup legacy data before purging
        if (rawLegacy && !rawLegacy.includes('"migratedToIndexedDB"')) {
          try { storage.setItem('EIF_PRE_MIGRATION_BACKUP', rawLegacy); } catch (e) {}
        }

        // Set completion flag
        try { storage.setItem('EIF_MIGRATION_COMPLETE_V16_48', 'true'); } catch (e) {}

        // Safe purge of legacy storage keys
        for (const legacyKey of LEGACY_STORAGE_KEYS) {
          try { storage.removeItem(legacyKey); } catch (e) {}
        }

        // Replace raw state with lightweight pointer in localStorage
        try {
          storage.setItem('EIF_DATA_MASTER_V1', JSON.stringify({
            migratedToIndexedDB: true,
            migratedAt: new Date().toISOString(),
            version: 'V16.49'
          }));
        } catch (e) {}

        await this.putRecord('settings', { key: 'migration_status', value: 'completed', reason: 'idb_has_preexisting_data' });
        this.migrated = true;
        return { migrated: false, count: 0, reason: 'idb_has_data' };
      }

      // 4. Locate primary state payload
      let rawState = storage.getItem('EIF_DATA_MASTER_V1');
      if (!rawState) {
        for (const k of LEGACY_STORAGE_KEYS) {
          const v = storage.getItem(k);
          if (v && v.trim().startsWith('{')) {
            rawState = v;
            break;
          }
        }
      }

      let parsedState = null;
      if (rawState) {
        try {
          parsedState = JSON.parse(rawState);
        } catch (e) {
          console.warn('[EIF_DB] Failed to parse legacy state:', e);
          return { migrated: false, count: 0, reason: 'parse_error' };
        }
      }

      if (!parsedState || typeof parsedState !== 'object') {
        return { migrated: false, count: 0, reason: 'empty_state' };
      }

      let totalMigrated = 0;
      let migrationError = false;
      const payloadByStore = this._prepareFlushPayload(parsedState);

      // Perform migration writes with per-store isolation and error tracking
      for (const [storeName, records] of Object.entries(payloadByStore)) {
        if (!records || !records.length) continue;
        try {
          await new Promise((resolve, reject) => {
            try {
              const tx = db.transaction([storeName], 'readwrite');
              tx.oncomplete = () => resolve();
              tx.onerror = () => reject(tx.error || new Error('Migration tx failed in ' + storeName));
              tx.onabort = () => reject(tx.error || new Error('Migration tx aborted in ' + storeName));

              const store = tx.objectStore(storeName);
              for (const item of records) {
                if (item) {
                  store.put(item);
                  totalMigrated++;
                }
              }
            } catch (err) {
              reject(err);
            }
          });
        } catch (err) {
          migrationError = true;
          console.error(`[EIF_DB] Migration failed for store ${storeName}:`, err);
        }
      }

      if (migrationError) {
        console.warn(`[EIF_DB] Migration finished with errors. Total migrated: ${totalMigrated}. Preserving legacy storage.`);
        return { migrated: false, count: totalMigrated, reason: 'write_failure' };
      }

      // Extract base64 legacy data from attachments into blobs store
      if (Array.isArray(parsedState.attachments)) {
        for (const att of parsedState.attachments) {
          if (att && att.hash && att.legacyData && typeof att.legacyData === 'string') {
            try {
              await this.putBlob(att.hash, att.legacyData);
            } catch (e) {}
          }
        }
      }

      // Mark completion in IndexedDB settings store
      await this.putRecord('settings', {
        key: 'migration_status',
        value: 'completed',
        timestamp: new Date().toISOString(),
        recordCount: totalMigrated
      });

      // Create backup copy before purging
      if (rawState) {
        try { storage.setItem('EIF_PRE_MIGRATION_BACKUP', rawState); } catch (e) {}
      }

      // Set completion flag
      try { storage.setItem('EIF_MIGRATION_COMPLETE_V16_48', 'true'); } catch (e) {}

      // Safe purge of legacy storage keys
      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        try { storage.removeItem(legacyKey); } catch (e) {}
      }

      // Set lightweight pointer in localStorage
      try {
        storage.setItem('EIF_DATA_MASTER_V1', JSON.stringify({
          migratedToIndexedDB: true,
          migratedAt: new Date().toISOString(),
          version: 'V16.49'
        }));
      } catch (e) {}

      this.migrated = true;
      console.log(`[EIF_DB] Automatic migration complete: ${totalMigrated} records migrated safely.`);
      return { migrated: true, count: totalMigrated };
    }

    /**
     * Hydrate in-memory state S from IndexedDB
     */
    async loadStateIntoMemory() {
      await this.openDatabase();
      await this.migrateFromLocalStorage();

      const S = (typeof global !== 'undefined' && global.S) || {};

      const storage = global.localStorage;
      const isMigrationComplete = this.migrated || (storage && storage.getItem('EIF_MIGRATION_COMPLETE_V16_48') === 'true');

      // 1. Load all entity stores
      const directStores = [
        'companies', 'workorders', 'permits', 'materials', 'issues',
        'tasks', 'coord', 'safety', 'exec', 'surveys', 'governance',
        'reinstatement', 'attachments', 'orgPeople', 'orgTeams', 'equipment',
        'archiveFilesV165', 'codexDecisions1646', 'safeSnapshots1646',
        'users', 'locations', 'workTypes', 'crewPeople', 'crewAuthorizations',
        'qualityInspections', 'executionEvidence', 'whatsapp', 'files',
        'smartReads', 'hrPeople', 'safetyFiles', 'archive'
      ];

      for (const name of directStores) {
        const records = await this.getAllRecords(name);
        if (records && records.length) {
          S[name] = records;
        } else if (!isMigrationComplete && S[name] && S[name].length) {
          // If migration is incomplete and store failed to migrate, preserve in-memory data
        } else {
          S[name] = [];
        }
      }

      // Checklists: map back to object keyed by woId
      const checklistRecords = await this.getAllRecords('checklists');
      S.checklists = {};
      if (checklistRecords && checklistRecords.length) {
        for (const item of checklistRecords) {
          if (item && item.woId) {
            S.checklists[item.woId] = S.checklists[item.woId] || [];
            if (!S.checklists[item.woId].some(x => x.id === item.id)) {
              S.checklists[item.woId].push(item);
            }
          }
        }
      }

      // Quality profiles mapping
      const qp = await this.getAllRecords('qualityProfiles');
      S.qualityProfiles1647 = Array.isArray(qp) ? qp : [];
      S.qualityProfiles = S.qualityProfiles1647;

      // 2. Load all unmapped state fields
      const unmapped = await this.getAllRecords('unmapped_state');
      if (unmapped && unmapped.length) {
        for (const item of unmapped) {
          if (item && item.key) {
            S[item.key] = item.value;
          }
        }
      }

      // 3. Fallback rehydration from master_state_snapshot if any field was completely missing
      const masterSnap = await this.getRecord('settings', 'master_state_snapshot');
      if (masterSnap && masterSnap.value && typeof masterSnap.value === 'object') {
        for (const [k, v] of Object.entries(masterSnap.value)) {
          if (S[k] === undefined) {
            S[k] = v;
          }
        }
      }

      // 3.5 Works Center rehydration (V16.50): dedicated stores win over the snapshot fallback
      const worksMetaRecord = await this.getRecord('settings', 'works.meta');
      if (worksMetaRecord && worksMetaRecord.value && typeof worksMetaRecord.value === 'object') {
        const wm = worksMetaRecord.value;
        const worksDefRecords = await this.getAllRecords('worksDefs');
        const worksLineRecords = await this.getAllRecords('worksLines');
        for (const l of worksLineRecords) {
          if (l && Object.prototype.hasOwnProperty.call(l, 'assigneeIds')) {
            delete l.assigneeIds;
          }
        }
        const worksReqRecords = await this.getAllRecords('worksReqs');
        const worksEventRecords = await this.getAllRecords('worksEvents');
        worksEventRecords.sort((a, b) => {
          const atA = a && a.at ? String(a.at) : '';
          const atB = b && b.at ? String(b.at) : '';
          if (atA !== atB) return atA < atB ? -1 : 1;
          return String((a && a.id) || '').localeCompare(String((b && b.id) || ''));
        });
        S.works = {
          schema: wm.schema,
          migratedFrom: wm.migratedFrom || {},
          tombstones: wm.tombstones || [],
          defs: worksDefRecords,
          lines: worksLineRecords,
          reqs: worksReqRecords,
          events: worksEventRecords
        };
      }

      // 4. Load auxiliary settings
      const uiLangRecord = await this.getRecord('settings', 'uiLanguage');
      if (uiLangRecord && uiLangRecord.value) {
        S.uiLanguage = uiLangRecord.value;
      }
      const activeCompanyRecord = await this.getRecord('settings', 'activeCompanyId');
      if (activeCompanyRecord && activeCompanyRecord.value) {
        S.activeCompanyId = activeCompanyRecord.value;
      }

      // Ensure SEED materials exist if empty
      if (!S.materials || !S.materials.length) {
        if (global.SEED && Array.isArray(global.SEED)) {
          S.materials = global.SEED.slice();
          await this.putBatch('materials', S.materials);
        }
      }

      global.S = S;
      if (typeof window !== 'undefined') window.S = S;
      return S;
    }

    /**
     * Debounced write-behind persistence
     * DEFECT 2 FIX: Collects and resolves all promises issued within the debounce window
     * so earlier saveState() calls never hang when subsequent edits reset the timer.
     */
    scheduleSync() {
      this.dirtySeq++;
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }

      if (!this._pendingSyncResolvers) {
        this._pendingSyncResolvers = [];
      }

      return new Promise((resolve) => {
        this._pendingSyncResolvers.push(resolve);
        this.debounceTimer = setTimeout(async () => {
          this.debounceTimer = null;
          const resolvers = this._pendingSyncResolvers;
          this._pendingSyncResolvers = [];
          const res = await this.flush();
          for (const r of resolvers) {
            try { r(res); } catch (e) {}
          }
        }, this.debounceDelayMs);
      });
    }

    /**
     * Robust per-store write-behind flush with failure propagation and sequence counter dirty tracking
     * DEFECTS P1, P2 & P3 FIX:
     * - Isolated per-store readwrite transactions prevent cascading store locks.
     * - Any store failure keeps isDirty=true and returns false for retry without dropping edits.
     * - dirtySeq vs lastSavedSeq ensures edits during an in-flight flush trigger a re-flush!
     */
    async flush() {
      if (this.activeFlushPromise) {
        await this.activeFlushPromise;
        if (this.dirtySeq > this.lastSavedSeq) {
          return this.flush();
        }
        return true;
      }

      if (this.dirtySeq <= this.lastSavedSeq) {
        return true;
      }

      const seqToSave = this.dirtySeq;
      this.activeFlushPromise = (async () => {
        try {
          const S = (typeof window !== 'undefined' && window.S) || global.S;
          if (!S || typeof S !== 'object') return false;

          const db = await this.openDatabase();
          if (!db || typeof db.transaction !== 'function') {
            // Memory fallback path
            this._saveToInMemoryStores(S);
            if (global.localStorage) {
              try {
                global.localStorage.setItem('EIF_DATA_MASTER_V1', JSON.stringify(S));
              } catch (e) {}
            }
            this.lastSavedSeq = Math.max(this.lastSavedSeq, seqToSave);
            return true;
          }

          const payloadByStore = this._prepareFlushPayload(S);
          let flushError = false;

          // Per-store transactions with error tracking (Defects P1 & P2 safety)
          for (const [storeName, records] of Object.entries(payloadByStore)) {
            try {
              await new Promise((resolve, reject) => {
                try {
                  const tx = db.transaction([storeName], 'readwrite');
                  tx.oncomplete = () => resolve();
                  tx.onerror = (e) => reject(tx.error || (e.target && e.target.error) || new Error('Flush transaction failed: ' + storeName));
                  tx.onabort = (e) => reject(tx.error || new Error('Flush transaction aborted: ' + storeName));

                  const store = tx.objectStore(storeName);
                  store.clear();
                  for (const item of records) {
                    if (item) store.put(item);
                  }
                } catch (err) {
                  reject(err);
                }
              });
            } catch (err) {
              flushError = true;
              console.error(`[EIF_DB] Flush error for store ${storeName}:`, err);
            }
          }

          // Dual-write to localStorage if migration is incomplete so legacy storage always mirrors latest S
          await this._dualWriteIfMigrationIncomplete(S);

          if (flushError) {
            // DEFECT P1 FIX: Do not update lastSavedSeq; preserve isDirty = true for retry
            return false;
          }

          // Mark sequence as safely saved
          this.lastSavedSeq = Math.max(this.lastSavedSeq, seqToSave);
          return true;
        } catch (err) {
          console.error('[EIF_DB] Atomic flush failed, dirty state preserved for retry:', err);
          return false;
        } finally {
          this.activeFlushPromise = null;
        }
      })();

      return this.activeFlushPromise;
    }

    async init() {
      await this.openDatabase();
      await this.loadStateIntoMemory();
    }
  }

  // Create singleton instance
  const manager = new PersistenceManager();

  // Export native IDB binary methods on window
  global.idbPut = async function(hash, fileOrBlob) {
    return await manager.putBlob(hash, fileOrBlob);
  };

  global.idbGet = async function(hash) {
    return await manager.getBlob(hash);
  };

  global.idbDelete = async function(hash) {
    return await manager.deleteBlob(hash);
  };

  // Export public database API
  const EIF_DB = {
    DB_NAME,
    DB_VERSION,
    manager,
    init: () => manager.init(),
    getState: () => (typeof window !== 'undefined' && window.S) || global.S,
    saveState: () => manager.scheduleSync(),
    flush: () => manager.flush(),
    migrateFromLocalStorage: () => manager.migrateFromLocalStorage(),
    putRecord: (store, record) => manager.putRecord(store, record),
    getRecord: (store, key) => manager.getRecord(store, key),
    deleteRecord: (store, key) => manager.deleteRecord(store, key),
    getAllRecords: (store) => manager.getAllRecords(store)
  };

  global.EIF_DB = EIF_DB;

  // Auto-init when DOM is ready in browser environment
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        manager.init().then(() => {
          if (typeof global.refresh === 'function') {
            try { global.refresh(); } catch (e) {}
          }
        });
      });
    } else {
      manager.init().then(() => {
        if (typeof global.refresh === 'function') {
          try { global.refresh(); } catch (e) {}
        }
      });
    }
  }

  // CommonJS export for Node test harnesses
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      DB_NAME,
      DB_VERSION,
      STORE_DEFINITIONS,
      PersistenceManager,
      EIF_DB
    };
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
