/**
 * tests/verify_m2_runtime.js
 * End-to-End Runtime Verification Suite for Milestone M2
 * 
 * Verifies:
 * 1. F05: IndexedDB Database Schema (22 stores + blobs)
 * 2. F06: Native idbPut, idbGet, idbDelete binary storage
 * 3. F07: Reactive cache S and write-behind persistence
 * 4. F08: Multi-key save purge in app.js
 * 5. F09: Zero-loss legacy migration engine
 * 6. F10: Structured JSON backup & restore
 * 7. F11: Standalone SQLite WASM binary export & import
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createMockBrowserEnv, MockLocalStorage } = require('./harness.js');

const PROJECT_ROOT = path.resolve(__dirname, '..');

async function runM2Verification() {
  console.log('\n========================================================================');
  console.log('       MILESTONE M2 RUNTIME VERIFICATION SUITE — ENGINEER ISLAM FOUDA   ');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      passed++;
      console.log(`  ✔ [PASS] ${name}`);
    } catch (e) {
      console.error(`  ✖ [FAIL] ${name}:`, e.message);
      throw e;
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  ✔ [PASS] ${name}`);
    } catch (e) {
      console.error(`  ✖ [FAIL] ${name}:`, e.message);
      throw e;
    }
  }

  // Setup simulated browser environment using comprehensive test harness
  const env = createMockBrowserEnv();
  global.window = env;
  global.document = env.document;
  global.localStorage = env.localStorage;
  global.sessionStorage = env.sessionStorage;
  global.indexedDB = env.indexedDB;

  const { PersistenceManager, STORE_DEFINITIONS, EIF_DB } = require('../assets/js/db.js');
  const backup = require('../assets/js/backup.js');

  // --- Test Group 1: F05 IndexedDB Schema ---
  console.log('\n--- Group 1: F05 IndexedDB Schema ---');
  test('F05.1: comprehensive entity object stores + blobs store defined', () => {
    assert.ok(STORE_DEFINITIONS.length >= 23);
    const storeNames = STORE_DEFINITIONS.map(s => s.name);
    assert.ok(storeNames.includes('blobs'));
    assert.ok(storeNames.includes('companies'));
    assert.ok(storeNames.includes('workorders'));
    assert.ok(storeNames.includes('permits'));
    assert.ok(storeNames.includes('materials'));
    assert.ok(storeNames.includes('checklists'));
    assert.ok(storeNames.includes('settings'));
  });

  test('F05.2: blobs store configured with hash keyPath', () => {
    const blobs = STORE_DEFINITIONS.find(s => s.name === 'blobs');
    assert.ok(blobs);
    assert.equal(blobs.keyPath, 'hash');
  });

  // --- Test Group 2: F06 Binary Storage (idbPut / idbGet) ---
  console.log('\n--- Group 2: F06 Binary Attachment Storage ---');
  await testAsync('F06.1: idbPut stores binary data and idbGet retrieves exact bytes', async () => {
    const testHash = 'sha256_mock_hash_voucher_12345';
    const testBuffer = Buffer.from('PDF_PERMIT_VOUCHER_CONTENT_SAMPLE_DATA_ARABIC_تقرير_التصريح');
    
    await global.window.idbPut(testHash, testBuffer);
    const retrieved = await global.window.idbGet(testHash);
    
    assert.ok(retrieved, 'Should retrieve stored record');
    assert.deepEqual(retrieved, testBuffer);
  });

  await testAsync('F06.2: idbDelete removes binary blob successfully', async () => {
    const testHash = 'sha256_delete_me';
    await global.window.idbPut(testHash, Buffer.from('temp'));
    assert.ok(await global.window.idbGet(testHash));
    
    await global.window.idbDelete(testHash);
    const afterDelete = await global.window.idbGet(testHash);
    assert.equal(afterDelete, null);
  });

  // --- Test Group 3: F07 Reactive Cache & Write-Behind ---
  console.log('\n--- Group 3: F07 Reactive Cache & Write-Behind ---');
  await testAsync('F07.1: Synchronous S mutations and debounced write-behind', async () => {
    const mgr = new PersistenceManager();
    await mgr.openDatabase();

    const state = {
      companies: [{ id: 'c1', name: 'شركة الشرق للمقاولات', code: 'C-01' }],
      workorders: [{ id: 'w1', no: 'WO-2026-001', companyId: 'c1', status: 'قيد التنفيذ' }],
      permits: [],
      materials: [{ code: '908111001', description: 'CABLE 35MM2' }]
    };

    global.window.S = state;
    global.S = state;
    assert.deepEqual(global.window.S, state);

    // Trigger sync
    mgr.scheduleSync();
    assert.equal(mgr.isDirty, true);

    // Flush immediately
    await mgr.flush();
    assert.equal(mgr.isDirty, false);

    // Verify written to database
    const companies = await mgr.getAllRecords('companies');
    assert.equal(companies.length, 1);
    assert.equal(companies[0].name, 'شركة الشرق للمقاولات');
  });

  // --- Test Group 4: F08 Multi-Key Save Purge in app.js ---
  console.log('\n--- Group 4: F08 Multi-Key Save Purge Verification ---');
  test('F08.1: app.js contains zero localStorage.setItem calls with legacy EIF_FINAL_V16 keys', () => {
    const appCode = fs.readFileSync(path.join(PROJECT_ROOT, 'app.js'), 'utf8');
    const legacyKeyMatches = appCode.match(/localStorage\.setItem\s*\(\s*['"]EIF_FINAL_V16_[^'"]+['"]/g);
    assert.equal(legacyKeyMatches, null, 'No legacy key writes should remain in app.js');
  });

  test('F08.2: save() delegates to window.EIF_DB.saveState', () => {
    const appCode = fs.readFileSync(path.join(PROJECT_ROOT, 'app.js'), 'utf8');
    assert.ok(appCode.includes('if(window.EIF_DB&&typeof window.EIF_DB.saveState===\'function\'){window.EIF_DB.saveState(S);}'));
  });

  // --- Test Group 5: F09 Zero-Loss Legacy Migration Engine ---
  console.log('\n--- Group 5: F09 Zero-Loss Legacy Migration ---');
  await testAsync('F09.1: Migration detects legacy keys and imports records with zero loss', async () => {
    const migrationStorage = new MockLocalStorage();
    const legacyState = {
      companies: [
        { id: 'leg_c1', name: 'شركة المقاولات الحديثة', code: 'MOD-01' }
      ],
      workorders: [
        { id: 'leg_w1', no: 'WO-LEG-001', companyId: 'leg_c1', priority: 'عالي', status: 'جديد' }
      ],
      permits: [
        { id: 'leg_p1', wo: 'leg_w1', number: 'PERM-2026-99', type: 'emergency' }
      ],
      materials: [
        { code: '908514023', description: 'TRANSFORMER 1500KVA' }
      ]
    };

    migrationStorage.setItem('EIF_DATA_MASTER_V1', JSON.stringify(legacyState));
    migrationStorage.setItem('EIF_SECTION_CUSTOM_V1639', JSON.stringify({ 'home::0': { width: 75 } }));
    migrationStorage.setItem('EIF_UI_LANG', 'ar');

    for (const store of env.mockDb.stores.values()) {
      store.data.clear();
    }
    env.localStorage = migrationStorage;
    global.localStorage = migrationStorage;
    if (global.window) global.window.localStorage = migrationStorage;

    const mgr = new PersistenceManager();
    await mgr.openDatabase();
    
    // Clear marker to test migration
    migrationStorage.removeItem('EIF_MIGRATION_COMPLETED_V1');
    const result = await mgr.migrateFromLocalStorage();

    assert.ok(result.migrated, 'Migration should complete successfully');
    assert.ok(result.count >= 4, 'Should migrate at least 4 total records');

    const migratedCompanies = await mgr.getAllRecords('companies');
    assert.equal(migratedCompanies.length, 1);
    assert.equal(migratedCompanies[0].name, 'شركة المقاولات الحديثة');
  });

  // --- Test Group 6: F10 Structured JSON Backup & Restore ---
  console.log('\n--- Group 6: F10 Structured JSON Backup & Restore ---');
  await testAsync('F10.1: Export and Restore JSON round-trip preserves Arabic UTF-8 text and schema', async () => {
    const testState = {
      companies: [{ id: 'comp_jed', name: 'فرع شركة جدة للكهرباء', code: 'JED-01' }],
      workorders: [{ id: 'wo_jed', no: 'WO-JED-888', city: 'جدة', status: 'قيد التنفيذ' }],
      materials: [{ code: '908111002', description: 'كابل جهد متوسط 120 ملم²' }],
      permits: [],
      tasks: [],
      coord: [],
      safety: [],
      exec: [],
      issues: [],
      checklists: {},
      uiLanguage: 'ar'
    };

    const exportedJSON = await backup.exportJSON(testState);
    assert.ok(exportedJSON, 'JSON export produced string');
    
    const parsed = JSON.parse(exportedJSON);
    assert.equal(parsed.meta.system, 'EngineerIslamFouda');
    assert.equal(parsed.meta.schemaVersion, 1);
    assert.equal(parsed.meta.version, 'V16.48');
    assert.equal(parsed.data.companies[0].name, 'فرع شركة جدة للكهرباء');
    assert.equal(parsed.data.materials[0].description, 'كابل جهد متوسط 120 ملم²');

    const restoredState = await backup.importJSON(exportedJSON);
    assert.equal(restoredState.companies[0].name, 'فرع شركة جدة للكهرباء');
    assert.equal(restoredState.workorders[0].city, 'جدة');
  });

  // --- Test Group 7: F11 SQLite WASM Export & Import ---
  console.log('\n--- Group 7: F11 Standalone SQLite WASM Export & Import ---');
  await testAsync('F11.1: Export SQLite produces valid binary with SQLite format 3 header', async () => {
    const sampleState = {
      companies: [{ id: 'c_sql', name: 'شركة التمديدات السعودية', code: 'SEC-99' }],
      workorders: [{ id: 'w_sql', no: 'WO-SQL-001', companyId: 'c_sql', status: 'جديد' }],
      materials: [{ code: '908111003', description: 'CABLE CU 185MM2' }],
      attachments: [{ id: 'att_1', hash: 'hash_sample', fileName: 'permit.pdf', size: 1024, type: 'application/pdf' }]
    };

    const binary = await backup.exportSQLite(sampleState);
    assert.ok(binary instanceof Uint8Array, 'Should export Uint8Array binary');
    assert.ok(binary.length >= 100, 'SQLite binary should have header');

    // Verify SQLite magic header: "SQLite format 3\0"
    const headerStr = Buffer.from(binary.buffer, binary.byteOffset, 16).toString('utf8');
    assert.ok(headerStr.startsWith('SQLite format 3'), 'Binary must start with SQLite format 3 header');

    // Test import
    const imported = await backup.importSQLite(binary);
    assert.ok(imported.companies, 'Imported object contains companies');
    assert.equal(imported.companies[0].name, 'شركة التمديدات السعودية');
    assert.equal(imported.workorders[0].no, 'WO-SQL-001');
  });

  // --- Test Group 8: index.html Script Order ---
  console.log('\n--- Group 8: Script Injection Order in index.html ---');
  test('F05.index: index.html loads vendor sql-wasm, db.js, backup.js BEFORE app.js', () => {
    const html = fs.readFileSync(path.join(PROJECT_ROOT, 'index.html'), 'utf8');
    const sqlIdx = html.indexOf('assets/vendor/sql/sql-wasm.js');
    const dbIdx = html.indexOf('assets/js/db.js');
    const backupIdx = html.indexOf('assets/js/backup.js');
    const appIdx = html.indexOf('app.js');

    assert.ok(sqlIdx !== -1, 'sql-wasm.js must be in index.html');
    assert.ok(dbIdx !== -1, 'db.js must be in index.html');
    assert.ok(backupIdx !== -1, 'backup.js must be in index.html');
    assert.ok(appIdx !== -1, 'app.js must be in index.html');

    assert.ok(sqlIdx < appIdx, 'sql-wasm.js must load before app.js');
    assert.ok(dbIdx < appIdx, 'db.js must load before app.js');
    assert.ok(backupIdx < appIdx, 'backup.js must load before app.js');
  });

  // --- Test Group 9: Defect 1 Regression (Three-Boot Deletion Invariant) ---
  console.log('\n--- Group 9: Defect 1 Regression (Three-Boot Deletion Invariant) ---');
  await testAsync('F09.2: User-deleted records are never resurrected from localStorage on subsequent boots', async () => {
    const testLs = new MockLocalStorage();
    const legacy = {
      workorders: [{ id: 'w1', no: 'WO-1' }],
      tasks: [{ id: 't1', title: 'TASK-TO-DELETE' }],
      companies: [{ id: 'c1', name: 'شركة المقاولات' }]
    };
    testLs.setItem('EIF_DATA_MASTER_V1', JSON.stringify(legacy));

    // Boot 1: initial migration
    for (const store of env.mockDb.stores.values()) {
      store.data.clear();
    }
    env.localStorage = testLs;
    global.localStorage = testLs;
    if (global.window) global.window.localStorage = testLs;

    const pm1 = new PersistenceManager();
    await pm1.openDatabase();
    await pm1.loadStateIntoMemory();

    // Verify task is loaded
    assert.equal(global.S.tasks.length, 1);

    // Boot 2: user deletes all tasks
    global.S.tasks = [];
    pm1.isDirty = true;
    const ok = await pm1.flush();
    assert.ok(ok, 'Flush after deletion should succeed');

    const idbTasks = await pm1.getAllRecords('tasks');
    assert.equal(idbTasks.length, 0, 'Tasks in IndexedDB must be 0 after deletion');

    // Boot 3: simulate app restart reading from localStorage pointer
    const pm3 = new PersistenceManager();
    global.S = JSON.parse(testLs.getItem('EIF_DATA_MASTER_V1') || '{}');
    const loadedS = await pm3.loadStateIntoMemory();
    assert.ok(loadedS && Array.isArray(loadedS.tasks), 'loadedS.tasks should be an array');
    assert.equal(loadedS.tasks.length, 0, 'Tasks after Boot 3 must remain empty (no resurrection)');
    pm3.isDirty = true;
    await pm3.flush();
    const idbTasksBoot3 = await pm3.getAllRecords('tasks');
    assert.equal(idbTasksBoot3.length, 0, 'Tasks in IndexedDB must remain 0 after subsequent save');
  });

  // --- Test Group 10: Defect 2 Regression (Debounced Save Promises Resolution) ---
  console.log('\n--- Group 10: Defect 2 Regression (Debounced Save Promises Resolution) ---');
  await testAsync('F07.2: Multiple saveState calls inside debounce window all resolve cleanly without hanging', async () => {
    const pm = new PersistenceManager();
    await pm.openDatabase();
    pm.debounceDelayMs = 50;

    global.S = { workorders: [{ id: 'w_test_debounce', no: 'WO-DEB' }] };
    let p1Resolved = false;
    let p2Resolved = false;

    const promise1 = pm.scheduleSync().then(res => {
      p1Resolved = true;
      return res;
    });

    // Fire second call immediately within debounce delay
    const promise2 = pm.scheduleSync().then(res => {
      p2Resolved = true;
      return res;
    });

    const [res1, res2] = await Promise.all([promise1, promise2]);
    assert.ok(p1Resolved, 'First debounced promise must resolve');
    assert.ok(p2Resolved, 'Second debounced promise must resolve');
    assert.ok(res1, 'First debounced flush should report success');
    assert.ok(res2, 'Second debounced flush should report success');
    assert.equal(pm.isDirty, false, 'isDirty must be false after debounced flush');
  });

  // --- Test Group 11: Defect P4 Regression (JSON Restore Window.S Binding) ---
  console.log('\n--- Group 11: Defect P4 Regression (JSON Restore Window.S Binding) ---');
  test('F10.2: app.js restoreFile handler rebinds window.S and global.S and invokes save()', () => {
    const appJsContent = fs.readFileSync(path.join(PROJECT_ROOT, 'app.js'), 'utf8');
    const match = appJsContent.match(/function restoreFile\s*\([^)]*\)\s*\{[\s\S]*?readAsText\([^)]*\)\}/);
    assert.ok(match, 'restoreFile function must exist in app.js');

    let savedInvoked = false;
    let alertMsg = '';
    global.save = () => { savedInvoked = true; };
    global.alert = (msg) => { alertMsg = msg; };
    global.window = global.window || {};

    class MockFileReader {
      readAsText(file) {
        this.result = file.content;
        if (typeof this.onload === 'function') {
          this.onload();
        }
      }
    }
    global.FileReader = MockFileReader;

    const restoreFn = new Function('return ' + match[0])();

    // Test with structured backup payload
    const structuredBackup = {
      meta: { system: 'EngineerIslamFouda', version: 'V16.48' },
      data: {
        companies: [{ id: 'c_restored', name: 'شركة الاستعادة المعتمدة' }],
        workorders: [{ id: 'w_restored', no: 'WO-RESTORED-99' }],
        materials: []
      }
    };
    restoreFn({ content: JSON.stringify(structuredBackup) });

    assert.ok(savedInvoked, 'save() must be invoked after restore');
    assert.equal(alertMsg, 'تم استرجاع النسخة', 'Should show success alert');
    assert.ok(global.window.S && global.window.S.workorders, 'window.S must be bound with data');
    assert.ok(global.S && global.S.workorders, 'global.S must be bound with data');
    assert.equal(global.window.S.workorders[0].no, 'WO-RESTORED-99');
    assert.equal(global.S.workorders[0].no, 'WO-RESTORED-99');

    // Test with direct legacy backup payload
    savedInvoked = false;
    const directBackup = {
      companies: [{ id: 'c_direct', name: 'شركة مباشرة' }],
      workorders: [{ id: 'w_direct', no: 'WO-DIRECT-01' }],
      materials: []
    };
    restoreFn({ content: JSON.stringify(directBackup) });
    assert.ok(savedInvoked, 'save() must be invoked after legacy restore');
    assert.equal(global.window.S.workorders[0].no, 'WO-DIRECT-01');
    assert.equal(global.S.workorders[0].no, 'WO-DIRECT-01');
  });

  // --- Test Group 12: Partial Migration Recovery Invariant ---
  console.log('\n--- Group 12: Partial Migration Recovery Invariant ---');
  await testAsync('F09.3: Unmigrated store during initial failure is recovered to IndexedDB on subsequent boot without data loss', async () => {
    function makeFaultIDB(failSet) {
      const stores = new Map();
      const db = {
        objectStoreNames: { contains: n => stores.has(n) },
        createObjectStore(n, o) { const s = { kp: o.keyPath, data: new Map(), createIndex() {} }; stores.set(n, s); return s; },
        transaction(names, mode) {
          const tx = { oncomplete: null, onerror: null, onabort: null };
          const bad = names.some(n => failSet.has(n)) && mode === 'readwrite';
          const pending = [];
          tx.objectStore = n => {
            const s = stores.get(n); if (!s) throw new Error('NotFoundError ' + n);
            const req = (fn) => { const r = {}; pending.push(() => { if (bad) { r.error = 'ConstraintError'; r.onerror && r.onerror(); } else { r.result = fn(); r.onsuccess && r.onsuccess({ target: r }); } }); return r; };
            return {
              put: v => req(() => { if (!bad) s.data.set(String(v[s.kp]), structuredClone(v)); }),
              get: k => req(() => { const v = s.data.get(String(k)); return v ? structuredClone(v) : undefined; }),
              getAll: () => req(() => [...s.data.values()].map(v => structuredClone(v))),
              delete: k => req(() => s.data.delete(String(k))),
              clear: () => req(() => s.data.clear()),
            };
          };
          setTimeout(() => { pending.forEach(f => f()); if (bad) tx.onabort && tx.onabort(); else tx.oncomplete && tx.oncomplete(); }, 0);
          return tx;
        },
        _stores: stores,
      };
      return {
        db,
        factory: { open() { const r = {}; setTimeout(() => { r.result = db; r.onupgradeneeded && r.onupgradeneeded({ target: r }); r.onsuccess && r.onsuccess({ target: r }); }, 0); return r; } },
      };
    }

    const legacy = {
      workorders: [{ id: 'w1', no: 'WO-1' }],
      tasks: [{ id: 't1', title: 'Task A' }],
      equipment: [{ id: 'e1', name: 'Excavator CAT 320' }]
    };
    const ls = new MockLocalStorage();
    ls.setItem('EIF_DATA_MASTER_V1', JSON.stringify(legacy));
    const failSet = new Set(['equipment']);
    const faultIdb = makeFaultIDB(failSet);

    const oldIDB = global.indexedDB;
    const oldLS = global.localStorage;
    global.indexedDB = faultIdb.factory;
    global.localStorage = ls;
    if (global.window) {
      global.window.indexedDB = faultIdb.factory;
      global.window.localStorage = ls;
    }

    delete require.cache[require.resolve('../assets/js/db.js')];
    let { PersistenceManager: PM } = require('../assets/js/db.js');

    // Boot 1: migration fails on equipment
    let pm1 = new PM();
    global.S = JSON.parse(ls.getItem('EIF_DATA_MASTER_V1'));
    if (global.window) global.window.S = global.S;
    await pm1.loadStateIntoMemory();
    assert.equal(global.S.equipment.length, 1, 'Equipment should remain in S during boot 1');

    // In-flight user edit and debounced save
    global.S.tasks[0].title = 'Task A Edited';
    pm1.isDirty = true;
    pm1.dirtySeq++;
    await pm1.flush();

    // Transient failure clears
    failSet.clear();

    // Boot 2: app restarts, IndexedDB has data, but equipment is empty in IDB.
    // The system must detect unmigrated equipment and recover it into IndexedDB.
    delete require.cache[require.resolve('../assets/js/db.js')];
    ({ PersistenceManager: PM } = require('../assets/js/db.js'));
    let pm2 = new PM();
    global.S = JSON.parse(ls.getItem('EIF_DATA_MASTER_V1'));
    if (global.window) global.window.S = global.S;
    await pm2.loadStateIntoMemory();

    assert.equal(global.S.equipment.length, 1, 'Equipment must be preserved across boot 2');
    assert.equal(global.S.equipment[0].name, 'Excavator CAT 320', 'Equipment data must be intact');
    const idbEquip = faultIdb.db._stores.get('equipment').data.get('e1');
    assert.ok(idbEquip, 'Equipment must be recovered into IndexedDB store');
    assert.equal(idbEquip.name, 'Excavator CAT 320');

    // Clean up
    global.indexedDB = oldIDB;
    global.localStorage = oldLS;
    if (global.window) {
      global.window.indexedDB = oldIDB;
      global.window.localStorage = oldLS;
    }
  });

  // --- Test Group 13: Partial Migration Recovery Before Flush ---
  console.log('\n--- Group 13: Partial Migration Recovery Before Flush ---');
  await testAsync('F09.4: When transient failure clears before flush, unmigrated store is safely captured and recovered', async () => {
    function makeFaultIDB(failSet) {
      const stores = new Map();
      const db = {
        objectStoreNames: { contains: n => stores.has(n) },
        createObjectStore(n, o) { const s = { kp: o.keyPath, data: new Map(), createIndex() {} }; stores.set(n, s); return s; },
        transaction(names, mode) {
          const tx = { oncomplete: null, onerror: null, onabort: null };
          const bad = names.some(n => failSet.has(n)) && mode === 'readwrite';
          const pending = [];
          tx.objectStore = n => {
            const s = stores.get(n); if (!s) throw new Error('NotFoundError ' + n);
            const req = (fn) => { const r = {}; pending.push(() => { if (bad) { r.error = 'ConstraintError'; r.onerror && r.onerror(); } else { r.result = fn(); r.onsuccess && r.onsuccess({ target: r }); } }); return r; };
            return {
              put: v => req(() => { if (!bad) s.data.set(String(v[s.kp]), structuredClone(v)); }),
              get: k => req(() => { const v = s.data.get(String(k)); return v ? structuredClone(v) : undefined; }),
              getAll: () => req(() => [...s.data.values()].map(v => structuredClone(v))),
              delete: k => req(() => s.data.delete(String(k))),
              clear: () => req(() => s.data.clear()),
            };
          };
          setTimeout(() => { pending.forEach(f => f()); if (bad) tx.onabort && tx.onabort(); else tx.oncomplete && tx.oncomplete(); }, 0);
          return tx;
        },
        _stores: stores,
      };
      return {
        db,
        factory: { open() { const r = {}; setTimeout(() => { r.result = db; r.onupgradeneeded && r.onupgradeneeded({ target: r }); r.onsuccess && r.onsuccess({ target: r }); }, 0); return r; } },
      };
    }

    const legacy = {
      workorders: [{ id: 'w1', no: 'WO-1' }],
      tasks: [{ id: 't1', title: 'Task B' }],
      equipment: [{ id: 'e2', name: 'Bulldozer D8R' }]
    };
    const ls = new MockLocalStorage();
    ls.setItem('EIF_DATA_MASTER_V1', JSON.stringify(legacy));
    const failSet = new Set(['equipment']);
    const faultIdb = makeFaultIDB(failSet);

    const oldIDB = global.indexedDB;
    const oldLS = global.localStorage;
    global.indexedDB = faultIdb.factory;
    global.localStorage = ls;
    if (global.window) {
      global.window.indexedDB = faultIdb.factory;
      global.window.localStorage = ls;
    }

    delete require.cache[require.resolve('../assets/js/db.js')];
    let { PersistenceManager: PM } = require('../assets/js/db.js');

    // Boot 1
    let pm1 = new PM();
    global.S = JSON.parse(ls.getItem('EIF_DATA_MASTER_V1'));
    if (global.window) global.window.S = global.S;
    await pm1.loadStateIntoMemory();
    assert.equal(global.S.equipment.length, 1);

    // Failure clears before flush
    failSet.clear();
    global.S.tasks[0].title = 'Task B Edited';
    pm1.isDirty = true;
    pm1.dirtySeq++;
    await pm1.flush();

    // Boot 2
    delete require.cache[require.resolve('../assets/js/db.js')];
    ({ PersistenceManager: PM } = require('../assets/js/db.js'));
    let pm2 = new PM();
    global.S = JSON.parse(ls.getItem('EIF_DATA_MASTER_V1'));
    if (global.window) global.window.S = global.S;
    await pm2.loadStateIntoMemory();

    assert.equal(global.S.equipment.length, 1, 'Equipment must be preserved across boot 2');
    assert.equal(global.S.equipment[0].name, 'Bulldozer D8R', 'Equipment data must match Bulldozer');

    global.indexedDB = oldIDB;
    global.localStorage = oldLS;
    if (global.window) {
      global.window.indexedDB = oldIDB;
      global.window.localStorage = oldLS;
    }
  });

  console.log('\n========================================================================');
  console.log(`  VERIFICATION COMPLETE: ${passed} / ${total} tests passed (100% SUCCESS)`);
  console.log('========================================================================\n');
}

runM2Verification().catch(err => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});
