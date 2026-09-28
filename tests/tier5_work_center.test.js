/**
 * tests/tier5_work_center.test.js
 * Tier 5: Work Center Unification (V16.50), SOP_WORK_CENTER_UNIFICATION.md §8, cases T-01 … T-11.
 * Authored by Claude Code (P0 gate). Test authority is Claude-only: other agents must NOT edit this file.
 *
 * Each test name carries the phase whose exit gate it belongs to ([P1], [P2], [P3], [ALL]).
 *
 * Conventions pinned by these tests (binding for works.js / db.js / backup.js implementers):
 *  - works.js is an IIFE over `window` (or globalThis) that sets `window.EIF_WORKS`. It reads its
 *    dependencies at call time through that global object only: `global.EIF_DB.putBlob/getBlob/saveState`,
 *    `crypto.subtle`. No DOM access.
 *  - Persons live in S.orgPeople (there is no S.persons). Work-scope permission module is 'execution'.
 *  - ACTION_MIN: read 1; create, edit, attach 2; approve, reject 3; grant, configure 4.
 *    attach() checks ('execution','attach'); detach()/replace() check ('execution','edit').
 *  - Owner Device Mode (R-3, client-confirmed): actor === null is allowed only while
 *    S.settings.ownerDeviceMode !== false (missing settings = ON). Every such write is audited override:true.
 *  - An inactive person is denied even if isSuperAdmin (SOP §5.1 erratum: the active check runs first).
 *  - Blob hash = lowercase hex SHA-256 of the file bytes. Video length comes from `file.durationSec`;
 *    a video with missing or short duration is rejected with code 'VIDEO_TOO_SHORT'. A batch is validated
 *    in full before any byte is stored (all-or-nothing).
 *  - Migration IDs: defs any; lines `mig:siteReq:<woId>:<defId>`, `mig:tasks:<taskId>`,
 *    `mig:general:<woId>` (the WO's 'تنفيذ عام' line, used by exec rows whose stage matches no line and by
 *    workEvidence1628); reqs `mig:executionEvidence:<evId>:photo|video`, `mig:workEvidence1628:<weId>`;
 *    titles from jobTitles1624 `mig:jobTitles1624:<jtId>`.
 *  - migratedFrom keys: workTypes, siteRequirementDefs, siteReq, exec, tasks, executionEvidence,
 *    workEvidence1628, jobTitles1624, orgPeople. `count` = number of legacy records consumed from that source.
 *  - WO ownership for scopes: wo.departmentId (department_manage, includes descendants via parentId),
 *    wo.teamId (team_view / team_manage). Grants write person.moduleOverrides[module] / person.scopeOverride.
 *    Delegations live in S.permissionDelegations {id, fromPersonId, toPersonId, module, level, expiresAt}.
 */

const fs = require('node:fs');
const vm = require('node:vm');
const childProcess = require('node:child_process');
const {
  assert,
  registerTest,
  setContext,
  readFile,
  getFilePath,
  computeSha256,
  MockIDBDatabase,
  MockLocalStorage
} = require('./harness.js');

setContext('Tier 5', 'WorkCenter', 'Work Center Unification (V16.50)');

const WORKS_PATH = 'assets/js/works.js';
const FIXTURE_PATH = 'tests/fixtures/v1649_state.json';
const FIXTURE_HASH = '3a1f8b2c9d0e4f5a6b7c8d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c';

const LEGACY_KEYS = ['workTypes', 'siteRequirementDefs', 'exec', 'executionEvidence', 'workEvidence1628', 'tasks', 'jobTitles1624'];
const MODULES = ['execution', 'workorders', 'safety', 'permits', 'materials', 'docs', 'organization', 'survey', 'quality', 'governance', 'reinstatement', 'equipment'];
const ACTIONS = ['read', 'create', 'edit', 'attach', 'approve', 'reject', 'grant', 'configure'];

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------
const J = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
// Cross-realm safe deep equality (works.js objects may come from another realm)
const same = (a, b, msg) => assert.deepStrictEqual(J(a), J(b), msg);
const byId = (arr) => J(arr || []).sort((a, b) => String(a.id).localeCompare(String(b.id)));
const idOf = (x) => (typeof x === 'string' ? x : x && (x.id || x.personId || x.lineId || x.hash));

function loadFixture() {
  const f = JSON.parse(readFile(FIXTURE_PATH));
  delete f.meta;
  return f;
}

function legacySnapshot(S) {
  const snap = {};
  for (const k of LEGACY_KEYS) snap[k] = computeSha256(JSON.stringify(S[k] === undefined ? null : S[k]));
  snap.siteReq = computeSha256(JSON.stringify((S.workorders || []).map(w => [w.id, w.siteReq === undefined ? null : w.siteReq])));
  snap.personLegacy = computeSha256(JSON.stringify((S.orgPeople || []).map(p => [p.id, p.role, p.accessScope, p.moduleAccess1618 || null, p.moduleAccess1620 || null])));
  snap.teamLegacy = computeSha256(JSON.stringify((S.orgTeams || []).map(t => [t.id, t.moduleAccess1618 || null, t.moduleAccess1620 || null])));
  return snap;
}

async function toBytes(data) {
  if (data && typeof data.arrayBuffer === 'function') return new Uint8Array(await data.arrayBuffer());
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  throw new Error('putBlob received non-binary data: ' + Object.prototype.toString.call(data));
}

/** Fake EIF_DB: byte-exact blob backing store that survives "reload" (new instance over the same backing). */
function makeFakeDb(backing = new Map()) {
  const db = {
    backing,
    saves: 0,
    putCalls: 0,
    persisted: null,
    failNextSave: false,
    win: null,
    async putBlob(hash, data) {
      db.putCalls++;
      if (!hash) throw new Error('hash required');
      backing.set(hash, await toBytes(data));
      return true;
    },
    async getBlob(hash) {
      const b = backing.get(hash);
      return b ? new Blob([b]) : null;
    },
    saveState() {
      db.saves++;
      if (db.failNextSave) {
        db.failNextSave = false;
        return Promise.reject(new Error('Simulated crash mid-flush'));
      }
      db.persisted = J(db.win && db.win.S);
      return Promise.resolve(true);
    }
  };
  return db;
}

const silentConsole = { log() {}, warn() {}, error() {}, info() {}, debug() {} };

/** Load works.js. Fails cleanly (RED) while the file does not exist. */
function loadWorks(extra = {}) {
  const code = readFile(WORKS_PATH);
  const win = Object.assign({
    console: silentConsole,
    crypto: globalThis.crypto,
    File, Blob, TextEncoder, TextDecoder, setTimeout, clearTimeout
  }, extra);
  win.window = win;
  new Function('window', code)(win);
  assert.ok(win.EIF_WORKS && typeof win.EIF_WORKS === 'object', 'works.js must expose window.EIF_WORKS');
  return { W: win.EIF_WORKS, win };
}

function env(S, db = makeFakeDb()) {
  const { W, win } = loadWorks({ EIF_DB: db });
  win.S = S;
  db.win = win;
  return { W, win, db, S };
}

function mkFile(name, type, content, durationSec) {
  const f = new File([Buffer.from(content)], name, { type });
  if (durationSec !== undefined) Object.defineProperty(f, 'durationSec', { value: durationSec, enumerable: true });
  return f;
}

function mkSpyFile(name, type, content) {
  const f = mkFile(name, type, content);
  f.readCount = 0;
  for (const m of ['arrayBuffer', 'text', 'stream', 'bytes', 'slice']) {
    const orig = f[m];
    if (typeof orig === 'function') {
      f[m] = function (...args) { f.readCount++; return orig.apply(f, args); };
    }
  }
  return f;
}

const sha = (content) => computeSha256(Buffer.from(content));

function mkLine(id, woId, companyId, defId, assigneeIds = []) {
  return {
    id, companyId, woId, defId, qty: 1, unit: 'م', status: 'planned',
    assignees: assigneeIds.map(personId => ({ personId, role: 'foreman' })),
    due: '', progressPct: 0, notes: '',
    createdAt: '2026-09-28T00:00:00.000Z', createdBy: 'sa1', updatedAt: '2026-09-28T00:00:00.000Z', updatedBy: 'sa1', legacyRef: null
  };
}

function mkReq(id, lineId, woId, extra = {}) {
  return Object.assign({
    id, lineId, woId, kind: 'photo', label: 'قبل التنفيذ', stage: 'before',
    minCount: 3, minVideoSec: 10, attachments: [], status: 'open', legacyRef: null
  }, extra);
}

