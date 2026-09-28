# SOP & Architecture Blueprint — Work Center Unification (V16.50)

**System:** Engineer Islam Fouda Work Management System (Local-First Offline PWA)
**Baseline:** V16.49 (`03af61d`) — 225/225 unit, 17/17 runtime, audit proofs green
**Target:** V16.50 — implements the client's *IMPORTANT SIMPLIFICATION & STRUCTURAL RULES*
**Authority:** Claude Code (Staff Architect / sole testing & approval authority)
**Date:** 2026-09-28
**Status:** APPROVED FOR EXECUTION. No phase merges until Claude issues `[APPROVED]` at its gate.

---

## 0. Ground Truth: Audit of the V16.49 Baseline

This blueprint is based on the current code, not on assumptions. Line references are to `app.js` at `03af61d`.

### 0.1 Scattered work systems (to be unified)

| Legacy collection | Where | What it really holds | Problem |
|---|---|---|---|
| `S.workTypes` | `app.js:173` | Free-text work descriptions auto-added on WO create | Catalog built from typed text; duplicates and typos |
| `S.siteRequirementDefs` | `app.js:449-462` | `{id,name,unit}` requirement catalog | Separate catalog from `workTypes` |
| `wo.siteReq` | `app.js:173,462` | `{[defId]:{selected,name,unit,qty}}` embedded in WO | Copies `name` (goes stale on rename); cannot be assigned |
| `S.exec` | db store `exec` | Execution rows keyed by `wo` | Parallel to evidence; no link to requirement |
| `S.executionEvidence` | `app.js:343,438,924` | `{wo,stage,photos[],videos[]}` | **DEFECT: photos and videos hold metadata only (no `hash`, no blob). The binaries are lost.** |
| `S.workEvidence1628` | `app.js:1656-1665` | Notes and delay evidence with hashed files | Third evidence system; correct blob storage |
| `S.tasks` (with `wo`) | `app.js:178` | `{text,user,wo,due,done}` | `user` is free text, not a person ID |

### 0.2 Titles and permissions

| Finding | Where | Problem |
|---|---|---|
| `S.jobTitles1624` scoped per company, `teamId` optional | `app.js:1523-1529` | No Department entity. Title links to a *team*, not a department |
| `allowedRoles()` merges custom titles with a **hardcoded Arabic defaults list** | `app.js:1559` | Violates the "no hardcoded text" rule |
| `person.role` is **free text**; scope is inferred by regex (`/super\s*admin\|سوبر/`, `/مدير المشروع/`) | `app.js:1128,1167,1197` | Typing a name can escalate privilege. Renaming a title breaks the inference |
| `SCOPE_RANK` includes `department_manage` | `app.js:1275` | This scope has no department to act on |
| Two `hasPerm` implementations | `app.js:1137,1896` | Logic drift risk |
| `isRoot(a){return !a\|\|...}` | `app.js:1278` | **No session is treated as root** (owner-device mode). This must become an explicit, documented decision (see R-3) |
| Module access lives in `moduleAccess1618`/`moduleAccess1620` on persons and teams | 65 refs | Versioned field names, no single resolver |

### 0.3 Persistence facts we build on

- `assets/js/db.js`: IndexedDB `EngineerIslamFoudaDB` v2. Content-addressed `blobs` store keyed by SHA-256 `hash`. `attachments` store keyed by `hash` with `links[]`. Catch-all `unmapped_state`. Atomic single-transaction `flush()`. Deletion non-resurrection invariant.
- `S.attachments[]` already de-duplicates by hash and supports multi-link (`links:[{wo,category}]`) — **reuse, don't reinvent.**
- `S.accessAudit1617` is an append-only audit log pattern (`app.js:1280`) — **reuse the pattern.**
- `app.js` is 695 KB and uses monkey-patch chaining (`__refreshV162=refresh;refresh=function(){...}`). **New domain logic must NOT be appended there** (see §7.1).

---

## 1. Rule 1: `S.works`, the single Work Center schema

### 1.1 Design principles
1. **One root, normalized.** Every work concept is stored under `S.works`. Nothing is copied by name; everything references by ID.
2. **Catalog vs. instance.** A *definition* (what a type of work is) is separate from a *line* (that work inside a specific WO).
3. **Append-only events.** State changes are recorded in `events`. The mutable fields are a projection for fast reads.
4. **Legacy-safe.** Deterministic migration IDs (`mig:<source>:<legacyId>`) make migration idempotent (§6).

