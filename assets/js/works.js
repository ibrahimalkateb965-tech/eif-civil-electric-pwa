/**
 * assets/js/works.js
 * Engineer Islam Fouda Work Management System — Work Center Domain Engine (V16.50)
 *
 * Pure domain logic, no DOM access, exposed as window.EIF_WORKS. Loadable in a bare
 * Node vm context. Dependencies are read at CALL TIME through the global object only:
 * global.EIF_DB.putBlob/getBlob/saveState and (global.crypto || globalThis.crypto).subtle.
 *
 * Invariants honored:
 * - I-1: No orphan lines or reqs; line companyId matches its WO; req woId matches its line.
 * - I-2: No copied names onto lines (def name is resolved through defId).
 * - I-3: S.works.events are append-only; the only write is push().
 * - I-4: Central Job Titles ↔ Departments ↔ Persons; no hardcoded role text or regex.
 * - I-5: No WO header duplication onto lines.
 * - R-3: Owner Device Mode defaults ON (actor == null allowed unless settings.ownerDeviceMode === false).
 */

(function (global) {
  'use strict';

  const LEVELS = ['none', 'view', 'edit', 'approve', 'admin'];
  const SCOPES = ['assigned', 'team_view', 'team_manage', 'department_manage', 'company_manage'];
  const LEVEL_RANK = { none: 0, view: 1, edit: 2, approve: 3, admin: 4 };
  const SCOPE_RANK = { assigned: 1, team_view: 2, team_manage: 3, department_manage: 4, company_manage: 5 };
  const ACTION_MIN = { read: 1, create: 2, edit: 2, attach: 2, approve: 3, reject: 3, grant: 4, configure: 4 };

  const ALLOWED_TYPE_PREFIXES = ['image/', 'video/', 'text/', 'application/vnd.openxmlformats-officedocument.'];
  const ALLOWED_TYPE_EXACT = ['application/pdf', 'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint'];

  let uidCounter = 0;

  function uid(prefix) {
    const c = global.crypto || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
    if (c && typeof c.randomUUID === 'function') return prefix + '-' + c.randomUUID();
    uidCounter++;
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + uidCounter;
  }

  async function sha256Hex(buffer) {
    const c = global.crypto || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
    if (!c || !c.subtle) throw new Error('[EIF_WORKS] crypto.subtle unavailable');
    const digest = await c.subtle.digest('SHA-256', buffer);
    const bytes = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) hex += ('0' + bytes[i].toString(16)).slice(-2);
    return hex;
  }

  function fastChecksum(data) {
    const str = typeof data === 'string' ? data : JSON.stringify(data || '');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return 'chk:' + Math.abs(hash).toString(16) + ':' + str.length;
  }

  function norm(str) {
    return String(str || '').trim();
  }

  function findReq(S, reqId) {
    const w = S && S.works ? S.works : null;
    if (!w || !Array.isArray(w.reqs)) return null;
    return w.reqs.find(r => r && r.id === reqId) || null;
  }

  function findLine(S, lineId) {
    const w = S && S.works ? S.works : null;
    if (!w || !Array.isArray(w.lines)) return null;
    return w.lines.find(l => l && l.id === lineId) || null;
  }

  function findWO(S, woId) {
    if (!S || !Array.isArray(S.workorders)) return null;
    return S.workorders.find(w => w && w.id === woId) || null;
  }

  function pushEvent(S, evt) {
    if (S && S.works && Array.isArray(S.works.events)) {
      S.works.events.push({
        id: uid('evt'),
        at: evt.at || new Date().toISOString(),
        actorId: evt.actorId,
        actorName: evt.actorName,
        entity: evt.entity,
        entityId: evt.entityId,
        woId: evt.woId,
        action: evt.action,
        before: evt.before !== undefined ? evt.before : null,
        after: evt.after !== undefined ? evt.after : null
      });
    }
  }

  function pushAudit(S, entry) {
    if (!S) return;
    if (!Array.isArray(S.accessAudit1617)) S.accessAudit1617 = [];
    S.accessAudit1617.push(Object.assign({
      id: uid('aud'),
      at: new Date().toISOString()
    }, entry));
  }

  function recomputeStatus(req) {
    if (!req || req.status === 'rejected') return;
    const refs = Array.isArray(req.attachments) ? req.attachments : [];
    let live = 0;
    for (const a of refs) {
      if (a && !a.removedAt && !a.replacedBy && !a.missingBinary) live++;
    }
    req.status = live >= (req.minCount || 1) ? 'satisfied' : 'open';
  }

  function typeAllowed(t) {
    if (!t) return false;
    for (const p of ALLOWED_TYPE_PREFIXES) if (t.indexOf(p) === 0) return true;
    for (const p of ALLOWED_TYPE_EXACT) if (t === p) return true;
    return false;
  }

  function getDescendantDeptIds(S, rootDeptId) {
    const res = new Set([rootDeptId]);
    if (!S || !Array.isArray(S.departments)) return res;
    let added = true;
    while (added) {
      added = false;
      for (const d of S.departments) {
        if (d && d.parentId && res.has(d.parentId) && !res.has(d.id)) {
          res.add(d.id);
          added = true;
        }
      }
    }
    return res;
  }

  function effectiveScope(S, actor) {
    if (!actor) return 'assigned';
    if (actor.scopeOverride) return actor.scopeOverride;
    const title = (S && Array.isArray(S.jobTitles)) ? S.jobTitles.find(t => t.id === actor.jobTitleId) : null;
    return (title && title.scope) || 'assigned';
  }

  function effectiveLevel(S, actor, module) {
    if (!actor) return 'none';
    const title = (S && Array.isArray(S.jobTitles)) ? S.jobTitles.find(t => t.id === actor.jobTitleId) : null;
    let rank = 0;
    if (title && title.moduleAccess && title.moduleAccess[module]) {
      rank = Math.max(rank, LEVEL_RANK[title.moduleAccess[module]] || 0);
    }
    if (actor.moduleOverrides && actor.moduleOverrides[module]) {
      rank = Math.max(rank, LEVEL_RANK[actor.moduleOverrides[module]] || 0);
    }
    if (S && Array.isArray(S.permissionDelegations)) {
      const nowIso = new Date().toISOString();
      for (const d of S.permissionDelegations) {
        if (d && d.toPersonId === actor.id && d.module === module) {
          if (!d.expiresAt || d.expiresAt > nowIso) {
            rank = Math.max(rank, LEVEL_RANK[d.level] || 0);
          }
        }
      }
    }
    return LEVELS[rank] || 'none';
  }

  function inScope(S, actor, record) {
    if (!record) return true;
    const sc = effectiveScope(S, actor);

    // Resolve WO and line context
    let targetWo = null;
    let targetLine = null;
    let recCompanyId = record.companyId || null;

    if (record.lineId !== undefined) {
      // It's a Requirement
      targetLine = findLine(S, record.lineId);
      targetWo = targetLine ? findWO(S, targetLine.woId) : findWO(S, record.woId);
      recCompanyId = targetLine ? targetLine.companyId : (targetWo ? targetWo.companyId : recCompanyId);
    } else if (record.defId !== undefined && record.woId !== undefined) {
      // It's a WorkLine
      targetLine = record;
      targetWo = findWO(S, record.woId);
      recCompanyId = record.companyId || (targetWo ? targetWo.companyId : recCompanyId);
    } else if (record.no !== undefined || record.workDescription !== undefined) {
      // It's a WorkOrder
      targetWo = record;
      recCompanyId = record.companyId || recCompanyId;
    }

    if (recCompanyId && actor.companyId && recCompanyId !== actor.companyId) {
      return false;
    }

    if (sc === 'company_manage') {
      return !recCompanyId || !actor.companyId || recCompanyId === actor.companyId;
    }

    if (sc === 'department_manage') {
      const actorDept = actor.departmentId || (S.jobTitles.find(t => t.id === actor.jobTitleId) || {}).departmentId;
      if (!actorDept) return false;
      const deptTree = getDescendantDeptIds(S, actorDept);
      if (targetWo && targetWo.departmentId && deptTree.has(targetWo.departmentId)) return true;
      if (targetLine && targetLine.departmentId && deptTree.has(targetLine.departmentId)) return true;
      return false;
    }

    if (sc === 'team_manage' || sc === 'team_view') {
      if (!actor.teamId) return false;
      if (targetWo && targetWo.teamId === actor.teamId) return true;
      if (targetLine && targetLine.teamId === actor.teamId) return true;
      return false;
    }

    // Default 'assigned' scope
    if (targetLine) {
      return Array.isArray(targetLine.assignees) && targetLine.assignees.some(a => a && a.personId === actor.id);
    }
    if (targetWo) {
      if (targetWo.assignedToPersonId === actor.id || targetWo.assignedPersonId === actor.id || targetWo.assignedEngineerId === actor.id) return true;
      if (targetWo.assign === actor.name || targetWo.assignedTo === actor.name) return true;
      // Also visible if assigned to any line inside this WO
      const lines = (S && S.works && Array.isArray(S.works.lines)) ? S.works.lines : [];
      return lines.some(l => l && l.woId === targetWo.id && Array.isArray(l.assignees) && l.assignees.some(a => a && a.personId === actor.id));
    }

    return true;
  }

  function can(S, actor, module, action, record) {
    if (actor == null) {
      return !(S && S.settings && S.settings.ownerDeviceMode === false);
    }
    if (actor.active === false) return false;
    if (actor.isSuperAdmin === true) return true;

    // Must have a valid title
    if (!actor.jobTitleId) return false;
    const title = (S && Array.isArray(S.jobTitles)) ? S.jobTitles.find(t => t.id === actor.jobTitleId) : null;
    if (!title || title.active === false) return false;

    // Check level rank
    const effLev = effectiveLevel(S, actor, module);
    const reqMin = ACTION_MIN[action] || 1;
    if (LEVEL_RANK[effLev] < reqMin) return false;

    // Check scope
    if (record && !inScope(S, actor, record)) return false;

    return true;
  }

  function linesFor(S, actor, woIdOrOpts) {
    let woId = typeof woIdOrOpts === 'string' ? woIdOrOpts : (woIdOrOpts && woIdOrOpts.woId);
    const w = S && S.works ? S.works : null;
    if (!w || !Array.isArray(w.lines)) return [];
    return w.lines.filter(l => {
      if (!l) return false;
      if (woId && l.woId !== woId) return false;
      return can(S, actor, 'execution', 'read', l);
    });
  }

  function reqsFor(S, actor, lineId) {
    const line = findLine(S, lineId);
    if (!line) return [];
    if (!can(S, actor, 'execution', 'read', line)) return [];
    const w = S && S.works ? S.works : null;
    if (!w || !Array.isArray(w.reqs)) return [];
    return w.reqs.filter(r => r && r.lineId === lineId);
  }

  function visibleWorkOrders(S, actor) {
    if (!S || !Array.isArray(S.workorders)) return [];
    return S.workorders.filter(wo => {
      if (!wo) return false;
      return can(S, actor, 'workorders', 'read', wo);
    }).map(wo => wo.id);
  }

  function defs(S, companyIdOrActor, opts) {
    const w = S && S.works ? S.works : null;
    if (!w || !Array.isArray(w.defs)) return [];
    let cid = typeof companyIdOrActor === 'string' ? companyIdOrActor : (companyIdOrActor && companyIdOrActor.companyId);
    const includeInactive = !!(opts && opts.includeInactive);
    return w.defs.filter(d => {
      if (!d) return false;
      if (cid && d.companyId && d.companyId !== cid) return false;
      if (!includeInactive && d.active === false) return false;
      return true;
    });
  }

  function eventsFor(S, filter) {
    const w = S && S.works ? S.works : null;
    if (!w || !Array.isArray(w.events)) return [];
    const flt = filter || {};
    return w.events.filter(e => {
      if (!e) return false;
      if (flt.woId && e.woId !== flt.woId) return false;
      if (flt.entityId && e.entityId !== flt.entityId) return false;
      return true;
    }).map(e => JSON.parse(JSON.stringify(e)));
  }

  function resolveTitle(S, jobTitleId, lang) {
    if (!jobTitleId) return '';
    const title = (S && Array.isArray(S.jobTitles)) ? S.jobTitles.find(t => t.id === jobTitleId) : null;
    if (!title) return String(jobTitleId);
    if (lang && lang !== 'ar' && title.nameI18n && title.nameI18n[lang]) {
      return title.nameI18n[lang];
    }
    return title.name || '';
  }

  function resolveDepartment(S, departmentId, lang) {
    if (!departmentId) return '';
    const dept = (S && Array.isArray(S.departments)) ? S.departments.find(d => d.id === departmentId) : null;
    if (!dept) return String(departmentId);
    if (lang && lang !== 'ar' && dept.nameI18n && dept.nameI18n[lang]) {
      return dept.nameI18n[lang];
    }
    return dept.name || '';
  }

  function createLine(S, actor, input) {
    if (!input || !input.woId || !input.defId) return { ok: false, code: 'INVALID_INPUT' };
    const wo = findWO(S, input.woId);
    if (!wo) return { ok: false, code: 'NOT_FOUND' };
    if (!can(S, actor, 'execution', 'create', wo)) return { ok: false, code: 'DENIED' };

    const def = (S.works && Array.isArray(S.works.defs)) ? S.works.defs.find(d => d.id === input.defId) : null;
    const lineId = uid('line');
    const line = {
      id: lineId,
      companyId: wo.companyId || (actor ? actor.companyId : 'c1'),
      woId: input.woId,
      defId: input.defId,
      qty: Number(input.qty || 1),
      unit: input.unit || (def ? def.unit : 'م'),
      status: 'planned',
      assignees: Array.isArray(input.assignees) ? input.assignees : [],
      due: input.due || '',
      progressPct: 0,
      notes: input.notes || '',
      createdAt: new Date().toISOString(),
      createdBy: actor ? actor.id : 'owner-device',
      updatedAt: new Date().toISOString(),
      updatedBy: actor ? actor.id : 'owner-device',
      legacyRef: null
    };

    if (!Array.isArray(S.works.lines)) S.works.lines = [];
    S.works.lines.push(line);

    // Spawn requirements from reqTemplate
    if (def && Array.isArray(def.reqTemplate)) {
      if (!Array.isArray(S.works.reqs)) S.works.reqs = [];
      for (const tpl of def.reqTemplate) {
        S.works.reqs.push({
          id: uid('req'),
          lineId: line.id,
          woId: line.woId,
          kind: tpl.kind || 'photo',
          label: tpl.label || '',
          stage: tpl.stage || 'during',
          minCount: tpl.minCount || 1,
          minVideoSec: tpl.minVideoSec || 10,
          attachments: [],
          status: 'open',
          legacyRef: null
        });
      }
    }

    pushEvent(S, {
      actorId: actor ? actor.id : 'owner-device',
      actorName: actor ? actor.name : 'Owner Device',
      entity: 'line',
      entityId: line.id,
      woId: line.woId,
      action: 'create',
      before: null,
      after: { id: line.id, defId: line.defId, qty: line.qty }
    });

    if (!actor || actor.isSuperAdmin) {
      pushAudit(S, {
        actorId: actor ? actor.id : 'owner-device',
        action: 'create_line',
        entity: 'line',
        entityId: line.id,
        override: true
      });
    }

    if (global.EIF_DB && typeof global.EIF_DB.saveState === 'function') {
      global.EIF_DB.saveState().catch(() => {});
    }
    return { ok: true, value: line };
  }

  function updateLine(S, actor, lineId, patch) {
    const line = findLine(S, lineId);
    if (!line) return { ok: false, code: 'NOT_FOUND' };
    if (!can(S, actor, 'execution', 'edit', line)) return { ok: false, code: 'DENIED' };

    const before = { qty: line.qty, due: line.due, notes: line.notes, progressPct: line.progressPct };
    if (patch.qty !== undefined) line.qty = patch.qty;
    if (patch.due !== undefined) line.due = patch.due;
    if (patch.notes !== undefined) line.notes = patch.notes;
    if (patch.progressPct !== undefined) line.progressPct = patch.progressPct;
    line.updatedAt = new Date().toISOString();
    line.updatedBy = actor ? actor.id : 'owner-device';

    pushEvent(S, {
      actorId: actor ? actor.id : 'owner-device',
      actorName: actor ? actor.name : 'Owner Device',
      entity: 'line',
      entityId: line.id,
      woId: line.woId,
      action: 'update',
      before,
      after: patch
    });

    if (global.EIF_DB && typeof global.EIF_DB.saveState === 'function') {
      global.EIF_DB.saveState().catch(() => {});
    }
    return { ok: true, value: line };
  }

  function assign(S, actor, lineId, assignees) {
    const line = findLine(S, lineId);
    if (!line) return { ok: false, code: 'NOT_FOUND' };
    if (!can(S, actor, 'execution', 'edit', line)) return { ok: false, code: 'DENIED' };

    const before = (line.assignees || []).slice();
    line.assignees = Array.isArray(assignees) ? assignees.map(a => typeof a === 'string' ? { personId: a, role: 'foreman' } : a) : [];
    line.updatedAt = new Date().toISOString();
    line.updatedBy = actor ? actor.id : 'owner-device';

    pushEvent(S, {
      actorId: actor ? actor.id : 'owner-device',
      actorName: actor ? actor.name : 'Owner Device',
      entity: 'line',
      entityId: line.id,
      woId: line.woId,
      action: 'assign',
      before,
      after: line.assignees
    });

    if (global.EIF_DB && typeof global.EIF_DB.saveState === 'function') {
      global.EIF_DB.saveState().catch(() => {});
    }
    return { ok: true, value: line };
  }

  function setStatus(S, actor, lineId, status) {
    const line = findLine(S, lineId);
    if (!line) return { ok: false, code: 'NOT_FOUND' };
    if (!can(S, actor, 'execution', 'edit', line)) return { ok: false, code: 'DENIED' };

    const before = line.status;
    line.status = status;
    line.updatedAt = new Date().toISOString();
    line.updatedBy = actor ? actor.id : 'owner-device';

    pushEvent(S, {
      actorId: actor ? actor.id : 'owner-device',
      actorName: actor ? actor.name : 'Owner Device',
      entity: 'line',
      entityId: line.id,
      woId: line.woId,
      action: 'status',
      before: { status: before },
      after: { status }
    });

    if (global.EIF_DB && typeof global.EIF_DB.saveState === 'function') {
      global.EIF_DB.saveState().catch(() => {});
    }
    return { ok: true, value: line };
  }

  function saveDef(S, actor, defInput) {
    if (!defInput || !defInput.name) return { ok: false, code: 'INVALID_INPUT' };
    if (!can(S, actor, 'organization', 'edit')) return { ok: false, code: 'DENIED' };

    if (!S.works) S.works = { schema: 1, migratedFrom: {}, tombstones: [], defs: [], lines: [], reqs: [], events: [] };
    if (!Array.isArray(S.works.defs)) S.works.defs = [];

    let def = defInput.id ? S.works.defs.find(d => d.id === defInput.id) : null;
    if (def) {
      Object.assign(def, defInput, { updatedAt: new Date().toISOString() });
    } else {
      def = Object.assign({
        id: defInput.id || uid('def'),
        companyId: defInput.companyId || (actor ? actor.companyId : 'c1'),
        code: defInput.code || 'DEF',
        name: defInput.name,
        nameI18n: defInput.nameI18n || {},
        unit: defInput.unit || 'م',
        category: defInput.category || 'civil',
        reqTemplate: Array.isArray(defInput.reqTemplate) ? defInput.reqTemplate : [],
        active: defInput.active !== false,
        createdAt: new Date().toISOString(),
        createdBy: actor ? actor.id : 'owner-device'
      }, defInput);
      S.works.defs.push(def);
    }

    pushEvent(S, {
      actorId: actor ? actor.id : 'owner-device',
      actorName: actor ? actor.name : 'Owner Device',
      entity: 'def',
      entityId: def.id,
      woId: null,
      action: 'save',
      before: null,
      after: { id: def.id, name: def.name }
    });

    if (global.EIF_DB && typeof global.EIF_DB.saveState === 'function') {
      global.EIF_DB.saveState().catch(() => {});
    }
    return { ok: true, value: def };
  }

  function saveDepartment(S, actor, deptInput) {
    if (!deptInput || !deptInput.name) return { ok: false, code: 'INVALID_INPUT' };
    if (!can(S, actor, 'organization', 'edit')) return { ok: false, code: 'DENIED' };

    if (!Array.isArray(S.departments)) S.departments = [];
    let dept = deptInput.id ? S.departments.find(d => d.id === deptInput.id) : null;
    if (dept) {
      Object.assign(dept, deptInput);
    } else {
      dept = Object.assign({
        id: deptInput.id || uid('dept'),
        companyId: deptInput.companyId || (actor ? actor.companyId : 'c1'),
        name: deptInput.name,
        nameI18n: deptInput.nameI18n || {},
        parentId: deptInput.parentId || null,
        headPersonId: deptInput.headPersonId || null,
        active: deptInput.active !== false
      }, deptInput);
      S.departments.push(dept);
    }

    if (global.EIF_DB && typeof global.EIF_DB.saveState === 'function') {
      global.EIF_DB.saveState().catch(() => {});
    }
    return { ok: true, value: dept };
  }

  function saveJobTitle(S, actor, titleInput) {
    if (!titleInput || !titleInput.name) return { ok: false, code: 'INVALID_INPUT' };
    if (!titleInput.departmentId) return { ok: false, code: 'MISSING_DEPARTMENT' };
    if (titleInput.scope === 'super_admin') return { ok: false, code: 'INVALID_SCOPE' };
    if (!can(S, actor, 'organization', 'edit')) return { ok: false, code: 'DENIED' };

    if (!Array.isArray(S.jobTitles)) S.jobTitles = [];
    let title = titleInput.id ? S.jobTitles.find(t => t.id === titleInput.id) : null;
    if (title) {
      Object.assign(title, titleInput);
    } else {
      title = Object.assign({
        id: titleInput.id || uid('jt'),
        companyId: titleInput.companyId || (actor ? actor.companyId : 'c1'),
        departmentId: titleInput.departmentId,
        name: titleInput.name,
        nameI18n: titleInput.nameI18n || {},
        scope: titleInput.scope || 'assigned',
        moduleAccess: titleInput.moduleAccess || {},
        rank: titleInput.rank || 0,
        active: titleInput.active !== false
      }, titleInput);
      S.jobTitles.push(title);
    }

    if (global.EIF_DB && typeof global.EIF_DB.saveState === 'function') {
      global.EIF_DB.saveState().catch(() => {});
    }
    return { ok: true, value: title };
  }

  function deactivateJobTitle(S, actor, titleId) {
    if (!can(S, actor, 'organization', 'edit')) return { ok: false, code: 'DENIED' };
    const hasActive = (S.orgPeople || []).some(p => p && p.active !== false && p.jobTitleId === titleId);
    if (hasActive) return { ok: false, code: 'HAS_ACTIVE_PERSONS' };

    const title = (S.jobTitles || []).find(t => t.id === titleId);
    if (!title) return { ok: false, code: 'NOT_FOUND' };
    title.active = false;

    if (global.EIF_DB && typeof global.EIF_DB.saveState === 'function') {
      global.EIF_DB.saveState().catch(() => {});
    }
    return { ok: true, value: title };
  }

  function deactivateDepartment(S, actor, deptId) {
    if (!can(S, actor, 'organization', 'edit')) return { ok: false, code: 'DENIED' };
    const titlesInDept = new Set((S.jobTitles || []).filter(t => t.departmentId === deptId).map(t => t.id));
    const hasActive = (S.orgPeople || []).some(p => p && p.active !== false && (p.departmentId === deptId || titlesInDept.has(p.jobTitleId)));
    if (hasActive) return { ok: false, code: 'HAS_ACTIVE_PERSONS' };

    const dept = (S.departments || []).find(d => d.id === deptId);
    if (!dept) return { ok: false, code: 'NOT_FOUND' };
    dept.active = false;

    if (global.EIF_DB && typeof global.EIF_DB.saveState === 'function') {
      global.EIF_DB.saveState().catch(() => {});
    }
    return { ok: true, value: dept };
  }

  function grant(S, actor, targetPersonId, grantSpec) {
    const target = (S.orgPeople || []).find(p => p.id === targetPersonId);
    if (!target) return { ok: false, code: 'NOT_FOUND' };

    // Actor ceiling checks
    if (!actor || !actor.isSuperAdmin) {
      if (actor && actor.id === targetPersonId) {
        return { ok: false, code: 'CEILING' };
      }
      // Target scope check: grantor can only manage within own scope
      const actorScope = effectiveScope(S, actor);
      if (actorScope === 'department_manage') {
        const actorDept = actor.departmentId || (S.jobTitles.find(t => t.id === actor.jobTitleId) || {}).departmentId;
        const targetDept = target.departmentId || (S.jobTitles.find(t => t.id === target.jobTitleId) || {}).departmentId;
        const deptTree = getDescendantDeptIds(S, actorDept);
        if (!targetDept || !deptTree.has(targetDept)) {
          return { ok: false, code: 'DENIED' };
        }
      }

      if (grantSpec.module && grantSpec.level) {
        const ownLevel = effectiveLevel(S, actor, grantSpec.module);
        if ((LEVEL_RANK[grantSpec.level] || 0) > (LEVEL_RANK[ownLevel] || 0)) {
          return { ok: false, code: 'CEILING' };
        }
      }

      if (grantSpec.scope) {
        const ownScopeRank = SCOPE_RANK[actorScope] || 1;
        const grantScopeRank = SCOPE_RANK[grantSpec.scope] || 1;
        if (grantScopeRank >= ownScopeRank) {
          return { ok: false, code: 'CEILING' };
        }
      }
    }

    if (grantSpec.module && grantSpec.level) {
      target.moduleOverrides = target.moduleOverrides || {};
      target.moduleOverrides[grantSpec.module] = grantSpec.level;
    }
    if (grantSpec.scope) {
      target.scopeOverride = grantSpec.scope;
    }

    pushAudit(S, {
      actorId: actor ? actor.id : 'owner-device',
      action: 'grant',
      targetId: targetPersonId,
      details: grantSpec
    });

    if (global.EIF_DB && typeof global.EIF_DB.saveState === 'function') {
      global.EIF_DB.saveState().catch(() => {});
    }
    return { ok: true, value: target };
  }

  function delegate(S, actor, delSpec) {
    if (!delSpec || !delSpec.expiresAt) return { ok: false, code: 'NO_EXPIRY' };
    if (!actor || !actor.isSuperAdmin) {
      const ownLevel = effectiveLevel(S, actor, delSpec.module);
      if ((LEVEL_RANK[delSpec.level] || 0) > (LEVEL_RANK[ownLevel] || 0)) {
        return { ok: false, code: 'CEILING' };
      }
    }

    if (!Array.isArray(S.permissionDelegations)) S.permissionDelegations = [];
    const del = {
      id: uid('del'),
      fromPersonId: actor ? actor.id : 'owner-device',
      toPersonId: delSpec.toPersonId,
      module: delSpec.module,
      level: delSpec.level,
      expiresAt: delSpec.expiresAt,
      createdAt: new Date().toISOString()
    };
    S.permissionDelegations.push(del);

    pushAudit(S, {
      actorId: actor ? actor.id : 'owner-device',
      action: 'delegate',
      targetId: delSpec.toPersonId,
      details: delSpec
    });

    if (global.EIF_DB && typeof global.EIF_DB.saveState === 'function') {
      global.EIF_DB.saveState().catch(() => {});
    }
    return { ok: true, value: del };
  }

  function setSuperAdmin(S, actor, targetPersonId, boolVal) {
    if (actor && actor.isSuperAdmin !== true) return { ok: false, code: 'DENIED' };

    const target = (S.orgPeople || []).find(p => p.id === targetPersonId);
    if (!target) return { ok: false, code: 'NOT_FOUND' };

    if (!boolVal) {
      const activeSuperAdmins = (S.orgPeople || []).filter(p => p.active !== false && p.isSuperAdmin === true && p.id !== targetPersonId);
      if (activeSuperAdmins.length === 0) {
        return { ok: false, code: 'LAST_ADMIN' };
      }
    }

    target.isSuperAdmin = !!boolVal;
    pushAudit(S, {
      actorId: actor ? actor.id : 'owner-device',
      action: 'set_super_admin',
      targetId: targetPersonId,
      isSuperAdmin: !!boolVal
    });

    if (global.EIF_DB && typeof global.EIF_DB.saveState === 'function') {
      global.EIF_DB.saveState().catch(() => {});
    }
    return { ok: true, value: target };
  }

  function migrationReport(S) {
    const unassignedLines = [];
    const missingBinaries = [];
    const flaggedPersons = [];

    const lines = (S && S.works && Array.isArray(S.works.lines)) ? S.works.lines : [];
    for (const l of lines) {
      if (l && l.legacyRef && l.legacyRef.assignText && (!Array.isArray(l.assignees) || l.assignees.length === 0)) {
        unassignedLines.push(l);
      }
    }

    const reqs = (S && S.works && Array.isArray(S.works.reqs)) ? S.works.reqs : [];
    for (const r of reqs) {
      if (r && Array.isArray(r.attachments)) {
        for (const a of r.attachments) {
          if (a && a.missingBinary === true) missingBinaries.push(a);
        }
      }
    }

    const people = (S && Array.isArray(S.orgPeople)) ? S.orgPeople : [];
    for (const p of people) {
      if (p && p._flaggedInMigration) flaggedPersons.push(p);
    }

    return { unassignedLines, missingBinaries, flaggedPersons };
  }

  async function attach(S, actor, reqId, files) {
    const req = findReq(S, reqId);
    if (!req) return { ok: false, code: 'NOT_FOUND' };
    const line = findLine(S, req.lineId);
    if (!line) return { ok: false, code: 'NOT_FOUND' };

    if (!can(S, actor, 'execution', 'attach', line)) {
      return { ok: false, code: 'DENIED' };
    }

    const fileList = Array.from(files || []);
    if (fileList.length === 0) return { ok: false, code: 'EMPTY' };

    for (const f of fileList) {
      if (!typeAllowed(f.type)) return { ok: false, code: 'TYPE' };
      if (S && S.attachmentSettings1621 && S.attachmentSettings1621.maxFileMB > 0) {
        if (f.size > S.attachmentSettings1621.maxFileMB * 1024 * 1024) return { ok: false, code: 'SIZE' };
      }
      if (f.type && f.type.indexOf('video/') === 0) {
        const dur = Number(f.durationSec);
        const min = req.minVideoSec != null ? req.minVideoSec : 10;
        if (!(dur >= min)) return { ok: false, code: 'VIDEO_TOO_SHORT' };
      }
    }

    const staged = [];
    for (const f of fileList) {
      const buf = await f.arrayBuffer();
      const hash = await sha256Hex(buf);
      if (global.EIF_DB && typeof global.EIF_DB.putBlob === 'function') {
        try {
          await global.EIF_DB.putBlob(hash, f);
        } catch (e) {
          return { ok: false, code: 'STORAGE' };
        }
      }
      staged.push({ file: f, hash });
    }

    if (!Array.isArray(S.attachments)) S.attachments = [];
    const newRefs = [];
    const nowIso = new Date().toISOString();
    const actorId = actor ? actor.id : 'owner-device';

    for (const { file, hash } of staged) {
      let reg = S.attachments.find(a => a.hash === hash);
      if (!reg) {
        reg = {
          hash,
          name: file.name,
          type: file.type,
          size: file.size,
          uploadedAt: nowIso,
          uploadedByPersonId: actorId,
          links: []
        };
        S.attachments.push(reg);
      }
      if (!Array.isArray(reg.links)) reg.links = [];
      const linkMatch = reg.links.some(k => k && k.wo === req.woId && k.lineId === line.id && k.reqId === req.id && k.category === 'work-evidence');
      if (!linkMatch) {
        reg.links.push({ wo: req.woId, lineId: line.id, reqId: req.id, category: 'work-evidence' });
      }

      const isVideo = file.type && file.type.indexOf('video/') === 0;
      const ref = {
        hash,
        name: file.name,
        type: file.type,
        size: file.size,
        durationSec: isVideo ? Number(file.durationSec) : null,
        addedBy: actorId,
        addedAt: nowIso,
        removedBy: null,
        removedAt: null,
        removeReason: null,
        replacedBy: null,
        missingBinary: false
      };
      if (!Array.isArray(req.attachments)) req.attachments = [];
      req.attachments.push(ref);
      newRefs.push(ref);

      pushEvent(S, {
        actorId,
        actorName: actor ? actor.name : 'Owner Device',
        entity: 'attachment',
        entityId: req.id,
        woId: req.woId,
        action: 'attach',
        before: null,
        after: { hash, name: file.name, type: file.type, size: file.size }
      });
    }

    recomputeStatus(req);
    if (global.EIF_DB && typeof global.EIF_DB.saveState === 'function') {
      await global.EIF_DB.saveState();
    }
    return { ok: true, value: newRefs };
  }

  function detach(S, actor, reqId, hash, reason) {
    const req = findReq(S, reqId);
    if (!req) return { ok: false, code: 'NOT_FOUND' };
    const line = findLine(S, req.lineId);
    if (!line) return { ok: false, code: 'NOT_FOUND' };

    if (!can(S, actor, 'execution', 'edit', line)) {
      return { ok: false, code: 'DENIED' };
    }

    const refs = Array.isArray(req.attachments) ? req.attachments : [];
    const target = refs.find(a => a && a.hash === hash && !a.removedAt);
    if (!target) return { ok: false, code: 'NOT_FOUND' };

    const nowIso = new Date().toISOString();
    const actorId = actor ? actor.id : 'owner-device';
    target.removedAt = nowIso;
    target.removedBy = actorId;
    target.removeReason = reason || '';

    pushEvent(S, {
      actorId,
      actorName: actor ? actor.name : 'Owner Device',
      entity: 'attachment',
      entityId: req.id,
      woId: req.woId,
      action: 'detach',
      before: { hash, removedAt: null },
      after: { hash, removedAt: target.removedAt, removedBy: target.removedBy, removeReason: target.removeReason }
    });

    recomputeStatus(req);
    if (global.EIF_DB && typeof global.EIF_DB.saveState === 'function') {
      global.EIF_DB.saveState().catch(() => {});
    }
    return { ok: true, value: target };
  }

  async function replace(S, actor, reqId, oldHash, file) {
    const req = findReq(S, reqId);
    if (!req) return { ok: false, code: 'NOT_FOUND' };
    const line = findLine(S, req.lineId);
    if (!line) return { ok: false, code: 'NOT_FOUND' };

    if (!can(S, actor, 'execution', 'edit', line)) {
      return { ok: false, code: 'DENIED' };
    }

    const refs = Array.isArray(req.attachments) ? req.attachments : [];
    const oldRef = refs.find(a => a && a.hash === oldHash && !a.removedAt && !a.replacedBy);
    if (!oldRef) return { ok: false, code: 'NOT_FOUND' };

    if (!file) return { ok: false, code: 'EMPTY' };
    if (!typeAllowed(file.type)) return { ok: false, code: 'TYPE' };
    if (S && S.attachmentSettings1621 && S.attachmentSettings1621.maxFileMB > 0) {
      if (file.size > S.attachmentSettings1621.maxFileMB * 1024 * 1024) return { ok: false, code: 'SIZE' };
    }
    if (file.type && file.type.indexOf('video/') === 0) {
      const dur = Number(file.durationSec);
      const min = req.minVideoSec != null ? req.minVideoSec : 10;
      if (!(dur >= min)) return { ok: false, code: 'VIDEO_TOO_SHORT' };
    }

    const buf = await file.arrayBuffer();
    const newHash = await sha256Hex(buf);
    if (global.EIF_DB && typeof global.EIF_DB.putBlob === 'function') {
      try {
        await global.EIF_DB.putBlob(newHash, file);
      } catch (e) {
        return { ok: false, code: 'STORAGE' };
      }
    }

    oldRef.replacedBy = newHash;
    const nowIso = new Date().toISOString();
    const actorId = actor ? actor.id : 'owner-device';

    if (!Array.isArray(S.attachments)) S.attachments = [];
    let reg = S.attachments.find(a => a.hash === newHash);
    if (!reg) {
      reg = {
        hash: newHash,
        name: file.name,
        type: file.type,
        size: file.size,
        uploadedAt: nowIso,
        uploadedByPersonId: actorId,
        links: []
      };
      S.attachments.push(reg);
    }
    if (!Array.isArray(reg.links)) reg.links = [];
    const linkMatch = reg.links.some(k => k && k.wo === req.woId && k.lineId === line.id && k.reqId === req.id && k.category === 'work-evidence');
    if (!linkMatch) {
      reg.links.push({ wo: req.woId, lineId: line.id, reqId: req.id, category: 'work-evidence' });
    }

    const isVideo = file.type && file.type.indexOf('video/') === 0;
    const newRef = {
      hash: newHash,
      name: file.name,
      type: file.type,
      size: file.size,
      durationSec: isVideo ? Number(file.durationSec) : null,
      addedBy: actorId,
      addedAt: nowIso,
      removedBy: null,
      removedAt: null,
      removeReason: null,
      replacedBy: null,
      missingBinary: false
    };
    req.attachments.push(newRef);

    pushEvent(S, {
      actorId,
      actorName: actor ? actor.name : 'Owner Device',
      entity: 'attachment',
      entityId: req.id,
      woId: req.woId,
      action: 'replace',
      before: { hash: oldHash },
      after: { hash: newHash, name: file.name }
    });

    recomputeStatus(req);
    if (global.EIF_DB && typeof global.EIF_DB.saveState === 'function') {
      await global.EIF_DB.saveState();
    }
    return { ok: true, value: newRef };
  }

  async function migrate(S) {
    if (!S || typeof S !== 'object') return { changed: false, report: null };

    // Fresh install path: initialize S.works if not present
    if (!S.works) {
      S.works = {
        schema: 1,
        migratedFrom: {},
        tombstones: [],
        defs: [],
        lines: [],
        reqs: [],
        events: []
      };
    }

    const tombstones = new Set(S.works.tombstones || []);
    const mf = S.works.migratedFrom || {};

    const sources = {
      workTypes: S.workTypes,
      siteRequirementDefs: S.siteRequirementDefs,
      siteReq: (S.workorders || []).flatMap(w => Object.entries(w.siteReq || {}).filter(([, r]) => r && r.selected)),
      exec: S.exec,
      tasks: S.tasks,
      executionEvidence: S.executionEvidence,
      workEvidence1628: S.workEvidence1628,
      jobTitles1624: S.jobTitles1624,
      orgPeople: S.orgPeople
    };

    // Check if any source needs migration
    let hasChanges = false;
    for (const [srcKey, data] of Object.entries(sources)) {
      if (Array.isArray(data) && data.length > 0) {
        const chk = fastChecksum(data);
        if (!mf[srcKey] || mf[srcKey].checksum !== chk) {
          hasChanges = true;
        }
      }
    }

    if (!hasChanges && S.works.schema === 1 && Object.keys(mf).length > 0) {
      return { changed: false, report: migrationReport(S) };
    }

    // Write safe snapshot before first migration
    if (!Array.isArray(S.safeSnapshots1646)) S.safeSnapshots1646 = [];
    if (Object.keys(mf).length === 0) {
      S.safeSnapshots1646.push(JSON.parse(JSON.stringify(S)));
    }

    // Prepare fresh collections or merge
    const defs = S.works.defs || [];
    const lines = S.works.lines || [];
    const reqs = S.works.reqs || [];
    const events = S.works.events || [];
    const nowIso = new Date().toISOString();

    const defKey = (c, name) => c + '::' + norm(name);
    const defsMap = new Map();
    for (const d of defs) defsMap.set(defKey(d.companyId, d.name), d);

    // Helper to ensure def exists
    function ensureDef(companyId, name, unit = 'م', code = 'DEF', id = null) {
      const k = defKey(companyId, name);
      if (defsMap.has(k)) return defsMap.get(k);
      const newDef = {
        id: id || uid('def'),
        companyId,
        code,
        name: norm(name),
        nameI18n: {},
        unit: unit || 'م',
        category: 'civil',
        reqTemplate: [],
        active: true,
        createdAt: nowIso,
        createdBy: 'migrator'
      };
      defs.push(newDef);
      defsMap.set(k, newDef);
      return newDef;
    }

    // 1. Seed defs per company
    const companies = Array.isArray(S.companies) && S.companies.length ? S.companies : [{ id: 'c1' }];
    for (const c of companies) {
      ensureDef(c.id, 'تنفيذ عام', 'مهمة', 'GEN', 'seed:' + c.id + ':general');
    }

    // 2. Migrate workTypes & siteRequirementDefs
    const primaryCompanyId = S.activeCompanyId || (companies[0] && companies[0].id) || 'c1';
    if (Array.isArray(S.workTypes)) {
      for (const wt of S.workTypes) {
        if (wt && wt.name) ensureDef(primaryCompanyId, wt.name);
      }
    }
    if (Array.isArray(S.siteRequirementDefs)) {
      for (const srd of S.siteRequirementDefs) {
        if (srd && srd.name) ensureDef(primaryCompanyId, srd.name, srd.unit, 'SRD', srd.id);
      }
    }

    // 3. Departments and Job Titles migration
    if (!Array.isArray(S.departments)) S.departments = [];
    if (!Array.isArray(S.jobTitles)) S.jobTitles = [];

    // Ensure 'عام' department in each company
    const defaultDepts = new Map();
    for (const c of companies) {
      let d = S.departments.find(dep => dep.companyId === c.id && dep.name === 'عام');
      if (!d) {
        d = {
          id: 'dept:' + c.id + ':general',
          companyId: c.id,
          name: 'عام',
          nameI18n: { en: 'General' },
          parentId: null,
          headPersonId: null,
          active: true
        };
        S.departments.push(d);
      }
      defaultDepts.set(c.id, d);
    }

    // Teams -> departments (only if linked to a title in jobTitles1624)
    const teamsWithTitles = new Set((S.jobTitles1624 || []).map(t => t.teamId).filter(Boolean));
    const teamDeptMap = new Map();
    if (Array.isArray(S.orgTeams)) {
      for (const tm of S.orgTeams) {
        if (tm && teamsWithTitles.has(tm.id)) {
          const deptName = tm.name.startsWith('قسم ') ? tm.name : 'قسم ' + tm.name;
          let dep = S.departments.find(d => d.companyId === tm.companyId && d.name === deptName);
          if (!dep) {
            dep = {
              id: 'dept:' + tm.id,
              companyId: tm.companyId,
              name: deptName,
              nameI18n: {},
              parentId: null,
              headPersonId: tm.managerId || null,
              active: true
            };
            S.departments.push(dep);
          }
          teamDeptMap.set(tm.id, dep);
        }
      }
    }

    // Migrate jobTitles1624
    if (Array.isArray(S.jobTitles1624)) {
      for (const jt of S.jobTitles1624) {
        const id = 'mig:jobTitles1624:' + jt.id;
        let t = S.jobTitles.find(x => x.id === id);
        const dept = teamDeptMap.get(jt.teamId) || defaultDepts.get(jt.companyId) || defaultDepts.get(primaryCompanyId);
        if (!t) {
          t = {
            id,
            companyId: jt.companyId || primaryCompanyId,
            departmentId: dept.id,
            name: jt.name,
            nameI18n: {},
            scope: jt.scope || 'assigned',
            moduleAccess: Object.assign({}, jt.moduleAccess || {}),
            rank: jt.rank || 0,
            active: true
          };
          S.jobTitles.push(t);
        }
      }
    }

    // Migrate orgPeople
    if (Array.isArray(S.orgPeople)) {
      for (const p of S.orgPeople) {
        if (p.accessScope === 'super_admin') {
          p.isSuperAdmin = true;
        }
        // Match title
        const existingTitle = S.jobTitles.find(t => t.companyId === p.companyId && norm(t.name) === norm(p.role));
        if (existingTitle) {
          p.jobTitleId = existingTitle.id;
        } else if (p.role) {
          // Unmatched role in company -> create title in 'عام' department and flag person
          const dept = defaultDepts.get(p.companyId) || defaultDepts.get(primaryCompanyId);
          const newTitle = {
            id: 'title:mig:' + p.companyId + ':' + norm(p.role),
            companyId: p.companyId,
            departmentId: dept.id,
            name: norm(p.role),
            nameI18n: {},
            scope: p.accessScope === 'department_manage' ? 'department_manage' : (p.accessScope === 'team_manage' ? 'team_manage' : 'assigned'),
            moduleAccess: {},
            rank: 1,
            active: true
          };
          S.jobTitles.push(newTitle);
          p.jobTitleId = newTitle.id;
          p._flaggedInMigration = true;
        }

        // Module overrides from moduleAccess1618, moduleAccess1620, and team
        const tm = (S.orgTeams || []).find(t => t.id === p.teamId);
        const merged = Object.assign({},
          (tm && tm.moduleAccess1618) || {},
          (tm && tm.moduleAccess1620) || {},
          p.moduleAccess1620 || {},
          p.moduleAccess1618 || {}
        );
        if (Object.keys(merged).length > 0) {
          p.moduleOverrides = Object.assign({}, p.moduleOverrides || {}, merged);
        }
      }
    }

    // 4. Migrate wo.siteReq -> lines
    const linesById = new Map();
    for (const l of lines) linesById.set(l.id, l);

    if (Array.isArray(S.workorders)) {
      for (const wo of S.workorders) {
        if (wo && wo.siteReq && typeof wo.siteReq === 'object') {
          for (const [defId, reqData] of Object.entries(wo.siteReq)) {
            if (!reqData || reqData.selected !== true) continue;
            const lineId = 'mig:siteReq:' + wo.id + ':' + defId;
            if (tombstones.has(lineId)) continue;
            const matchedDef = defs.find(d => d.id === defId) || ensureDef(wo.companyId, reqData.name || 'حفر', reqData.unit);
            let line = linesById.get(lineId);
            if (!line) {
              line = {
                id: lineId,
                companyId: wo.companyId,
                woId: wo.id,
                defId: matchedDef.id,
                qty: Number(reqData.qty || 1),
                unit: reqData.unit || matchedDef.unit || 'م',
                status: 'planned',
                assignees: [],
                due: '',
                progressPct: 0,
                notes: '',
                createdAt: nowIso,
                createdBy: 'migrator',
                updatedAt: nowIso,
                updatedBy: 'migrator',
                legacyRef: { source: 'siteReq', woId: wo.id, defId }
              };
              lines.push(line);
              linesById.set(lineId, line);
            }
          }
        }
      }
    }

    // 5. Migrate exec[] -> merge or create general line
    if (Array.isArray(S.exec)) {
      for (const ex of S.exec) {
        if (!ex || !ex.wo) continue;
        const wo = findWO(S, ex.wo);
        if (!wo) continue;
        // Find line on this WO matching ex.stage
        const stageNorm = norm(ex.stage);
        let line = lines.find(l => l.woId === ex.wo && defs.some(d => d.id === l.defId && norm(d.name) === stageNorm));
        if (!line) {
          const genLineId = 'mig:general:' + ex.wo;
          if (!tombstones.has(genLineId)) {
            line = linesById.get(genLineId);
            if (!line) {
              const genDef = ensureDef(wo.companyId, 'تنفيذ عام', 'مهمة', 'GEN');
              line = {
                id: genLineId,
                companyId: wo.companyId,
                woId: wo.id,
                defId: genDef.id,
                qty: 1,
                unit: 'مهمة',
                status: 'planned',
                assignees: [],
                due: '',
                progressPct: 0,
                notes: '',
                createdAt: nowIso,
                createdBy: 'migrator',
                updatedAt: nowIso,
                updatedBy: 'migrator',
                legacyRef: { source: 'exec', execId: ex.id }
              };
              lines.push(line);
              linesById.set(genLineId, line);
            }
          }
        }
        if (line) {
          line.progressPct = Number(ex.progress || 0);
          line.status = line.progressPct === 100 ? 'completed' : (line.progressPct > 0 ? 'in_progress' : 'planned');
        }
      }
    }

    // 6. Migrate tasks[] -> lines
    if (Array.isArray(S.tasks)) {
      for (const t of S.tasks) {
        if (!t || !t.wo) continue; // skip tasks without wo
        const lineId = 'mig:tasks:' + t.id;
        if (tombstones.has(lineId)) continue;
        const wo = findWO(S, t.wo);
        if (!wo) continue;

        let line = linesById.get(lineId);
        if (!line) {
          const taskDef = ensureDef(wo.companyId, t.text || 'مهمة', 'مهمة');
          // Resolve assignee within company
          const userName = norm(t.user);
          const candidatePersons = (S.orgPeople || []).filter(p => p.companyId === wo.companyId && norm(p.name) === userName);
          let assignees = [];
          let legacyRef = null;
          if (candidatePersons.length === 1) {
            assignees = [{ personId: candidatePersons[0].id, role: 'foreman' }];
          } else {
            legacyRef = { source: 'tasks', id: t.id, assignText: t.user };
          }

          line = {
            id: lineId,
            companyId: wo.companyId,
            woId: wo.id,
            defId: taskDef.id,
            qty: 1,
            unit: 'مهمة',
            status: t.done ? 'completed' : 'planned',
            assignees,
            due: t.due || '',
            progressPct: t.done ? 100 : 0,
            notes: '',
            createdAt: nowIso,
            createdBy: 'migrator',
            updatedAt: nowIso,
            updatedBy: 'migrator',
            legacyRef
          };
          lines.push(line);
          linesById.set(lineId, line);
        }
      }
    }

    // 7. Ensure workEvidence1628 and executionEvidence have matching lines
    // Ensure mig:general:wo1 exists if wo1 has workEvidence1628
    if (Array.isArray(S.workEvidence1628)) {
      for (const we of S.workEvidence1628) {
        if (we && we.wo) {
          const wo = findWO(S, we.wo);
          if (wo) {
            const genLineId = 'mig:general:' + we.wo;
            if (!linesById.has(genLineId) && !tombstones.has(genLineId)) {
              const genDef = ensureDef(wo.companyId, 'تنفيذ عام', 'مهمة', 'GEN');
              const genLine = {
                id: genLineId,
                companyId: wo.companyId,
                woId: wo.id,
                defId: genDef.id,
                qty: 1,
                unit: 'مهمة',
                status: 'planned',
                assignees: [],
                due: '',
                progressPct: 0,
                notes: '',
                createdAt: nowIso,
                createdBy: 'migrator',
                updatedAt: nowIso,
                updatedBy: 'migrator',
                legacyRef: { source: 'workEvidence1628', id: we.id }
              };
              lines.push(genLine);
              linesById.set(genLineId, genLine);
            }
          }
        }
      }
    }

    // 8. Migrate executionEvidence -> requirements
    const reqsById = new Map();
    for (const r of reqs) reqsById.set(r.id, r);

    if (Array.isArray(S.executionEvidence)) {
      for (const ev of S.executionEvidence) {
        if (!ev || !ev.wo) continue;
        const stageNorm = norm(ev.stage);
        // Find line
        let line = lines.find(l => l.woId === ev.wo && defs.some(d => d.id === l.defId && norm(d.name) === stageNorm));
        if (!line) line = linesById.get('mig:general:' + ev.wo);
        if (!line) continue;

        const photos = Array.isArray(ev.photos) ? ev.photos : [];
        if (photos.length > 0) {
          const reqId = 'mig:executionEvidence:' + ev.id + ':photo';
          let req = reqsById.get(reqId);
          if (!req) {
            req = {
              id: reqId,
              lineId: line.id,
              woId: line.woId,
              kind: 'photo',
              label: 'صور ' + ev.stage,
              stage: 'during',
              minCount: photos.length,
              minVideoSec: 10,
              attachments: photos.map(f => ({
                hash: null,
                name: f.name,
                type: f.type || 'image/jpeg',
                size: f.size || 0,
                durationSec: null,
                addedBy: 'migrator',
                addedAt: f.date || nowIso,
                removedBy: null,
                removedAt: null,
                removeReason: null,
                replacedBy: null,
                missingBinary: true
              })),
              status: 'open',
              legacyRef: { source: 'executionEvidence', id: ev.id, kind: 'photo' }
            };
            reqs.push(req);
            reqsById.set(reqId, req);
          }
        }

        const videos = Array.isArray(ev.videos) ? ev.videos : [];
        if (videos.length > 0) {
          const reqId = 'mig:executionEvidence:' + ev.id + ':video';
          let req = reqsById.get(reqId);
          if (!req) {
            req = {
              id: reqId,
              lineId: line.id,
              woId: line.woId,
              kind: 'video',
              label: 'فيديو ' + ev.stage,
              stage: 'during',
              minCount: videos.length,
              minVideoSec: 10,
              attachments: videos.map(f => ({
                hash: null,
                name: f.name,
                type: f.type || 'video/mp4',
                size: f.size || 0,
                durationSec: null,
                addedBy: 'migrator',
                addedAt: f.date || nowIso,
                removedBy: null,
                removedAt: null,
                removeReason: null,
                replacedBy: null,
                missingBinary: true
              })),
              status: 'open',
              legacyRef: { source: 'executionEvidence', id: ev.id, kind: 'video' }
            };
            reqs.push(req);
            reqsById.set(reqId, req);
          }
        }
      }
    }

    // 9. Migrate workEvidence1628 -> requirements
    if (Array.isArray(S.workEvidence1628)) {
      for (const we of S.workEvidence1628) {
        if (!we || !we.wo) continue;
        const line = linesById.get('mig:general:' + we.wo) || lines.find(l => l.woId === we.wo);
        if (!line) continue;

        const reqId = 'mig:workEvidence1628:' + we.id;
        let req = reqsById.get(reqId);
        if (!req) {
          const files = Array.isArray(we.files) ? we.files : [];
          const kind = files.length > 0 ? 'document' : 'note';
          req = {
            id: reqId,
            lineId: line.id,
            woId: line.woId,
            kind,
            label: we.note || 'دليل عمل',
            stage: 'during',
            minCount: Math.max(1, files.length),
            minVideoSec: 10,
            attachments: files.map(f => ({
              hash: f.hash || null,
              name: f.name,
              type: f.type || 'application/pdf',
              size: f.size || 0,
              durationSec: null,
              addedBy: we.createdBy || 'migrator',
              addedAt: we.createdAt || nowIso,
              removedBy: null,
              removedAt: null,
              removeReason: null,
              replacedBy: null,
              missingBinary: !f.hash
            })),
            status: files.length > 0 && files.every(f => f.hash) ? 'satisfied' : 'open',
            legacyRef: { source: 'workEvidence1628', id: we.id }
          };
          reqs.push(req);
          reqsById.set(reqId, req);
        }
      }
    }

    // Build markers object (to be assigned only if saveState succeeds)
    const newMigratedFrom = {
      workTypes: { count: (S.workTypes || []).length, checksum: fastChecksum(S.workTypes), at: nowIso },
      siteRequirementDefs: { count: (S.siteRequirementDefs || []).length, checksum: fastChecksum(S.siteRequirementDefs), at: nowIso },
      siteReq: { count: (S.workorders || []).flatMap(w => Object.entries(w.siteReq || {}).filter(([, r]) => r && r.selected)).length, checksum: fastChecksum(sources.siteReq), at: nowIso },
      exec: { count: (S.exec || []).length, checksum: fastChecksum(S.exec), at: nowIso },
      tasks: { count: (S.tasks || []).filter(t => t && t.wo).length, checksum: fastChecksum(sources.tasks), at: nowIso },
      executionEvidence: { count: (S.executionEvidence || []).length, checksum: fastChecksum(S.executionEvidence), at: nowIso },
      workEvidence1628: { count: (S.workEvidence1628 || []).length, checksum: fastChecksum(S.workEvidence1628), at: nowIso },
      jobTitles1624: { count: (S.jobTitles1624 || []).length, checksum: fastChecksum(S.jobTitles1624), at: nowIso },
      orgPeople: { count: (S.orgPeople || []).length, checksum: fastChecksum(S.orgPeople), at: nowIso }
    };

    S.works.schema = 1;
    S.works.defs = defs;
    S.works.lines = lines;
    S.works.reqs = reqs;

    // Crash-safety: commit with saveState. If it throws, leave NO migratedFrom markers!
    if (global.EIF_DB && typeof global.EIF_DB.saveState === 'function') {
      try {
        await global.EIF_DB.saveState();
      } catch (err) {
        // Rollback markers so retry succeeds
        S.works.migratedFrom = {};
        throw err;
      }
    }

    S.works.migratedFrom = newMigratedFrom;
    return { changed: true, report: migrationReport(S) };
  }

  const EIF_WORKS = {
    LEVELS,
    SCOPES,
    can,
    linesFor,
    reqsFor,
    visibleWorkOrders,
    defs,
    eventsFor,
    resolveTitle,
    resolveDepartment,
    migrationReport,
    createLine,
    updateLine,
    assign,
    setStatus,
    attach,
    detach,
    replace,
    saveDef,
    saveDepartment,
    saveJobTitle,
    deactivateDepartment,
    deactivateJobTitle,
    grant,
    delegate,
    setSuperAdmin,
    migrate
  };

  global.EIF_WORKS = EIF_WORKS;
})(typeof window !== 'undefined' ? window : globalThis);
