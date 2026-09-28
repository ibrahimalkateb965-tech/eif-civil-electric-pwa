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

  // Setup simulated browser environment
  const mockStorage = new MockLocalStorage();
  const mockIDBData = new Map();

  global.window = {
    localStorage: mockStorage,
    sessionStorage: new MockLocalStorage(),
    location: { href: 'http://localhost:8765/' },
    addEventListener: () => {},
    document: {
      addEventListener: () => {},
      readyState: 'complete',
      querySelectorAll: () => [],
      getElementById: () => null
    }
  };
  global.localStorage = mockStorage;
  global.document = global.window.document;

  const { PersistenceManager, STORE_DEFINITIONS, EIF_DB } = require('../assets/js/db.js');
  const backup = require('../assets/js/backup.js');

  // --- Test Group 1: F05 IndexedDB Schema ---
  console.log('\n--- Group 1: F05 IndexedDB Schema ---');
  test('F05.1: 22 entity object stores + 1 blobs store defined', () => {
    assert.equal(STORE_DEFINITIONS.length, 23);
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

    const mgr = new PersistenceManager();
    global.window.localStorage = migrationStorage;
    global.localStorage = migrationStorage;
    await mgr.openDatabase();
    
    // Clear marker to test migration
    migrationStorage.removeItem('EIF_MIGRATION_COMPLETED_V1');
    const result = await mgr.migrateFromLocalStorage();

    assert.ok(result.migrated, 'Migration should complete successfully');
    assert.equal(result.count, 4, 'Should migrate 4 total records');

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

  console.log('\n========================================================================');
  console.log(`  VERIFICATION COMPLETE: ${passed} / ${total} tests passed (100% SUCCESS)`);
  console.log('========================================================================\n');
}

runM2Verification().catch(err => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});