/** Hand-built post-migration state: 2 companies, departments with a child, titles, WOs, lines, reqs. */
function baseState() {
  return {
    companies: [{ id: 'c1', name: 'شركة التمديدات', code: 'C1' }, { id: 'c2', name: 'شركة الجنوب', code: 'C2' }],
    activeCompanyId: 'c1',
    settings: { ownerDeviceMode: false },
    workorders: [
      { id: 'woA', no: 'A-001', companyId: 'c1', departmentId: 'dA', teamId: 'tmA' },
      { id: 'woA2', no: 'A-002', companyId: 'c1', departmentId: 'dA2', teamId: 'tmA' },
      { id: 'woB', no: 'B-001', companyId: 'c1', departmentId: 'dB', teamId: 'tmB' },
      { id: 'woC', no: 'C-001', companyId: 'c2', departmentId: 'dC', teamId: 'tmC' }
    ],
    orgTeams: [
      { id: 'tmA', name: 'فريق الحفر', companyId: 'c1', departmentId: 'dA' },
      { id: 'tmB', name: 'فريق الكهرباء', companyId: 'c1', departmentId: 'dB' },
      { id: 'tmC', name: 'فريق الجنوب', companyId: 'c2', departmentId: 'dC' }
    ],
    departments: [
      { id: 'dA', companyId: 'c1', name: 'قسم الحفر', nameI18n: { en: 'Excavation' }, parentId: null, headPersonId: 'mgr', active: true },
      { id: 'dA2', companyId: 'c1', name: 'وحدة الحفر الشمالية', nameI18n: {}, parentId: 'dA', headPersonId: null, active: true },
      { id: 'dB', companyId: 'c1', name: 'قسم الكهرباء', nameI18n: {}, parentId: null, headPersonId: null, active: true },
      { id: 'dC', companyId: 'c2', name: 'قسم الجنوب', nameI18n: {}, parentId: null, headPersonId: 'cm', active: true }
    ],
    jobTitles: [
      { id: 'tMgr', companyId: 'c1', departmentId: 'dA', name: 'مدير قسم', nameI18n: { en: 'Department Manager' }, scope: 'department_manage', moduleAccess: { execution: 'approve', workorders: 'edit' }, rank: 3, active: true },
      { id: 'tForeman', companyId: 'c1', departmentId: 'dA', name: 'فورمان', nameI18n: { en: 'Foreman' }, scope: 'assigned', moduleAccess: { execution: 'edit', workorders: 'view' }, rank: 1, active: true },
      { id: 'tTeam', companyId: 'c1', departmentId: 'dB', name: 'مشرف فريق', nameI18n: {}, scope: 'team_view', moduleAccess: { execution: 'view', workorders: 'view' }, rank: 2, active: true },
      { id: 'tViewer', companyId: 'c1', departmentId: 'dA', name: 'مشاهد', nameI18n: {}, scope: 'assigned', moduleAccess: { workorders: 'view' }, rank: 0, active: true },
      { id: 'tCMgr', companyId: 'c2', departmentId: 'dC', name: 'مدير قسم', nameI18n: {}, scope: 'department_manage', moduleAccess: { execution: 'approve' }, rank: 3, active: true }
    ],
    orgPeople: [
      { id: 'sa1', companyId: 'c1', name: 'المالك', isSuperAdmin: true, jobTitleId: null, departmentId: null, active: true },
      { id: 'sa2', companyId: 'c1', name: 'مدير سابق', isSuperAdmin: true, jobTitleId: null, departmentId: null, active: false },
      { id: 'mgr', companyId: 'c1', teamId: 'tmA', name: 'مدير الحفر', isSuperAdmin: false, jobTitleId: 'tMgr', departmentId: 'dA', active: true },
      { id: 'fm', companyId: 'c1', teamId: 'tmA', name: 'فورمان أ', isSuperAdmin: false, jobTitleId: 'tForeman', departmentId: 'dA', active: true },
      { id: 'eng', companyId: 'c1', teamId: 'tmA', name: 'مهندس أ', isSuperAdmin: false, jobTitleId: 'tForeman', departmentId: 'dA', active: true },
      { id: 'engB', companyId: 'c1', teamId: 'tmB', name: 'مهندس ب', isSuperAdmin: false, jobTitleId: 'tForeman', departmentId: 'dB', active: true },
      { id: 'sup', companyId: 'c1', teamId: 'tmB', name: 'مشرف ب', isSuperAdmin: false, jobTitleId: 'tTeam', departmentId: 'dB', active: true },
      { id: 'fake', companyId: 'c1', teamId: 'tmA', name: 'سوبر أدمن', role: 'Super Admin', accessScope: 'super_admin', isSuperAdmin: false, jobTitleId: 'tViewer', departmentId: 'dA', active: true },
      { id: 'nb', companyId: 'c1', name: 'بدون مسمى', isSuperAdmin: false, jobTitleId: null, departmentId: null, active: true },
      { id: 'cm', companyId: 'c2', teamId: 'tmC', name: 'مدير الجنوب', isSuperAdmin: false, jobTitleId: 'tCMgr', departmentId: 'dC', active: true }
    ],
    works: {
      schema: 1,
      migratedFrom: {},
      tombstones: [],
      defs: [
        { id: 'dfA', companyId: 'c1', code: 'EXC', name: 'حفر', nameI18n: { en: 'Excavation' }, unit: 'م3', category: 'civil', reqTemplate: [], active: true, createdAt: '2026-09-28T00:00:00.000Z', createdBy: 'sa1' },
        { id: 'dfC', companyId: 'c2', code: 'COM', name: 'تشغيل', nameI18n: {}, unit: 'مهمة', category: 'electrical', reqTemplate: [{ kind: 'photo', label: 'بعد', minCount: 1, stage: 'after' }], active: true, createdAt: '2026-09-28T00:00:00.000Z', createdBy: 'sa1' }
      ],
      lines: [
        mkLine('L1', 'woA', 'c1', 'dfA', ['fm']),
        mkLine('L2', 'woA', 'c1', 'dfA', ['fm']),
        mkLine('L3', 'woA', 'c1', 'dfA'),
        mkLine('L4', 'woA', 'c1', 'dfA'),
        mkLine('L5', 'woA', 'c1', 'dfA', ['eng']),
        mkLine('L6', 'woA2', 'c1', 'dfA'),
        mkLine('L7', 'woB', 'c1', 'dfA', ['engB']),
        mkLine('L8', 'woC', 'c2', 'dfC')
      ],
      reqs: [
        mkReq('R1', 'L1', 'woA'),
        mkReq('R4', 'L1', 'woA', { label: 'أثناء التنفيذ', stage: 'during', minCount: 1 }),
        mkReq('R2', 'L2', 'woA'),
        mkReq('R3', 'L3', 'woA'),
        mkReq('R7', 'L7', 'woB'),
        mkReq('R8', 'L8', 'woC', { minCount: 1 })
      ],
      events: []
    },
    attachments: [],
    accessAudit1617: [],
    permissionDelegations: [],
    safeSnapshots1646: []
  };
}

const person = (S, id) => S.orgPeople.find(p => p.id === id);
const reqOf = (S, id) => S.works.reqs.find(r => r.id === id);
const lineOf = (S, id) => S.works.lines.find(l => l.id === id);
const woOf = (S, id) => S.workorders.find(w => w.id === id);

/** Extract the body of `function NAME(` by brace matching (enough for static policy scans). */
function functionBodies(src, name) {
  const bodies = [];
  const re = new RegExp('function\\s+' + name.replace(/[$]/g, '\\$') + '\\s*\\(', 'g');
  let m;
  while ((m = re.exec(src))) {
    let i = src.indexOf('{', m.index);
    if (i < 0) break;
    let depth = 0;
    const start = i;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) break; }
    }
    bodies.push(src.slice(start, i + 1));
  }
  return bodies;
}