### 1.2 Schema

```js
S.works = {
  schema: 1,                       // bump only with a registered migrator
  migratedFrom: { /* source -> {count, at, checksum} */ },
  tombstones: [],                  // IDs deleted by users; migration must never recreate them

  defs: [ /* WorkDef: the catalog */ ],
  lines: [ /* WorkLine: a def inside a WO = the WO's work scope */ ],
  reqs: [ /* Requirement: evidence or deliverable required for a line */ ],
  events: [ /* WorkEvent: append-only audit trail */ ]
};
```

**WorkDef**: replaces `workTypes` and `siteRequirementDefs`
```js
{ id, companyId, code, name, nameI18n: {en, ur, hi, bn},
  unit, category,                          // 'civil' | 'electrical' | 'reinstatement' | ...
  reqTemplate: [ { kind, label, minCount, stage } ],   // default requirements spawned per line
  active: true, createdAt, createdBy }
```

**WorkLine**: replaces `wo.siteReq`, `S.exec`, and WO-linked `S.tasks`
```js
{ id, companyId, woId, defId,
  qty, unit, status,                       // 'planned'|'in_progress'|'submitted'|'approved'|'rejected'
  assignees: [ { personId, role: 'foreman'|'engineer'|'crew' } ],
  due, progressPct, notes,
  createdAt, createdBy, updatedAt, updatedBy, legacyRef }
```

**Requirement**: replaces `executionEvidence`, `workEvidence1628`, and per-stage photo/video buckets
```js
{ id, lineId, woId, kind,                  // 'photo'|'video'|'document'|'note'|'measurement'
  label, stage,                            // 'before'|'during'|'after'|custom
  minCount, minVideoSec,                   // preserves the existing ≥10s video rule
  attachments: [ AttachmentRef ],
  status,                                  // 'open'|'satisfied'|'rejected'
  legacyRef }
```

**AttachmentRef**: the bytes live in the IndexedDB `blobs` store. The ref only points to them.
```js
{ hash, name, type, size, durationSec,
  addedBy: personId, addedAt,
  removedBy: null, removedAt: null, removeReason: null,   // soft delete only
  replacedBy: null,                                        // hash of the successor version
  missingBinary: false }                                   // true for legacy metadata-only records
```

**WorkEvent**: append-only
```js
{ id, at, actorId, actorName, entity: 'def'|'line'|'req'|'attachment',
  entityId, woId, action,                  // 'create'|'update'|'assign'|'status'|'attach'|'detach'|'replace'|'migrate'
  before, after }                           // minimal diff, never full blobs
```

### 1.3 Invariants (all enforced in tests)
- I-1: `line.defId` must exist in `defs`. `req.lineId` must exist in `lines`. There are no orphans.
- I-2: The display name always comes from `defs`/`jobTitles` at render time. It is never copied onto instances. (`legacyRef` may hold a historical snapshot for audit only.)
- I-3: `events` are never mutated or deleted by application code.
- I-4: Any ID in `tombstones` is never recreated by migration or import.
- I-5: `S.workorders` stays the WO header store. `S.works` never duplicates WO header fields.

### 1.4 Persistence mapping
`db.js` becomes `DB_VERSION = 3`. `onupgradeneeded` is **strictly additive**: it creates the new stores and never deletes or clears existing ones.

| Store | keyPath | Indexes |
|---|---|---|
| `worksDefs` | `id` | `companyId`, `code` |
| `worksLines` | `id` | `woId`, `defId`, `status`, `assigneeIds` (multiEntry) |
| `worksReqs` | `id` | `lineId`, `woId`, `status` |
| `worksEvents` | `id` | `woId`, `entityId`, `at` |

`schema`, `migratedFrom` and `tombstones` are stored in `settings` under the key `works.meta`. For fast index lookup, lines persist a derived `assigneeIds: string[]`.

---

## 2. Rule 2: Multiple photos, videos, and files per requirement (IndexedDB + audit trail)

