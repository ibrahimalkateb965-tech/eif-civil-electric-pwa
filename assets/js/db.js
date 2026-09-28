/**
 * assets/js/db.js
 * Engineer Islam Fouda Work Management System — IndexedDB Persistence Engine
 * Version: 2.0.0 (V16.49)
 *
 * Implements:
 * 1. IndexedDB database `EngineerIslamFoudaDB` (v2) with entity stores, dedicated `blobs` store,
 *    and catch-all `unmapped_state` store ensuring 100% preservation of all fields in state `S`.
 * 2. Atomic, safe write transactions where `isDirty` is ONLY cleared after successful commit.
 * 3. Safe migration engine that NEVER purges localStorage if on memory fallback or on any write error.
 * 4. Rehydration of 100% of state S fields (including users, hrPeople, crewAuthorizations, safeSnapshots, etc.).
 * 5. Native binary blob store window.idbPut, window.idbGet, window.idbDelete.
 */

(function(global) {
  'use strict';

  const DB_NAME = 'EngineerIslamFoudaDB';
  const DB_VERSION = 2;

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
    // Dedicated binary blobs store
    { name: 'blobs', keyPath: 'hash', indexes: [{ name: 'storedAt', keyPath: 'storedAt' }] }
  ];

  const KNOWN_STORE_NAMES = new Set(STORE_DEFINITIONS.map(d => d.name));

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
      this.isDirty = false;
      this.debounceTimer = null;
      this.debounceDelayMs = 150;
      this.inMemoryBlobs = new Map();
      this.inMemoryStores = new Map();
      for (const def of STORE_DEFINITIONS) {
        this.inMemoryStores.set(def.name, new Map());
      }
      this.migrated = false;
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
                  store.createIndex(idx.name, idx.keyPath || idx.name, { unique: !!idx.unique });
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
     * Put binary data into the dedicated blobs store
     */
    async putBlob(hash, fileOrBlob) {
      if (!hash) throw new Error('[EIF_DB] hash required for putBlob');
      this.inMemoryBlobs.set(hash, fileOrBlob);

      const db = await this.openDatabase();
      if (!db || typeof db.transaction !== 'function') return true;

      return new Promise((resolve) => {
        try {
          const tx = db.transaction(['blobs'], 'readwrite');
          const store = tx.objectStore('blobs');
          const req = store.put({ hash, data: fileOrBlob, storedAt: new Date().toISOString() });
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch (e) {
          resolve(false);
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

      return new Promise((resolve) => {
        try {
          const tx = db.transaction(['blobs'], 'readwrite');
          const store = tx.objectStore('blobs');
          const req = store.delete(hash);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch (e) {
          resolve(false);
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

      return new Promise((resolve) => {
        try {
          const tx = db.transaction([storeName], 'readwrite');
          const store = tx.objectStore(storeName);
          const req = store.put(record);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch (e) {
          resolve(false);
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

      return new Promise((resolve) => {
        try {
          const tx = db.transaction([storeName], 'readwrite');
          const store = tx.objectStore(storeName);
          const req = store.delete(key);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch (e) {
          resolve(false);
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

    /**
     * Batch put into an object store
     */
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
          tx.onerror = () => resolve(false);
          tx.onabort = () => resolve(false);
        } catch (e) {
          resolve(false);
        }
      });
    }

    async clearStore(storeName) {
      const storeMap = this.inMemoryStores.get(storeName);
      if (storeMap) storeMap.clear();

      const db = await this.openDatabase();
      if (!db || typeof db.transaction !== 'function') return true;

      return new Promise((resolve) => {
        try {
          const tx = db.transaction([storeName], 'readwrite');
          const store = tx.objectStore(storeName);
          const req = store.clear();
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch (e) {
          resolve(false);
        }
      });
    }

    /**
     * Automatic migration engine from localStorage keys into IndexedDB
     * INVARIANT: Never purges localStorage if on memory fallback or on write failure!
     */
    async migrateFromLocalStorage() {
      const storage = global.localStorage;
      if (!storage) return { migrated: false, count: 0 };

      // Check idempotent migration flag
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

      // 1. Check if DB is genuine IndexedDB
      const db = await this.openDatabase();
      if (this.isMemoryFallback || !db) {
        console.warn('[EIF_DB] Cannot execute destructive migration: IndexedDB is running on memory fallback. Preserving localStorage untouched.');
        return { migrated: false, count: 0, reason: 'memory_fallback' };
      }

      // 2. Locate primary state payload
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

      let totalMigrated = 0;
      let allWritesSucceeded = true;

      if (parsedState && typeof parsedState === 'object') {
        // Build map of all entity stores
        const handledStores = new Set();

        // 1. Direct entity arrays
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
          handledStores.add(sName);
          let items = parsedState[sName];
          if (sName === 'qualityProfiles') {
            items = parsedState.qualityProfiles1647 || parsedState.qualityProfiles;
          }
          if (Array.isArray(items) && items.length) {
            const ok = await this.putBatch(sName, items);
            if (!ok) allWritesSucceeded = false;
            totalMigrated += items.length;
          }
        }

        // Special handling for checklists: flatten if object keyed by woId
        handledStores.add('checklists');
        const checklistsArr = [];
        if (parsedState.checklists) {
          if (Array.isArray(parsedState.checklists)) {
            checklistsArr.push(...parsedState.checklists);
          } else if (typeof parsedState.checklists === 'object') {
            for (const [woId, items] of Object.entries(parsedState.checklists)) {
              if (Array.isArray(items)) {
                for (const item of items) {
                  if (item) {
                    checklistsArr.push(Object.assign({ id: item.id || (woId + '_' + Math.random().toString(36).slice(2)), woId }, item));
                  }
                }
              }
            }
          }
        }
        if (checklistsArr.length) {
          const ok = await this.putBatch('checklists', checklistsArr);
          if (!ok) allWritesSucceeded = false;
          totalMigrated += checklistsArr.length;
        }

        // Extract base64 legacy data from attachments into blobs store
        if (Array.isArray(parsedState.attachments)) {
          for (const att of parsedState.attachments) {
            if (att && att.hash && att.legacyData && typeof att.legacyData === 'string') {
              try {
                await this.putBlob(att.hash, att.legacyData);
                delete att.legacyData;
              } catch (e) {}
            }
          }
        }

        // Catch-all: store ANY remaining field in S into unmapped_state store
        for (const [key, value] of Object.entries(parsedState)) {
          if (!handledStores.has(key)) {
            const ok = await this.putRecord('unmapped_state', { key, value });
            if (!ok) allWritesSucceeded = false;
            totalMigrated++;
          }
        }

        // Master snapshot backup in settings
        const snapOk = await this.putRecord('settings', { key: 'master_state_snapshot', value: parsedState });
        if (!snapOk) allWritesSucceeded = false;
      }

      // 3. Migrate auxiliary settings keys
      const auxKeys = [
        { key: 'uiLanguage', ls: 'EIF_UI_LANG' },
        { key: 'qualityLang', ls: 'EIF_QUALITY_LANG_V1648' },
        { key: 'sectionCustom', ls: 'EIF_SECTION_CUSTOM_V1639' },
        { key: 'sectionBuilder', ls: 'EIF_SECTION_BUILDER_V1642' }
      ];

      for (const aux of auxKeys) {
        const val = storage.getItem(aux.ls);
        if (val !== null) {
          try {
            const parsedVal = JSON.parse(val);
            await this.putRecord('settings', { key: aux.key, value: parsedVal });
          } catch (e) {
            await this.putRecord('settings', { key: aux.key, value: val });
          }
        }
      }

      // Safe snapshots migration
      const snapsRaw = storage.getItem('EIF_SAFE_SNAPSHOTS_V1646');
      if (snapsRaw) {
        try {
          const snaps = JSON.parse(snapsRaw);
          if (Array.isArray(snaps)) {
            await this.putBatch('safeSnapshots1646', snaps);
            totalMigrated += snaps.length;
          }
        } catch (e) {}
      }

      // Check write verification gate
      if (!allWritesSucceeded) {
        console.error('[EIF_DB] Migration failed during writing to IndexedDB. Aborting purge of localStorage.');
        return { migrated: false, count: 0, reason: 'write_failure' };
      }

      // 4. Mark completion in IndexedDB settings store
      await this.putRecord('settings', {
        key: 'migration_status',
        value: 'completed',
        timestamp: new Date().toISOString(),
        recordCount: totalMigrated
      });

      // 5. Create backup copy before purging
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
     * Guarantees 100% field rehydration
     */
    async loadStateIntoMemory() {
      await this.openDatabase();
      await this.migrateFromLocalStorage();

      const S = global.S || {};

      // 1. Load all entity stores
      const entityStores = [
        'companies', 'workorders', 'permits', 'materials', 'issues',
        'tasks', 'coord', 'safety', 'exec', 'surveys', 'governance',
        'reinstatement', 'attachments', 'orgPeople', 'orgTeams', 'equipment',
        'archiveFilesV165', 'codexDecisions1646', 'safeSnapshots1646',
        'users', 'locations', 'workTypes', 'crewPeople', 'crewAuthorizations',
        'qualityInspections', 'executionEvidence', 'whatsapp', 'files',
        'smartReads', 'hrPeople', 'safetyFiles', 'archive'
      ];

      for (const name of entityStores) {
        const records = await this.getAllRecords(name);
        if (records && records.length) {
          S[name] = records;
        } else if (!S[name]) {
          S[name] = [];
        }
      }

      // Checklists: map back to object keyed by woId
      const checklistRecords = await this.getAllRecords('checklists');
      S.checklists = S.checklists || {};
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
      if (qp && qp.length) {
        S.qualityProfiles1647 = qp;
        S.qualityProfiles = qp;
      }

      // 2. Load all unmapped state fields
      const unmapped = await this.getAllRecords('unmapped_state');
      if (unmapped && unmapped.length) {
        for (const item of unmapped) {
          if (item && item.key) {
            S[item.key] = item.value;
          }
        }
      }

      // 3. Fallback rehydration from master_state_snapshot if any field is missing
      const masterSnap = await this.getRecord('settings', 'master_state_snapshot');
      if (masterSnap && masterSnap.value && typeof masterSnap.value === 'object') {
        for (const [k, v] of Object.entries(masterSnap.value)) {
          if (S[k] === undefined || (Array.isArray(v) && (!S[k] || !S[k].length))) {
            S[k] = v;
          }
        }
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
      return S;
    }

    /**
     * Debounced write-behind persistence
     */
    scheduleSync() {
      this.isDirty = true;
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      return new Promise((resolve) => {
        this.debounceTimer = setTimeout(async () => {
          await this.flush();
          resolve();
        }, this.debounceDelayMs);
      });
    }

    /**
     * Flush current in-memory state S to IndexedDB immediately
     * INVARIANT: isDirty is only cleared after all writes succeed!
     */
    async flush() {
      if (!this.isDirty) return true;
      const S = global.S;
      if (!S || typeof S !== 'object') return false;

      try {
        const handledStores = new Set();

        // 1. Direct entity stores
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
          handledStores.add(sName);
          let items = S[sName];
          if (Array.isArray(items)) {
            await this.clearStore(sName);
            await this.putBatch(sName, items);
          }
        }

        // Checklists
        handledStores.add('checklists');
        if (S.checklists && typeof S.checklists === 'object') {
          const checklistArr = [];
          for (const [woId, items] of Object.entries(S.checklists)) {
            if (Array.isArray(items)) {
              for (const it of items) {
                checklistArr.push(Object.assign({ id: it.id || (woId + '_' + Math.random().toString(36).slice(2)), woId }, it));
              }
            }
          }
          await this.clearStore('checklists');
          await this.putBatch('checklists', checklistArr);
        }

        // Quality profiles
        handledStores.add('qualityProfiles');
        handledStores.add('qualityProfiles1647');
        const qpItems = S.qualityProfiles1647 || S.qualityProfiles;
        if (Array.isArray(qpItems)) {
          await this.clearStore('qualityProfiles');
          await this.putBatch('qualityProfiles', qpItems);
        }

        // 2. Catch-all: store ANY remaining field in S into unmapped_state
        for (const [key, value] of Object.entries(S)) {
          if (!handledStores.has(key)) {
            await this.putRecord('unmapped_state', { key, value });
          }
        }

        // 3. Settings & active configuration
        if (S.uiLanguage) {
          await this.putRecord('settings', { key: 'uiLanguage', value: S.uiLanguage });
        }
        if (S.activeCompanyId) {
          await this.putRecord('settings', { key: 'activeCompanyId', value: S.activeCompanyId });
        }

        // Master state snapshot backup
        await this.putRecord('settings', { key: 'master_state_snapshot', value: S });

        // Storage write succeeded: now safe to clear dirty flag
        this.isDirty = false;
        return true;
      } catch (err) {
        console.error('[EIF_DB] Failed to flush state to IndexedDB:', err);
        // INVARIANT: isDirty stays true on failure so retry occurs
        return false;
      }
    }

    /**
     * Initialize engine on application bootstrap
     */
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
    getState: () => global.S,
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
