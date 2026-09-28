/**
 * assets/js/works_ui.js
 * Engineer Islam Fouda WMS V16.50 — Unified Work Center UI Module
 * Autonomous, Decoupled, Purely Consumes window.EIF_WORKS API
 * Multi-Language (ar, en, ur, hi, bn) • Tablet-First • Zero direct S.* mutations
 */

(function (window) {
  'use strict';

  // --- 1. Multi-Lingual Dictionary (5 Languages) ---
  var I18N = {
    ar: {
      workCenter: 'مركز الأعمال الموحد',
      foremanMyWork: 'أعمالي الميدانية (المراقب)',
      orgAdmin: 'إدارة الأقسام والمسميات',
      permissions: 'سقوف الصلاحيات والتفويض',
      migrationReport: 'تقرير تدقيق الترحيل',
      selectWo: 'اختر أمر العمل:',
      allWos: '-- جميع أوامر العمل المتاحة --',
      permitNo: 'رقم تصريح بلدي:',
      secProject: 'مشروع سكيكو:',
      location: 'الموقع:',
      status: 'الحالة:',
      linesTitle: 'بنود الأعمال المعتمدة لأمر العمل',
      addLine: '+ إضافة بند عمل',
      defName: 'نوع العمل / البند',
      qtyUnit: 'الكمية والوحدة',
      progress: 'نسبة الإنجاز',
      assignees: 'المسند إليهم',
      actions: 'إجراءات',
      noLines: 'لا توجد بنود عمل مسجلة لهذا الأمر حالياً.',
      reqsTitle: 'متطلبات التوثيق والمستندات الميدانية للبند المختار',
      uploadFiles: 'انقر أو اسحب ملفات لرفع التوثيق (صور / فيديو / PDF)',
      videoMinNote: 'تنبيه: يجب ألا تقل مدة الفيديو التوثيقي عن 10 ثوانٍ.',
      missingBinaryBadge: '⚠ الملف الأصلي غير محفوظ — أعد الرفع',
      showHistory: 'عرض سجل المحذوفات والمستبدلات',
      hideHistory: 'إخفاء سجل المحذوفات',
      timelineTitle: 'السجل الزمني للأحداث (Audit Trail)',
      deleteReasonPrompt: 'يرجى إدخال سبب الحذف للمراجعة:',
      replaceFile: 'استبدال',
      deleteFile: 'حذف',
      myAssignedLines: 'البنود المسندة إلي فقط في هذا الأمر',
      readOnlyNotice: 'وضع العرض الميداني: ترويسة أمر العمل للقراءة فقط.',
      deptsTitle: 'الهيكل التنظيمي والأقسام',
      addDept: '+ إضافة قسم جديد',
      titlesTitle: 'المسميات الوظيفية وبطاقات الوصف',
      addTitle: '+ إضافة مسمى وظيفي',
      deactivate: 'تعطيل',
      active: 'نشط',
      inactive: 'معطل',
      scope: 'نطاق الصلاحية:',
      deptRequired: 'القسم التابع له (إلزامي):',
      save: 'حفظ وتثبيت',
      cancel: 'إلغاء',
      close: 'إغلاق',
      superAdminToggle: 'صلاحية سوبر أدمن (مدير عام كامل للنظام):',
      grantModuleCeiling: 'تعديل صلاحيات الوحدات (ضمن سقف صلاحياتك):',
      unassignedLinesCount: 'بنود عمل غير مسندة لأي مراقب:',
      missingBinariesCount: 'مرفقات مفقودة البايتات (من الإصدارات السابقة):',
      flaggedPersonsCount: 'موظفون بمسميات غير مسكنة أو معلقة:',
      operationSuccess: 'تمت العملية بنجاح',
      actorRoleLabel: 'المستخدم الحالي:',
      errVideoTooShort: 'خطأ: مدة الفيديو أقل من 10 ثوانٍ! تم رفض الملف.',
      errDenied: 'غير مصرح لك بإجراء هذه العملية.',
      errCeiling: 'لا يمكنك منح صلاحية أعلى من مستواك الخاص.',
      errLastAdmin: 'حظر أمني: لا يمكن عزل أو تخفيض آخر سوبر أدمن في النظام.',
      errHasActivePersons: 'لا يمكن تعطيل العنصر لوجود موظفين نشطين مرتبطين به.'
    },
    en: {
      workCenter: 'Unified Work Center',
      foremanMyWork: 'My Field Work (Foreman)',
      orgAdmin: 'Departments & Job Titles',
      permissions: 'Permissions & Delegations',
      migrationReport: 'Migration Audit Report',
      selectWo: 'Select Work Order:',
      allWos: '-- All Available Work Orders --',
      permitNo: 'Balady Permit No:',
      secProject: 'SEC Project No:',
      location: 'Location:',
      status: 'Status:',
      linesTitle: 'Approved Scope Work Lines',
      addLine: '+ Add Work Line',
      defName: 'Work Type / Scope',
      qtyUnit: 'Quantity & Unit',
      progress: 'Progress',
      assignees: 'Assignees',
      actions: 'Actions',
      noLines: 'No work lines registered for this order.',
      reqsTitle: 'Field Documentation & Evidence Requirements',
      uploadFiles: 'Click or drag files to upload evidence (Photos / Video / PDF)',
      videoMinNote: 'Notice: Video evidence must be at least 10 seconds long.',
      missingBinaryBadge: '⚠ Original file binary missing — please re-upload',
      showHistory: 'Show soft-deleted & replaced history',
      hideHistory: 'Hide history',
      timelineTitle: 'Audit Event Trail',
      deleteReasonPrompt: 'Please enter removal reason for audit:',
      replaceFile: 'Replace',
      deleteFile: 'Delete',
      myAssignedLines: 'Lines Assigned to Me Only',
      readOnlyNotice: 'Field Mode: Work order header is read-only.',
      deptsTitle: 'Departments Organization Tree',
      addDept: '+ Add Department',
      titlesTitle: 'Job Titles & Role Cards',
      addTitle: '+ Add Job Title',
      deactivate: 'Deactivate',
      active: 'Active',
      inactive: 'Inactive',
      scope: 'Access Scope:',
      deptRequired: 'Parent Department (Mandatory):',
      save: 'Save',
      cancel: 'Cancel',
      close: 'Close',
      superAdminToggle: 'Super Admin Status (Global System Owner):',
      grantModuleCeiling: 'Module Permission Ceiling:',
      unassignedLinesCount: 'Unassigned Work Lines:',
      missingBinariesCount: 'Legacy Missing Binaries:',
      flaggedPersonsCount: 'Persons with Unresolved Titles:',
      operationSuccess: 'Operation completed successfully',
      actorRoleLabel: 'Current User:',
      errVideoTooShort: 'Error: Video duration is under 10 seconds! File rejected.',
      errDenied: 'Permission denied for this action.',
      errCeiling: 'Cannot grant permission higher than your own ceiling.',
      errLastAdmin: 'Security Lockout: Cannot demote the last remaining Super Admin.',
      errHasActivePersons: 'Cannot deactivate: active persons are currently linked to this record.'
    },
    ur: {
      workCenter: 'ورک سینٹر',
      foremanMyWork: 'میرا فیلڈ کام',
      orgAdmin: 'شعبہ جات اور عہدے',
      permissions: 'اختیارات',
      migrationReport: 'آڈٹ رپورٹ',
      selectWo: 'ورک آرڈر منتخب کریں:',
      linesTitle: 'منظور شدہ کام کی لائنیں',
      uploadFiles: 'فائلیں اپ لوڈ کریں',
      videoMinNote: 'ویڈیو کم از کم 10 سیکنڈ ہونی چاہیے'
    },
    hi: {
      workCenter: 'कार्य केंद्र',
      foremanMyWork: 'मेरा कार्य (फोरमैन)',
      orgAdmin: 'विभाग और पद',
      permissions: 'अनुमतियाँ',
      migrationReport: 'ऑडिट रिपोर्ट',
      selectWo: 'कार्य आदेश चुनें:',
      linesTitle: 'स्वीकृत कार्य सूची',
      uploadFiles: 'फ़ाइलें अपलोड करें',
      videoMinNote: 'वीडियो कम से کم 10 सेकंड का होना चाहिए'
    },
    bn: {
      workCenter: 'কাজের কেন্দ্র',
      foremanMyWork: 'আমার কাজ (ফোরম্যান)',
      orgAdmin: 'বিভাগ ও পদবী',
      permissions: 'অনুমতিসমূহ',
      migrationReport: 'অডিট রিপোর্ট',
      selectWo: 'কাজের অর্ডার নির্বাচন করুন:',
      linesTitle: 'অনুমোদিত কাজের তালিকা',
      uploadFiles: 'ফাইল আপলোড করুন',
      videoMinNote: 'ভিডিও কমপক্ষে ১০ সেকেন্ড হতে হবে'
    }
  };

  function getLang() {
    return window.uiLanguage || 'ar';
  }

  function t(key) {
    var lang = getLang();
    var dict = I18N[lang] || I18N.ar;
    return dict[key] || I18N.ar[key] || key;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // --- Notification Toast ---
  function showToast(msg, isError) {
    var toast = document.getElementById('wcToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'wcToast';
      toast.className = 'wc-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.background = isError ? 'var(--wc-danger)' : 'var(--wc-navy)';
    toast.classList.add('show');
    setTimeout(function () {
      toast.classList.remove('show');
    }, 3500);
  }

  function handleError(res) {
    if (!res || res.ok) return;
    var msg = res.message;
    if (res.code === 'VIDEO_TOO_SHORT') msg = t('errVideoTooShort');
    if (res.code === 'DENIED') msg = t('errDenied');
    if (res.code === 'CEILING') msg = t('errCeiling');
    if (res.code === 'LAST_ADMIN') msg = t('errLastAdmin');
    if (res.code === 'HAS_ACTIVE_PERSONS') msg = t('errHasActivePersons');
    showToast(msg || 'Error', true);
  }

  // --- Screen State ---
  var state = {
    activeTab: 'workCenter', // 'workCenter' | 'foreman' | 'orgAdmin' | 'permissions' | 'migration'
    selectedWoId: '',
    selectedLineId: '',
    showDeletedHistory: false
  };

  // --- Main Render Dispatcher ---
  function render(container, S, actor) {
    var lang = getLang();
    var isRtl = (lang === 'ar' || lang === 'ur');
    container.dir = isRtl ? 'rtl' : 'ltr';
    container.innerHTML = '';

    var wrapper = document.createElement('div');
    wrapper.className = 'wc-container';

    // 1. Header with Tabs
    var header = document.createElement('div');
    header.className = 'wc-header';

    var titleBox = document.createElement('div');
    titleBox.className = 'wc-header-title';
    var actorTitle = actor ? (window.EIF_WORKS.resolveTitle(S, actor.jobTitleId, lang) + ' — ' + actor.name) : 'وضع جهاز المالك (كامل الصلاحيات)';
    titleBox.innerHTML = '<h2>🏢 ' + escapeHtml(t(state.activeTab)) + '</h2>' +
      '<div class="wc-actor-badge">👤 ' + escapeHtml(actorTitle) + '</div>';
    header.appendChild(titleBox);

    var nav = document.createElement('div');
    nav.className = 'wc-tabs-nav';

    var tabs = [
      { id: 'workCenter', label: t('workCenter'), icon: '📋' },
      { id: 'foreman', label: t('foremanMyWork'), icon: '👷' },
      { id: 'orgAdmin', label: t('orgAdmin'), icon: '🏢' },
      { id: 'permissions', label: t('permissions'), icon: '🔐' },
      { id: 'migration', label: t('migrationReport'), icon: '📊' }
    ];

    tabs.forEach(function (tab) {
      var btn = document.createElement('button');
      btn.className = 'wc-tab-btn' + (state.activeTab === tab.id ? ' active' : '');
      btn.innerHTML = tab.icon + ' ' + escapeHtml(tab.label);
      btn.onclick = function () {
        state.activeTab = tab.id;
        render(container, S, actor);
      };
      nav.appendChild(btn);
    });
    header.appendChild(nav);
    wrapper.appendChild(header);

    // 2. Active Screen Content
    var contentArea = document.createElement('div');
    if (state.activeTab === 'workCenter') {
      renderWorkCenterScreen(contentArea, S, actor, false);
    } else if (state.activeTab === 'foreman') {
      renderWorkCenterScreen(contentArea, S, actor, true); // Foreman mode
    } else if (state.activeTab === 'orgAdmin') {
      renderOrgAdminScreen(contentArea, S, actor);
    } else if (state.activeTab === 'permissions') {
      renderPermissionsScreen(contentArea, S, actor);
    } else if (state.activeTab === 'migration') {
      renderMigrationScreen(contentArea, S, actor);
    }

    wrapper.appendChild(contentArea);
    container.appendChild(wrapper);
  }

  // --- SCREEN A & B: Work Center & Foreman My Work ---
  function renderWorkCenterScreen(area, S, actor, isForemanMode) {
    var lang = getLang();
    var visibleWoIds = window.EIF_WORKS.visibleWorkOrders(S, actor);
    if (!state.selectedWoId && visibleWoIds.length > 0) {
      state.selectedWoId = visibleWoIds[0];
    }

    var card = document.createElement('div');
    card.className = 'wc-card';

    // Work Order Selector
    var selectorBar = document.createElement('div');
    selectorBar.className = 'wc-wo-selector-bar';

    var selectHtml = '<select class="wc-select" id="wcWoSelect">';
    (S.workorders || []).forEach(function (wo) {
      if (visibleWoIds.indexOf(wo.id) !== -1) {
        var isSel = (wo.id === state.selectedWoId) ? ' selected' : '';
        selectHtml += '<option value="' + escapeHtml(wo.id) + '"' + isSel + '>' +
          '[' + escapeHtml(wo.code || wo.id) + '] ' + escapeHtml(wo.title) +
          '</option>';
      }
    });
    selectHtml += '</select>';

    selectorBar.innerHTML = '<div><label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px">' +
      escapeHtml(t('selectWo')) + '</label>' + selectHtml + '</div>';

    if (isForemanMode) {
      var notice = document.createElement('div');
      notice.className = 'wc-badge wc-badge-in_progress';
      notice.textContent = t('readOnlyNotice');
      selectorBar.appendChild(notice);
    } else if (window.EIF_WORKS.can(S, actor, 'execution', 'create')) {
      var addLineBtn = document.createElement('button');
      addLineBtn.className = 'wc-btn wc-btn-primary';
      addLineBtn.innerHTML = '➕ ' + escapeHtml(t('addLine'));
      addLineBtn.onclick = function () {
        openAddLineModal(S, actor, state.selectedWoId, function () {
          renderWorkCenterScreen(area, S, actor, isForemanMode);
        });
      };
      selectorBar.appendChild(addLineBtn);
    }

    card.appendChild(selectorBar);

    var currentWo = (S.workorders || []).find(function (w) { return w.id === state.selectedWoId; });
    if (currentWo) {
      var strip = document.createElement('div');
      strip.className = 'wc-wo-strip';
      strip.innerHTML =
        '<div class="wc-wo-strip-item"><small>' + escapeHtml(t('permitNo')) + '</small><b>' + escapeHtml(currentWo.permitNo || '—') + '</b></div>' +
        '<div class="wc-wo-strip-item"><small>' + escapeHtml(t('secProject')) + '</small><b>' + escapeHtml(currentWo.secProjectNo || '—') + '</b></div>' +
        '<div class="wc-wo-strip-item"><small>' + escapeHtml(t('location')) + '</small><b>' + escapeHtml(currentWo.location || '—') + '</b></div>' +
        '<div class="wc-wo-strip-item"><small>' + escapeHtml(t('status')) + '</small><b><span class="wc-badge wc-badge-' + escapeHtml(currentWo.status) + '">' + escapeHtml(currentWo.status) + '</span></b></div>';
      card.appendChild(strip);
    }

    // Lines Table
    var lines = window.EIF_WORKS.linesFor(S, actor, state.selectedWoId);
    if (!state.selectedLineId && lines.length > 0) {
      state.selectedLineId = lines[0].id;
    }

    var tableHeader = document.createElement('div');
    tableHeader.className = 'wc-card-header';
    tableHeader.innerHTML = '<h3>📋 ' + escapeHtml(isForemanMode ? t('myAssignedLines') : t('linesTitle')) + ' (' + lines.length + ')</h3>';
    card.appendChild(tableHeader);

    if (lines.length === 0) {
      var emptyMsg = document.createElement('div');
      emptyMsg.style.padding = '24px';
      emptyMsg.style.textAlign = 'center';
      emptyMsg.style.color = 'var(--wc-muted)';
      emptyMsg.textContent = t('noLines');
      card.appendChild(emptyMsg);
    } else {
      var tableWrap = document.createElement('div');
      tableWrap.className = 'wc-table-wrap';
      var table = document.createElement('table');
      table.className = 'wc-table';
      table.innerHTML =
        '<thead><tr>' +
        '<th>' + escapeHtml(t('defName')) + '</th>' +
        '<th>' + escapeHtml(t('qtyUnit')) + '</th>' +
        '<th>' + escapeHtml(t('progress')) + '</th>' +
        '<th>' + escapeHtml(t('status')) + '</th>' +
        '<th>' + escapeHtml(t('assignees')) + '</th>' +
        '<th>' + escapeHtml(t('actions')) + '</th>' +
        '</tr></thead><tbody></tbody>';

      var tbody = table.querySelector('tbody');
      lines.forEach(function (line) {
        var def = (S.works.defs || []).find(function (d) { return d.id === line.defId; }) || { name: line.defId, unit: line.unit };
        var defName = (lang === 'en' && def.nameI18n && def.nameI18n.en) ? def.nameI18n.en : def.name;

        var tr = document.createElement('tr');
        if (line.id === state.selectedLineId) tr.className = 'selected';
        tr.style.cursor = 'pointer';

        var assigneeNames = (line.assignees || []).map(function (a) {
          var p = (S.orgPeople || []).find(function (item) { return item.id === a.personId; });
          return p ? p.name : a.personId;
        }).join(', ') || '—';

        tr.innerHTML =
          '<td><b>' + escapeHtml(defName) + '</b></td>' +
          '<td>' + escapeHtml(line.qty) + ' ' + escapeHtml(line.unit || def.unit) + '</td>' +
          '<td><div style="display:flex;align-items:center;gap:8px"><div class="progress" style="flex:1"><span style="width:' + (line.progressPct || 0) + '%"></span></div><b>' + (line.progressPct || 0) + '%</b></div></td>' +
          '<td><span class="wc-badge wc-badge-' + escapeHtml(line.status) + '">' + escapeHtml(line.status) + '</span></td>' +
          '<td>' + escapeHtml(assigneeNames) + '</td>' +
          '<td><button class="wc-btn wc-btn-secondary wc-btn-sm" id="btnReqs_' + escapeHtml(line.id) + '">عرض المتطلبات 🔍</button></td>';

        tr.onclick = function (e) {
          if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT') {
            state.selectedLineId = line.id;
            renderWorkCenterScreen(area, S, actor, isForemanMode);
          }
        };

        tr.querySelector('#btnReqs_' + line.id).onclick = function (e) {
          e.stopPropagation();
          state.selectedLineId = line.id;
          renderWorkCenterScreen(area, S, actor, isForemanMode);
        };

        tbody.appendChild(tr);
      });
      tableWrap.appendChild(table);
      card.appendChild(tableWrap);
    }

    area.innerHTML = '';
    area.appendChild(card);

    // Event on WO change
    var woSelect = card.querySelector('#wcWoSelect');
    if (woSelect) {
      woSelect.onchange = function () {
        state.selectedWoId = this.value;
        state.selectedLineId = '';
        renderWorkCenterScreen(area, S, actor, isForemanMode);
      };
    }

    // 3. Requirements Gallery for Selected Line
    if (state.selectedLineId) {
      var reqCard = document.createElement('div');
      reqCard.className = 'wc-card';

      var reqHeader = document.createElement('div');
      reqHeader.className = 'wc-card-header';
      reqHeader.innerHTML =
        '<h3>📸 ' + escapeHtml(t('reqsTitle')) + '</h3>' +
        '<div><button class="wc-btn wc-btn-secondary wc-btn-sm" id="btnToggleHistory">' +
        (state.showDeletedHistory ? '👁️ ' + escapeHtml(t('hideHistory')) : '🕒 ' + escapeHtml(t('showHistory'))) +
        '</button></div>';
      reqCard.appendChild(reqHeader);

      var reqs = window.EIF_WORKS.reqsFor(S, actor, state.selectedLineId);
      var reqsGrid = document.createElement('div');
      reqsGrid.className = 'wc-reqs-grid';

      reqs.forEach(function (req) {
        var reqEl = document.createElement('div');
        reqEl.className = 'wc-req-card';

        var statusBadge = req.status === 'satisfied' ?
          '<span class="wc-badge wc-badge-approved">مستوفى ✓</span>' :
          '<span class="wc-badge wc-badge-planned">مطلوب</span>';

        reqEl.innerHTML =
          '<div class="wc-req-header">' +
          '<h4 class="wc-req-title">' + escapeHtml(req.label) + '</h4>' +
          statusBadge +
          '</div>' +
          '<div class="wc-req-meta">' +
          '<span>المرحلة: <b>' + escapeHtml(req.stage) + '</b></span> • ' +
          '<span>النوع: <b>' + escapeHtml(req.kind) + '</b></span>' +
          (req.minVideoSec ? ' • <span style="color:var(--wc-warning)">فيديو ≥ ' + req.minVideoSec + ' ث</span>' : '') +
          '</div>';

        // Drop Zone for Upload
        var dropArea = document.createElement('div');
        dropArea.className = 'wc-drop-area';
        dropArea.innerHTML =
          '<span>📁 ' + escapeHtml(t('uploadFiles')) + '</span>' +
          (req.kind === 'video' ? '<small style="color:var(--wc-warning);font-size:11px">' + escapeHtml(t('videoMinNote')) + '</small>' : '') +
          '<input type="file" multiple id="fileInput_' + escapeHtml(req.id) + '">';

        dropArea.onclick = function () {
          dropArea.querySelector('input').click();
        };

        var fileInput = dropArea.querySelector('input');
        fileInput.onchange = function () {
          var files = Array.from(this.files);
          if (files.length === 0) return;

          // Attach files
          window.EIF_WORKS.attach(S, actor, req.id, files).then(function (res) {
            if (!res.ok) {
              handleError(res);
            } else {
              showToast(t('operationSuccess'));
              renderWorkCenterScreen(area, S, actor, isForemanMode);
            }
          });
        };

        reqEl.appendChild(dropArea);

        // Attachments List
        var attList = document.createElement('div');
        attList.className = 'wc-attachments-list';

        (req.attachments || []).forEach(function (att) {
          if (att.removedAt && !state.showDeletedHistory) return;

          var row = document.createElement('div');
          row.className = 'wc-attachment-row' + (att.removedAt ? ' deleted' : '');

          var badge = '';
          if (att.missingBinary && !att.removedAt) {
            badge = '<span class="wc-badge wc-badge-missing" style="font-size:11px">' + escapeHtml(t('missingBinaryBadge')) + '</span>';
          }

          var durationLabel = att.durationSec ? (' (' + att.durationSec + 's)') : '';

          row.innerHTML =
            '<div class="wc-att-info">' +
            '<span>' + (att.type.indexOf('video') === 0 ? '🎥' : att.type.indexOf('image') === 0 ? '🖼️' : '📄') + '</span>' +
            '<div style="min-width:0">' +
            '<div class="wc-att-name" title="' + escapeHtml(att.name) + '">' + escapeHtml(att.name) + durationLabel + ' ' + badge + '</div>' +
            '<div class="wc-att-meta">' + (Math.round(att.size / 1024)) + ' KB' +
            (att.removedAt ? ' • محذوف: ' + escapeHtml(att.removeReason) : '') +
            '</div>' +
            '</div>' +
            '</div>';

          var actionsDiv = document.createElement('div');
          actionsDiv.style.display = 'flex';
          actionsDiv.style.gap = '4px';

          if (!att.removedAt && window.EIF_WORKS.can(S, actor, 'execution', 'edit')) {
            var delBtn = document.createElement('button');
            delBtn.className = 'wc-btn wc-btn-secondary wc-btn-sm';
            delBtn.innerHTML = '🗑️';
            delBtn.title = t('deleteFile');
            delBtn.onclick = function (e) {
              e.stopPropagation();
              var reason = prompt(t('deleteReasonPrompt'), 'فحص ميداني غير مطابق');
              if (reason === null) return;
              var res = window.EIF_WORKS.detach(S, actor, req.id, att.hash, reason);
              if (!res.ok) {
                handleError(res);
              } else {
                showToast(t('operationSuccess'));
                renderWorkCenterScreen(area, S, actor, isForemanMode);
              }
            };
            actionsDiv.appendChild(delBtn);

            var repBtn = document.createElement('button');
            repBtn.className = 'wc-btn wc-btn-secondary wc-btn-sm';
            repBtn.innerHTML = '🔄';
            repBtn.title = t('replaceFile');
            repBtn.onclick = function (e) {
              e.stopPropagation();
              var repInput = document.createElement('input');
              repInput.type = 'file';
              repInput.onchange = function () {
                if (this.files && this.files[0]) {
                  window.EIF_WORKS.replace(S, actor, req.id, att.hash, this.files[0]).then(function (res) {
                    if (!res.ok) {
                      handleError(res);
                    } else {
                      showToast(t('operationSuccess'));
                      renderWorkCenterScreen(area, S, actor, isForemanMode);
                    }
                  });
                }
              };
              repInput.click();
            };
            actionsDiv.appendChild(repBtn);
          }

          row.appendChild(actionsDiv);
          attList.appendChild(row);
        });

        reqEl.appendChild(attList);
        reqsGrid.appendChild(reqEl);
      });

      reqCard.appendChild(reqsGrid);
      area.appendChild(reqCard);

      var toggleHistBtn = reqCard.querySelector('#btnToggleHistory');
      if (toggleHistBtn) {
        toggleHistBtn.onclick = function () {
          state.showDeletedHistory = !state.showDeletedHistory;
          renderWorkCenterScreen(area, S, actor, isForemanMode);
        };
      }

      // Event Timeline for Selected WO
      var evCard = document.createElement('div');
      evCard.className = 'wc-card';
      evCard.innerHTML = '<div class="wc-card-header"><h3>🕒 ' + escapeHtml(t('timelineTitle')) + '</h3></div>';

      var events = window.EIF_WORKS.eventsFor(S, { woId: state.selectedWoId });
      var tl = document.createElement('div');
      tl.className = 'wc-timeline';

      events.slice(0, 10).forEach(function (ev) {
        var item = document.createElement('div');
        item.className = 'wc-timeline-item';
        item.innerHTML =
          '<div class="wc-timeline-time">' + new Date(ev.at).toLocaleString('ar-SA') + ' — <b>' + escapeHtml(ev.actorName || ev.actorId) + '</b></div>' +
          '<div class="wc-timeline-desc">' + escapeHtml(ev.action.toUpperCase()) + ' on ' + escapeHtml(ev.entity) + ' (' + escapeHtml(ev.entityId) + ')</div>';
        tl.appendChild(item);
      });

      evCard.appendChild(tl);
      area.appendChild(evCard);
    }
  }

  // --- SCREEN C: Org Admin (Departments & Job Titles) ---
  function renderOrgAdminScreen(area, S, actor) {
    var lang = getLang();
    var card = document.createElement('div');
    card.className = 'wc-card';

    var header = document.createElement('div');
    header.className = 'wc-card-header';
    header.innerHTML =
      '<h3>🏢 ' + escapeHtml(t('deptsTitle')) + '</h3>' +
      '<button class="wc-btn wc-btn-primary" id="btnAddDept">' + escapeHtml(t('addDept')) + '</button>';
    card.appendChild(header);

    // Departments Table
    var dWrap = document.createElement('div');
    dWrap.className = 'wc-table-wrap';
    var dTable = document.createElement('table');
    dTable.className = 'wc-table';
    dTable.innerHTML = '<thead><tr><th>اسم القسم (عربي)</th><th>Department (EN)</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody></tbody>';
    var dtbody = dTable.querySelector('tbody');

    (S.departments || []).forEach(function (dept) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><b>' + escapeHtml(dept.name) + '</b></td>' +
        '<td>' + escapeHtml(dept.nameEn || '—') + '</td>' +
        '<td>' + (dept.active ? '<span class="wc-badge wc-badge-approved">' + t('active') + '</span>' : '<span class="wc-badge wc-badge-rejected">' + t('inactive') + '</span>') + '</td>' +
        '<td><button class="wc-btn wc-btn-secondary wc-btn-sm" id="btnDeactDept_' + dept.id + '">' + t('deactivate') + '</button></td>';

      tr.querySelector('#btnDeactDept_' + dept.id).onclick = function () {
        var res = window.EIF_WORKS.deactivateDepartment(S, actor, dept.id);
        if (!res.ok) {
          handleError(res);
        } else {
          showToast(t('operationSuccess'));
          renderOrgAdminScreen(area, S, actor);
        }
      };
      dtbody.appendChild(tr);
    });
    dWrap.appendChild(dTable);
    card.appendChild(dWrap);

    // Job Titles Section
    var tHeader = document.createElement('div');
    tHeader.className = 'wc-card-header';
    tHeader.style.marginTop = '20px';
    tHeader.innerHTML =
      '<h3>👔 ' + escapeHtml(t('titlesTitle')) + '</h3>' +
      '<button class="wc-btn wc-btn-primary" id="btnAddTitle">' + escapeHtml(t('addTitle')) + '</button>';
    card.appendChild(tHeader);

    var tWrap = document.createElement('div');
    tWrap.className = 'wc-table-wrap';
    var tTable = document.createElement('table');
    tTable.className = 'wc-table';
    tTable.innerHTML = '<thead><tr><th>المسمى الوظيفي</th><th>القسم التابع له</th><th>نطاق الصلاحية Scope</th><th>صلاحية مركز الأعمال</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody></tbody>';
    var ttbody = tTable.querySelector('tbody');

    (S.jobTitles || []).forEach(function (title) {
      var deptName = window.EIF_WORKS.resolveDepartment(S, title.departmentId, lang);
      var worksLvl = (title.moduleAccess && title.moduleAccess.works) || 'none';

      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><b>' + escapeHtml(title.name) + '</b></td>' +
        '<td>' + escapeHtml(deptName) + '</td>' +
        '<td><span class="wc-badge wc-badge-in_progress">' + escapeHtml(title.scope) + '</span></td>' +
        '<td><span class="wc-badge wc-badge-planned">' + escapeHtml(worksLvl) + '</span></td>' +
        '<td>' + (title.active ? '<span class="wc-badge wc-badge-approved">' + t('active') + '</span>' : '<span class="wc-badge wc-badge-rejected">' + t('inactive') + '</span>') + '</td>' +
        '<td><button class="wc-btn wc-btn-secondary wc-btn-sm" id="btnDeactTitle_' + title.id + '">' + t('deactivate') + '</button></td>';

      tr.querySelector('#btnDeactTitle_' + title.id).onclick = function () {
        var res = window.EIF_WORKS.deactivateJobTitle(S, actor, title.id);
        if (!res.ok) {
          handleError(res);
        } else {
          showToast(t('operationSuccess'));
          renderOrgAdminScreen(area, S, actor);
        }
      };
      ttbody.appendChild(tr);
    });
    tWrap.appendChild(tTable);
    card.appendChild(tWrap);

    area.innerHTML = '';
    area.appendChild(card);

    // Add Dept Modal Trigger
    card.querySelector('#btnAddDept').onclick = function () {
      var name = prompt('أدخل اسم القسم الجديد (عربي):');
      if (!name) return;
      var nameEn = prompt('Department name in English (optional):') || '';
      var res = window.EIF_WORKS.saveDepartment(S, actor, { name: name, nameEn: nameEn, companyId: 'comp_1' });
      if (!res.ok) handleError(res);
      else {
        showToast(t('operationSuccess'));
        renderOrgAdminScreen(area, S, actor);
      }
    };

    // Add Title Modal Trigger
    card.querySelector('#btnAddTitle').onclick = function () {
      var name = prompt('أدخل المسمى الوظيفي الجديد:');
      if (!name) return;
      var deptId = (S.departments && S.departments[0]) ? S.departments[0].id : '';
      var res = window.EIF_WORKS.saveJobTitle(S, actor, {
        name: name,
        nameEn: name,
        departmentId: deptId,
        scope: 'assigned',
        moduleAccess: { works: 'edit', permits: 'view' },
        companyId: 'comp_1'
      });
      if (!res.ok) handleError(res);
      else {
        showToast(t('operationSuccess'));
        renderOrgAdminScreen(area, S, actor);
      }
    };
  }

  // --- SCREEN D: Permissions & Ceiling Enforcement ---
  function renderPermissionsScreen(area, S, actor) {
    var card = document.createElement('div');
    card.className = 'wc-card';

    var header = document.createElement('div');
    header.className = 'wc-card-header';
    header.innerHTML = '<h3>🔐 ' + escapeHtml(t('permissions')) + '</h3>';
    card.appendChild(header);

    var grid = document.createElement('div');
    grid.className = 'wc-perm-grid';

    (S.orgPeople || []).forEach(function (person) {
      var pCard = document.createElement('div');
      pCard.className = 'wc-perm-card';

      var titleName = window.EIF_WORKS.resolveTitle(S, person.jobTitleId, getLang());
      var deptName = window.EIF_WORKS.resolveDepartment(S, person.departmentId, getLang());

      pCard.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<b>' + escapeHtml(person.name) + '</b>' +
        (person.isSuperAdmin ? '<span class="wc-badge wc-badge-approved">Super Admin 👑</span>' : '') +
        '</div>' +
        '<div style="font-size:12px;color:var(--wc-muted)">' + escapeHtml(titleName) + ' • ' + escapeHtml(deptName) + '</div>' +
        '<div class="wc-perm-row">' +
        '<span>صلاحية مركز الأعمال:</span>' +
        '<b>' + escapeHtml((person.moduleOverrides && person.moduleOverrides.works) || 'حسب المسمى') + '</b>' +
        '</div>';

      // Super Admin toggle (only visible to Super Admins)
      if (actor && actor.isSuperAdmin) {
        var adminToggleRow = document.createElement('div');
        adminToggleRow.className = 'wc-perm-row';
        adminToggleRow.innerHTML =
          '<span>تعيين كـ Super Admin:</span>' +
          '<input type="checkbox" id="chkAdmin_' + person.id + '"' + (person.isSuperAdmin ? ' checked' : '') + '>';

        adminToggleRow.querySelector('input').onchange = function () {
          var res = window.EIF_WORKS.setSuperAdmin(S, actor, person.id, this.checked);
          if (!res.ok) {
            handleError(res);
            this.checked = !this.checked; // revert
          } else {
            showToast(t('operationSuccess'));
            renderPermissionsScreen(area, S, actor);
          }
        };
        pCard.appendChild(adminToggleRow);
      }

      grid.appendChild(pCard);
    });

    card.appendChild(grid);
    area.innerHTML = '';
    area.appendChild(card);
  }

  // --- SCREEN E: Migration Review Report ---
  function renderMigrationScreen(area, S, actor) {
    var card = document.createElement('div');
    card.className = 'wc-card';

    var report = window.EIF_WORKS.migrationReport(S);

    var header = document.createElement('div');
    header.className = 'wc-card-header';
    header.innerHTML = '<h3>📊 ' + escapeHtml(t('migrationReport')) + '</h3>';
    card.appendChild(header);

    var kpiGrid = document.createElement('div');
    kpiGrid.style.display = 'grid';
    kpiGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(220px, 1fr))';
    kpiGrid.style.gap = '14px';

    kpiGrid.innerHTML =
      '<div class="wc-card" style="margin:0;background:#f8fafc">' +
      '<small>' + escapeHtml(t('unassignedLinesCount')) + '</small>' +
      '<b style="font-size:24px;color:var(--wc-navy)">' + report.unassignedLines.length + '</b>' +
      '</div>' +
      '<div class="wc-card" style="margin:0;background:#fff1f2">' +
      '<small>' + escapeHtml(t('missingBinariesCount')) + '</small>' +
      '<b style="font-size:24px;color:var(--wc-danger)">' + report.missingBinaries.length + '</b>' +
      '</div>' +
      '<div class="wc-card" style="margin:0;background:#fef3c7">' +
      '<small>' + escapeHtml(t('flaggedPersonsCount')) + '</small>' +
      '<b style="font-size:24px;color:var(--wc-warning)">' + report.flaggedPersons.length + '</b>' +
      '</div>';

    card.appendChild(kpiGrid);

    // List of Missing Binaries
    if (report.missingBinaries.length > 0) {
      var sec = document.createElement('div');
      sec.innerHTML = '<h4 style="margin:16px 0 8px;color:var(--wc-danger)">قائمة المرفقات التي تتطلب إعادة رفع ميداني:</h4>';
      var ul = document.createElement('ul');
      report.missingBinaries.forEach(function (mb) {
        var li = document.createElement('li');
        li.style.fontSize = '13px';
        li.style.marginBottom = '6px';
        li.innerHTML = '<b>' + escapeHtml(mb.name) + '</b> — في المتطلب: ' + escapeHtml(mb.label) + ' (أمر: ' + escapeHtml(mb.woId) + ')';
        ul.appendChild(li);
      });
      sec.appendChild(ul);
      card.appendChild(sec);
    }

    area.innerHTML = '';
    area.appendChild(card);
  }

  // --- Add Line Modal ---
  function openAddLineModal(S, actor, woId, onDone) {
    var modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'wc-modal-backdrop open';

    var defs = window.EIF_WORKS.defs(S);
    var defOptions = defs.map(function (d) {
      return '<option value="' + escapeHtml(d.id) + '">' + escapeHtml(d.name) + ' (' + escapeHtml(d.unit) + ')</option>';
    }).join('');

    modalBackdrop.innerHTML =
      '<div class="wc-modal-content">' +
      '<h3 style="margin:0;color:var(--wc-navy)">➕ إضافة بند عمل جديد إلى أمر العمل</h3>' +
      '<div><label style="font-weight:700;font-size:13px;display:block;margin-bottom:4px">اختر نوع العمل المعتمد من الكتالوج:</label>' +
      '<select class="wc-select" id="modalDefSelect">' + defOptions + '</select></div>' +
      '<div><label style="font-weight:700;font-size:13px;display:block;margin-bottom:4px">الكمية المستهدفة:</label>' +
      '<input type="number" class="wc-select" id="modalQtyInput" value="100" min="1"></div>' +
      '<div><label style="font-weight:700;font-size:13px;display:block;margin-bottom:4px">تاريخ الإنجاز المطلوب:</label>' +
      '<input type="date" class="wc-select" id="modalDueInput" value="' + new Date().toISOString().split('T')[0] + '"></div>' +
      '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:12px">' +
      '<button class="wc-btn wc-btn-secondary" id="btnModalCancel">إلغاء</button>' +
      '<button class="wc-btn wc-btn-primary" id="btnModalSave">حفظ البند وتوليد المتطلبات</button>' +
      '</div>' +
      '</div>';

    document.body.appendChild(modalBackdrop);

    modalBackdrop.querySelector('#btnModalCancel').onclick = function () {
      modalBackdrop.remove();
    };

    modalBackdrop.querySelector('#btnModalSave').onclick = function () {
      var defId = modalBackdrop.querySelector('#modalDefSelect').value;
      var qty = modalBackdrop.querySelector('#modalQtyInput').value;
      var due = modalBackdrop.querySelector('#modalDueInput').value;

      var res = window.EIF_WORKS.createLine(S, actor, {
        woId: woId,
        defId: defId,
        qty: qty,
        due: due
      });

      if (!res.ok) {
        handleError(res);
      } else {
        showToast(t('operationSuccess'));
        modalBackdrop.remove();
        if (onDone) onDone();
      }
    };
  }

  // --- Public Entrypoint API ---
  window.EIF_WORKS_UI = {
    mount: function (containerEl, S, actor, opts) {
      opts = opts || {};
      if (opts.woId) state.selectedWoId = opts.woId;
      state.activeTab = 'workCenter';
      render(containerEl, S, actor);
    },
    mountMyWork: function (containerEl, S, actor, opts) {
      opts = opts || {};
      if (opts.woId) state.selectedWoId = opts.woId;
      state.activeTab = 'foreman';
      render(containerEl, S, actor);
    },
    mountOrgAdmin: function (containerEl, S, actor) {
      state.activeTab = 'orgAdmin';
      render(containerEl, S, actor);
    },
    setLanguage: function (lang, containerEl, S, actor) {
      window.uiLanguage = lang;
      if (containerEl && S) render(containerEl, S, actor);
    }
  };

})(window);