### 2.1 Storage flow (single code path: `Works.attach(reqId, files, actor)`)
1. Permission check: `can(actor, 'execution', 'edit', line)` (§5). If it fails, reject before reading any bytes.
2. For each file: compute a SHA-256 of the `arrayBuffer()`, then `EIF_DB.putBlob(hash, file)`. Identical content is stored once.
3. Upsert into `S.attachments` (existing registry) and push the link `{wo, lineId, reqId, category:'work-evidence'}`.
4. Push an `AttachmentRef` into `req.attachments`. There is **no cap on the count**. `minCount` only affects `status`.
5. Validate videos against `minVideoSec` (existing ≥10s rule, `app.js:343`).
6. Append a `WorkEvent{action:'attach'}` per file.
7. Recompute `req.status` and persist with one `saveState` call. The atomic flush in `db.js` guarantees that metadata and events commit together.

### 2.2 Removal and replacement
- `detach` is **soft**. It sets `removedAt/removedBy/removeReason` and never deletes the blob. The file stays viewable in the audit view.
- `replace` sets `replacedBy` on the old ref, adds the new ref, and emits one `replace` event that references both hashes.
- Blob garbage collection is out of scope for V16.50. Blobs are only purged through an explicit Super Admin action with no remaining live refs, and that action is itself audited.

### 2.3 Accepted types
Photos `image/*`, video `video/*`, documents `application/pdf`, Office, `text/*`. Size limits come from the existing `S.attachmentSettings`, not from constants.

### 2.4 Fixing the legacy defect
Legacy `executionEvidence` entries have no hash. Migration creates refs with `missingBinary:true`. The UI shows them as "⚠ الملف الأصلي غير محفوظ — أعد الرفع" ("original file not saved, re-upload"). Records are **never silently dropped**, and the gap is reported in the migration report.

---

## 3. Rule 3: Selective work scope inside Work Orders (Foreman)

- The **WO's scope is its set of `WorkLine`s**. The WO creator or manager selects which catalog defs apply (replacing the `siteReq` checkboxes). Each line is assigned individually.
- A Foreman is assigned **per line** through `line.assignees[{personId, role:'foreman'}]`, not per WO.
- **Visibility rule for scope `assigned`:** the person sees a WO only if at least one line lists them. Within that WO they see **only their lines** and those lines' requirements. The WO header is read-only.
- **Enforcement happens in the data layer, not only in the UI.** `Works.linesFor(actor, woId)` and `Works.attach()` apply the scope filter. Hidden buttons are not a security boundary.
- Reassignment emits an `assign` event with the before/after assignee sets.
- Legacy `wo.assign` / `wo.exec` / `task.user` text is resolved to a `personId` by exact normalized-name match within the company. If there is no match, the original text is kept in `legacyRef.assignText` and the line is flagged *unassigned* for manager review. Nothing is guessed.

---

## 4. Rule 4: Central Job Titles ↔ Departments ↔ Persons (no hardcoded text)

### 4.1 Schema
```js
S.departments = [ { id, companyId, name, nameI18n, parentId: null, headPersonId, active } ];
S.jobTitles   = [ { id, companyId, departmentId /* required */, name, nameI18n,
                    scope,                     // SCOPE_RANK key: assigned..company_manage (never super_admin)
                    moduleAccess: { [module]: 'none'|'view'|'edit'|'approve'|'admin' },
                    rank, active } ];
person.jobTitleId       // replaces free-text person.role for all logic
person.departmentId     // defaults to the title's department; an explicit override is allowed
```

### 4.2 Rules
- **Every** title belongs to a department. **Every** active person has a `jobTitleId`.
- Display names are always resolved through the ID. Renaming a title changes every screen and report with **zero writes to person records**.
- A title or department with linked active persons **cannot be deleted**. It can only be deactivated.
- **Remove the hardcoded defaults** in `allowedRoles()` (`app.js:1559`). They become *seed data*: they are created once per company as ordinary `jobTitles` rows on migration or first run, and are editable afterwards.
- **Remove all regex role inference** (`app.js:1128,1167,1197`). No permission path may read `person.role` text. A static test enforces this (T-08).
- `S.orgTeams` remain as operational crews. A team may reference a `departmentId`, but titles no longer hang off teams.

---

