/**
 * assets/js/backup.js
 * Engineer Islam Fouda Work Management System — Backup & Restore Engine
 * Version: 1.1.0 (V16.50)
 *
 * Implements:
 * 1. Structured JSON export & import with schema verification and UTF-8 / Arabic / Emoji preservation.
 * 2. Offline SQLite database (.db) export & import using WebAssembly (sql.js).
 * 3. Transparent UI handling for JSON and SQLite backups.
 */

(function(global) {
  'use strict';

  let sqlJsInstance = null;

  /**
   * Helper to escape SQL literals safely
   */
  function escapeSql(val) {
    if (val === null || val === undefined) return 'NULL';
    return `'${String(val).replace(/'/g, "''")}'`;
  }

  /**
   * Initialize or retrieve SQL.js WebAssembly engine
   */
  async function getSqlEngine() {
    if (sqlJsInstance) return sqlJsInstance;

    // In browser, check if initSqlJs is available on window
    let initFn = global.initSqlJs;
    let localWasmBinary = null;

    if (typeof initFn !== 'function') {
      // If running in Node, check local vendor bundle first
      if (typeof require === 'function') {
        try {
          const path = require('path');
          const fs = require('fs');
          const localJsPath = path.resolve(__dirname, '../vendor/sql/sql-wasm.js');
          const localWasmPath = path.resolve(__dirname, '../vendor/sql/sql-wasm.wasm');
          if (fs.existsSync(localJsPath)) {
            const sqlMod = require(localJsPath);
            initFn = typeof sqlMod === 'function' ? sqlMod : sqlMod.initSqlJs;
          }
          if (fs.existsSync(localWasmPath)) {
            localWasmBinary = fs.readFileSync(localWasmPath);
          }
        } catch (e) {}

        if (typeof initFn !== 'function') {
          try {
            const sqlMod = require('sql.js');
            initFn = typeof sqlMod === 'function' ? sqlMod : sqlMod.initSqlJs;
          } catch (e) {}
        }
      }
    }

    if (typeof initFn === 'function') {
      try {
        const config = {
          locateFile: file => {
            if (typeof window !== 'undefined' && window.location) {
              return 'assets/vendor/sql/' + file;
            }
            return file;
          }
        };
        if (localWasmBinary) {
          config.wasmBinary = localWasmBinary;
        }
        sqlJsInstance = await initFn(config);
        return sqlJsInstance;
      } catch (e) {
        console.warn('[EIF_BACKUP] Failed to init SQL.js via locateFile:', e);
      }
    }

    return null;
  }

  /**
   * -------------------------------------------------------------
   * 1. Structured JSON Export & Import Engine
   * -------------------------------------------------------------
   */

  /**
   * Export all collections and active settings as structured JSON string
   */
  function exportJSON(customState) {
    const S = customState || global.S || {};

    const collections = [
      'companies', 'workorders', 'permits', 'materials', 'issues',
      'tasks', 'coord', 'safety', 'exec', 'surveys', 'governance',
      'reinstatement', 'attachments', 'orgPeople', 'orgTeams', 'equipment',
      'departments', 'jobTitles', 'permissionDelegations', 'accessAudit1617',
      'siteRequirementDefs', 'executionEvidence', 'workEvidence1628', 'jobTitles1624'
    ];

    const exportData = {};
    const recordCounts = {};

    for (const c of collections) {
      exportData[c] = Array.isArray(S[c]) ? S[c].slice() : [];
      recordCounts[c] = exportData[c].length;
    }

    // Works Center (V16.50): exported whole (null when absent)
    exportData.works = S.works || null;
    recordCounts.works = S.works
      ? ((S.works.defs || []).length + (S.works.lines || []).length + (S.works.reqs || []).length + (S.works.events || []).length)
      : 0;

    // Special collection mappings
    exportData.checklists = S.checklists || {};
    recordCounts.checklists = Object.keys(exportData.checklists).length;

    exportData.qualityProfiles = Array.isArray(S.qualityProfiles1647) ? S.qualityProfiles1647.slice() : [];
    recordCounts.qualityProfiles = exportData.qualityProfiles.length;

    exportData.archiveFiles = Array.isArray(S.archiveFilesV165) ? S.archiveFilesV165.slice() : [];
    recordCounts.archiveFiles = exportData.archiveFiles.length;

    exportData.decisions = Array.isArray(S.codexDecisions1646) ? S.codexDecisions1646.slice() : [];
    recordCounts.decisions = exportData.decisions.length;

    // Active settings & preferences
    exportData.settings = {
      uiLanguage: S.uiLanguage || 'ar',
      activeCompanyId: S.activeCompanyId || null,
      workTypes: S.workTypes || []
    };

    const payload = {
      meta: {
        system: 'EngineerIslamFouda',
        version: 'V16.48',
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        recordCounts: recordCounts
      },
      data: exportData
    };

    return JSON.stringify(payload, null, 2);
  }

  /**
   * Import structured JSON backup and restore into state S and IndexedDB
   */
  async function importJSON(jsonString) {
    if (!jsonString || typeof jsonString !== 'string') {
      return false;
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      console.error('[EIF_BACKUP] Invalid JSON syntax in backup payload:', e);
      return false;
    }

    let sourceData = null;
    let legacyRawState = false;

    // Format A: Standard structured format with meta.system
    if (parsed && parsed.meta && parsed.meta.system === 'EngineerIslamFouda') {
      sourceData = parsed.data || {};
    }
    // Format B: Legacy format with direct collections (e.g. a V16.49 full-state dump).
    // Restored losslessly: EVERY top-level key of the parsed object is copied onto S.
    else if (parsed && typeof parsed === 'object' && (parsed.workorders || parsed.materials || parsed.companies)) {
      sourceData = parsed;
      legacyRawState = true;
    } else {
      console.error('[EIF_BACKUP] Unrecognized backup schema format.');
      return false;
    }

    const S = global.S || {};

    if (legacyRawState) {
      for (const key of Object.keys(sourceData)) {
        S[key] = sourceData[key];
      }
    }

    const collections = [
      'companies', 'workorders', 'permits', 'materials', 'issues',
      'tasks', 'coord', 'safety', 'exec', 'surveys', 'governance',
      'reinstatement', 'attachments', 'orgPeople', 'orgTeams', 'equipment'
    ];

    for (const c of collections) {
      if (Array.isArray(sourceData[c])) {
        S[c] = sourceData[c];
      }
    }

    // Checklists
    if (sourceData.checklists && typeof sourceData.checklists === 'object') {
      S.checklists = sourceData.checklists;
    }

    // Quality profiles
    if (Array.isArray(sourceData.qualityProfiles)) {
      S.qualityProfiles1647 = sourceData.qualityProfiles;
    } else if (Array.isArray(sourceData.qualityProfiles1647)) {
      S.qualityProfiles1647 = sourceData.qualityProfiles1647;
    }

    // Archive files
    if (Array.isArray(sourceData.archiveFiles)) {
      S.archiveFilesV165 = sourceData.archiveFiles;
    } else if (Array.isArray(sourceData.archiveFilesV165)) {
      S.archiveFilesV165 = sourceData.archiveFilesV165;
    }

    // Decisions
    if (Array.isArray(sourceData.decisions)) {
      S.codexDecisions1646 = sourceData.decisions;
    } else if (Array.isArray(sourceData.codexDecisions1646)) {
      S.codexDecisions1646 = sourceData.codexDecisions1646;
    }

    // Work Center & org entities (V16.50); works only restored when present
    if (Array.isArray(sourceData.departments)) S.departments = sourceData.departments;
    if (Array.isArray(sourceData.jobTitles)) S.jobTitles = sourceData.jobTitles;
    if (Array.isArray(sourceData.permissionDelegations)) S.permissionDelegations = sourceData.permissionDelegations;
    if (Array.isArray(sourceData.accessAudit1617)) S.accessAudit1617 = sourceData.accessAudit1617;
    if (Array.isArray(sourceData.siteRequirementDefs)) S.siteRequirementDefs = sourceData.siteRequirementDefs;
    if (Array.isArray(sourceData.executionEvidence)) S.executionEvidence = sourceData.executionEvidence;
    if (Array.isArray(sourceData.workEvidence1628)) S.workEvidence1628 = sourceData.workEvidence1628;
    if (Array.isArray(sourceData.jobTitles1624)) S.jobTitles1624 = sourceData.jobTitles1624;
    if (sourceData.works && typeof sourceData.works === 'object') S.works = sourceData.works;

    // Settings
    if (sourceData.settings && typeof sourceData.settings === 'object') {
      if (sourceData.settings.uiLanguage) S.uiLanguage = sourceData.settings.uiLanguage;
      if (sourceData.settings.activeCompanyId) S.activeCompanyId = sourceData.settings.activeCompanyId;
      if (sourceData.settings.workTypes) S.workTypes = sourceData.settings.workTypes;
    }

    global.S = S;

    // Work Center silent migration (SOP §6.3): importing any backup runs the same
    // migrator, so legacy backups are restored and migrated in one path.
    if (global.EIF_WORKS && typeof global.EIF_WORKS.migrate === 'function') {
      try { await global.EIF_WORKS.migrate(S); } catch (e) { console.error('[EIF_BACKUP] works migration failed', e); }
    }

    // Persist immediately to IndexedDB
    if (global.EIF_DB && typeof global.EIF_DB.flush === 'function') {
      global.EIF_DB.manager.isDirty = true;
      await global.EIF_DB.flush();
    }

    // Trigger UI refresh
    if (typeof global.refresh === 'function') {
      try { global.refresh(); } catch (e) {}
    }

    return S;
  }

  /**
   * -------------------------------------------------------------
   * 2. Standalone SQLite Database (sql.js WASM) Engine
   * -------------------------------------------------------------
   */

  /**
   * Export all collections to an offline SQLite database binary
   */
  async function exportSQLite(customState) {
    const SQL = await getSqlEngine();
    if (!SQL) {
      throw new Error('[EIF_BACKUP] SQLite WebAssembly engine not loaded.');
    }

    const db = new SQL.Database();
    const S = customState || global.S || {};

    // 1. Execute Relational DDL
    const ddl = `
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY, name TEXT UNIQUE, code TEXT, note TEXT, logo TEXT, created TEXT);
      CREATE TABLE IF NOT EXISTS workorders (id TEXT PRIMARY KEY, no TEXT UNIQUE, main_type TEXT, execution_class TEXT, code TEXT, work_description TEXT, type_json TEXT, description TEXT, location TEXT, city TEXT, company TEXT, company_id TEXT, project TEXT, area TEXT, station TEXT, consultant TEXT, route TEXT, location_link TEXT, map_url TEXT, assign_date TEXT, exec_date TEXT, approval_date TEXT, priority TEXT, status TEXT, assigned_to TEXT, site_req_json TEXT, work_start TEXT, permit_end TEXT, permit_number TEXT, permit_issue_date TEXT, permit_streets TEXT, permit_total_length TEXT, permit_excavation_length TEXT);
      CREATE TABLE IF NOT EXISTS permits (id TEXT PRIMARY KEY, workorder_id TEXT, type TEXT, request_no TEXT, number TEXT, issue_date TEXT, start_date TEXT, end_date TEXT, city TEXT, district TEXT, municipality TEXT, streets TEXT, total_length TEXT, excavation_length TEXT, damrat TEXT, route_segments_json TEXT, file_hash TEXT, file_name TEXT, extracted_text TEXT, renewals_json TEXT, completion_requested INTEGER, completion_request_date TEXT, completion_group TEXT, completion_note TEXT, created TEXT);
      CREATE TABLE IF NOT EXISTS materials (code TEXT PRIMARY KEY, unit TEXT, description TEXT, sdms TEXT, usage TEXT, catalog_page INTEGER, image TEXT);
      CREATE TABLE IF NOT EXISTS issues (id TEXT PRIMARY KEY, workorder_id TEXT, material_code TEXT, quantity REAL, voucher TEXT, voucher_file_name TEXT, voucher_file_hash TEXT, voucher_file_size INTEGER, issue_date TEXT);
      CREATE TABLE IF NOT EXISTS checklists (id TEXT PRIMARY KEY, workorder_id TEXT, phase TEXT, name TEXT, note TEXT, done INTEGER, user_id TEXT, evidence TEXT, comment TEXT, updated_at TEXT);
      CREATE TABLE IF NOT EXISTS quality_profiles (id TEXT PRIMARY KEY, workorder_id TEXT UNIQUE, items_json TEXT, updated_at TEXT);
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, workorder_id TEXT, user_id TEXT, text TEXT, due_date TEXT, done INTEGER);
      CREATE TABLE IF NOT EXISTS coord (id TEXT PRIMARY KEY, workorder_id TEXT, type TEXT, user_id TEXT, status TEXT);
      CREATE TABLE IF NOT EXISTS safety (id TEXT PRIMARY KEY, workorder_id TEXT, type TEXT, user_id TEXT, status TEXT);
      CREATE TABLE IF NOT EXISTS exec (id TEXT PRIMARY KEY, workorder_id TEXT, type TEXT, user_id TEXT, status TEXT);
      CREATE TABLE IF NOT EXISTS surveys (id TEXT PRIMARY KEY, workorder_id TEXT, date TEXT, expected_length REAL, notes_json TEXT, files_json TEXT, site_requirements_json TEXT);
      CREATE TABLE IF NOT EXISTS governance (id TEXT PRIMARY KEY, workorder_id TEXT, requested INTEGER, scheduled_date TEXT, executed INTEGER, checklist_done INTEGER, safety_notified INTEGER, materials_issued INTEGER, notes TEXT);
      CREATE TABLE IF NOT EXISTS reinstatement (id TEXT PRIMARY KEY, workorder_id TEXT, material TEXT, unit TEXT, quantity REAL, source TEXT, status TEXT, notes TEXT);
      CREATE TABLE IF NOT EXISTS org_people (id TEXT PRIMARY KEY, company_id TEXT, team_id TEXT, name TEXT, phone TEXT, email TEXT, role TEXT, language TEXT, nationality TEXT, iqama TEXT, iqama_expiry TEXT, cid TEXT, cid_expiry TEXT, sec_auth TEXT, sec_auth_expiry TEXT, active INTEGER, json TEXT, job_title_id TEXT, department_id TEXT, is_super_admin INTEGER, module_overrides_json TEXT, scope_override TEXT);
      CREATE TABLE IF NOT EXISTS org_teams (id TEXT PRIMARY KEY, company_id TEXT, name TEXT, type TEXT, module TEXT, manager_id TEXT, json TEXT);
      CREATE TABLE IF NOT EXISTS works_defs (id TEXT PRIMARY KEY, company_id TEXT, code TEXT, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS works_lines (id TEXT PRIMARY KEY, wo_id TEXT, def_id TEXT, status TEXT, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS works_reqs (id TEXT PRIMARY KEY, line_id TEXT, wo_id TEXT, status TEXT, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS works_events (id TEXT PRIMARY KEY, wo_id TEXT, entity_id TEXT, at TEXT, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS departments (id TEXT PRIMARY KEY, company_id TEXT, parent_id TEXT, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS job_titles (id TEXT PRIMARY KEY, company_id TEXT, department_id TEXT, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS equipment (id TEXT PRIMARY KEY, company_id TEXT, name TEXT, code TEXT, plate TEXT, type TEXT, driver TEXT, status TEXT, tv_no TEXT, tv_end TEXT, cost REAL, notes TEXT);
      CREATE TABLE IF NOT EXISTS attachments (hash TEXT PRIMARY KEY, name TEXT, size INTEGER, uploaded_at TEXT, uploaded_by_person_id TEXT, uploaded_by_name TEXT, links_json TEXT, deleted INTEGER);
      CREATE TABLE IF NOT EXISTS blobs (hash TEXT PRIMARY KEY, data BLOB, size INTEGER);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value_json TEXT);
    `;
    db.run(ddl);

    // 2. Insert metadata
    db.run(`INSERT INTO meta (key, value) VALUES ('system', 'EngineerIslamFouda'), ('version', 'V16.48'), ('exportedAt', ${escapeSql(new Date().toISOString())});`);

    // 3. Batch insert entities
    // Companies
    if (Array.isArray(S.companies)) {
      for (const c of S.companies) {
        if (!c || !c.id) continue;
        db.run(`INSERT OR REPLACE INTO companies (id, name, code, note, logo, created) VALUES (?, ?, ?, ?, ?, ?);`,
          [c.id, c.name || '', c.code || '', c.note || '', c.logo || '', c.created || '']);
      }
    }

    // Work Orders
    if (Array.isArray(S.workorders)) {
      for (const w of S.workorders) {
        if (!w || !w.id) continue;
        db.run(`INSERT OR REPLACE INTO workorders (id, no, main_type, execution_class, code, work_description, type_json, description, location, city, company, company_id, project, area, station, consultant, route, location_link, map_url, assign_date, exec_date, approval_date, priority, status, assigned_to, site_req_json, work_start, permit_end, permit_number, permit_issue_date, permit_streets, permit_total_length, permit_excavation_length) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            w.id, w.no || '', w.mainType || '', w.executionClass || '', w.code || '',
            w.workDescription || '', JSON.stringify(w.type || []), w.desc || '', w.loc || '',
            w.city || '', w.company || '', w.companyId || '', w.project || '', w.area || '',
            w.station || '', w.consultant || '', w.route || '', w.locationLink || '',
            w.mapUrl || '', w.assign || '', w.exec || '', w.approvalDate || '',
            w.priority || 'عادي', w.status || 'جديد', w.assignedTo || '',
            JSON.stringify(w.siteReq || {}), w.workStart || '', w.permitEnd || '',
            w.permitNumber || '', w.permitIssueDate || '', w.permitStreets || '',
            w.permitTotalLength || '', w.permitExcavationLength || ''
          ]);
      }
    }

    // Permits
    if (Array.isArray(S.permits)) {
      for (const p of S.permits) {
        if (!p || !p.id) continue;
        db.run(`INSERT OR REPLACE INTO permits (id, workorder_id, type, request_no, number, issue_date, start_date, end_date, city, district, municipality, streets, total_length, excavation_length, damrat, route_segments_json, file_hash, file_name, extracted_text, renewals_json, completion_requested, completion_request_date, completion_group, completion_note, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            p.id, p.wo || '', p.type || 'execution', p.requestNo || '', p.number || '',
            p.issueDate || '', p.start || '', p.end || '', p.city || '', p.district || '',
            p.municipality || '', p.streets || '', p.totalLength || '', p.excavationLength || '',
            p.damrat || '', JSON.stringify(p.routeSegments || []), p.fileHash || '', p.fileName || '',
            p.extractedText || '', JSON.stringify(p.renewals || []), p.completionRequested ? 1 : 0,
            p.completionRequestDate || '', p.completionGroup || '', p.completionNote || '', p.created || ''
          ]);
      }
    }

    // Materials
    if (Array.isArray(S.materials)) {
      for (const m of S.materials) {
        if (!m || !m.code) continue;
        db.run(`INSERT OR REPLACE INTO materials (code, unit, description, sdms, usage, catalog_page, image) VALUES (?, ?, ?, ?, ?, ?, ?);`,
          [m.code, m.unit || '', m.description || '', m.sdms || '', m.usage || '', m.catalogPage || null, m.image || null]);
      }
    }

    // Issues
    if (Array.isArray(S.issues)) {
      for (const is of S.issues) {
        if (!is || !is.id) continue;
        const vf = is.voucherFile || {};
        db.run(`INSERT OR REPLACE INTO issues (id, workorder_id, material_code, quantity, voucher, voucher_file_name, voucher_file_hash, voucher_file_size, issue_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [is.id, is.wo || '', is.mi || '', Number(is.qty) || 0, is.voucher || '', vf.name || '', vf.hash || '', vf.size || 0, is.date || '']);
      }
    }

    // Checklists
    if (S.checklists && typeof S.checklists === 'object') {
      for (const [woId, items] of Object.entries(S.checklists)) {
        if (Array.isArray(items)) {
          for (const item of items) {
            if (!item) continue;
            db.run(`INSERT OR REPLACE INTO checklists (id, workorder_id, phase, name, note, done, user_id, evidence, comment, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
              [item.id || (woId + '_' + Math.random().toString(36).slice(2)), woId, item.phase || '', item.name || '', item.note || '', item.done ? 1 : 0, item.user || '', item.evidence || '', item.comment || '', new Date().toISOString()]);
          }
        }
      }
    }

    // Tasks
    if (Array.isArray(S.tasks)) {
      for (const t of S.tasks) {
        if (!t || !t.id) continue;
        db.run(`INSERT OR REPLACE INTO tasks (id, workorder_id, user_id, text, due_date, done) VALUES (?, ?, ?, ?, ?, ?);`,
          [t.id, t.wo || '', t.user || '', t.text || '', t.due || '', t.done ? 1 : 0]);
      }
    }

    // Attachments metadata
    if (Array.isArray(S.attachments)) {
      for (const a of S.attachments) {
        if (!a || !a.hash) continue;
        db.run(`INSERT OR REPLACE INTO attachments (hash, name, size, uploaded_at, uploaded_by_person_id, uploaded_by_name, links_json, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
          [a.hash, a.name || '', Number(a.size) || 0, a.uploadedAt || a.date || '', a.uploadedByPersonId || '', a.uploadedByName || '', JSON.stringify(a.links || []), a.deleted1621 ? 1 : 0]);
      }
    }

    // Org people (V16.50 DEFECT FIX: table existed but was never populated)
    if (Array.isArray(S.orgPeople)) {
      for (const p of S.orgPeople) {
        if (!p || !p.id) continue;
        db.run(`INSERT OR REPLACE INTO org_people (id, company_id, team_id, name, phone, email, role, language, nationality, iqama, iqama_expiry, cid, cid_expiry, sec_auth, sec_auth_expiry, active, json, job_title_id, department_id, is_super_admin, module_overrides_json, scope_override) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            p.id, p.companyId || '', p.teamId || '', p.name || '', p.phone || '', p.email || '',
            p.role || '', p.language || '', p.nationality || '', p.iqama || '', p.iqamaExpiry || '',
            p.cid || '', p.cidExpiry || '', p.secAuth || '', p.secAuthExpiry || '',
            p.active === false ? 0 : 1, JSON.stringify(p),
            p.jobTitleId != null ? p.jobTitleId : null,
            p.departmentId != null ? p.departmentId : null,
            p.isSuperAdmin ? 1 : 0,
            p.moduleOverrides ? JSON.stringify(p.moduleOverrides) : null,
            p.scopeOverride != null ? p.scopeOverride : null
          ]);
      }
    }

    // Org teams (V16.50 DEFECT FIX: table existed but was never populated)
    if (Array.isArray(S.orgTeams)) {
      for (const t of S.orgTeams) {
        if (!t || !t.id) continue;
        db.run(`INSERT OR REPLACE INTO org_teams (id, company_id, name, type, module, manager_id, json) VALUES (?, ?, ?, ?, ?, ?, ?);`,
          [t.id, t.companyId || '', t.name || '', t.type || '', t.module || '', t.managerId || '', JSON.stringify(t)]);
      }
    }

    // Work Center (V16.50)
    if (S.works && typeof S.works === 'object') {
      const wk = S.works;
      db.run(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?);`, ['works.meta', JSON.stringify({ schema: wk.schema, migratedFrom: wk.migratedFrom || {}, tombstones: wk.tombstones || [] })]);
      for (const d of (wk.defs || [])) {
        if (!d || !d.id) continue;
        db.run(`INSERT OR REPLACE INTO works_defs (id, company_id, code, json) VALUES (?, ?, ?, ?);`,
          [d.id, d.companyId || '', d.code || '', JSON.stringify(d)]);
      }
      for (const l of (wk.lines || [])) {
        if (!l || !l.id) continue;
        db.run(`INSERT OR REPLACE INTO works_lines (id, wo_id, def_id, status, json) VALUES (?, ?, ?, ?, ?);`,
          [l.id, l.woId || '', l.defId || '', l.status || '', JSON.stringify(l)]);
      }
      for (const r of (wk.reqs || [])) {
        if (!r || !r.id) continue;
        db.run(`INSERT OR REPLACE INTO works_reqs (id, line_id, wo_id, status, json) VALUES (?, ?, ?, ?, ?);`,
          [r.id, r.lineId || '', r.woId || '', r.status || '', JSON.stringify(r)]);
      }
      for (const e of (wk.events || [])) {
        if (!e || !e.id) continue;
        db.run(`INSERT OR REPLACE INTO works_events (id, wo_id, entity_id, at, json) VALUES (?, ?, ?, ?, ?);`,
          [e.id, e.woId || '', e.entityId || '', e.at || '', JSON.stringify(e)]);
      }
    }

    // Departments (V16.50)
    if (Array.isArray(S.departments)) {
      for (const d of S.departments) {
        if (!d || !d.id) continue;
        db.run(`INSERT OR REPLACE INTO departments (id, company_id, parent_id, json) VALUES (?, ?, ?, ?);`,
          [d.id, d.companyId || '', d.parentId != null ? d.parentId : null, JSON.stringify(d)]);
      }
    }

    // Job titles (V16.50)
    if (Array.isArray(S.jobTitles)) {
      for (const t of S.jobTitles) {
        if (!t || !t.id) continue;
        db.run(`INSERT OR REPLACE INTO job_titles (id, company_id, department_id, json) VALUES (?, ?, ?, ?);`,
          [t.id, t.companyId || '', t.departmentId != null ? t.departmentId : null, JSON.stringify(t)]);
      }
    }

    // Settings
    if (S.uiLanguage) {
      db.run(`INSERT OR REPLACE INTO settings (key, value_json) VALUES ('uiLanguage', ?);`, [JSON.stringify(S.uiLanguage)]);
    }
    if (S.activeCompanyId) {
      db.run(`INSERT OR REPLACE INTO settings (key, value_json) VALUES ('activeCompanyId', ?);`, [JSON.stringify(S.activeCompanyId)]);
    }

    // Export database binary
    const binary = db.export();
    db.close();

    return binary;
  }

  /**
   * Import SQLite database binary into memory state S and IndexedDB
   */
  async function importSQLite(uint8Array) {
    if (!uint8Array || !(uint8Array instanceof Uint8Array || uint8Array instanceof ArrayBuffer)) {
      return false;
    }

    const bytes = uint8Array instanceof Uint8Array ? uint8Array : new Uint8Array(uint8Array);

    // Verify SQLite Header: "SQLite format 3\0" (16 bytes)
    if (bytes.length < 16) {
      console.error('[EIF_BACKUP] File too small to be a valid SQLite database.');
      return false;
    }

    const header = String.fromCharCode.apply(null, Array.from(bytes.slice(0, 15)));
    if (header !== 'SQLite format 3') {
      console.error('[EIF_BACKUP] Non-SQLite binary header detected. Expected "SQLite format 3".');
      return false;
    }

    const SQL = await getSqlEngine();
    if (!SQL) {
      throw new Error('[EIF_BACKUP] SQLite WebAssembly engine not loaded.');
    }

    let db;
    try {
      db = new SQL.Database(bytes);
    } catch (e) {
      console.error('[EIF_BACKUP] Failed to open SQLite database:', e);
      return false;
    }

    const S = global.S || {};

    const tableRows = (query) => {
      try {
        const stmt = db.prepare(query);
        const rows = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject());
        }
        stmt.free();
        return rows;
      } catch (e) {
        return [];
      }
    };

    // Extract companies
    const companies = tableRows('SELECT * FROM companies');
    if (companies.length) S.companies = companies;

    // Extract workorders
    const wos = tableRows('SELECT * FROM workorders');
    if (wos.length) {
      S.workorders = wos.map(w => {
        let type = ['other'];
        try { type = JSON.parse(w.type_json || '["other"]'); } catch (e) {}
        let siteReq = {};
        try { siteReq = JSON.parse(w.site_req_json || '{}'); } catch (e) {}
        return {
          id: w.id,
          no: w.no,
          mainType: w.main_type,
          executionClass: w.execution_class,
          code: w.code,
          workDescription: w.work_description,
          type: type,
          desc: w.description,
          loc: w.location,
          city: w.city,
          company: w.company,
          companyId: w.company_id,
          project: w.project,
          area: w.area,
          station: w.station,
          consultant: w.consultant,
          route: w.route,
          locationLink: w.location_link,
          mapUrl: w.map_url,
          assign: w.assign_date,
          exec: w.exec_date,
          approvalDate: w.approval_date,
          priority: w.priority || 'عادي',
          status: w.status || 'جديد',
          assignedTo: w.assigned_to,
          siteReq: siteReq,
          workStart: w.work_start,
          permitEnd: w.permit_end,
          permitNumber: w.permit_number,
          permitIssueDate: w.permit_issue_date,
          permitStreets: w.permit_streets,
          permitTotalLength: w.permit_total_length,
          permitExcavationLength: w.permit_excavation_length
        };
      });
    }

    // Extract permits
    const permits = tableRows('SELECT * FROM permits');
    if (permits.length) {
      S.permits = permits.map(p => {
        let routeSegments = [];
        try { routeSegments = JSON.parse(p.route_segments_json || '[]'); } catch (e) {}
        let renewals = [];
        try { renewals = JSON.parse(p.renewals_json || '[]'); } catch (e) {}
        return {
          id: p.id,
          wo: p.workorder_id,
          type: p.type || 'execution',
          requestNo: p.request_no,
          number: p.number,
          issueDate: p.issue_date,
          start: p.start_date,
          end: p.end_date,
          city: p.city,
          district: p.district,
          municipality: p.municipality,
          streets: p.streets,
          totalLength: p.total_length,
          excavationLength: p.excavation_length,
          damrat: p.damrat,
          routeSegments: routeSegments,
          fileHash: p.file_hash,
          fileName: p.file_name,
          extractedText: p.extracted_text,
          renewals: renewals,
          completionRequested: !!p.completion_requested,
          completionRequestDate: p.completion_request_date,
          completionGroup: p.completion_group,
          completionNote: p.completion_note,
          created: p.created
        };
      });
    }

    // Extract materials
    const materials = tableRows('SELECT * FROM materials');
    if (materials.length) S.materials = materials;

    // Extract issues
    const issues = tableRows('SELECT * FROM issues');
    if (issues.length) {
      S.issues = issues.map(is => ({
        id: is.id,
        wo: is.workorder_id,
        mi: is.material_code,
        qty: is.quantity,
        voucher: is.voucher,
        voucherFile: { name: is.voucher_file_name, hash: is.voucher_file_hash, size: is.voucher_file_size },
        date: is.issue_date
      }));
    }

    // Extract checklists
    const checklists = tableRows('SELECT * FROM checklists');
    if (checklists.length) {
      S.checklists = {};
      for (const cl of checklists) {
        const woId = cl.workorder_id;
        if (!woId) continue;
        S.checklists[woId] = S.checklists[woId] || [];
        S.checklists[woId].push({
          id: cl.id,
          phase: cl.phase,
          name: cl.name,
          note: cl.note,
          done: !!cl.done,
          user: cl.user_id,
          evidence: cl.evidence,
          comment: cl.comment
        });
      }
    }

    // Extract tasks
    const tasks = tableRows('SELECT * FROM tasks');
    if (tasks.length) {
      S.tasks = tasks.map(t => ({
        id: t.id,
        wo: t.workorder_id,
        user: t.user_id,
        text: t.text,
        due: t.due_date,
        done: !!t.done
      }));
    }

    // Extract attachments
    const attachments = tableRows('SELECT * FROM attachments');
    if (attachments.length) {
      S.attachments = attachments.map(a => {
        let links = [];
        try { links = JSON.parse(a.links_json || '[]'); } catch (e) {}
        return {
          hash: a.hash,
          name: a.name,
          size: a.size,
          uploadedAt: a.uploaded_at,
          date: a.uploaded_at,
          uploadedByPersonId: a.uploaded_by_person_id,
          uploadedByName: a.uploaded_by_name,
          links: links,
          deleted1621: !!a.deleted
        };
      });
    }

    // Extract org people (V16.50 DEFECT FIX: rebuild from typed columns + full-record json)
    const orgPeopleRows = tableRows('SELECT * FROM org_people');
    if (orgPeopleRows.length) {
      S.orgPeople = orgPeopleRows.map(r => {
        let p = null;
        try { if (r.json) p = JSON.parse(r.json); } catch (e) {}
        if (!p || typeof p !== 'object') {
          p = { id: r.id, companyId: r.company_id || '', teamId: r.team_id || '', name: r.name || '', phone: r.phone || '', email: r.email || '', role: r.role || '', language: r.language || '', nationality: r.nationality || '', iqama: r.iqama || '', iqamaExpiry: r.iqama_expiry || '', cid: r.cid || '', cidExpiry: r.cid_expiry || '', secAuth: r.sec_auth || '', secAuthExpiry: r.sec_auth_expiry || '', active: !(r.active === 0) };
        }
        if (r.job_title_id !== undefined) p.jobTitleId = r.job_title_id != null ? r.job_title_id : null;
        if (r.department_id !== undefined) p.departmentId = r.department_id != null ? r.department_id : null;
        if (r.is_super_admin !== undefined) p.isSuperAdmin = !!r.is_super_admin;
        if (r.module_overrides_json != null) {
          try { p.moduleOverrides = JSON.parse(r.module_overrides_json); } catch (e) {}
        }
        if (r.scope_override !== undefined && r.scope_override != null) p.scopeOverride = r.scope_override;
        return p;
      });
    }

    // Extract org teams (V16.50 DEFECT FIX)
    const orgTeamRows = tableRows('SELECT * FROM org_teams');
    if (orgTeamRows.length) {
      S.orgTeams = orgTeamRows.map(r => {
        let t = null;
        try { if (r.json) t = JSON.parse(r.json); } catch (e) {}
        if (!t || typeof t !== 'object') {
          t = { id: r.id, companyId: r.company_id || '', name: r.name || '', type: r.type || '', module: r.module || '', managerId: r.manager_id || '' };
        }
        return t;
      });
    }

    // Extract Work Center (V16.50): rebuild only when the works.meta marker exists
    let worksMeta = null;
    for (const m of tableRows(`SELECT value FROM meta WHERE key = 'works.meta'`)) {
      try { worksMeta = JSON.parse(m.value); } catch (e) {}
    }
    if (worksMeta && typeof worksMeta === 'object') {
      const parseJsonRows = (rows) => rows.map(r => {
        try { return r.json ? JSON.parse(r.json) : null; } catch (e) { return null; }
      }).filter(Boolean);
      const worksDefs = parseJsonRows(tableRows('SELECT * FROM works_defs'));
      const worksLines = parseJsonRows(tableRows('SELECT * FROM works_lines'));
      const worksReqs = parseJsonRows(tableRows('SELECT * FROM works_reqs'));
      const worksEvents = parseJsonRows(tableRows('SELECT * FROM works_events'));
      worksEvents.sort((a, b) => {
        const atA = a && a.at ? String(a.at) : '';
        const atB = b && b.at ? String(b.at) : '';
        if (atA !== atB) return atA < atB ? -1 : 1;
        return String((a && a.id) || '').localeCompare(String((b && b.id) || ''));
      });
      S.works = {
        schema: worksMeta.schema,
        migratedFrom: worksMeta.migratedFrom || {},
        tombstones: worksMeta.tombstones || [],
        defs: worksDefs,
        lines: worksLines,
        reqs: worksReqs,
        events: worksEvents
      };
    }

    // Extract departments (V16.50)
    const departmentRows = tableRows('SELECT * FROM departments');
    if (departmentRows.length) {
      S.departments = departmentRows.map(r => {
        let d = null;
        try { if (r.json) d = JSON.parse(r.json); } catch (e) {}
        if (!d || typeof d !== 'object') {
          d = { id: r.id, companyId: r.company_id || '', name: '', nameI18n: {}, parentId: null, headPersonId: null, active: true };
        }
        if (r.parent_id !== undefined) d.parentId = r.parent_id != null ? r.parent_id : null;
        return d;
      });
    }

    // Extract job titles (V16.50)
    const jobTitleRows = tableRows('SELECT * FROM job_titles');
    if (jobTitleRows.length) {
      S.jobTitles = jobTitleRows.map(r => {
        let t = null;
        try { if (r.json) t = JSON.parse(r.json); } catch (e) {}
        if (!t || typeof t !== 'object') {
          t = { id: r.id, companyId: r.company_id || '', departmentId: r.department_id != null ? r.department_id : null, name: '', nameI18n: {}, scope: 'assigned', moduleAccess: {}, rank: 0, active: true };
        }
        if (r.department_id !== undefined) t.departmentId = r.department_id != null ? r.department_id : null;
        return t;
      });
    }

    // Extract settings
    const settings = tableRows('SELECT * FROM settings');
    for (const s of settings) {
      try {
        const val = JSON.parse(s.value_json);
        if (s.key === 'uiLanguage') S.uiLanguage = val;
        if (s.key === 'activeCompanyId') S.activeCompanyId = val;
      } catch (e) {}
    }

    db.close();
    global.S = S;

    // Work Center silent migration (SOP §6.3): old .db imports run the same migrator
    if (global.EIF_WORKS && typeof global.EIF_WORKS.migrate === 'function') {
      try { await global.EIF_WORKS.migrate(S); } catch (e) { console.error('[EIF_BACKUP] works migration failed', e); }
    }

    // Flush to IndexedDB
    if (global.EIF_DB && typeof global.EIF_DB.flush === 'function') {
      global.EIF_DB.manager.isDirty = true;
      await global.EIF_DB.flush();
    }

    // Refresh UI
    if (typeof global.refresh === 'function') {
      try { global.refresh(); } catch (e) {}
    }

    return S;
  }

  /**
   * -------------------------------------------------------------
   * 3. Browser Download & File Trigger Helpers
   * -------------------------------------------------------------
   */

  function downloadJSONBackup() {
    const jsonStr = exportJSON();
    const dateStr = new Date().toISOString().slice(0, 10);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Engineer_Islam_Fouda_Backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  async function downloadSQLiteBackup() {
    try {
      const u8 = await exportSQLite();
      const dateStr = new Date().toISOString().slice(0, 10);
      const blob = new Blob([u8], { type: 'application/x-sqlite3' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Engineer_Islam_Fouda_Database_${dateStr}.db`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      alert((global.S?.uiLanguage === 'ar' ? 'تعذر تصدير قاعدة بيانات SQLite: ' : 'Failed to export SQLite database: ') + err.message);
    }
  }

  /**
   * Universal Restore file handler: automatically detects JSON vs SQLite (.db)
   */
  async function restoreUniversalFile(file) {
    if (!file) return;
    const name = (file.name || '').toLowerCase();

    if (name.endsWith('.db') || name.endsWith('.sqlite')) {
      const reader = new FileReader();
      reader.onload = async () => {
        const u8 = new Uint8Array(reader.result);
        const ok = await importSQLite(u8);
        if (ok) {
          alert(global.S?.uiLanguage === 'ar' ? 'تم استرجاع قاعدة بيانات SQLite بنجاح!' : 'SQLite database restored successfully!');
        } else {
          alert(global.S?.uiLanguage === 'ar' ? 'فشل استرجاع قاعدة بيانات SQLite. الملف تالف أو غير صالح.' : 'Failed to restore SQLite database. File is corrupted or invalid.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // Default to JSON
      const reader = new FileReader();
      reader.onload = async () => {
        const ok = await importJSON(reader.result);
        if (ok) {
          alert(global.S?.uiLanguage === 'ar' ? 'تم استرجاع النسخة الاحتياطية بنجاح!' : 'Backup restored successfully!');
        } else {
          alert(global.S?.uiLanguage === 'ar' ? 'ملف النسخة الاحتياطية غير صالح أو تالف.' : 'Backup file is invalid or corrupted.');
        }
      };
      reader.readAsText(file);
    }
  }

  // Export on EIF_BACKUP and attach to window
  const EIF_BACKUP = {
    exportJSON,
    importJSON,
    exportSQLite,
    importSQLite,
    downloadJSONBackup,
    downloadSQLiteBackup,
    restoreUniversalFile
  };

  global.EIF_BACKUP = EIF_BACKUP;

  // Enhance EIF_DB with backup functions to fulfill interface contracts
  if (global.EIF_DB) {
    global.EIF_DB.exportJSON = exportJSON;
    global.EIF_DB.importJSON = importJSON;
    global.EIF_DB.exportSQLite = exportSQLite;
    global.EIF_DB.importSQLite = importSQLite;
  }

  // Override legacy window functions
  global.backup = function() {
    // If user clicks backup, download structured JSON
    downloadJSONBackup();
  };

  global.backupSQLite = function() {
    downloadSQLiteBackup();
  };

  global.restoreClick = function() {
    const input = document.getElementById('restoreFile');
    if (input) {
      input.accept = '.json,.db,.sqlite,application/json';
      input.click();
    }
  };

  global.restoreFile = function(f) {
    restoreUniversalFile(f);
  };

  // Node CommonJS exports
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      exportJSON,
      importJSON,
      exportSQLite,
      importSQLite,
      escapeSql,
      EIF_BACKUP
    };
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
