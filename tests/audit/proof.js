const assert = require('node:assert');
const nodePath = require('node:path');
const path = nodePath.resolve(__dirname, '../../assets/js/db.js');

// --- minimal IDB mock with per-store failure injection + async latency ---
function makeIDB(opts = {}) {
  const stores = new Map();
  const fail = opts.fail || new Set();
  const delay = opts.delay || 0;
  const db = {
    objectStoreNames: { contains: n => stores.has(n) },
    createObjectStore(n, o) { const s = { kp: o.keyPath, data: new Map(), createIndex() {} }; stores.set(n, s); return s; },
    transaction(names, mode) {
      const tx = { oncomplete: null, onerror: null, onabort: null };
      const bad = names.some(n => fail.has(n)) && mode === 'readwrite';
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
      setTimeout(() => { pending.forEach(f => f()); if (bad) tx.onabort && tx.onabort(); else tx.oncomplete && tx.oncomplete(); }, delay);
      return tx;
    },
    _stores: stores,
  };
  return {
    db,
    factory: { open() { const r = {}; setTimeout(() => { r.result = db; r.onupgradeneeded && r.onupgradeneeded({ target: r }); r.onsuccess && r.onsuccess({ target: r }); }, 0); return r; } },
  };
}

function makeLS(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}

function freshModule() {
  delete require.cache[require.resolve(path)];
  return require(path);
}

const quiet = () => { console.warn = console.error = console.log = () => {}; };
const out = console.log.bind(console);
const origLog = console.log, origWarn = console.warn, origErr = console.error;
const restore = () => { console.log = origLog; console.warn = origWarn; console.error = origErr; };