## 5. Rule 5: Hierarchical permissions with Super Admin global override

### 5.1 Single resolver (replaces both `hasPerm` and `hasPerm1617`)
```text
can(actor, module, action, record?) :
  1. actor.isSuperAdmin === true            → ALLOW (all companies, modules, records)   ← global override
  2. actor inactive / no jobTitle           → DENY
  3. level = max( title.moduleAccess[module],
                  person.moduleOverrides[module],
                  activeDelegations(actor)[module] )     // delegations honor expiresAt
  4. LEVEL_RANK[level] < ACTION_MIN[action]  → DENY
  5. record && !inScope(actor, record)       → DENY
  6. → ALLOW
LEVEL_RANK : none 0 < view 1 < edit 2 < approve 3 < admin 4
ACTION_MIN : read 1, create/edit/attach 2, approve/reject 3, grant/configure 4
inScope by effective scope (title.scope unless person override):
  assigned          → actor is in any line.assignees of the record's WO (line-level for line/req records)
  team_view/manage  → record's WO assigned to actor's team
  department_manage → record's WO owned by actor's department (or descendant)
  company_manage    → record.companyId === actor.companyId
```

### 5.2 Hierarchy (no escalation)
- A grantor can only grant a module level **≤ their own** level for that module, and a scope **strictly below** their own `SCOPE_RANK`. This generalizes the existing "لا تتجاوز صلاحياتك" ("does not exceed your permissions") rule at `app.js:1308`.
- A manager can only edit persons inside their own scope, for example a department manager and their department.
- Delegations (`S.permissionDelegations`) follow the same ceiling and carry a mandatory `expiresAt`.

### 5.3 Super Admin
- `person.isSuperAdmin: boolean` is the **only** source. It is set only by another Super Admin, and every change is audited.
- It is not a job title and is not tied to any company, which gives cross-company visibility.
- **Last-admin guard:** the last active Super Admin cannot be demoted, deactivated, or deleted.
- Every Super Admin action that would have been denied without the override is tagged `override:true` in `accessAudit`.

### 5.4 Audit
All grants, revocations, delegations, and Super Admin toggles are appended to `S.accessAudit1617` using the existing `audit()` pattern (`app.js:1280`).

---

## 6. Rule 6: Backward compatibility and silent migration

### 6.1 Contract
- **Silent:** migration runs automatically at boot after `EIF_DB` loads, with no prompts. A single toast appears only if something needs human review (unassigned lines, missing binaries).
- **Non-destructive:** legacy arrays (`workTypes`, `siteRequirementDefs`, `exec`, `executionEvidence`, `workEvidence1628`, `tasks`, `jobTitles1624`, `wo.siteReq`) are **kept unchanged** for V16.50 and V16.51. New code never writes to them. Removal requires a separate ADR no earlier than V16.52.
- **Snapshot first:** before the first migration, write a full snapshot to the existing `safeSnapshots1646` store.
- **Idempotent:** every migrated entity uses the deterministic ID `mig:<source>:<legacyId>` (or `mig:siteReq:<woId>:<defId>`). Re-running migration upserts and never duplicates.
- **Non-resurrection:** migration skips any ID in `S.works.tombstones`. This extends the V16.49 deletion invariant.
- **Guarded:** `S.works.migratedFrom[source] = {count, at, checksum}`. If a source's checksum is unchanged, that source is skipped.
- **Crash-safe:** all new records and `migratedFrom` are committed in one `saveState` flush. A partial run leaves no markers and retries at the next boot.

### 6.2 Migration map

| Source | → Target |
|---|---|
| `workTypes[]` + `siteRequirementDefs[]` | `works.defs` (dedupe by normalized name within company) |
| `wo.siteReq{defId:{qty}}` | `works.lines` (one per selected def) |
| `exec[]` | `works.lines` status/progress (merge onto matching line; else new line with `def = 'تنفيذ عام'` (general execution) seed) |
| `tasks[]` with `wo` | `works.lines` (def from task text) with the assignee resolved per §3 |
| `executionEvidence[]` | `works.reqs` per stage, refs `missingBinary:true` when no hash |
| `workEvidence1628[]` | `works.reqs` kind `note`/`document`, hashed refs preserved |
| `jobTitles1624[]` | `S.jobTitles` + department auto-created per team (`قسم <team name>`, i.e. "<team name> Department"), or `عام` (General) |
| `person.role` text | `person.jobTitleId` by exact title match; else create title in `عام` (General) dept, flagged for review |
| `accessScope==='super_admin'` | `isSuperAdmin:true` (the one-time inference is logged; the regex is never used again) |
| `moduleAccess1618/1620` | `person.moduleOverrides` / `title.moduleAccess` |