const ROLE_TOKENS = /super.{0,8}admin|سوبر|مدير المشروع/i;
function roleRegexHits(src) {
  const hits = [];
  const literalThenTest = /\/((?:\\.|[^\/\n])+)\/[gimsuy]*\s*\.\s*(?:test|exec)\s*\(/g;
  const matchWithLiteral = /\.\s*(?:match|matchAll|search)\s*\(\s*\/((?:\\.|[^\/\n])+)\//g;
  const ctor = /RegExp\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
  let m;
  while ((m = literalThenTest.exec(src))) if (ROLE_TOKENS.test(m[1])) hits.push(m[0].slice(0, 90));
  while ((m = matchWithLiteral.exec(src))) if (ROLE_TOKENS.test(m[1])) hits.push(m[0].slice(0, 90));
  while ((m = ctor.exec(src))) if (ROLE_TOKENS.test(m[2])) hits.push(m[0].slice(0, 90));
  return hits;
}
const PERSON_ROLE_READ = /\b(?:actor|person|p|a|user|u|target|grantor|me|cur)\s*\??\.\s*role\b|\[\s*['"]role['"]\s*\]/;

/** Shared T-02 oracle, reused by T-11 (V16.49 backup import). */
function assertFixtureMigrated(W, S, legacyBefore, snapshotsBefore) {
  const w = S.works;
  assert.ok(w && w.schema === 1, 'S.works.schema must be 1 after migration');

  // Counts per §6.2 source
  const expectCounts = { workTypes: 4, siteRequirementDefs: 3, siteReq: 2, exec: 3, tasks: 3, executionEvidence: 2, workEvidence1628: 2, jobTitles1624: 3, orgPeople: 6 };
  for (const [src, n] of Object.entries(expectCounts)) {
    const mf = w.migratedFrom && w.migratedFrom[src];
    assert.ok(mf, `migratedFrom.${src} marker missing`);
    assert.equal(mf.count, n, `migratedFrom.${src}.count`);
    assert.ok(typeof mf.checksum === 'string' && mf.checksum.length > 0, `migratedFrom.${src}.checksum missing`);
    assert.ok(mf.at && !Number.isNaN(Date.parse(mf.at)), `migratedFrom.${src}.at must be ISO`);
  }

  // Non-destructive: legacy arrays byte-identical
  same(legacySnapshot(S), legacyBefore, 'legacy collections must be byte-identical after migration');

  // Snapshot-first
  assert.equal((S.safeSnapshots1646 || []).length, snapshotsBefore + 1, 'exactly one safe snapshot must be written before first migration');

  // Defs: dedupe by normalized name within company
  const defNames = (c) => w.defs.filter(d => d.companyId === c).map(d => String(d.name).trim()).sort();
  same(defNames('c1'), ['تركيب عداد', 'تمديد كابل', 'تمديد كابلات', 'تنفيذ عام', 'حفر', 'دفان', 'ردم'].sort(), 'c1 defs');
  same(defNames('c2'), ['تنفيذ عام'], 'c2 defs (company-scoped seed)');
  const defById = (id) => w.defs.find(d => d.id === id);

  // Lines
  const expectedLines = ['mig:siteReq:wo1:def1', 'mig:siteReq:wo1:def2', 'mig:tasks:t1', 'mig:tasks:t2', 'mig:general:wo1', 'mig:general:wo2', 'mig:tasks:t4', 'mig:general:wo3'];
  same(w.lines.map(l => l.id).sort(), expectedLines.slice().sort(), 'migrated line ids');
  const L = (id) => lineOf(S, id);
  assert.equal(L('mig:siteReq:wo1:def1').qty, 12);
  assert.equal(L('mig:siteReq:wo1:def1').progressPct, 40, 'ex1 (stage حفر) merges onto the حفر line');
  assert.equal(defById(L('mig:siteReq:wo1:def1').defId).name.trim(), 'حفر');
  assert.equal(L('mig:siteReq:wo1:def2').qty, 5);
  assert.equal(L('mig:general:wo2').progressPct, 10, 'ex2 has no matching line -> general line');
  assert.equal(defById(L('mig:general:wo2').defId).name, 'تنفيذ عام');
  assert.equal(L('mig:general:wo3').companyId, 'c2');
  assert.equal(defById(L('mig:general:wo3').defId).companyId, 'c2', 'c2 general line must use c2 seed def');
  assert.equal(L('mig:general:wo3').progressPct, 25);

  // Assignee resolution (§3): exact normalized match within company only
  same(L('mig:tasks:t1').assignees.map(a => a.personId), ['p1'], 't1 علي -> p1 (p6 is علي in c2)');
  same(L('mig:tasks:t2').assignees, [], 't2 محمد is ambiguous (p2, p3)');
  assert.equal(L('mig:tasks:t2').legacyRef && L('mig:tasks:t2').legacyRef.assignText, 'محمد');
  same(L('mig:tasks:t4').assignees, [], 't4 خالد matches nobody');
  assert.equal(L('mig:tasks:t4').legacyRef && L('mig:tasks:t4').legacyRef.assignText, 'خالد');
  const report = W.migrationReport(S);
  const unassigned = report.unassignedLines.map(idOf);
  assert.ok(unassigned.includes('mig:tasks:t2') && unassigned.includes('mig:tasks:t4'), 'unassigned lines must be reported');

  // Requirements
  const R = (id) => reqOf(S, id);
  const evPhoto = R('mig:executionEvidence:ev1:photo');
  assert.ok(evPhoto, 'ev1 photo requirement missing');
  assert.equal(evPhoto.lineId, 'mig:siteReq:wo1:def1', 'ev1 (stage حفر) attaches to the حفر line');
  assert.equal(evPhoto.attachments.length, 2);
  assert.equal(R('mig:executionEvidence:ev1:video').attachments.length, 1);
  assert.equal(R('mig:executionEvidence:ev2:video').lineId, 'mig:general:wo3');
  const we1 = R('mig:workEvidence1628:we1');
  assert.ok(we1, 'we1 requirement missing');
  assert.equal(we1.kind, 'document');
  assert.equal(we1.lineId, 'mig:general:wo1');
  assert.equal(we1.attachments[0].hash, FIXTURE_HASH, 'hashed legacy ref must keep its hash');
  assert.equal(we1.attachments[0].missingBinary, false);
  assert.equal(R('mig:workEvidence1628:we2').kind, 'note');

  // I-1 no orphans, I-2 no copied names, I-5 no WO header duplication
  const woIds = new Set(S.workorders.map(x => x.id));
  const lineIds = new Set(w.lines.map(l => l.id));
  for (const l of w.lines) {
    assert.ok(defById(l.defId), `I-1 orphan line ${l.id} -> def ${l.defId}`);
    assert.ok(woIds.has(l.woId), `I-1 line ${l.id} -> unknown WO`);
    assert.equal(l.companyId, woOf(S, l.woId).companyId, `line ${l.id} companyId must match its WO`);
    for (const k of ['name', 'defName', 'no', 'code', 'company', 'workDescription', 'siteReq']) {
      assert.ok(!Object.prototype.hasOwnProperty.call(l, k), `I-2/I-5 line ${l.id} must not carry "${k}"`);
    }
  }
  for (const r of w.reqs) {
    assert.ok(lineIds.has(r.lineId), `I-1 orphan req ${r.id}`);
    assert.equal(r.woId, lineOf(S, r.lineId).woId, `req ${r.id} woId must match its line`);
  }

  // Departments & titles (§4, §6.2)
  const depNames = (c) => (S.departments || []).filter(d => d.companyId === c).map(d => d.name).sort();
  same(depNames('c1'), ['عام', 'قسم السلامة'].sort(), 'c1 departments (no dept for title-less teams)');
  same(depNames('c2'), ['عام', 'قسم التشغيل'].sort(), 'c2 departments');
  for (const t of S.jobTitles) {
    const d = S.departments.find(x => x.id === t.departmentId);
    assert.ok(d, `title ${t.id} must have an existing departmentId`);
    assert.equal(d.companyId, t.companyId, `title ${t.id} department must be in the same company`);
    assert.notEqual(t.scope, 'super_admin', 'super_admin is never a title scope');
  }
  const jt1 = S.jobTitles.find(t => t.id === 'mig:jobTitles1624:jt1');
  assert.ok(jt1, 'jt1 title missing');
  assert.equal(W.resolveDepartment(S, jt1.departmentId, 'ar'), 'قسم السلامة');
  assert.equal(jt1.moduleAccess.safety, 'admin', 'jobTitles1624.moduleAccess -> title.moduleAccess');
  assert.equal(W.resolveDepartment(S, S.jobTitles.find(t => t.id === 'mig:jobTitles1624:jt2').departmentId, 'ar'), 'عام');

  // Persons
  const P = (id) => person(S, id);
  assert.equal(P('p1').jobTitleId, 'mig:jobTitles1624:jt1');
  assert.equal(P('p4').jobTitleId, 'mig:jobTitles1624:jt2');
  assert.equal(P('p5').jobTitleId, 'mig:jobTitles1624:jt3');
  assert.equal(W.resolveTitle(S, P('p2').jobTitleId, 'ar'), 'فورمان');
  const p2Title = S.jobTitles.find(t => t.id === P('p2').jobTitleId);
  assert.equal(p2Title.companyId, 'c1');
  assert.equal(W.resolveDepartment(S, p2Title.departmentId, 'ar'), 'عام');
  const p6Title = S.jobTitles.find(t => t.id === P('p6').jobTitleId);
  assert.ok(p6Title && p6Title.companyId === 'c2', 'p6 role must resolve within c2, never to c1 jt1');
  assert.equal(W.resolveDepartment(S, p6Title.departmentId, 'ar'), 'عام');
  const flagged = report.flaggedPersons.map(idOf);
  assert.ok(flagged.includes('p2') && flagged.includes('p6'), 'unmatched-role persons must be flagged');
  for (const p of S.orgPeople.filter(x => x.active !== false)) {
    assert.ok(S.jobTitles.some(t => t.id === p.jobTitleId), `active person ${p.id} must have a valid jobTitleId`);
  }
  assert.equal(P('p3').isSuperAdmin, true, 'accessScope super_admin -> isSuperAdmin');
  for (const id of ['p1', 'p2', 'p4', 'p5', 'p6']) assert.notEqual(P(id).isSuperAdmin, true, `${id} must not become super admin`);
  assert.equal(P('p4').moduleOverrides.execution, 'approve', 'moduleAccess1618 (person) max team 1620');
  assert.equal(P('p2').moduleOverrides.execution, 'edit', 'team moduleAccess1620 -> member overrides');
  assert.equal(P('p1').moduleOverrides.docs, 'view', 'person moduleAccess1620');
  assert.equal(P('p1').moduleOverrides.safety, 'approve', 'team moduleAccess1618');
}

// =============================================================
// T-01  Rule 1: Unified schema on fresh install
// =============================================================
registerTest('T-01 [P2] Unified schema on fresh install; createLine writes nothing to legacy arrays', async () => {
  // Fresh-install path
  const sa = { id: 'sa1', companyId: 'c1', name: 'المالك', isSuperAdmin: true, jobTitleId: null, active: true };
  const S = { companies: [{ id: 'c1', name: 'ش' }], activeCompanyId: 'c1', settings: { ownerDeviceMode: false }, workorders: [{ id: 'wo1', no: 'N-1', companyId: 'c1' }], orgPeople: [sa], accessAudit1617: [], safeSnapshots1646: [] };
  const { W } = env(S);
  await W.migrate(S);
  assert.equal(S.works.schema, 1);
  for (const k of ['defs', 'lines', 'reqs', 'events', 'tombstones']) assert.ok(Array.isArray(S.works[k]), `S.works.${k} must be an array`);
  assert.ok(S.works.migratedFrom && typeof S.works.migratedFrom === 'object');
  for (const k of LEGACY_KEYS) assert.equal(S[k], undefined, `fresh install must not create legacy ${k}`);

  const d = W.saveDef(S, sa, { companyId: 'c1', code: 'EXC', name: 'حفر', unit: 'م3', category: 'civil', reqTemplate: [{ kind: 'photo', label: 'قبل', minCount: 2, stage: 'before' }] });
  assert.ok(d.ok, 'saveDef failed: ' + JSON.stringify(d));
  const r = W.createLine(S, sa, { woId: 'wo1', defId: d.value.id, qty: 3, due: '2026-10-01' });
  assert.ok(r.ok, 'createLine failed: ' + JSON.stringify(r));
  const line = lineOf(S, r.value.id);
  assert.ok(line && line.woId === 'wo1' && line.companyId === 'c1');
  assert.ok(!('name' in line), 'I-2: name must not be copied onto line');
  const spawned = S.works.reqs.filter(q => q.lineId === line.id);
  assert.equal(spawned.length, 1, 'reqTemplate must spawn one requirement');
  assert.equal(spawned[0].status, 'open');
  assert.equal(spawned[0].minCount, 2);
  assert.ok(S.works.events.some(e => e.action === 'create' && e.entity === 'line' && e.entityId === line.id), 'create event');
  for (const k of LEGACY_KEYS) assert.equal(S[k], undefined, `createLine must not write legacy ${k}`);
  assert.equal(woOf(S, 'wo1').siteReq, undefined, 'createLine must not write wo.siteReq');

  // Migrated-fixture path
  const F = loadFixture();
  const e2 = env(F);
  await e2.W.migrate(F);
  const before = legacySnapshot(F);
  const def = F.works.defs.find(x => x.companyId === 'c1' && x.name.trim() === 'ردم');
  const r2 = e2.W.createLine(F, person(F, 'p3'), { woId: 'wo2', defId: def.id, qty: 4 });
  assert.ok(r2.ok, 'createLine on migrated state failed: ' + JSON.stringify(r2));
  same(legacySnapshot(F), before, 'createLine on migrated state must not touch legacy collections');

  // Loadable in a bare Node vm context (SOP §7.1)
  const ctx = vm.createContext({ console: silentConsole });
  vm.runInContext(readFile(WORKS_PATH), ctx);
  const api = ctx.EIF_WORKS || (ctx.window && ctx.window.EIF_WORKS);
  assert.ok(api, 'works.js must load in a bare vm context and expose EIF_WORKS');
  for (const fn of ['can', 'linesFor', 'reqsFor', 'visibleWorkOrders', 'defs', 'eventsFor', 'resolveTitle', 'resolveDepartment', 'migrationReport', 'createLine', 'updateLine', 'assign', 'setStatus', 'attach', 'detach', 'replace', 'saveDef', 'saveDepartment', 'saveJobTitle', 'deactivateDepartment', 'deactivateJobTitle', 'grant', 'delegate', 'setSuperAdmin', 'migrate']) {
    assert.equal(typeof api[fn], 'function', `EIF_WORKS.${fn} missing (frozen contract)`);
  }
  same(api.LEVELS, ['none', 'view', 'edit', 'approve', 'admin']);
  same(api.SCOPES, ['assigned', 'team_view', 'team_manage', 'department_manage', 'company_manage']);
});

// =============================================================
// T-02  Rules 1, 6: Lossless legacy migration
// =============================================================
registerTest('T-02 [P2] Lossless legacy migration of the V16.49 fixture (every §6.2 row, no orphans)', async () => {
  const S = loadFixture();
  const before = legacySnapshot(S);
  const snaps = S.safeSnapshots1646.length;
  const { W } = env(S);
  const res = await W.migrate(S);
  assert.equal(res.changed, true, 'first migration must report changed:true');
  assertFixtureMigrated(W, S, before, snaps);
});

// =============================================================
// T-03  Rule 6: Idempotency, non-resurrection, crash safety
// =============================================================
registerTest('T-03 [P2] Migration is idempotent, never resurrects tombstones, and is crash-safe', async () => {
  // Idempotent
  const S = loadFixture();
  const { W } = env(S);
  await W.migrate(S);
  const snap = J(S);
  const again = await W.migrate(S);
  assert.equal(again.changed, false, 'second migrate() must report changed:false');
  same(S, snap, 'second migrate() must change nothing');

  // Non-resurrection: delete (tombstone) a migrated line, then force the tasks source to re-run
  S.works.lines = S.works.lines.filter(l => l.id !== 'mig:tasks:t1');
  S.works.tombstones.push('mig:tasks:t1');
  S.tasks.push({ id: 't5', wo: 'wo2', text: 'تمديد كابل', user: 'سارة', due: '', done: false });
  await W.migrate(S);
  assert.ok(!lineOf(S, 'mig:tasks:t1'), 'tombstoned line must never be recreated');
  assert.ok(lineOf(S, 'mig:tasks:t5'), 'changed source must be re-migrated (checksum guard)');
  same(lineOf(S, 'mig:tasks:t5').assignees.map(a => a.personId), ['p4']);
  assert.equal(S.works.migratedFrom.tasks.count, 4);

  // Crash mid-flush: no markers survive, retry succeeds
  const C = loadFixture();
  const legacy = legacySnapshot(C);
  const e = env(C);
  e.db.failNextSave = true;
  let threw = false;
  try {
    const r = await e.W.migrate(C);
    threw = !!(r && r.ok === false);
  } catch (err) { threw = true; }
  assert.ok(threw, 'a failed flush must surface as a rejected/failed migrate()');
  const markers = C.works && C.works.migratedFrom ? Object.keys(C.works.migratedFrom) : [];
  same(markers, [], 'no migratedFrom markers may remain after a crashed flush');
  assert.ok(!(e.db.persisted && e.db.persisted.works && Object.keys(e.db.persisted.works.migratedFrom || {}).length), 'nothing may be persisted by a crashed flush');
  same(legacySnapshot(C), legacy, 'crash must not touch legacy collections');
  const retry = await e.W.migrate(C);
  assert.equal(retry.changed, true);
  assert.equal(Object.keys(C.works.migratedFrom).length, 9, 'retry must write all 9 source markers');
  assert.equal(C.works.lines.length, 8, 'retry must produce the full line set exactly once');
  assert.ok(e.db.persisted && e.db.persisted.works, 'retry must persist through EIF_DB.saveState');
});

// =============================================================
// T-04  Rule 2: Multiple media per requirement in IndexedDB
// =============================================================
registerTest('T-04 [P1] 3 photos + 2 videos + 1 PDF on one requirement; byte-exact blobs; hash dedupe; 5s video rejected', async () => {
  const S = baseState();
  const { W, db } = env(S);
  const sa = person(S, 'sa1');
  const specs = [
    ['p1.jpg', 'image/jpeg', 'PHOTO-1-bytes'],
    ['p2.jpg', 'image/jpeg', 'PHOTO-2-bytes'],
    ['p3.png', 'image/png', 'PHOTO-3-bytes'],
    ['v1.mp4', 'video/mp4', 'VIDEO-1-bytes', 12],
    ['v2.mp4', 'video/mp4', 'VIDEO-2-bytes', 30],
    ['spec.pdf', 'application/pdf', '%PDF-1.4 spec']
  ];
  const files = specs.map(s => mkFile(...s));
  const saves0 = db.saves;
  const res = await W.attach(S, sa, 'R1', files);
  assert.ok(res.ok, 'attach failed: ' + JSON.stringify(res));
  assert.equal(res.value.length, 6);
  assert.equal(db.saves - saves0, 1, 'exactly one saveState per attach call');
  const R1 = reqOf(S, 'R1');
  assert.equal(R1.attachments.filter(a => !a.removedAt).length, 6, 'no cap on attachment count');
  assert.equal(R1.status, 'satisfied', 'minCount 3 reached');

  const reloaded = makeFakeDb(db.backing);
  for (const [name, type, content, dur] of specs) {
    const h = sha(content);
    const ref = R1.attachments.find(a => a.hash === h);
    assert.ok(ref, `ref for ${name} missing or hash not SHA-256 of bytes`);
    assert.equal(ref.name, name);
    assert.equal(ref.type, type);
    assert.equal(ref.size, Buffer.byteLength(content));
    assert.equal(ref.addedBy, 'sa1');
    assert.ok(!Number.isNaN(Date.parse(ref.addedAt)));
    assert.equal(ref.removedAt, null);
    assert.equal(ref.missingBinary, false);
    if (dur !== undefined) assert.equal(ref.durationSec, dur);
    const blob = await reloaded.getBlob(h);
    assert.ok(blob, `blob ${name} missing after reload`);
    same(Array.from(new Uint8Array(await blob.arrayBuffer())), Array.from(Buffer.from(content)), `bytes of ${name} must survive reload`);
    const reg = S.attachments.filter(a => a.hash === h);
    assert.equal(reg.length, 1, 'S.attachments registry: one entry per hash');
    assert.ok(reg[0].links.some(l => l.wo === 'woA' && l.lineId === 'L1' && l.reqId === 'R1' && l.category === 'work-evidence'), 'registry link {wo,lineId,reqId,category}');
  }
  assert.equal(S.works.events.filter(e => e.action === 'attach').length, 6, 'one attach event per file');

  // Same bytes on a second requirement: 1 blob, 2 refs
  const blobs0 = db.backing.size;
  const dup = await W.attach(S, sa, 'R4', [mkFile('p1-copy.jpg', 'image/jpeg', 'PHOTO-1-bytes')]);
  assert.ok(dup.ok, JSON.stringify(dup));
  assert.equal(db.backing.size, blobs0, 'identical content must be stored once');
  assert.equal(reqOf(S, 'R4').attachments[0].hash, sha('PHOTO-1-bytes'));
  const reg = S.attachments.filter(a => a.hash === sha('PHOTO-1-bytes'));
  assert.equal(reg.length, 1);
  assert.equal(reg[0].links.filter(l => l.reqId === 'R1' || l.reqId === 'R4').length, 2, 'one registry entry, two links');

  // Rejections are all-or-nothing and write nothing
  const n0 = R1.attachments.length, ev0 = S.works.events.length, b0 = db.backing.size, s0 = db.saves;
  const short = await W.attach(S, sa, 'R1', [mkFile('ok.jpg', 'image/jpeg', 'NEW-PHOTO'), mkFile('short.mp4', 'video/mp4', 'SHORT', 5)]);
  assert.equal(short.ok, false);
  assert.equal(short.code, 'VIDEO_TOO_SHORT');
  const noDur = await W.attach(S, sa, 'R1', [mkFile('nodur.mp4', 'video/mp4', 'NO-DURATION')]);
  assert.equal(noDur.code, 'VIDEO_TOO_SHORT', 'unknown video duration fails closed');
  const exe = await W.attach(S, sa, 'R1', [mkFile('x.exe', 'application/x-msdownload', 'MZ')]);
  assert.equal(exe.code, 'TYPE', 'type allowlist §2.3');
  assert.equal(R1.attachments.length, n0);
  assert.equal(S.works.events.length, ev0);
  assert.equal(db.backing.size, b0, 'rejected batch must not store any blob');
  assert.equal(db.saves, s0, 'rejected batch must not persist');

  // Permission check happens before any byte is read
  const spy = mkSpyFile('secret.jpg', 'image/jpeg', 'SECRET');
  const denied = await W.attach(S, person(S, 'nb'), 'R1', [spy]);
  assert.equal(denied.code, 'DENIED');
  assert.equal(spy.readCount, 0, 'file bytes must not be read before the permission check');
  assert.equal(db.backing.size, b0);
});

// =============================================================
// T-05  Rule 2: Attachment audit trail
// =============================================================
registerTest('T-05 [P1] attach/detach/replace each emit one audited event; detach is soft; events are append-only', async () => {
  const S = baseState();
  const { W, db } = env(S);
  const sa = person(S, 'sa1');
  const a = await W.attach(S, sa, 'R1', [mkFile('a.jpg', 'image/jpeg', 'A-bytes'), mkFile('b.jpg', 'image/jpeg', 'B-bytes')]);
  assert.ok(a.ok, JSON.stringify(a));
  const hA = sha('A-bytes'), hB = sha('B-bytes');
  const attachEv = S.works.events.filter(e => e.action === 'attach');
  assert.equal(attachEv.length, 2);
  for (const e of attachEv) {
    assert.equal(e.actorId, 'sa1');
    assert.ok(!Number.isNaN(Date.parse(e.at)), 'event.at must be ISO');
    assert.equal(e.entity, 'attachment');
    assert.equal(e.woId, 'woA');
    assert.ok('before' in e && 'after' in e, 'event must carry before/after');
    assert.ok(e.id, 'event must have an id');
  }
  assert.ok(attachEv.some(e => e.after && e.after.hash === hA));

  // detach: soft
  const prefix = J(S.works.events);
  const d = W.detach(S, sa, 'R1', hA, 'صورة خاطئة');
  assert.ok(d.ok, JSON.stringify(d));
  const refA = reqOf(S, 'R1').attachments.find(x => x.hash === hA);
  assert.ok(refA, 'detached ref must be kept');
  assert.ok(refA.removedAt && refA.removedBy === 'sa1' && refA.removeReason === 'صورة خاطئة');
  const blob = await db.getBlob(hA);
  assert.ok(blob, 'detach must never delete the blob');
  same(Array.from(new Uint8Array(await blob.arrayBuffer())), Array.from(Buffer.from('A-bytes')));
  const detachEv = S.works.events.slice(prefix.length);
  assert.equal(detachEv.length, 1, 'detach emits exactly one event');
  assert.equal(detachEv[0].action, 'detach');
  assert.equal(detachEv[0].actorId, 'sa1');
  assert.ok(detachEv[0].before && detachEv[0].before.removedAt == null && detachEv[0].after && detachEv[0].after.removedAt, 'detach before/after');
  same(S.works.events.slice(0, prefix.length), prefix, 'I-3 earlier events must be untouched');
  assert.equal(reqOf(S, 'R1').status, 'open', 'status recomputed from live refs (1 < minCount 3)');

  // replace
  const pre2 = S.works.events.length;
  const rp = await W.replace(S, sa, 'R1', hB, mkFile('b2.jpg', 'image/jpeg', 'B2-bytes'));
  assert.ok(rp.ok, JSON.stringify(rp));
  const hB2 = sha('B2-bytes');
  const R1 = reqOf(S, 'R1');
  assert.equal(R1.attachments.find(x => x.hash === hB).replacedBy, hB2);
  assert.ok(R1.attachments.find(x => x.hash === hB2 && !x.removedAt), 'successor ref added');
  const repEv = S.works.events.slice(pre2);
  assert.equal(repEv.length, 1, 'replace emits exactly one event');
  assert.equal(repEv[0].action, 'replace');
  assert.equal(repEv[0].before.hash, hB);
  assert.equal(repEv[0].after.hash, hB2);

  // Failures emit nothing
  const pre3 = S.works.events.length;
  assert.equal(W.detach(S, sa, 'R1', 'no-such-hash', 'x').ok, false);
  assert.equal(W.detach(S, sa, 'R1', hA, 'again').ok, false, 'double detach is rejected');
  assert.equal(W.detach(S, null, 'R1', hB2, 'owner off').code, 'DENIED', 'null actor denied when ownerDeviceMode is false');
  assert.equal(S.works.events.length, pre3);

  // eventsFor returns a copy
  const snap = J(S.works.events);
  const copy = W.eventsFor(S, { woId: 'woA' });
  assert.equal(copy.length, snap.filter(e => e.woId === 'woA').length);
  copy.push({ action: 'forged' });
  if (copy[0]) copy[0].action = 'tampered';
  same(S.works.events, snap, 'mutating eventsFor() output must not affect S.works.events');

  // Static: no code path in works.js mutates or deletes events
  const src = readFile(WORKS_PATH);
  const banned = [
    /events\s*\.\s*(?:splice|pop|shift|unshift|sort|reverse|fill|copyWithin)\s*\(/,
    /events\s*\.\s*length\s*=[^=]/,
    /delete\s+[\w.$\[\]'"]*events/,
    /events\s*\[[^\]]*\]\s*(?:=[^=]|\.\w+\s*=[^=])/,
    /\.events\s*=\s*(?!=)(?!\s*\[\s*\])/
  ];
  for (const re of banned) assert.ok(!re.test(src), `works.js mutates events: ${re}`);
});

// =============================================================
// T-06  Rules 2, 6: Legacy metadata-only evidence surfaced
// =============================================================
registerTest('T-06 [P2] Legacy executionEvidence without hash -> missingBinary refs, reported, never dropped', async () => {
  const S = loadFixture();
  const legacyMedia = S.executionEvidence.reduce((n, ev) => n + ev.photos.length + ev.videos.length, 0);
  const { W } = env(S);
  await W.migrate(S);
  const missing = [];
  for (const r of S.works.reqs) for (const a of r.attachments) if (a.missingBinary === true) missing.push({ r, a });
  assert.equal(legacyMedia, 4);
  assert.equal(missing.length, legacyMedia, 'every legacy photo/video must become exactly one ref');
  same(missing.map(m => m.a.name).sort(), ['clip1.mp4', 'commissioning.mp4', 'photo1.jpg', 'photo2.jpg']);
  for (const { r, a } of missing) {
    assert.ok(!a.hash, 'legacy metadata-only ref must not invent a hash');
    assert.ok(a.removedAt == null, 'legacy ref must be live, not silently removed');
    assert.ok(r.status !== 'satisfied', 'missing binaries cannot satisfy a requirement');
  }
  const kinds = missing.map(m => m.r.kind);
  assert.equal(kinds.filter(k => k === 'photo').length, 2);
  assert.equal(kinds.filter(k => k === 'video').length, 2);
  assert.equal(W.migrationReport(S).missingBinaries.length, 4, 'migration report must count all missing binaries');
});

// =============================================================
// T-07  Rule 3: Foreman selective scope
// =============================================================
registerTest('T-07a [P2] Foreman sees only assigned lines; data layer denies the rest', async () => {
  const S = baseState();
  const { W, db } = env(S);
  const fm = person(S, 'fm');
  same(W.linesFor(S, fm, 'woA').map(l => l.id).sort(), ['L1', 'L2'], 'WO with 5 lines, foreman on 2');
  same(W.linesFor(S, fm, 'woB'), [], 'unrelated WO lines invisible');
  same(J(W.visibleWorkOrders(S, fm)).sort(), ['woA'], 'only WOs with an assigned line are visible');
  same(W.reqsFor(S, fm, 'L3'), [], 'requirements of unassigned lines invisible');
  same(W.reqsFor(S, fm, 'L1').map(r => r.id).sort(), ['R1', 'R4']);

  const spy = mkSpyFile('x.jpg', 'image/jpeg', 'X');
  const denied = await W.attach(S, fm, 'R3', [spy]);
  assert.equal(denied.code, 'DENIED', 'attach to unassigned line must be DENIED at the data layer');
  assert.equal(spy.readCount, 0);
  assert.equal(db.backing.size, 0);
  const ok = await W.attach(S, fm, 'R1', [mkFile('y.jpg', 'image/jpeg', 'Y')]);
  assert.ok(ok.ok, 'attach to own line must succeed: ' + JSON.stringify(ok));

  assert.equal(W.can(S, fm, 'workorders', 'read', woOf(S, 'woA')), true, 'WO header readable');
  assert.equal(W.can(S, fm, 'workorders', 'edit', woOf(S, 'woA')), false, 'WO header not editable');
  assert.equal(W.can(S, fm, 'workorders', 'read', woOf(S, 'woB')), false, 'unrelated WO invisible');
  assert.equal(W.can(S, fm, 'execution', 'edit', lineOf(S, 'L1')), true);
  assert.equal(W.can(S, fm, 'execution', 'edit', lineOf(S, 'L3')), false, 'line-level scope inside the same WO');
  assert.equal(W.can(S, fm, 'execution', 'attach', reqOf(S, 'R3')), false, 'req record resolves through its line');
  const up = W.updateLine(S, fm, 'L3', { qty: 99 });
  assert.equal(up.code, 'DENIED');
  assert.equal(lineOf(S, 'L3').qty, 1);
});

registerTest('T-07b [P3] works_ui.js honours the frozen contract (orgPeople, execution module, no direct S mutation)', () => {
  const src = readFile('assets/js/works_ui.js');
  assert.ok(!/\bS\.persons\b/.test(src), 'works_ui.js must read S.orgPeople, not S.persons');
  const calls = [...src.matchAll(/EIF_WORKS\.can\(\s*\w+\s*,\s*[\w.]+\s*,\s*'([^']+)'\s*,\s*'([^']+)'/g)];
  assert.ok(calls.length > 0, 'works_ui.js must gate UI through EIF_WORKS.can');
  for (const [, mod, act] of calls) {
    assert.ok(MODULES.includes(mod), `unknown permission module '${mod}' (work scope module is 'execution')`);
    assert.ok(ACTIONS.includes(act), `unknown action '${act}' (ACTION_MIN keys only)`);
  }
  const mutation = /\bS\.(?:works|departments|jobTitles|orgPeople|accessAudit1617|permissionDelegations|attachments)\b[^;\n]*?(?:\.(?:push|splice|pop|shift|unshift)\s*\(|\s=(?!=))/;
  assert.ok(!mutation.test(src), 'UI must mutate state only through EIF_WORKS');
  assert.ok(src.includes('الملف الأصلي غير محفوظ'), '§2.4 missing-binary label');
});

// =============================================================
// T-08  Rule 4: Central job titles, no hardcoded text
// =============================================================
registerTest('T-08 [P2] Title rename needs 0 person writes; deletion blocked; no role-text permission logic', async () => {
  const S = baseState();
  const { W } = env(S);
  const sa = person(S, 'sa1');
  const peopleBefore = J(S.orgPeople);

  const t = S.jobTitles.find(x => x.id === 'tForeman');
  const ren = W.saveJobTitle(S, sa, Object.assign(J(t), { name: 'رئيس عمال', nameI18n: { en: 'Crew Chief' } }));
  assert.ok(ren.ok, JSON.stringify(ren));
  for (const id of ['fm', 'eng', 'engB']) assert.equal(W.resolveTitle(S, person(S, id).jobTitleId, 'ar'), 'رئيس عمال');
  assert.equal(W.resolveTitle(S, 'tForeman', 'en'), 'Crew Chief');
  same(S.orgPeople, peopleBefore, 'rename must perform zero person writes');
  assert.equal(W.resolveDepartment(S, 'dA', 'en'), 'Excavation');

  const dt = W.deactivateJobTitle(S, sa, 'tForeman');
  assert.equal(dt.code, 'HAS_ACTIVE_PERSONS');
  assert.notEqual(S.jobTitles.find(x => x.id === 'tForeman').active, false);
  const dd = W.deactivateDepartment(S, sa, 'dA');
  assert.equal(dd.code, 'HAS_ACTIVE_PERSONS');
  assert.notEqual(S.departments.find(x => x.id === 'dA').active, false);

  const empty = W.saveJobTitle(S, sa, { companyId: 'c1', departmentId: 'dB', name: 'فني احتياط', nameI18n: {}, scope: 'assigned', moduleAccess: {}, rank: 0, active: true });
  assert.ok(empty.ok, JSON.stringify(empty));
  const de = W.deactivateJobTitle(S, sa, empty.value.id);
  assert.ok(de.ok, JSON.stringify(de));
  assert.equal(S.jobTitles.find(x => x.id === empty.value.id).active, false);

  const noDept = W.saveJobTitle(S, sa, { companyId: 'c1', name: 'بدون قسم', scope: 'assigned', moduleAccess: {} });
  assert.equal(noDept.ok, false, 'every title requires departmentId');
  const saScope = W.saveJobTitle(S, sa, { companyId: 'c1', departmentId: 'dA', name: 'x', scope: 'super_admin', moduleAccess: {} });
  assert.equal(saScope.ok, false, 'super_admin is never a title scope');
  for (const x of S.jobTitles) assert.ok(x.departmentId, `title ${x.id} without departmentId`);

  // Static scan (SOP §4.2, T-08)
  const works = readFile(WORKS_PATH);
  const app = readFile('app.js');
  same(roleRegexHits(works), [], 'works.js: role-text regex found');
  same(roleRegexHits(app), [], 'app.js: role-text regex permission inference must be removed');
  for (const fn of ['can', 'inScope', 'effectiveLevel', 'effectiveScope', 'linesFor', 'reqsFor', 'visibleWorkOrders', 'grant', 'delegate', 'setSuperAdmin']) {
    for (const body of functionBodies(works, fn)) assert.ok(!PERSON_ROLE_READ.test(body), `works.js ${fn}() reads person.role`);
  }
  assert.ok(functionBodies(works, 'can').length > 0, 'works.js must declare `function can(`');
  for (const fn of ['hasPerm', 'hasPerm1617', 'isRoot', 'isRoot21', 'isTop22', 'defaultModuleAccess1618']) {
    for (const body of functionBodies(app, fn)) assert.ok(!PERSON_ROLE_READ.test(body), `app.js ${fn}() reads person.role`);
  }
  for (const body of functionBodies(app, 'allowedRoles')) {
    assert.ok(!/\[\s*['"]مدير مشاريع['"]/.test(body), 'allowedRoles() hardcoded defaults must become seed data');
  }
});

// =============================================================
// T-09  Rule 5: Hierarchical permissions, no escalation
// =============================================================
registerTest('T-09 [P2] Department scope, grant ceilings, delegation expiry, assigned isolation', async () => {
  const S = baseState();
  const { W } = env(S);
  const mgr = person(S, 'mgr'), fm = person(S, 'fm'), sup = person(S, 'sup');

  same(J(W.visibleWorkOrders(S, mgr)).sort(), ['woA', 'woA2'], 'department manager sees own dept + descendants only');
  assert.equal(W.can(S, mgr, 'workorders', 'read', woOf(S, 'woB')), false);
  assert.equal(W.can(S, mgr, 'workorders', 'read', woOf(S, 'woC')), false, 'no cross-company visibility');
  assert.equal(W.can(S, mgr, 'execution', 'approve', lineOf(S, 'L6')), true, 'descendant department line');

  const audit0 = S.accessAudit1617.length;
  assert.equal(W.grant(S, mgr, 'eng', { module: 'execution', level: 'admin' }).code, 'CEILING', 'level above own');
  assert.equal(W.grant(S, mgr, 'eng', { module: 'safety', level: 'view' }).code, 'CEILING', 'module grantor lacks');
  assert.equal(W.grant(S, mgr, 'eng', { scope: 'department_manage' }).code, 'CEILING', 'scope equal to own');
  assert.equal(W.grant(S, mgr, 'eng', { scope: 'company_manage' }).code, 'CEILING', 'scope above own');
  assert.equal(W.grant(S, mgr, 'mgr', { module: 'workorders', level: 'admin' }).code, 'CEILING', 'no self-escalation');
  const outside = W.grant(S, mgr, 'engB', { module: 'execution', level: 'view' });
  assert.equal(outside.ok, false, 'cannot edit persons outside own scope');
  assert.equal(person(S, 'engB').moduleOverrides, undefined);
  const g1 = W.grant(S, mgr, 'eng', { module: 'execution', level: 'approve' });
  assert.ok(g1.ok, JSON.stringify(g1));
  assert.equal(person(S, 'eng').moduleOverrides.execution, 'approve');
  const g2 = W.grant(S, mgr, 'eng', { scope: 'team_manage' });
  assert.ok(g2.ok, JSON.stringify(g2));
  assert.equal(person(S, 'eng').scopeOverride, 'team_manage');
  assert.equal(S.accessAudit1617.length - audit0, 2, 'each successful grant audited once; refusals not granted');

  assert.equal(W.delegate(S, mgr, { toPersonId: 'fm', module: 'workorders', level: 'edit' }).code, 'NO_EXPIRY');
  assert.equal(W.delegate(S, mgr, { toPersonId: 'fm', module: 'workorders', level: 'admin', expiresAt: '2099-01-01T00:00:00.000Z' }).code, 'CEILING');
  S.permissionDelegations.push({ id: 'dg-old', fromPersonId: 'mgr', toPersonId: 'fm', module: 'workorders', level: 'edit', expiresAt: '2020-01-01T00:00:00.000Z' });
  assert.equal(W.can(S, fm, 'workorders', 'edit', woOf(S, 'woA')), false, 'expired delegation grants nothing');
  const dg = W.delegate(S, mgr, { toPersonId: 'fm', module: 'workorders', level: 'edit', expiresAt: '2099-01-01T00:00:00.000Z' });
  assert.ok(dg.ok, JSON.stringify(dg));
  assert.equal(W.can(S, fm, 'workorders', 'edit', woOf(S, 'woA')), true, 'live delegation honoured');
  assert.equal(W.can(S, fm, 'workorders', 'edit', woOf(S, 'woB')), false, 'delegation never widens scope');

  assert.equal(W.can(S, fm, 'workorders', 'read', woOf(S, 'woB')), false, "assigned user cannot read another team's WO");
  assert.ok(!J(W.visibleWorkOrders(S, fm)).includes('woB'));
  same(J(W.visibleWorkOrders(S, sup)).sort(), ['woB'], 'team_view sees its team WOs only');
});

// =============================================================
// T-10  Rule 5: Super Admin global override
// =============================================================
registerTest('T-10 [P2] Super Admin override across companies; audited; last-admin guard; free text grants nothing', async () => {
  const S = baseState();
  const { W } = env(S);
  const sa = person(S, 'sa1');

  const records = [undefined, woOf(S, 'woA'), woOf(S, 'woC'), lineOf(S, 'L8'), reqOf(S, 'R8')];
  for (const m of MODULES) for (const a of ACTIONS) for (const rec of records) {
    assert.equal(W.can(S, sa, m, a, rec), true, `super admin denied ${m}/${a} on ${rec ? rec.id : 'no record'}`);
  }

  const audit0 = S.accessAudit1617.length;
  const cl = W.createLine(S, sa, { woId: 'woC', defId: 'dfC', qty: 1 });
  assert.ok(cl.ok, 'super admin (company c1, no title) must act in c2: ' + JSON.stringify(cl));
  const newAudit = S.accessAudit1617.slice(audit0);
  assert.ok(newAudit.some(e => e.override === true && e.actorId === 'sa1'), 'override actions audited override:true');
  const at = await W.attach(S, sa, 'R8', [mkFile('c2.jpg', 'image/jpeg', 'C2')]);
  assert.ok(at.ok, JSON.stringify(at));

  // Inactive super admin is denied (SOP §5.1 erratum)
  assert.equal(W.can(S, person(S, 'sa2'), 'execution', 'read', woOf(S, 'woA')), false, 'inactive super admin must be denied');

  // Owner Device Mode (R-3: default ON, audited)
  delete S.settings;
  assert.equal(W.can(S, null, 'execution', 'edit', woOf(S, 'woA')), true, 'ownerDeviceMode defaults ON');
  const a1 = S.accessAudit1617.length;
  const od = W.createLine(S, null, { woId: 'woA', defId: 'dfA', qty: 2 });
  assert.ok(od.ok, JSON.stringify(od));
  assert.ok(S.accessAudit1617.slice(a1).some(e => e.override === true), 'owner-device writes audited override:true');
  S.settings = { ownerDeviceMode: false };
  assert.equal(W.can(S, null, 'execution', 'read', woOf(S, 'woA')), false, 'ownerDeviceMode OFF enforces login');
  assert.equal(W.createLine(S, null, { woId: 'woA', defId: 'dfA', qty: 2 }).code, 'DENIED');

  // Last-admin guard (sa2 is inactive and does not count)
  assert.equal(W.setSuperAdmin(S, person(S, 'mgr'), 'eng', true).code, 'DENIED', 'only a super admin can toggle');
  assert.equal(W.setSuperAdmin(S, sa, 'sa1', false).code, 'LAST_ADMIN');
  assert.equal(person(S, 'sa1').isSuperAdmin, true);
  const a2 = S.accessAudit1617.length;
  assert.ok(W.setSuperAdmin(S, sa, 'eng', true).ok);
  assert.ok(W.setSuperAdmin(S, sa, 'eng', false).ok);
  assert.equal(S.accessAudit1617.length - a2, 2, 'every super admin toggle audited');
  assert.equal(W.setSuperAdmin(S, sa, 'sa1', false).code, 'LAST_ADMIN');

  // Free text grants nothing
  const fake = person(S, 'fake');
  assert.equal(W.can(S, fake, 'organization', 'configure'), false, 'role text "Super Admin" grants nothing');
  assert.equal(W.can(S, fake, 'execution', 'edit', woOf(S, 'woA')), false, 'legacy accessScope super_admin grants nothing at runtime');
  assert.equal(W.can(S, fake, 'workorders', 'read', woOf(S, 'woC')), false);
  assert.equal(W.setSuperAdmin(S, fake, 'fake', true).code, 'DENIED');
});

// =============================================================
// T-11  Rule 6: Backward-compatible round trip
// =============================================================
const V2_STORES = [
  'companies', 'workorders', 'permits', 'materials', 'issues', 'checklists', 'qualityProfiles', 'tasks', 'coord',
  'safety', 'exec', 'surveys', 'governance', 'reinstatement', 'attachments', 'orgPeople', 'orgTeams', 'equipment',
  'archiveFilesV165', 'codexDecisions1646', 'safeSnapshots1646', 'users', 'locations', 'workTypes', 'crewPeople',
  'crewAuthorizations', 'qualityInspections', 'executionEvidence', 'whatsapp', 'files', 'smartReads', 'hrPeople',
  'safetyFiles', 'archive', 'unmapped_state', 'settings', 'blobs'
];
const V3_WORK_STORES = {
  worksDefs: ['companyId', 'code'],
  worksLines: ['woId', 'defId', 'status', 'assigneeIds'],
  worksReqs: ['lineId', 'woId', 'status'],
  worksEvents: ['woId', 'entityId', 'at']
};

/** indexedDB.open() that fires onupgradeneeded like a browser and records destructive calls. */
function makeUpgradableIDB(db, log) {
  const origCreate = db.createObjectStore.bind(db);
  db.createObjectStore = (name, options = {}) => {
    const store = origCreate(name, options);
    const origIdx = store.createIndex.bind(store);
    store.idxOptions = {};
    store.createIndex = (n, kp, opts = {}) => { store.idxOptions[n] = Object.assign({ keyPath: kp }, opts); return origIdx(n, kp, opts); };
    return store;
  };
  db.deleteObjectStore = (name) => { log.deleted.push(name); db.stores.delete(name); };
  return {
    open(name, version) {
      const req = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, transaction: null };
      setTimeout(() => {
        req.result = db;
        if (version > db.version) {
          const oldVersion = db.version;
          db.version = version;
          log.upgrades.push([oldVersion, version]);
          if (typeof req.onupgradeneeded === 'function') req.onupgradeneeded({ target: req, oldVersion, newVersion: version });
        }
        if (typeof req.onsuccess === 'function') req.onsuccess({ target: req });
      }, 0);
      return req;
    }
  };
}

function withGlobals(overrides, fn) {
  const keys = Object.keys(overrides);
  const saved = {};
  for (const k of keys) { saved[k] = { had: Object.prototype.hasOwnProperty.call(global, k), v: global[k] }; }
  const restore = () => { for (const k of keys) { if (saved[k].had) global[k] = saved[k].v; else delete global[k]; } };
  for (const k of keys) { if (overrides[k] === undefined) delete global[k]; else global[k] = overrides[k]; }
  return Promise.resolve().then(fn).finally(restore);
}

registerTest('T-11a [P1] IndexedDB v2 -> v3 upgrade is strictly additive (all prior stores and records intact)', async () => {
  const dbMod = require('../assets/js/db.js');
  assert.equal(dbMod.DB_VERSION, 3, 'db.js DB_VERSION must be 3');
  for (const [name, idx] of Object.entries(V3_WORK_STORES)) {
    const def = dbMod.STORE_DEFINITIONS.find(s => s.name === name);
    assert.ok(def, `STORE_DEFINITIONS missing ${name}`);
    assert.equal(def.keyPath, 'id');
    same((def.indexes || []).map(i => i.name).sort(), idx.slice().sort(), `${name} indexes`);
  }
  const ai = dbMod.STORE_DEFINITIONS.find(s => s.name === 'worksLines').indexes.find(i => i.name === 'assigneeIds');
  assert.equal(ai.multiEntry, true, 'worksLines.assigneeIds must be multiEntry');

  const log = { deleted: [], upgrades: [] };
  const v2 = new MockIDBDatabase('EngineerIslamFoudaDB', 2);
  for (const name of V2_STORES) {
    const kp = name === 'blobs' || name === 'attachments' ? 'hash' : (name === 'materials' ? 'code' : (name === 'settings' || name === 'unmapped_state' ? 'key' : 'id'));
    v2.createObjectStore(name, { keyPath: kp });
  }
  await v2.getObjectStore('workorders').put({ id: 'w1', no: 'N-1', companyId: 'c1', siteReq: { d1: { selected: true, qty: 3 } } });
  await v2.getObjectStore('orgPeople').put({ id: 'p1', name: 'علي', role: 'مهندس' });
  await v2.getObjectStore('executionEvidence').put({ id: 'ev1', wo: 'w1', photos: [{ name: 'a.jpg' }] });
  await v2.getObjectStore('blobs').put({ hash: 'h1', data: 'BYTES', storedAt: '2026-09-01' });
  await v2.getObjectStore('settings').put({ key: 'master_state_snapshot', value: { workorders: [{ id: 'w1' }] } });
  await v2.getObjectStore('unmapped_state').put({ key: 'jobTitles1624', value: [{ id: 'jt1' }] });
  const before = {};
  for (const name of V2_STORES) before[name] = J(Array.from(v2.getObjectStore(name).data.entries()));
  const clears = [];
  for (const name of V2_STORES) {
    const st = v2.getObjectStore(name);
    const orig = st.clear.bind(st);
    st.clear = () => { clears.push(name); return orig(); };
  }

  await withGlobals({ indexedDB: makeUpgradableIDB(v2, log) }, async () => {
    const pm = new dbMod.PersistenceManager();
    const opened = await pm.openDatabase();
    assert.equal(opened, v2, 'must open the existing database, not a fallback');
  });
  same(log.upgrades, [[2, 3]], 'exactly one v2 -> v3 upgrade');
  same(log.deleted, [], 'onupgradeneeded must never delete a store');
  same(clears, [], 'onupgradeneeded must never clear a store');
  for (const name of V2_STORES) {
    assert.ok(v2.hasObjectStore(name), `prior store ${name} lost`);
    same(J(Array.from(v2.getObjectStore(name).data.entries())), before[name], `records of ${name} changed by upgrade`);
  }
  for (const [name, idx] of Object.entries(V3_WORK_STORES)) {
    assert.ok(v2.hasObjectStore(name), `upgrade must create ${name}`);
    const st = v2.getObjectStore(name);
    assert.equal(st.keyPath, 'id');
    for (const i of idx) assert.ok(st.indexes.has(i), `${name} index ${i} missing`);
  }
  assert.equal(v2.getObjectStore('worksLines').idxOptions.assigneeIds.multiEntry, true, 'multiEntry must be passed to createIndex');
});

registerTest('T-11b [P1] S.works persists into works* stores + settings works.meta and rehydrates deep-equal', async () => {
  const dbMod = require('../assets/js/db.js');
  const log = { deleted: [], upgrades: [] };
  const idbDb = new MockIDBDatabase('EngineerIslamFoudaDB', 0);
  const fakeIDB = makeUpgradableIDB(idbDb, log);
  const ls = new MockLocalStorage();
  ls.setItem('EIF_MIGRATION_COMPLETE_V16_48', 'true');

  const state = baseState();
  state.works.events.push(
    { id: 'e1', at: '2026-09-28T01:00:00.000Z', actorId: 'sa1', actorName: 'المالك', entity: 'line', entityId: 'L1', woId: 'woA', action: 'create', before: null, after: { qty: 1 } },
    { id: 'e2', at: '2026-09-28T02:00:00.000Z', actorId: 'sa1', actorName: 'المالك', entity: 'line', entityId: 'L1', woId: 'woA', action: 'assign', before: { assigneeIds: [] }, after: { assigneeIds: ['fm'] } }
  );
  state.works.tombstones.push('mig:tasks:tX');
  state.works.migratedFrom.tasks = { count: 1, at: '2026-09-28T00:00:00.000Z', checksum: 'abc' };
  const original = J(state.works);

  await withGlobals({ indexedDB: fakeIDB, localStorage: ls, S: state }, async () => {
    const pm = new dbMod.PersistenceManager();
    const payload = pm._prepareFlushPayload(state);
    same(byId(payload.worksDefs), byId(original.defs), 'worksDefs payload');
    same(byId(payload.worksReqs), byId(original.reqs), 'worksReqs payload');
    same(byId(payload.worksEvents), byId(original.events), 'worksEvents payload');
    assert.equal(payload.worksLines.length, original.lines.length);
    for (const rec of payload.worksLines) {
      const src = original.lines.find(l => l.id === rec.id);
      same(rec.assigneeIds, src.assignees.map(a => a.personId), `derived assigneeIds for ${rec.id}`);
    }
    const meta = payload.settings.find(s => s.key === 'works.meta');
    assert.ok(meta, 'settings must hold works.meta');
    same(meta.value, { schema: 1, migratedFrom: original.migratedFrom, tombstones: original.tombstones });
    assert.ok(!payload.unmapped_state.some(u => u.key === 'works'), 'S.works must not also be stored in unmapped_state');

    pm.isDirty = true;
    assert.equal(await pm.flush(), true, 'flush must succeed on v3');
    assert.equal(idbDb.getObjectStore('worksLines').data.size, original.lines.length);

    // Remove the catch-all copies so rehydration must come from the works* stores
    const snapRec = idbDb.getObjectStore('settings').data.get('master_state_snapshot');
    if (snapRec && snapRec.value) delete snapRec.value.works;
    idbDb.getObjectStore('unmapped_state').data.delete('works');

    global.S = {};
    const pm2 = new dbMod.PersistenceManager();
    const S2 = await pm2.loadStateIntoMemory();
    assert.ok(S2.works, 'S.works must rehydrate from IndexedDB');
    assert.equal(S2.works.schema, 1);
    same(S2.works.migratedFrom, original.migratedFrom);
    same(S2.works.tombstones, original.tombstones);
    same(byId(S2.works.defs), byId(original.defs));
    same(byId(S2.works.lines), byId(original.lines), 'lines rehydrate without the derived assigneeIds');
    same(byId(S2.works.reqs), byId(original.reqs));
    same(S2.works.events, original.events, 'events rehydrate in (at, id) order');
  });
});

registerTest('T-11c [P1] V16.50 JSON and SQLite export -> import is deep-equal for works, departments, jobTitles', async () => {
  const backup = require('../assets/js/backup.js');
  const fx = loadFixture();
  const state = baseState();
  for (const k of LEGACY_KEYS) state[k] = fx[k];
  state.works.events.push({ id: 'e1', at: '2026-09-28T01:00:00.000Z', actorId: 'sa1', actorName: 'المالك', entity: 'attachment', entityId: 'R1', woId: 'woA', action: 'attach', before: null, after: { hash: 'h' } });
  reqOf(state, 'R1').attachments.push({ hash: 'h', name: 'a.jpg', type: 'image/jpeg', size: 3, durationSec: null, addedBy: 'sa1', addedAt: '2026-09-28T01:00:00.000Z', removedBy: null, removedAt: null, removeReason: null, replacedBy: null, missingBinary: false });
  state.permissionDelegations.push({ id: 'dg1', fromPersonId: 'mgr', toPersonId: 'fm', module: 'workorders', level: 'edit', expiresAt: '2099-01-01T00:00:00.000Z' });
  state.accessAudit1617.push({ at: '2026-09-28T00:00:00.000Z', actorId: 'sa1', action: 'grant', override: true });
  person(state, 'eng').moduleOverrides = { execution: 'approve' };
  person(state, 'eng').scopeOverride = 'team_manage';
  const personFields = (S) => (S.orgPeople || []).map(p => ({ id: p.id, jobTitleId: p.jobTitleId ?? null, departmentId: p.departmentId ?? null, isSuperAdmin: !!p.isSuperAdmin, moduleOverrides: p.moduleOverrides || null, scopeOverride: p.scopeOverride || null })).sort((a, b) => a.id.localeCompare(b.id));
  const expected = J(state);

  await withGlobals({ EIF_DB: undefined, EIF_WORKS: undefined, refresh: undefined, S: {} }, async () => {
    const json = backup.exportJSON(state);
    global.S = {};
    const ok = await backup.importJSON(json);
    assert.ok(ok, 'importJSON failed');
    const S = global.S;
    same(S.works, expected.works, 'JSON round trip: works');
    same(S.departments, expected.departments, 'JSON round trip: departments');
    same(S.jobTitles, expected.jobTitles, 'JSON round trip: jobTitles');
    same(S.permissionDelegations, expected.permissionDelegations, 'JSON round trip: permissionDelegations');
    same(S.accessAudit1617, expected.accessAudit1617, 'JSON round trip: accessAudit1617');
    for (const k of LEGACY_KEYS) same(S[k], expected[k], `JSON round trip must keep legacy ${k} (retained through V16.51)`);
    same(personFields(S), personFields(expected), 'JSON round trip: person title/department/super-admin/override fields');

    const u8 = await backup.exportSQLite(state);
    assert.ok(u8 && u8.length > 100, 'exportSQLite produced no database');
    global.S = {};
    const ok2 = await backup.importSQLite(u8);
    assert.ok(ok2, 'importSQLite failed');
    const Q = global.S;
    same(byId(Q.works && Q.works.defs), byId(expected.works.defs), 'SQLite round trip: works.defs');
    same(byId(Q.works && Q.works.lines), byId(expected.works.lines), 'SQLite round trip: works.lines');
    same(byId(Q.works && Q.works.reqs), byId(expected.works.reqs), 'SQLite round trip: works.reqs');
    same(Q.works && Q.works.events, expected.works.events, 'SQLite round trip: works.events');
    same({ schema: Q.works.schema, migratedFrom: Q.works.migratedFrom, tombstones: Q.works.tombstones }, { schema: 1, migratedFrom: expected.works.migratedFrom, tombstones: expected.works.tombstones }, 'SQLite round trip: works meta');
    same(byId(Q.departments), byId(expected.departments), 'SQLite round trip: departments');
    same(byId(Q.jobTitles), byId(expected.jobTitles), 'SQLite round trip: jobTitles');
    same(personFields(Q), personFields(expected), 'SQLite round trip: person title/department/super-admin/override fields');
  });
});

registerTest('T-11d [P2] Importing a V16.49 backup auto-migrates and passes the T-02 oracle', async () => {
  const backup = require('../assets/js/backup.js');
  const fx = loadFixture();
  const before = legacySnapshot(fx);
  const db = makeFakeDb();
  const { W, win } = loadWorks({ EIF_DB: db });
  db.win = win;
  await withGlobals({ EIF_DB: undefined, EIF_WORKS: W, refresh: undefined, S: {} }, async () => {
    const ok = await backup.importJSON(JSON.stringify(fx));
    assert.ok(ok, 'importJSON rejected a V16.49 full-state backup');
    const S = global.S;
    for (const k of LEGACY_KEYS) assert.ok(Array.isArray(S[k]) && S[k].length > 0, `V16.49 import dropped legacy ${k}`);
    assertFixtureMigrated(W, S, before, 0);
  });
});

registerTest('T-11f [P1] works.js is wired for offline boot (index.html db.js < works.js < app.js; sw.js precache)', () => {
  assert.ok(fs.existsSync(getFilePath(WORKS_PATH)), 'assets/js/works.js missing');
  const html = readFile('index.html');
  const order = ['assets/js/db.js', 'assets/js/works.js', 'app.js'].map(src => html.indexOf('<script src="' + src + '"'));
  assert.ok(order.every(i => i >= 0), 'index.html must load db.js, works.js and app.js via <script src>');
  assert.ok(order[0] < order[1] && order[1] < order[2], 'script order must be db.js -> works.js -> app.js');
  assert.ok(readFile('sw.js').includes("'./assets/js/works.js'"), 'sw.js PRECACHE_ASSETS must include ./assets/js/works.js');
});

registerTest('T-11e [ALL] Baseline runtime verification stays 17/17', () => {
  const r = childProcess.spawnSync(process.execPath, [getFilePath('tests/verify_m2_runtime.js')], { cwd: getFilePath('.'), encoding: 'utf8', timeout: 180000 });
  assert.equal(r.status, 0, 'verify_m2_runtime.js failed:\n' + String(r.stdout || '').slice(-1500) + String(r.stderr || '').slice(-500));
  assert.ok(/17\s*\/\s*17 tests passed/.test(r.stdout), 'expected 17 / 17 runtime checks');
});