(async () => {
  // ---------- P1: flush preserves isDirty and returns false when a store write fails ----------
  {
    const idb = makeIDB({ fail: new Set(['workorders']) });
    global.indexedDB = idb.factory; global.localStorage = makeLS({ EIF_MIGRATION_COMPLETE_V16_48: 'true' });
    global.S = { workorders: [{ id: 'w1', no: 'WO-1' }], tasks: [] };
    const { PersistenceManager } = freshModule(); const pm = new PersistenceManager();
    quiet(); await pm.openDatabase(); pm.isDirty = true; const ret = await pm.flush(); restore();
    out('P1 flush() with failing workorders store -> returned', ret, '| isDirty after =', pm.isDirty,
        '| workorders persisted =', idb.db._stores.get('workorders').data.size);
    assert.strictEqual(ret, false, 'P1: flush must return false when store fails');
    assert.strictEqual(pm.isDirty, true, 'P1: isDirty must stay true when store fails');
    assert.strictEqual(idb.db._stores.get('workorders').data.size, 0, 'P1: failing store must have 0 persisted');
  }

  // ---------- P2: failed migration -> next boot does NOT re-migrate stale localStorage over newer IDB edits ----------
  {
    const legacy = JSON.stringify({ workorders: [{ id: 'w1', no: 'WO-1', status: 'OLD' }], tasks: [{ id: 't1', title: 'OLD' }], customFlag: 'OLD' });
    const ls = makeLS({ EIF_DATA_MASTER_V1: legacy });
    const failSet = new Set(['equipment']);
    const idb = makeIDB({ fail: failSet });
    global.indexedDB = idb.factory; global.localStorage = ls; global.S = JSON.parse(legacy);
    let { PersistenceManager } = freshModule(); let pm = new PersistenceManager();
    quiet();
    const legacyWithEquip = JSON.parse(legacy); legacyWithEquip.equipment = [{ id: 'e1' }]; ls.setItem('EIF_DATA_MASTER_V1', JSON.stringify(legacyWithEquip)); global.S = JSON.parse(JSON.stringify(legacyWithEquip));
    const m1 = await pm.migrateFromLocalStorage();
    await pm.loadStateIntoMemory();
    global.S.tasks[0].title = 'NEW EDIT'; global.S.customFlag = 'NEW';
    pm.isDirty = true; await pm.flush();
    const afterEditTasks = idb.db._stores.get('tasks').data.get('t1').title;
    ({ PersistenceManager } = freshModule()); pm = new PersistenceManager();
    global.S = JSON.parse(ls.getItem('EIF_DATA_MASTER_V1'));
    const m2 = await pm.migrateFromLocalStorage(); await pm.loadStateIntoMemory();
    restore();
    out('P2 migration#1 =', m1.reason, '| IDB tasks after session-1 edit =', afterEditTasks,
        '| boot2 migration =', m2.reason, '| S.tasks[0].title after boot2 =', global.S.tasks[0].title, '| S.customFlag =', global.S.customFlag);
    assert.strictEqual(m1.reason, 'write_failure', 'P2: migration 1 must report write_failure');
    assert.strictEqual(afterEditTasks, 'NEW EDIT', 'P2: session 1 edit must be in IDB');
    assert.strictEqual(m2.migrated, false, 'P2: boot 2 must skip migration');
    assert.ok(m2.reason === 'idb_has_data' || m2.reason === 'already_migrated' || m2.reason === 'write_failure', 'P2: boot 2 must not re-migrate');
    assert.strictEqual(global.S.tasks[0].title, 'NEW EDIT', 'P2: tasks title must not be overwritten');
    assert.strictEqual(global.S.customFlag, 'NEW', 'P2: customFlag must not be overwritten');
  }

  // ---------- P2b: Three-boot deletion scenario (Defect 1) ----------
  {
    quiet();
    const legacy = { workorders: [{ id: 'w1', no: 'WO-1' }], tasks: [{ id: 't1', title: 'DELETED-BY-USER' }], equipment: [{ id: 'e1' }] };
    const ls = makeLS({ EIF_DATA_MASTER_V1: JSON.stringify(legacy) });
    const fail = new Set(['equipment']); const idb = makeIDB({ fail });
    global.indexedDB = idb.factory; global.localStorage = ls;
    const boot = async () => { const { PersistenceManager } = freshModule(); const pm = new PersistenceManager();
      global.S = JSON.parse(ls.getItem('EIF_DATA_MASTER_V1')); await pm.loadStateIntoMemory(); return pm; };
    let pm = await boot();
    fail.clear();
    pm = await boot();
    const flag = ls.getItem('EIF_MIGRATION_COMPLETE_V16_48');
    assert.strictEqual(flag, 'true', 'Migration flag must be set on boot 2');
    global.S.tasks = []; pm.isDirty = true; await pm.flush();
    const idbTasks = idb.db._stores.get('tasks').data.size;
    assert.strictEqual(idbTasks, 0, 'IDB tasks after deletion must be 0');
    pm = await boot();
    restore();
    out('P2b flag after boot2 =', flag, '| IDB tasks after delete =', idbTasks, '| S.tasks after boot3 =', JSON.stringify(global.S.tasks));
    assert.strictEqual(global.S.tasks.length, 0, 'S.tasks after boot 3 must remain empty (no resurrection)');
    pm.isDirty = true; await pm.flush();
    assert.strictEqual(idb.db._stores.get('tasks').data.size, 0, 'IDB tasks after next save must remain 0');
    out('P2b three-boot deletion -> PASS (no resurrected records)');
  }

  // ---------- P3: in-flight flush preserves newer edits with sequence counter ----------
  {
    const idb = makeIDB({ delay: 5 });
    global.indexedDB = idb.factory; global.localStorage = makeLS({ EIF_MIGRATION_COMPLETE_V16_48: 'true' });
    global.S = { workorders: [{ id: 'w1', no: 'WO-1', status: 'A' }], tasks: [] };
    const { PersistenceManager } = freshModule(); const pm = new PersistenceManager();
    await pm.openDatabase(); pm.debounceDelayMs = 150;
    const p1 = pm.scheduleSync();
    await new Promise(r => setTimeout(r, 200));
    global.S.workorders[0].status = 'B';
    const p2 = pm.scheduleSync();
    await Promise.all([p1, p2]);
    out('P3 in-memory status = B | IDB workorders status =', idb.db._stores.get('workorders').data.get('w1').status, '| isDirty =', pm.isDirty);
    assert.strictEqual(idb.db._stores.get('workorders').data.get('w1').status, 'B', 'P3: status must be B');
    assert.strictEqual(pm.isDirty, false, 'P3: isDirty must be false');
  }

  // ---------- P3b: Multiple saveState calls inside debounce window (Defect 2) ----------
  {
    const idb = makeIDB(); global.indexedDB = idb.factory; global.localStorage = makeLS({ EIF_MIGRATION_COMPLETE_V16_48: 'true' });
    global.S = { tasks: [] };
    const { PersistenceManager } = freshModule(); const pm = new PersistenceManager(); await pm.openDatabase();
    let r1 = 'PENDING'; pm.scheduleSync().then(v => r1 = v);
    const p2 = pm.scheduleSync();
    await p2;
    await new Promise(r => setTimeout(r, 200));
    assert.strictEqual(r1, true, 'First saveState promise must resolve when debounced flush completes');
    out('P3b debounced promises resolution -> PASS');
  }

  // ---------- P4: JSON restore rebinds window.S and global.S via app.js restoreFile handler ----------
  {
    const fs = require('fs');
    const appJsPath = 'F:/AI PROJECTS/Autovemtech/Clients/07_islam/Engineer_Islam_Fouda_Professional_Base_V16_48/app.js';
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');
    const match = appJsContent.match(/function restoreFile\s*\([^)]*\)\s*\{[\s\S]*?readAsText\([^)]*\)\}/);
    assert.ok(match, 'restoreFile function must exist in app.js');

    let saved = false;
    global.save = () => { saved = true; };
    global.alert = () => {};
    global.window = {};
    global.S = { workorders: [{ id: 'w_old' }] };
    global.window.S = global.S;

    class MockFileReader {
      readAsText(file) {
        this.result = file.content;
        if (typeof this.onload === 'function') this.onload();
      }
    }
    global.FileReader = MockFileReader;

    const restoreFn = new Function('return ' + match[0])();

    // Test structured backup payload
    const structuredBackupJson = JSON.stringify({ data: { workorders: [{ id: 'w_restored_p4' }] } });
    restoreFn({ content: structuredBackupJson });

    assert.strictEqual(saved, true, 'save() must be invoked after restore');
    assert.strictEqual(global.window.S.workorders[0].id, 'w_restored_p4', 'window.S must point to restored object');
    assert.strictEqual(global.S.workorders[0].id, 'w_restored_p4', 'global.S must point to restored object');

    // Test legacy direct backup payload
    saved = false;
    const directBackupJson = JSON.stringify({ workorders: [{ id: 'w_direct_p4' }] });
    restoreFn({ content: directBackupJson });
    assert.strictEqual(saved, true, 'save() must be invoked after direct restore');
    assert.strictEqual(global.window.S.workorders[0].id, 'w_direct_p4', 'window.S must point to direct restored object');
    assert.strictEqual(global.S.workorders[0].id, 'w_direct_p4', 'global.S must point to direct restored object');
    delete global.window;
    out('P4 real restoreFile handler from app.js -> PASS');
  }

  // ---------- P5: Partial Migration Recovery Invariant (repro_partial) ----------
  {
    delete global.window;
    quiet();
    const legacy = { workorders: [{ id: 'w1' }], tasks: [{ id: 't1', title: 'A' }], equipment: [{ id: 'e1', name: 'Excavator' }] };
    const ls = makeLS({ EIF_DATA_MASTER_V1: JSON.stringify(legacy) });
    const fail = new Set(['equipment']); const idb = makeIDB({ fail });
    global.indexedDB = idb.factory; global.localStorage = ls;
    const boot = async () => { const { PersistenceManager } = freshModule(); const pm = new PersistenceManager();
      global.S = JSON.parse(ls.getItem('EIF_DATA_MASTER_V1')); await pm.loadStateIntoMemory(); return pm; };
    let pm = await boot();
    assert.strictEqual(global.S.equipment.length, 1, 'P5: equipment preserved in S during boot 1');
    global.S.tasks[0].title = 'B'; pm.isDirty = true; pm.dirtySeq++; await pm.flush();
    fail.clear(); // transient failure resolved
    pm = await boot(); // boot 2: recovers unmigrated store
    restore();
    assert.strictEqual(global.S.equipment.length, 1, 'P5: equipment preserved in S after boot 2');
    assert.strictEqual(global.S.equipment[0].name, 'Excavator', 'P5: equipment name intact after boot 2');
    assert.strictEqual(idb.db._stores.get('equipment').data.size, 1, 'P5: equipment written to IndexedDB');
    assert.ok(idb.db._stores.get('equipment').data.has('e1'), 'P5: equipment written to IndexedDB with key e1');
    out('P5 partial migration store recovery -> PASS');
  }

  // ---------- P6: Deletion Non-Resurrection Under Partial Flush Failure (repro_partial_c) ----------
  {
    delete global.window;
    quiet();
    const legacy = { workorders: [{ id: 'w1' }], tasks: [{ id: 't1', title: 'A' }], equipment: [{ id: 'e1', name: 'Excavator' }] };
    const ls = makeLS({ EIF_DATA_MASTER_V1: JSON.stringify(legacy) });
    const fail = new Set(['equipment']); const idb = makeIDB({ fail });
    global.indexedDB = idb.factory; global.localStorage = ls;
    const boot = async () => { const { PersistenceManager } = freshModule(); const pm = new PersistenceManager();
      global.S = JSON.parse(ls.getItem('EIF_DATA_MASTER_V1')); await pm.loadStateIntoMemory(); return pm; };
    let pm = await boot();
    assert.strictEqual(global.S.equipment.length, 1, 'P6: equipment preserved in S during boot 1');
    global.S.tasks = []; pm.isDirty = true; pm.dirtySeq++; const ret = await pm.flush();
    assert.strictEqual(ret, false, 'P6: flush returns false on equipment error');
    fail.clear(); // transient failure resolved
    pm = await boot(); // boot 2: recovers unmigrated store
    restore();
    assert.strictEqual(global.S.tasks.length, 0, 'P6: deleted tasks must NOT be resurrected');
    assert.strictEqual(global.S.equipment.length, 1, 'P6: equipment preserved in S after boot 2');
    assert.strictEqual(global.S.equipment[0].name, 'Excavator', 'P6: equipment name intact after boot 2');
    out('P6 deletion non-resurrection under partial flush failure -> PASS');
  }

  out('\n>>> ALL AUDIT PROOFS AND ASSERTIONS PASSED (100% SUCCESS) <<<\n');
})();