### 6.3 Import and backup paths
`backup.js` JSON and SQLite export include `S.works`, `S.departments` and `S.jobTitles`. **Importing a V16.49 backup runs the same migrator**, so old backups remain restorable forever.

### 6.4 Legacy screens
Old routes (execution evidence V16/V163, team room evidence, work evidence 1628) redirect to the Work Center, pre-filtered to the same WO. No legacy screen writes remain.

---

## 7. Rule 7: Phased execution across the fleet

### 7.1 Code placement (binding)
- New domain logic goes in **`assets/js/works.js`**: pure functions (`migrate`, `can`, `attach`, `detach`, `linesFor`, `resolveTitle`) with no DOM access, exposed as `window.EIF_WORKS`. It is loadable in Node `vm` by `tests/harness.js`.
- `app.js` receives **only** thin UI wiring. Adding a new `__refreshVxxx` monkey-patch layer is prohibited.
- `sw.js` precache list and `index.html` script order must include `works.js` (load after `db.js`, before `app.js`).

### 7.2 Phases and gates

| Phase | Owner | Deliverables | Exit gate (Claude) |
|---|---|---|---|
| **P0: Spec & red tests** | **Claude** | This SOP. Legacy fixtures captured from a V16.49 data export into `tests/fixtures/v1649_*.json`. `tests/tier5_work_center.test.js` with T-01…T-11 **failing** | Tests fail for the right reason; fixtures cover every row of §6.2 |
| **P1: Persistence plumbing** | **OpenCode** | `db.js` v3 additive stores (§1.4); `backup.js` JSON and SQLite coverage; `works.js` skeleton + `Works.attach/detach` | T-04, T-05, T-11 green; all 225 + 17 baseline tests green; `onupgradeneeded` diff reviewed |
| **P2: Migration & resolver** | **OpenCode** | `Works.migrate()`, `can()` resolver, departments/titles migration, removal of regex inference and hardcoded defaults | T-01, T-02, T-03, T-06, T-08, T-09, T-10 green; static grep clean |
| **P3: UI** | **Antigravity** | Work Center screen (WO → lines → requirements gallery with multi-upload, video length check, soft-delete history); Foreman "My Work" view; Departments & Job Titles admin; permission editor with ceilings. 5-language labels, RTL | T-07 green; manual smoke on tablet viewport; no direct `S.*` mutation from UI (must call `EIF_WORKS`) |
| **P4: Audit & approval** | **Claude** | Full suite, diff review against §1.3 invariants, security review of `can()` paths, migration dry run on real client export | Formal `[APPROVED]: WMS V16.50 Work Center Unification` |
| **P5: Release** | Claude → any | `VERSION.txt` → V16.50, `README_V16_50.md`, commit | Tagged, pushed on user instruction only |

**Fallback:** Codex CLI can take over any OpenCode task if it stalls. The same gates apply.
**Handoff rule:** each agent receives *this SOP section + the failing tests for its phase* and nothing else, to keep token use low. Agents do **not** run or modify tests. Test authority stays with Claude.

### 7.3 Risk register

| ID | Risk | Mitigation |
|---|---|---|
| R-1 | IDB upgrade v2 → v3 wipes data | Additive-only `onupgradeneeded`; snapshot before upgrade; T-11 |
| R-2 | Name-based person matching assigns wrong foreman | Exact normalized match only; ambiguous or none → unassigned + review flag |
| R-3 | `isRoot(!a)` treats no session as root, which bypasses the new resolver | **Decision required from client:** keep "Owner Device" mode as an explicit `settings.ownerDeviceMode` flag (default ON to preserve behavior), audited as `override:true`; OFF enforces login |
| R-4 | Two `save()` definitions (`app.js:26`, `:1483`) and `persist169` diverge | `works.js` calls `EIF_DB.saveState` directly; P4 audits call sites |
| R-5 | Blob growth from unlimited attachments | Content-hash dedupe; storage-quota readout in settings; GC deferred and admin-only |
| R-6 | Token bloat from agents reading the 695 KB `app.js` | Phase briefs cite line refs; logic isolated in `works.js` |

