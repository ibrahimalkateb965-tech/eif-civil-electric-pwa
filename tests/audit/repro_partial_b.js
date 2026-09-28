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
  // Boot 1: migration fails on 'equipment' (e.g. quota/constraint). User then edits a task -> debounced save.
  const legacy = { workorders: [{ id: 'w1' }], tasks: [{ id: 't1', title: 'A' }], equipment: [{ id: 'e1', name: 'Excavator' }] };
  const ls = makeLS({ EIF_DATA_MASTER_V1: JSON.stringify(legacy) });
  const fail = new Set(['equipment']); const idb = makeIDB({ fail });
  global.indexedDB = idb.factory; global.localStorage = ls;
  const boot = async () => { const { PersistenceManager } = freshModule(); const pm = new PersistenceManager();
    global.S = JSON.parse(ls.getItem('EIF_DATA_MASTER_V1')); await pm.loadStateIntoMemory(); return pm; };
  quiet();
  let pm = await boot();
  const eqAfterLoad = JSON.stringify(global.S.equipment);
  fail.clear(); global.S.tasks[0].title = 'B'; pm.isDirty = true; pm.dirtySeq++; await pm.flush();
  const lsAfterFlush = JSON.parse(ls.getItem('EIF_DATA_MASTER_V1')).equipment;
  fail.clear();                // transient failure gone
  pm = await boot();           // boot 2 -> idb_has_data branch -> purge
  restore();
  out('S.equipment after boot1 load =', eqAfterLoad);
  out('localStorage equipment after boot1 save =', JSON.stringify(lsAfterFlush));
  out('backup =', ls.getItem('EIF_PRE_MIGRATION_BACKUP') && JSON.parse(ls.getItem('EIF_PRE_MIGRATION_BACKUP')).equipment);
  out('S.equipment after boot2 =', JSON.stringify(global.S.equipment), '| legacy keys left:', [...ls._m.keys()]);
  assert.strictEqual(global.S.equipment.length, 1, 'Equipment must survive boot 2');
  assert.strictEqual(global.S.equipment[0].name, 'Excavator', 'Equipment name must match');
  assert.ok(idb.db._stores.get('equipment').data.has('e1'), 'Equipment must be in IndexedDB store');
  out('ALL ASSERTIONS PASSED in repro_partial_b.js');
})();
