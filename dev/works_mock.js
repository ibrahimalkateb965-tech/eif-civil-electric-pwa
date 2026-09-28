/**
 * dev/works_mock.js
 * In-memory Mock Implementation of window.EIF_WORKS adhering strictly to:
 * fleet_orders/works_api_contract.txt (V16.50 Frozen Contract)
 * For UI Development and Preview Testing (Never loaded by production index.html)
 */

(function (window) {
  'use strict';

  var mockState = {
    settings: {
      ownerDeviceMode: true,
      uiLanguage: 'ar'
    },
    companies: [
      { id: 'comp_1', name: 'شركة المقاولات العامة والكهرباء', nameEn: 'General Contracting & Electricity Co.' }
    ],
    departments: [
      { id: 'dept_civil', companyId: 'comp_1', name: 'قسم الأعمال المدنية', nameEn: 'Civil Works Department', active: true },
      { id: 'dept_elec', companyId: 'comp_1', name: 'قسم التمديدات الكهربائية', nameEn: 'Electrical Installations Department', active: true },
      { id: 'dept_safety', companyId: 'comp_1', name: 'قسم السلامة والجودة', nameEn: 'Safety & Quality Department', active: true }
    ],
    jobTitles: [
      {
        id: 'title_super_admin',
        companyId: 'comp_1',
        departmentId: 'dept_civil',
        name: 'مدير عام النظام',
        nameEn: 'System Super Admin',
        scope: 'company_manage',
        moduleAccess: { works: 'admin', permits: 'admin', materials: 'admin', crews: 'admin', settings: 'admin' },
        active: true
      },
      {
        id: 'title_dept_head',
        companyId: 'comp_1',
        departmentId: 'dept_civil',
        name: 'مدير قسم المدني',
        nameEn: 'Civil Department Manager',
        scope: 'department_manage',
        moduleAccess: { works: 'approve', permits: 'approve', materials: 'edit', crews: 'approve', settings: 'view' },
        active: true
      },
      {
        id: 'title_site_eng',
        companyId: 'comp_1',
        departmentId: 'dept_civil',
        name: 'مهندس موقع',
        nameEn: 'Site Engineer',
        scope: 'team_manage',
        moduleAccess: { works: 'edit', permits: 'edit', materials: 'edit', crews: 'view', settings: 'none' },
        active: true
      },
      {
        id: 'title_foreman',
        companyId: 'comp_1',
        departmentId: 'dept_civil',
        name: 'مراقب موقع (فورمن)',
        nameEn: 'Site Foreman',
        scope: 'assigned',
        moduleAccess: { works: 'edit', permits: 'view', materials: 'view', crews: 'none', settings: 'none' },
        active: true
      }
    ],
    persons: [
      {
        id: 'user_admin',
        companyId: 'comp_1',
        departmentId: 'dept_civil',
        jobTitleId: 'title_super_admin',
        name: 'م. إسلام فودة',
        nameEn: 'Eng. Islam Fouda',
        phone: '+966500000001',
        isSuperAdmin: true,
        active: true
      },
      {
        id: 'user_manager',
        companyId: 'comp_1',
        departmentId: 'dept_civil',
        jobTitleId: 'title_dept_head',
        name: 'م. طارق الزهراني',
        nameEn: 'Eng. Tariq Al-Zahrani',
        phone: '+966500000002',
        isSuperAdmin: false,
        active: true
      },
      {
        id: 'user_foreman_ali',
        companyId: 'comp_1',
        departmentId: 'dept_civil',
        jobTitleId: 'title_foreman',
        name: 'علي عبد الله (فورمن)',
        nameEn: 'Ali Abdullah (Foreman)',
        phone: '+966500000003',
        isSuperAdmin: false,
        active: true
      },
      {
        id: 'user_foreman_saad',
        companyId: 'comp_1',
        departmentId: 'dept_civil',
        jobTitleId: 'title_foreman',
        name: 'سعد القحطاني (فورمن)',
        nameEn: 'Saad Al-Qahtani (Foreman)',
        phone: '+966500000004',
        isSuperAdmin: false,
        active: true
      }
    ],
    workorders: [
      {
        id: 'WO-2026-101',
        code: 'WO-101',
        companyId: 'comp_1',
        departmentId: 'dept_civil',
        title: 'مشروع حفر وتمديد كابلات حي الروضة - جدة',
        titleEn: 'Excavation & Cable Laying Project - Al-Rawdah, Jeddah',
        permitNo: 'BALADY-948210-2026',
        secProjectNo: 'SEC-JD-4491',
        location: 'جدة - حي الروضة - طريق الملك عبد العزيز',
        status: 'in_progress',
        createdAt: '2026-09-20T08:00:00Z'
      },
      {
        id: 'WO-2026-102',
        code: 'WO-102',
        companyId: 'comp_1',
        departmentId: 'dept_elec',
        title: 'محطة تحويل فرعية 33kV حي السلامة',
        titleEn: 'Substation 33kV - Al-Salamah',
        permitNo: 'BALADY-773190-2026',
        secProjectNo: 'SEC-JD-8820',
        location: 'جدة - حي السلامة',
        status: 'planned',
        createdAt: '2026-09-22T09:30:00Z'
      }
    ],
    works: {
      schema: 1,
      tombstones: [],
      migratedFrom: {
        workTypes: { count: 3, at: '2026-09-28T10:00:00Z', checksum: 'chk123' },
        siteRequirementDefs: { count: 2, at: '2026-09-28T10:00:00Z', checksum: 'chk456' },
        executionEvidence: { count: 4, at: '2026-09-28T10:00:00Z', checksum: 'chk789' }
      },
      defs: [
        {
          id: 'def_excavation',
          companyId: 'comp_1',
          code: 'CIV-001',
          name: 'حفر خندقي مسار كابلات',
          nameI18n: { ar: 'حفر خندقي مسار كابلات', en: 'Trench Excavation for Cables', ur: 'کیبلز کے لیے کھدائی', hi: 'केबल के लिए ट्रेंच खुदाई', bn: 'তারের জন্য পরিখা খনন' },
          unit: 'متر طولي',
          category: 'civil',
          reqTemplate: [
            { kind: 'photo', label: 'صورة الموقع قبل البدء وتحديد المسار', stage: 'before', minCount: 2 },
            { kind: 'photo', label: 'صور أعمال الحفر وقياس العمق', stage: 'during', minCount: 3 },
            { kind: 'video', label: 'فيديو توثيقي للعمق والفرشة الرملية (10 ثوان على الأقل)', stage: 'during', minCount: 1, minVideoSec: 10 },
            { kind: 'photo', label: 'صورة نظافة الموقع والردم المبدئي', stage: 'after', minCount: 2 }
          ],
          active: true,
          createdAt: '2026-09-20T08:00:00Z'
        },
        {
          id: 'def_sand_bedding',
          companyId: 'comp_1',
          code: 'CIV-002',
          name: 'توريد وفرش رمل ناعم أسفل الكابلات',
          nameI18n: { ar: 'توريد وفرش رمل ناعم أسفل الكابلات', en: 'Fine Sand Bedding Under Cables', ur: 'کیبلز کے نیچے ریت کی بچھونا', hi: 'केबल के नीचे रेत बिछाना', bn: 'তারের নিচে বালি বিছানো' },
          unit: 'متر مكعب',
          category: 'civil',
          reqTemplate: [
            { kind: 'photo', label: 'فحص عينة الرمل المورد', stage: 'before', minCount: 1 },
            { kind: 'photo', label: 'صورة سماكة الفرشة (10 سم)', stage: 'during', minCount: 2 }
          ],
          active: true,
          createdAt: '2026-09-20T08:30:00Z'
        },
        {
          id: 'def_cable_pulling',
          companyId: 'comp_1',
          code: 'ELE-001',
          name: 'سحب وتمديد كابلات جهد متوسط 33kV',
          nameI18n: { ar: 'سحب وتمديد كابلات جهد متوسط 33kV', en: 'Medium Voltage 33kV Cable Pulling', ur: 'میڈیم وولٹیج کیبل کھینچنا', hi: 'मीडियम वोल्टेज केबल बिछाना', bn: 'মাঝারি ভোল্টেজ তার টানা' },
          unit: 'متر طولي',
          category: 'electrical',
          reqTemplate: [
            { kind: 'photo', label: 'صورة بكرات الكابل وشهادة الفحص', stage: 'before', minCount: 1 },
            { kind: 'video', label: 'فيديو عملية السحب والسرعة المحددة', stage: 'during', minCount: 1, minVideoSec: 10 },
            { kind: 'document', label: 'تقرير اختبار العزل (Megger Test)', stage: 'after', minCount: 1 }
          ],
          active: true,
          createdAt: '2026-09-21T09:00:00Z'
        }
      ],
      lines: [
        {
          id: 'line_101_1',
          companyId: 'comp_1',
          woId: 'WO-2026-101',
          defId: 'def_excavation',
          qty: 450,
          unit: 'متر طولي',
          status: 'in_progress',
          progressPct: 65,
          assignees: [
            { personId: 'user_foreman_ali', role: 'foreman' }
          ],
          due: '2026-10-05',
          notes: 'تم إنجاز 300 متر ومتبقي 150 متر بانتظار تصريح تقاطع الشارع الرئيسي.',
          createdAt: '2026-09-21T10:00:00Z',
          updatedAt: '2026-09-25T14:00:00Z'
        },
        {
          id: 'line_101_2',
          companyId: 'comp_1',
          woId: 'WO-2026-101',
          defId: 'def_sand_bedding',
          qty: 90,
          unit: 'متر مكعب',
          status: 'in_progress',
          progressPct: 40,
          assignees: [
            { personId: 'user_foreman_ali', role: 'foreman' }
          ],
          due: '2026-10-06',
          notes: 'توريد الدفعة الأولى تم بنجاح.',
          createdAt: '2026-09-22T08:00:00Z',
          updatedAt: '2026-09-26T11:00:00Z'
        },
        {
          id: 'line_101_3',
          companyId: 'comp_1',
          woId: 'WO-2026-101',
          defId: 'def_cable_pulling',
          qty: 450,
          unit: 'متر طولي',
          status: 'planned',
          progressPct: 0,
          assignees: [
            { personId: 'user_foreman_saad', role: 'foreman' } // Assigned to Saad, Ali cannot see/edit in Foreman My Work
          ],
          due: '2026-10-12',
          notes: 'مجدول بعد اعتماد الرصف والردم.',
          createdAt: '2026-09-23T09:00:00Z',
          updatedAt: '2026-09-23T09:00:00Z'
        }
      ],
      reqs: [
        {
          id: 'req_101_1_before',
          lineId: 'line_101_1',
          woId: 'WO-2026-101',
          kind: 'photo',
          label: 'صورة الموقع قبل البدء وتحديد المسار',
          stage: 'before',
          minCount: 2,
          minVideoSec: 0,
          status: 'satisfied',
          attachments: [
            {
              hash: 'sha256_mock_photo_1',
              name: 'rawdah_pre_excavation_01.jpg',
              type: 'image/jpeg',
              size: 245000,
              durationSec: 0,
              addedBy: 'user_foreman_ali',
              addedAt: '2026-09-21T10:15:00Z',
              removedBy: null,
              removedAt: null,
              removeReason: null,
              replacedBy: null,
              missingBinary: false
            },
            {
              hash: 'sha256_mock_photo_2_legacy',
              name: 'site_survey_point_b.png',
              type: 'image/png',
              size: 198000,
              durationSec: 0,
              addedBy: 'user_foreman_ali',
              addedAt: '2026-09-21T10:20:00Z',
              removedBy: null,
              removedAt: null,
              removeReason: null,
              replacedBy: null,
              missingBinary: true // Legacy metadata-only indicator
            }
          ]
        },
        {
          id: 'req_101_1_video',
          lineId: 'line_101_1',
          woId: 'WO-2026-101',
          kind: 'video',
          label: 'فيديو توثيقي للعمق والفرشة الرملية (10 ثوان على الأقل)',
          stage: 'during',
          minCount: 1,
          minVideoSec: 10,
          status: 'satisfied',
          attachments: [
            {
              hash: 'sha256_mock_video_trench',
              name: 'trench_depth_inspection_12s.mp4',
              type: 'video/mp4',
              size: 14800000,
              durationSec: 12,
              addedBy: 'user_foreman_ali',
              addedAt: '2026-09-24T16:00:00Z',
              removedBy: null,
              removedAt: null,
              removeReason: null,
              replacedBy: null,
              missingBinary: false
            }
          ]
        },
        {
          id: 'req_101_1_after',
          lineId: 'line_101_1',
          woId: 'WO-2026-101',
          kind: 'photo',
          label: 'صورة نظافة الموقع والردم المبدئي',
          stage: 'after',
          minCount: 2,
          minVideoSec: 0,
          status: 'open',
          attachments: []
        }
      ],
      events: [
        {
          id: 'ev_001',
          at: '2026-09-21T10:00:00Z',
          actorId: 'user_admin',
          actorName: 'م. إسلام فودة',
          entity: 'line',
          entityId: 'line_101_1',
          woId: 'WO-2026-101',
          action: 'create',
          before: null,
          after: { defId: 'def_excavation', qty: 450, unit: 'متر طولي' }
        },
        {
          id: 'ev_002',
          at: '2026-09-21T10:05:00Z',
          actorId: 'user_admin',
          actorName: 'م. إسلام فودة',
          entity: 'line',
          entityId: 'line_101_1',
          woId: 'WO-2026-101',
          action: 'assign',
          before: { assignees: [] },
          after: { assignees: [{ personId: 'user_foreman_ali', role: 'foreman' }] }
        },
        {
          id: 'ev_003',
          at: '2026-09-24T16:00:00Z',
          actorId: 'user_foreman_ali',
          actorName: 'علي عبد الله (فورمن)',
          entity: 'attachment',
          entityId: 'req_101_1_video',
          woId: 'WO-2026-101',
          action: 'attach',
          before: null,
          after: { name: 'trench_depth_inspection_12s.mp4', hash: 'sha256_mock_video_trench', size: 14800000 }
        }
      ]
    }
  };

  var EIF_WORKS = {
    LEVELS: ['none', 'view', 'edit', 'approve', 'admin'],
    SCOPES: ['assigned', 'team_view', 'team_manage', 'department_manage', 'company_manage'],

    // --- READ FUNCTIONS ---
    can: function (S, actor, module, action, record) {
      if (!actor) {
        if (S && S.settings && S.settings.ownerDeviceMode) return true;
        return false;
      }
      if (actor.isSuperAdmin) return true;

      var title = (S.jobTitles || []).find(function (t) { return t.id === actor.jobTitleId; });
      if (!title || !title.active) return false;

      var level = (title.moduleAccess && title.moduleAccess[module]) || 'none';
      var levelIdx = EIF_WORKS.LEVELS.indexOf(level);

      var requiredLevel = 'view';
      if (action === 'edit' || action === 'create' || action === 'attach' || action === 'detach') requiredLevel = 'edit';
      if (action === 'approve' || action === 'status') requiredLevel = 'approve';
      if (action === 'admin' || action === 'delete') requiredLevel = 'admin';

      var reqIdx = EIF_WORKS.LEVELS.indexOf(requiredLevel);
      if (levelIdx < reqIdx) return false;

      // Scope checks
      if (record && record.woId) {
        if (title.scope === 'assigned') {
          // If checking line or req, verify actor is assigned
          if (record.assignees) {
            return record.assignees.some(function (a) { return a.personId === actor.id; });
          }
        }
        if (title.scope === 'department_manage' && record.departmentId) {
          return record.departmentId === actor.departmentId;
        }
      }
      return true;
    },

    linesFor: function (S, actor, woId) {
      var lines = (S.works && S.works.lines || []).filter(function (l) {
        return !woId || l.woId === woId;
      });

      if (!actor && S && S.settings && S.settings.ownerDeviceMode) return lines;
      if (actor && actor.isSuperAdmin) return lines;

      var title = actor && (S.jobTitles || []).find(function (t) { return t.id === actor.jobTitleId; });
      if (title && title.scope === 'assigned') {
        return lines.filter(function (l) {
          return l.assignees && l.assignees.some(function (a) { return a.personId === actor.id; });
        });
      }
      return lines;
    },

    reqsFor: function (S, actor, lineId) {
      return (S.works && S.works.reqs || []).filter(function (r) {
        return r.lineId === lineId;
      });
    },

    visibleWorkOrders: function (S, actor) {
      var allWos = (S.workorders || []);
      if (!actor && S && S.settings && S.settings.ownerDeviceMode) {
        return allWos.map(function (w) { return w.id; });
      }
      if (actor && actor.isSuperAdmin) {
        return allWos.map(function (w) { return w.id; });
      }

      var title = actor && (S.jobTitles || []).find(function (t) { return t.id === actor.jobTitleId; });
      if (title && title.scope === 'assigned') {
        var myLines = (S.works && S.works.lines || []).filter(function (l) {
          return l.assignees && l.assignees.some(function (a) { return a.personId === actor.id; });
        });
        var woSet = {};
        myLines.forEach(function (l) { woSet[l.woId] = true; });
        return Object.keys(woSet);
      }

      return allWos.map(function (w) { return w.id; });
    },

    defs: function (S, companyId, opts) {
      opts = opts || {};
      var list = (S.works && S.works.defs || []);
      return list.filter(function (d) {
        if (companyId && d.companyId !== companyId) return false;
        if (!opts.includeInactive && d.active === false) return false;
        return true;
      });
    },

    eventsFor: function (S, filter) {
      filter = filter || {};
      var list = (S.works && S.works.events || []).slice();
      if (filter.woId) {
        list = list.filter(function (e) { return e.woId === filter.woId; });
      }
      if (filter.entityId) {
        list = list.filter(function (e) { return e.entityId === filter.entityId; });
      }
      return list.reverse(); // newest first
    },

    resolveTitle: function (S, jobTitleId, lang) {
      var t = (S.jobTitles || []).find(function (item) { return item.id === jobTitleId; });
      if (!t) return '—';
      if (lang === 'en' && t.nameEn) return t.nameEn;
      return t.name;
    },

    resolveDepartment: function (S, departmentId, lang) {
      var d = (S.departments || []).find(function (item) { return item.id === departmentId; });
      if (!d) return '—';
      if (lang === 'en' && d.nameEn) return d.nameEn;
      return d.name;
    },

    migrationReport: function (S) {
      var unassigned = (S.works && S.works.lines || []).filter(function (l) {
        return !l.assignees || l.assignees.length === 0;
      });
      var missingBinaries = [];
      (S.works && S.works.reqs || []).forEach(function (r) {
        (r.attachments || []).forEach(function (att) {
          if (att.missingBinary && !att.removedAt) {
            missingBinaries.push({ reqId: r.id, woId: r.woId, label: r.label, name: att.name });
          }
        });
      });
      var flaggedPersons = (S.persons || []).filter(function (p) {
        return !p.jobTitleId || !(S.jobTitles || []).some(function (t) { return t.id === p.jobTitleId; });
      });

      return {
        unassignedLines: unassigned,
        missingBinaries: missingBinaries,
        flaggedPersons: flaggedPersons
      };
    },

    // --- WRITE FUNCTIONS ---
    createLine: function (S, actor, payload) {
      if (!EIF_WORKS.can(S, actor, 'works', 'create')) {
        return { ok: false, code: 'DENIED', message: 'غير مصرح لك بإضافة بند عمل' };
      }
      var def = (S.works.defs || []).find(function (d) { return d.id === payload.defId; });
      if (!def) return { ok: false, code: 'DEF_NOT_FOUND', message: 'تعريف البند غير موجود' };

      var lineId = 'line_' + Date.now();
      var newLine = {
        id: lineId,
        companyId: def.companyId || 'comp_1',
        woId: payload.woId,
        defId: payload.defId,
        qty: Number(payload.qty) || 1,
        unit: def.unit,
        status: 'planned',
        progressPct: 0,
        assignees: [],
        due: payload.due || '',
        notes: payload.notes || '',
        createdAt: new Date().toISOString(),
        createdBy: actor ? actor.id : 'owner'
      };

      S.works.lines.push(newLine);

      // Spawn default requirements from template
      (def.reqTemplate || []).forEach(function (t, idx) {
        var reqId = 'req_' + lineId + '_' + (idx + 1);
        S.works.reqs.push({
          id: reqId,
          lineId: lineId,
          woId: payload.woId,
          kind: t.kind,
          label: t.label,
          stage: t.stage,
          minCount: t.minCount || 1,
          minVideoSec: t.minVideoSec || 0,
          status: 'open',
          attachments: []
        });
      });

      S.works.events.push({
        id: 'ev_' + Date.now(),
        at: new Date().toISOString(),
        actorId: actor ? actor.id : 'owner',
        actorName: actor ? actor.name : 'Owner Device',
        entity: 'line',
        entityId: lineId,
        woId: payload.woId,
        action: 'create',
        before: null,
        after: { defId: payload.defId, qty: newLine.qty }
      });

      return { ok: true, value: newLine };
    },

    updateLine: function (S, actor, lineId, patch) {
      var line = (S.works.lines || []).find(function (l) { return l.id === lineId; });
      if (!line) return { ok: false, code: 'NOT_FOUND', message: 'بند العمل غير موجود' };
      if (!EIF_WORKS.can(S, actor, 'works', 'edit', line)) {
        return { ok: false, code: 'DENIED', message: 'غير مصرح بتعديل البند' };
      }

      var before = { qty: line.qty, due: line.due, notes: line.notes, progressPct: line.progressPct };
      Object.assign(line, patch);
      line.updatedAt = new Date().toISOString();
      line.updatedBy = actor ? actor.id : 'owner';

      S.works.events.push({
        id: 'ev_' + Date.now(),
        at: new Date().toISOString(),
        actorId: actor ? actor.id : 'owner',
        actorName: actor ? actor.name : 'Owner Device',
        entity: 'line',
        entityId: lineId,
        woId: line.woId,
        action: 'update',
        before: before,
        after: patch
      });

      return { ok: true, value: line };
    },

    assign: function (S, actor, lineId, assignees) {
      var line = (S.works.lines || []).find(function (l) { return l.id === lineId; });
      if (!line) return { ok: false, code: 'NOT_FOUND', message: 'بند العمل غير موجود' };
      if (!EIF_WORKS.can(S, actor, 'works', 'edit', line)) {
        return { ok: false, code: 'DENIED', message: 'غير مصرح بإسناد البند' };
      }

      var before = { assignees: line.assignees };
      line.assignees = assignees || [];

      S.works.events.push({
        id: 'ev_' + Date.now(),
        at: new Date().toISOString(),
        actorId: actor ? actor.id : 'owner',
        actorName: actor ? actor.name : 'Owner Device',
        entity: 'line',
        entityId: lineId,
        woId: line.woId,
        action: 'assign',
        before: before,
        after: { assignees: line.assignees }
      });

      return { ok: true, value: line };
    },

    setStatus: function (S, actor, lineId, status) {
      var line = (S.works.lines || []).find(function (l) { return l.id === lineId; });
      if (!line) return { ok: false, code: 'NOT_FOUND', message: 'بند العمل غير موجود' };
      if (!EIF_WORKS.can(S, actor, 'works', 'status', line)) {
        return { ok: false, code: 'DENIED', message: 'غير مصرح بتغيير الحالة' };
      }

      var before = { status: line.status };
      line.status = status;
      if (status === 'approved') line.progressPct = 100;

      S.works.events.push({
        id: 'ev_' + Date.now(),
        at: new Date().toISOString(),
        actorId: actor ? actor.id : 'owner',
        actorName: actor ? actor.name : 'Owner Device',
        entity: 'line',
        entityId: lineId,
        woId: line.woId,
        action: 'status',
        before: before,
        after: { status: status }
      });

      return { ok: true, value: line };
    },

    attach: function (S, actor, reqId, files) {
      return new Promise(function (resolve) {
        var req = (S.works.reqs || []).find(function (r) { return r.id === reqId; });
        if (!req) return resolve({ ok: false, code: 'NOT_FOUND', message: 'المتطلب غير موجود' });

        var line = (S.works.lines || []).find(function (l) { return l.id === req.lineId; });
        if (!EIF_WORKS.can(S, actor, 'works', 'attach', line)) {
          return resolve({ ok: false, code: 'DENIED', message: 'غير مصرح لك بإرفاق ملفات لهذا البند' });
        }

        var newRefs = [];
        for (var i = 0; i < files.length; i++) {
          var f = files[i];
          // Video length check (>= 10s rule)
          if (f.type && f.type.indexOf('video') === 0) {
            var dur = f.durationSec || (f.mockDuration ? f.mockDuration : 15);
            if (dur < 10) {
              return resolve({ ok: false, code: 'VIDEO_TOO_SHORT', message: 'الفيديو قصير جداً (' + dur + ' ثوان). الحد الأدنى المطلوب 10 ثوان.' });
            }
          }

          var ref = {
            hash: 'sha256_mock_' + Date.now() + '_' + i,
            name: f.name || 'attachment_' + (i + 1),
            type: f.type || 'application/octet-stream',
            size: f.size || 102400,
            durationSec: f.durationSec || (f.type && f.type.indexOf('video') === 0 ? 12 : 0),
            addedBy: actor ? actor.id : 'owner',
            addedAt: new Date().toISOString(),
            removedBy: null,
            removedAt: null,
            removeReason: null,
            replacedBy: null,
            missingBinary: false
          };
          req.attachments.push(ref);
          newRefs.push(ref);

          S.works.events.push({
            id: 'ev_' + Date.now() + '_' + i,
            at: new Date().toISOString(),
            actorId: actor ? actor.id : 'owner',
            actorName: actor ? actor.name : 'Owner Device',
            entity: 'attachment',
            entityId: reqId,
            woId: req.woId,
            action: 'attach',
            before: null,
            after: { name: ref.name, hash: ref.hash, size: ref.size }
          });
        }

        // Satisfy requirement if minCount reached
        var activeCount = req.attachments.filter(function (a) { return !a.removedAt; }).length;
        if (activeCount >= req.minCount) req.status = 'satisfied';

        resolve({ ok: true, value: newRefs });
      });
    },

    detach: function (S, actor, reqId, hash, reason) {
      var req = (S.works.reqs || []).find(function (r) { return r.id === reqId; });
      if (!req) return { ok: false, code: 'NOT_FOUND', message: 'المتطلب غير موجود' };

      var line = (S.works.lines || []).find(function (l) { return l.id === req.lineId; });
      if (!EIF_WORKS.can(S, actor, 'works', 'detach', line)) {
        return { ok: false, code: 'DENIED', message: 'غير مصرح بحذف المرفق' };
      }

      var att = (req.attachments || []).find(function (a) { return a.hash === hash && !a.removedAt; });
      if (!att) return { ok: false, code: 'ATT_NOT_FOUND', message: 'المرفق غير موجود أو محذوف مسبقاً' };

      // Soft delete
      att.removedAt = new Date().toISOString();
      att.removedBy = actor ? actor.id : 'owner';
      att.removeReason = reason || 'حذف يدوي من المستخدم';

      var activeCount = req.attachments.filter(function (a) { return !a.removedAt; }).length;
      if (activeCount < req.minCount) req.status = 'open';

      S.works.events.push({
        id: 'ev_' + Date.now(),
        at: new Date().toISOString(),
        actorId: actor ? actor.id : 'owner',
        actorName: actor ? actor.name : 'Owner Device',
        entity: 'attachment',
        entityId: reqId,
        woId: req.woId,
        action: 'detach',
        before: { name: att.name, hash: hash },
        after: { removedAt: att.removedAt, reason: att.removeReason }
      });

      return { ok: true, value: att };
    },

    replace: function (S, actor, reqId, oldHash, newFile) {
      return new Promise(function (resolve) {
        var detachRes = EIF_WORKS.detach(S, actor, reqId, oldHash, 'تم الاستبدال بملف جديد: ' + newFile.name);
        if (!detachRes.ok) return resolve(detachRes);

        EIF_WORKS.attach(S, actor, reqId, [newFile]).then(function (attachRes) {
          if (!attachRes.ok) return resolve(attachRes);
          var newRef = attachRes.value[0];
          detachRes.value.replacedBy = newRef.hash;

          S.works.events.push({
            id: 'ev_' + Date.now(),
            at: new Date().toISOString(),
            actorId: actor ? actor.id : 'owner',
            actorName: actor ? actor.name : 'Owner Device',
            entity: 'attachment',
            entityId: reqId,
            woId: detachRes.value.woId || '',
            action: 'replace',
            before: { oldHash: oldHash },
            after: { newHash: newRef.hash, newName: newRef.name }
          });

          resolve({ ok: true, value: newRef });
        });
      });
    },

    saveDef: function (S, actor, defObj) {
      if (!EIF_WORKS.can(S, actor, 'works', 'admin')) {
        return { ok: false, code: 'DENIED', message: 'غير مصرح بتعريف بنود الأعمال' };
      }
      var existing = (S.works.defs || []).find(function (d) { return d.id === defObj.id; });
      if (existing) {
        Object.assign(existing, defObj);
      } else {
        defObj.id = defObj.id || 'def_' + Date.now();
        defObj.createdAt = new Date().toISOString();
        S.works.defs.push(defObj);
      }
      return { ok: true, value: defObj };
    },

    saveDepartment: function (S, actor, deptObj) {
      if (!EIF_WORKS.can(S, actor, 'settings', 'admin')) {
        return { ok: false, code: 'DENIED', message: 'غير مصرح بإدارة الأقسام' };
      }
      var existing = (S.departments || []).find(function (d) { return d.id === deptObj.id; });
      if (existing) {
        Object.assign(existing, deptObj);
      } else {
        deptObj.id = deptObj.id || 'dept_' + Date.now();
        deptObj.active = true;
        S.departments.push(deptObj);
      }
      return { ok: true, value: deptObj };
    },

    saveJobTitle: function (S, actor, titleObj) {
      if (!EIF_WORKS.can(S, actor, 'settings', 'admin')) {
        return { ok: false, code: 'DENIED', message: 'غير مصرح بإدارة المسميات الوظيفية' };
      }
      if (!titleObj.departmentId) {
        return { ok: false, code: 'NO_DEPARTMENT', message: 'يجب ربط المسمى الوظيفي بقسم محدد' };
      }
      var existing = (S.jobTitles || []).find(function (t) { return t.id === titleObj.id; });
      if (existing) {
        Object.assign(existing, titleObj);
      } else {
        titleObj.id = titleObj.id || 'title_' + Date.now();
        titleObj.active = true;
        S.jobTitles.push(titleObj);
      }
      return { ok: true, value: titleObj };
    },

    deactivateDepartment: function (S, actor, id) {
      if (!EIF_WORKS.can(S, actor, 'settings', 'admin')) {
        return { ok: false, code: 'DENIED', message: 'غير مصرح بتعطيل القسم' };
      }
      var hasActive = (S.persons || []).some(function (p) { return p.departmentId === id && p.active !== false; });
      if (hasActive) {
        return { ok: false, code: 'HAS_ACTIVE_PERSONS', message: 'لا يمكن تعطيل القسم لوجود موظفين نشطين مرتبطين به' };
      }
      var dept = (S.departments || []).find(function (d) { return d.id === id; });
      if (dept) dept.active = false;
      return { ok: true };
    },

    deactivateJobTitle: function (S, actor, id) {
      if (!EIF_WORKS.can(S, actor, 'settings', 'admin')) {
        return { ok: false, code: 'DENIED', message: 'غير مصرح بتعطيل المسمى' };
      }
      var hasActive = (S.persons || []).some(function (p) { return p.jobTitleId === id && p.active !== false; });
      if (hasActive) {
        return { ok: false, code: 'HAS_ACTIVE_PERSONS', message: 'لا يمكن تعطيل المسمى لوجود موظفين نشطين يحملونه' };
      }
      var t = (S.jobTitles || []).find(function (item) { return item.id === id; });
      if (t) t.active = false;
      return { ok: true };
    },

    grant: function (S, actor, targetPersonId, grantObj) {
      if (!EIF_WORKS.can(S, actor, 'settings', 'admin')) {
        return { ok: false, code: 'DENIED', message: 'غير مصرح بمنح صلاحيات' };
      }
      var target = (S.persons || []).find(function (p) { return p.id === targetPersonId; });
      if (!target) return { ok: false, code: 'NOT_FOUND', message: 'المستخدم غير موجود' };

      // Ceiling check: Actor cannot grant higher than their own level
      if (actor && !actor.isSuperAdmin) {
        var myTitle = (S.jobTitles || []).find(function (t) { return t.id === actor.jobTitleId; });
        if (grantObj.level) {
          var myLvl = (myTitle && myTitle.moduleAccess && myTitle.moduleAccess[grantObj.module]) || 'none';
          if (EIF_WORKS.LEVELS.indexOf(grantObj.level) > EIF_WORKS.LEVELS.indexOf(myLvl)) {
            return { ok: false, code: 'CEILING', message: 'لا يمكنك منح صلاحية أعلى من مستواك الخاص' };
          }
        }
      }

      target.moduleOverrides = target.moduleOverrides || {};
      if (grantObj.module) target.moduleOverrides[grantObj.module] = grantObj.level;
      if (grantObj.scope) target.scopeOverride = grantObj.scope;

      return { ok: true, value: target };
    },

    delegate: function (S, actor, payload) {
      if (!payload.expiresAt) {
        return { ok: false, code: 'NO_EXPIRY', message: 'التفويض يتطلب تاريخ انتهاء محدد' };
      }
      return EIF_WORKS.grant(S, actor, payload.toPersonId, { module: payload.module, level: payload.level });
    },

    setSuperAdmin: function (S, actor, personId, bool) {
      if (!actor || !actor.isSuperAdmin) {
        return { ok: false, code: 'DENIED', message: 'وحده السوبر أدمن يمكنه تعديل هذه الصفة' };
      }
      if (!bool) {
        var admins = (S.persons || []).filter(function (p) { return p.isSuperAdmin && p.active !== false; });
        if (admins.length <= 1 && admins[0].id === personId) {
          return { ok: false, code: 'LAST_ADMIN', message: 'حظر أمني: لا يمكن عزل أو تخفيض آخر سوبر أدمن في النظام' };
        }
      }
      var target = (S.persons || []).find(function (p) { return p.id === personId; });
      if (!target) return { ok: false, code: 'NOT_FOUND', message: 'المستخدم غير موجود' };
      target.isSuperAdmin = bool;
      return { ok: true, value: target };
    },

    migrate: function () {
      return Promise.resolve({ changed: false, report: { message: 'Mock state already normalized.' } });
    }
  };

  window.EIF_WORKS = EIF_WORKS;
  window.__EIF_MOCK_STATE = mockState;

})(window);