---

## 8. The 11 mandatory verification test cases

File: `tests/tier5_work_center.test.js`, registered with `tests/harness.js` and run by `node tests/run_all.js`. Each case must pass on **both** the fresh-install path and the migrated-fixture path unless stated otherwise.

| # | Rule | Test | Pass criteria |
|---|---|---|---|
| **T-01** | 1 | **Unified schema on fresh install** | `S.works.schema===1`; `defs/lines/reqs/events` are arrays; creating a WO line via `EIF_WORKS` writes nothing to any legacy array |
| **T-02** | 1, 6 | **Lossless legacy migration** | Using the V16.49 fixture, every legacy record in §6.2 maps to exactly one target (counts match `migratedFrom`); legacy arrays are byte-identical before and after (checksum); I-1 has no orphans |
| **T-03** | 6 | **Idempotency + non-resurrection** | A second `migrate()` changes nothing (deep-equal); after deleting a migrated line (tombstoned) and re-running, the line stays deleted; a crash simulated mid-flush leaves no `migratedFrom` markers and the retry succeeds |
| **T-04** | 2 | **Multiple media per requirement in IndexedDB** | Attach 3 photos + 2 videos (≥10s) + 1 PDF to one requirement → 6 refs; every `getBlob(hash)` returns identical bytes after reload; the same file on two requirements creates 1 blob and 2 refs; a 5s video is rejected |
| **T-05** | 2 | **Attachment audit trail** | attach/detach/replace each emit one event with `actorId`, `at`, `before/after`; detach is soft (ref kept with `removedAt`, blob still retrievable); no code path mutates or deletes `events` |
| **T-06** | 2, 6 | **Legacy metadata-only evidence surfaced** | Legacy `executionEvidence` photo without hash → ref with `missingBinary:true`, counted in the migration report, never dropped |
| **T-07** | 3 | **Foreman selective scope** | WO with 5 lines, foreman assigned to 2 → `linesFor` returns 2; `attach` to an unassigned line is DENIED at the data layer; WO header is readable but not editable; unrelated WO is invisible |
| **T-08** | 4 | **Central job titles, no hardcoded text** | Renaming a title updates display for all linked persons with 0 person writes; deleting a title/department with active persons is blocked; every title has `departmentId`; **static scan**: no permission path in `app.js`/`works.js` matches `/super\s*admin\|سوبر\|مدير المشروع/` or reads `person.role` |
| **T-09** | 5 | **Hierarchical permissions, no escalation** | Dept manager sees only their department's WOs; cannot grant a module level above their own or a scope ≥ their own; expired delegation grants nothing; `assigned` user cannot read another team's WO |
| **T-10** | 5 | **Super Admin global override** | `isSuperAdmin` user passes `can()` for every module × action × company, including a company with no title for them; override actions are audited `override:true`; last Super Admin cannot be demoted/deleted; typing "Super Admin" as free text grants nothing |
| **T-11** | 6 | **Backward-compatible round trip** | V16.49 JSON backup imported into V16.50 → auto-migrated and passes T-02 checks; V16.50 JSON and SQLite export → re-import is deep-equal for `works`, `departments`, `jobTitles`; IDB v2 database upgraded to v3 with all prior stores intact; **baseline 225/225 + 17/17 still green** |

**Approval rule:** `[APPROVED]` requires 11/11 T-cases green, the full baseline green, and a clean §1.3 invariant review. A single red test blocks release. Skipped tests count as failures.

---

## 9. Definition of Done
- [ ] T-01…T-11 green; baseline suites green; output pasted into the approval note
- [ ] No new writes to legacy collections (grep-verified)
- [ ] `works.js` precached in `sw.js`; offline boot verified
- [ ] 5-language labels for all new UI strings
- [ ] R-3 decision recorded from the client
- [ ] `README_V16_50.md` + `VERSION.txt` updated
- [ ] Claude `[APPROVED]` verdict recorded
