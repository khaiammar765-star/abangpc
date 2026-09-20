# Staff Task Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A staff-only page where the owner assigns tasks that pass through a parallel approval chain (doer marks done → named approvers approve in any order → creator accepts), with send-back and reject paths.

**Architecture:** Two additive Supabase tables (`staff_tasks`, `staff_task_approvers`), one new page (`task.html` + `task.js`) following the inventory conventions, and one shared-helper move (`escapeHtml` into `system.js`). Approver names are resolved client-side from a staff map to avoid fragile embedded-join naming. All workflow transitions use guarded updates like the inventory stock code.

**Tech Stack:** Plain ES2017+ JavaScript (no build step), Supabase JS v2 via CDN, Supabase Auth, existing `system.css`.

## Global Constraints

- **Branch:** all work on `feature/staff-task`. Never commit to `main`. Do not push.
- **Database changes are additive only.** Only `CREATE TABLE` / `CREATE POLICY` / `CREATE INDEX` on the two new names. Never `ALTER`/`DROP` any existing table.
- **No TypeScript, no new CSS file.** Reuse `system.css`; inline `style=""` for one-off layout matches the codebase.
- **Auth guard:** `SystemApp.requireManager()` — matches dashboard and inventory.
- **Escape all user text.** Every task title, description, and reason passes through `escapeHtml` before it reaches `innerHTML`.
- **A reason is required** on every Send Back and Reject; refuse the action if blank.
- **Approval is parallel:** a task advances to `awaiting_owner` only when every approver row is `approved`. A task with zero approvers skips straight to `awaiting_owner` on Mark Done.
- **The creator is the final acceptor.** Ownership is `created_by`, never a role.
- **No test framework exists.** Each task ends with manual browser verification via VS Code Live Server on `http://127.0.0.1:5500`, plus `node --check` for syntax.
- **`config.js` points at production.** Test data is real; delete it afterwards.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `system.js` | Modify | Gains `escapeHtml` (moved from inventory.js) and the sidebar link swap |
| `inventory.js` | Modify | Loses `escapeHtml` (moved, not changed) |
| `task.html` | Create | Page shell: toolbar, filter row, task list, create modal, reason modal |
| `task.js` | Create | All task logic: load, render, create, workflow transitions, filters |
| `docs/superpowers/plans/staff-task-rollback.sql` | Create | Undo SQL for the two tables |

---

### Task 1: Create the database tables

**Files:**
- None (SQL run in the Supabase dashboard)
- Create: `docs/superpowers/plans/staff-task-rollback.sql`

**Interfaces:**
- Produces: tables `staff_tasks` and `staff_task_approvers` used by every later task.

- [ ] **Step 1: Write the rollback script first**

Create `docs/superpowers/plans/staff-task-rollback.sql`:

```sql
-- Undo the staff task feature. Destroys all task data. Touches nothing else.
-- Drop approvers first: it references staff_tasks.
drop table if exists public.staff_task_approvers;
drop table if exists public.staff_tasks;
```

```bash
git add docs/superpowers/plans/staff-task-rollback.sql
git commit -m "Add staff task rollback SQL"
```

- [ ] **Step 2: Read the setup SQL before running it**

Confirm by eye it names only `staff_tasks` and `staff_task_approvers`, with no `drop`/`alter`/`truncate`/`delete`.

- [ ] **Step 3: Run the setup SQL**

Supabase Dashboard → SQL Editor → New query → paste → Run.

```sql
create table if not exists public.staff_tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  assigned_to  uuid not null references public.users(id),
  created_by   uuid not null references public.users(id),
  start_date   date,
  end_date     date,
  status       text not null default 'in_progress'
               check (status in ('in_progress','awaiting_approval','awaiting_owner','completed','failed')),
  reason       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);

create table if not exists public.staff_task_approvers (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.staff_tasks(id) on delete cascade,
  approver_id  uuid not null references public.users(id),
  decision     text not null default 'pending'
               check (decision in ('pending','approved','sent_back','rejected')),
  reason       text,
  decided_at   timestamptz
);

create index if not exists staff_tasks_status_idx      on public.staff_tasks (status);
create index if not exists staff_tasks_assigned_idx    on public.staff_tasks (assigned_to);
create index if not exists staff_task_approvers_task_idx on public.staff_task_approvers (task_id);

alter table public.staff_tasks           enable row level security;
alter table public.staff_task_approvers  enable row level security;

create policy "staff_full_access_tasks" on public.staff_tasks
  for all to authenticated using (true) with check (true);
create policy "staff_full_access_task_approvers" on public.staff_task_approvers
  for all to authenticated using (true) with check (true);
```

Expected: `Success. No rows returned`.

- [ ] **Step 4: Verify tables exist, are protected, and the embed FK works**

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename like 'staff_task%';
```

Expected: two rows, both `rowsecurity = true`.

```sql
select id from public.staff_tasks limit 1;
```

Expected: `Success` (zero rows is fine — proves the table is queryable).

- [ ] **Step 5: Verify existing tables are untouched**

```sql
select count(*) from public.tickets;
select count(*) from public.users;
```

Expected: same counts as before. If either errors, stop and report.

---

### Task 2: Move escapeHtml into system.js

**Files:**
- Modify: `system.js` (add function, extend `SystemApp`)
- Modify: `inventory.js:23-32` (remove function)

**Interfaces:**
- Produces: global `escapeHtml(s)`, also `SystemApp.escapeHtml`. `inventory.js` and `task.js` both use the bare global.

`escapeHtml` is a plain top-level function in a classic (non-module) script, so it stays global after moving. `system.js` loads before every page script, so `inventory.js` keeps working unchanged.

- [ ] **Step 1: Add escapeHtml to system.js**

Insert immediately above the `// EXPOSE TO HTML PAGES` comment near `system.js:398` (just before `const SystemApp = {`). This is the exact body from `inventory.js:23-32`:

```javascript
// =============================================
// HTML ESCAPE
// =============================================
function escapeHtml(s) {
    if (!s)
        return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
```

- [ ] **Step 2: Add it to the SystemApp object**

In the `const SystemApp = { ... }` block, add `escapeHtml,` after `closeModal,`:

```javascript
    showToast,
    closeModal,
    escapeHtml,
};
```

- [ ] **Step 3: Delete the original from inventory.js**

Remove the `escapeHtml` function declaration (lines 23-32) from `inventory.js`. Leave every *call* to `escapeHtml(...)` exactly as-is.

- [ ] **Step 4: Verify one definition remains and syntax is valid**

```bash
grep -n "function escapeHtml" system.js inventory.js
node --check system.js
node --check inventory.js
```

Expected: `function escapeHtml` appears only in `system.js`; both `node --check` silent.

- [ ] **Step 5: Regression-test inventory in the browser**

Live Server → `inventory.html`, logged in as manager.

1. Parts and laptops render; zero console errors (F12).
2. Add a part named `Test <b>x</b> & "y"`. Expected: it displays literally as `Test <b>x</b> & "y"`, not bold — confirming escaping still works from its new home.
3. Delete that test part.

- [ ] **Step 6: Commit**

```bash
git add system.js inventory.js
git commit -m "Move escapeHtml into system.js for reuse"
```

---

### Task 3: Swap the sidebar link

**Files:**
- Modify: `system.js:161-163` (inside `renderSidebar`)

**Interfaces:**
- Produces: an `activePage` value of `'task'` that Task 4 passes in.

- [ ] **Step 1: Replace the New Ticket nav item**

In `renderSidebar`, replace the New Ticket anchor (`system.js:161-163`):

```html
      <a href="dashboard.html#create" class="nav-item">
        <span class="nav-item-icon">➕</span> New Ticket
      </a>
```

with:

```html
      <a href="task.html" class="nav-item ${activePage === 'task' ? 'active' : ''}">
        <span class="nav-item-icon">✅</span> Staff Task
      </a>
```

- [ ] **Step 2: Verify**

```bash
node --check system.js
```

Reload `dashboard.html`. Expected: sidebar shows **✅ Staff Task** under Management (New Ticket gone); the dashboard top bar still has its own **➕ New Ticket** button; clicking Staff Task 404s for now (page not built yet).

- [ ] **Step 3: Commit**

```bash
git add system.js
git commit -m "Replace New Ticket sidebar link with Staff Task"
```

---

### Task 4: Page shell, auth, staff list

**Files:**
- Create: `task.html`
- Create: `task.js`

**Interfaces:**
- Produces: `initTask()`, `loadStaff()` (fills `allStaff` array + `staffById` map + the doer/approver selects), `loadTasks()` (stub, filled in Task 5), DOM ids `taskList`, `taskModal`, `reasonModal`, `filterAssignee`, `filterStatus`, `filterSearch`, `filterMine`.

- [ ] **Step 1: Create task.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>AbangPC – Staff Task</title>
  <link rel="icon" type="image/jpeg" href="logo.jpeg" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="system.css" />
</head>
<body>

<div class="system-layout">
  <aside class="sidebar" id="sidebar"></aside>

  <div class="main-content">
    <div class="topbar">
      <div class="topbar-left">
        <button class="btn-menu" id="menuBtn">☰</button>
        <span class="topbar-title">Staff Task</span>
      </div>
      <div class="topbar-right">
        <button class="btn btn-primary btn-sm" id="addTaskBtn">➕ New Task</button>
      </div>
    </div>

    <div class="page-content">

      <!-- FILTERS -->
      <div class="card" style="margin-bottom:20px;">
        <div class="filters-row">
          <div class="input-wrap" style="flex:1;max-width:280px;">
            <span class="input-icon">🔍</span>
            <input type="text" id="filterSearch" placeholder="Search task title..." />
          </div>
          <select id="filterAssignee" class="diag-select" style="max-width:200px;">
            <option value="">All Assignees</option>
          </select>
          <select id="filterStatus" class="diag-select" style="max-width:200px;">
            <option value="">All Statuses</option>
            <option value="in_progress">In Progress</option>
            <option value="awaiting_approval">Awaiting Approval</option>
            <option value="awaiting_owner">Awaiting Owner</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
          <button class="status-tab" id="filterMine" data-on="false">⭐ Needs my action</button>
        </div>
      </div>

      <!-- TASK LIST -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">✅ Tasks</span>
          <span id="taskCount" style="font-size:13px;color:var(--muted);">Loading...</span>
        </div>
        <div id="taskList"></div>
      </div>

    </div>
  </div>
</div>

<!-- ===== CREATE TASK MODAL ===== -->
<div class="modal-overlay hidden" id="taskModal">
  <div class="modal" style="max-width:560px;">
    <div class="modal-header">
      <span class="modal-title">➕ New Task</span>
      <button class="modal-close" id="closeTaskModal">✕</button>
    </div>
    <div class="modal-body">
      <div class="field-group">
        <label>Title *</label>
        <div class="input-wrap"><span class="input-icon">📝</span>
          <input type="text" id="taskTitle" placeholder="e.g. Service the front counter PCs" /></div>
        <span class="field-err hidden" id="taskTitleErr">Title is required</span>
      </div>
      <div class="field-group">
        <label>Description</label>
        <div class="input-wrap"><span class="input-icon">📄</span>
          <textarea id="taskDesc" placeholder="What needs to be done..."></textarea></div>
      </div>
      <div class="field-group">
        <label>Assign to (doer) *</label>
        <select id="taskDoer" class="diag-select"></select>
        <span class="field-err hidden" id="taskDoerErr">Choose a doer</span>
      </div>
      <div class="field-group">
        <label>Approvers (pick any number; the doer is excluded)</label>
        <div id="taskApprovers" style="display:flex;flex-direction:column;gap:6px;max-height:160px;overflow-y:auto;padding:8px;border:1px solid var(--border);border-radius:10px;"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div class="field-group">
          <label>Start date</label>
          <div class="input-wrap"><span class="input-icon">📅</span>
            <input type="date" id="taskStart" /></div>
        </div>
        <div class="field-group">
          <label>End date (due)</label>
          <div class="input-wrap"><span class="input-icon">⏰</span>
            <input type="date" id="taskEnd" /></div>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="cancelTaskBtn">Cancel</button>
      <button class="btn btn-primary" id="saveTaskBtn">💾 Create Task</button>
    </div>
  </div>
</div>

<!-- ===== REASON MODAL (send back / reject) ===== -->
<div class="modal-overlay hidden" id="reasonModal">
  <div class="modal" style="max-width:440px;">
    <div class="modal-header">
      <span class="modal-title" id="reasonModalTitle">Reason</span>
      <button class="modal-close" id="closeReasonModal">✕</button>
    </div>
    <div class="modal-body">
      <div class="field-group">
        <label id="reasonLabel">Reason *</label>
        <div class="input-wrap"><span class="input-icon">✍️</span>
          <textarea id="reasonText" placeholder="Explain what needs fixing..."></textarea></div>
        <span class="field-err hidden" id="reasonErr">A reason is required</span>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="cancelReasonBtn">Cancel</button>
      <button class="btn btn-primary" id="confirmReasonBtn">Confirm</button>
    </div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="config.js"></script>
<script src="system.js"></script>
<script src="task.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create task.js with init, staff load, and stubs**

```javascript
// =============================================
// AbangPC - Staff Task
// =============================================
let currentUser = null;
let allStaff = [];
let staffById = {};
let filterMine = false;
let pendingReason = null; // { action, taskId, approverRowId? } while reason modal is open

const STATUS_LABELS = {
    in_progress: '🔧 In Progress',
    awaiting_approval: '👀 Awaiting Approval',
    awaiting_owner: '⭐ Awaiting Owner',
    completed: '✅ Completed',
    failed: '❌ Failed',
};

async function initTask() {
    try {
        currentUser = await SystemApp.requireManager();
        SystemApp.renderSidebar(currentUser, 'task');
        await loadStaff();
        bindEvents();
        await loadTasks();
    }
    catch (err) {
        console.error(err);
    }
}

async function loadStaff() {
    const { data, error } = await db
        .from('users')
        .select('id, full_name')
        .eq('is_active', true)
        .order('full_name', { ascending: true });
    if (error) {
        SystemApp.showToast('Failed to load staff', 'error');
        return;
    }
    allStaff = data || [];
    staffById = {};
    allStaff.forEach(s => { staffById[s.id] = s.full_name; });

    // Doer select
    const doer = document.getElementById('taskDoer');
    doer.innerHTML = '<option value="">— Choose staff —</option>' +
        allStaff.map(s => `<option value="${s.id}">${SystemApp.escapeHtml(s.full_name)}</option>`).join('');

    // Assignee filter
    const fa = document.getElementById('filterAssignee');
    fa.innerHTML = '<option value="">All Assignees</option>' +
        allStaff.map(s => `<option value="${s.id}">${SystemApp.escapeHtml(s.full_name)}</option>`).join('');
}

function bindEvents() {
    document.getElementById('menuBtn')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('open');
    });
    document.getElementById('addTaskBtn')?.addEventListener('click', openTaskModal);
    document.getElementById('cancelTaskBtn')?.addEventListener('click', () => SystemApp.closeModal('taskModal'));
    document.getElementById('closeTaskModal')?.addEventListener('click', () => SystemApp.closeModal('taskModal'));
    document.getElementById('saveTaskBtn')?.addEventListener('click', saveTask);

    // Rebuild approver checkboxes when the doer changes (doer excluded)
    document.getElementById('taskDoer')?.addEventListener('change', renderApproverChoices);

    // Filters
    document.getElementById('filterSearch')?.addEventListener('input', loadTasks);
    document.getElementById('filterAssignee')?.addEventListener('change', loadTasks);
    document.getElementById('filterStatus')?.addEventListener('change', loadTasks);
    document.getElementById('filterMine')?.addEventListener('click', () => {
        filterMine = !filterMine;
        const btn = document.getElementById('filterMine');
        btn.classList.toggle('active', filterMine);
        loadTasks();
    });

    // Reason modal
    document.getElementById('cancelReasonBtn')?.addEventListener('click', () => SystemApp.closeModal('reasonModal'));
    document.getElementById('closeReasonModal')?.addEventListener('click', () => SystemApp.closeModal('reasonModal'));
    document.getElementById('confirmReasonBtn')?.addEventListener('click', confirmReason);
}

async function loadTasks() {
    // Implemented in Task 5
}

// Placeholder; implemented in Task 5
function openTaskModal() {}
function renderApproverChoices() {}
async function saveTask() {}
// Placeholder; implemented in Task 6
async function confirmReason() {}

document.addEventListener('DOMContentLoaded', initTask);
```

- [ ] **Step 3: Verify page loads and is protected**

```bash
node --check task.js
```

1. Live Server → `task.html`. Expected: sidebar with **✅ Staff Task** active, "Staff Task" title, empty filter row with the assignee dropdown populated by real staff names, empty task list, zero console errors.
2. Sign out, browse directly to `task.html`. Expected: redirect to `login.html`.
3. Log back in; page loads again.

- [ ] **Step 4: Commit**

```bash
git add task.html task.js
git commit -m "Add staff task page shell, auth guard and staff load"
```

---

### Task 5: Create a task, and render the list

**Files:**
- Modify: `task.js`

**Interfaces:**
- Consumes: `allStaff`, `staffById`, `loadTasks` stub from Task 4.
- Produces: `openTaskModal()`, `renderApproverChoices()`, `saveTask()`, `loadTasks()`, `renderTasks(rows)`, `taskCardHTML(task)`, `isOverdue(task)`. Task 6 adds the action handlers referenced by the card buttons.

- [ ] **Step 1: Implement the create modal**

Replace the three create-related placeholders in `task.js`:

```javascript
function openTaskModal() {
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskDesc').value = '';
    document.getElementById('taskDoer').value = '';
    document.getElementById('taskStart').value = '';
    document.getElementById('taskEnd').value = '';
    document.getElementById('taskTitleErr').classList.add('hidden');
    document.getElementById('taskDoerErr').classList.add('hidden');
    renderApproverChoices();
    document.getElementById('taskModal').classList.remove('hidden');
}

// Approver checkboxes, excluding whoever is selected as the doer
function renderApproverChoices() {
    const doerId = document.getElementById('taskDoer').value;
    const box = document.getElementById('taskApprovers');
    const choices = allStaff.filter(s => s.id !== doerId);
    if (!choices.length) {
        box.innerHTML = '<span class="text-muted" style="font-size:13px;">No other staff available.</span>';
        return;
    }
    box.innerHTML = choices.map(s => `
      <label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;">
        <input type="checkbox" class="approver-check" value="${s.id}" />
        ${SystemApp.escapeHtml(s.full_name)}
      </label>`).join('');
}

async function saveTask() {
    const title = document.getElementById('taskTitle').value.trim();
    const doerId = document.getElementById('taskDoer').value;
    const titleErr = document.getElementById('taskTitleErr');
    const doerErr = document.getElementById('taskDoerErr');
    titleErr.classList.toggle('hidden', !!title);
    doerErr.classList.toggle('hidden', !!doerId);
    if (!title || !doerId) return;

    const approverIds = [...document.querySelectorAll('.approver-check:checked')].map(c => c.value);
    const startVal = document.getElementById('taskStart').value;
    const endVal = document.getElementById('taskEnd').value;

    const btn = document.getElementById('saveTaskBtn');
    btn.disabled = true;
    try {
        const { data: task, error } = await db.from('staff_tasks').insert({
            title,
            description: document.getElementById('taskDesc').value.trim() || null,
            assigned_to: doerId,
            created_by: currentUser.id,
            start_date: startVal || null,
            end_date: endVal || null,
        }).select('id').single();
        if (error) throw error;

        if (approverIds.length) {
            const rows = approverIds.map(aid => ({ task_id: task.id, approver_id: aid }));
            const { error: aErr } = await db.from('staff_task_approvers').insert(rows);
            if (aErr) throw aErr;
        }

        SystemApp.closeModal('taskModal');
        await loadTasks();
        SystemApp.showToast('✅ Task created!', 'success');
    }
    catch (err) {
        SystemApp.showToast(err.message || 'Failed to create task', 'error');
    }
    finally {
        btn.disabled = false;
    }
}
```

- [ ] **Step 2: Implement loadTasks with filtering**

Replace the `loadTasks` stub:

```javascript
async function loadTasks() {
    const list = document.getElementById('taskList');
    const countEl = document.getElementById('taskCount');
    list.innerHTML = `<div style="padding:30px;color:var(--muted);">Loading...</div>`;

    const { data, error } = await db
        .from('staff_tasks')
        .select('*, staff_task_approvers(*)')
        .order('created_at', { ascending: false });
    if (error) {
        list.innerHTML = `<div style="padding:30px;color:var(--danger);">Failed to load tasks.</div>`;
        countEl.textContent = '';
        return;
    }

    // Client-side filters
    const search = document.getElementById('filterSearch').value.trim().toLowerCase();
    const fAssignee = document.getElementById('filterAssignee').value;
    const fStatus = document.getElementById('filterStatus').value;

    let rows = data || [];
    if (search) rows = rows.filter(t => (t.title || '').toLowerCase().includes(search));
    if (fAssignee) rows = rows.filter(t => t.assigned_to === fAssignee);
    if (fStatus) rows = rows.filter(t => t.status === fStatus);
    if (filterMine) rows = rows.filter(needsMyAction);

    countEl.textContent = `${rows.length} task${rows.length !== 1 ? 's' : ''}`;
    renderTasks(rows);
}

// True when it is this viewer's turn to act on the task
function needsMyAction(t) {
    if (t.status === 'in_progress') return t.assigned_to === currentUser.id;
    if (t.status === 'awaiting_approval') {
        return (t.staff_task_approvers || [])
            .some(a => a.approver_id === currentUser.id && a.decision === 'pending');
    }
    if (t.status === 'awaiting_owner') return t.created_by === currentUser.id;
    return false;
}
```

- [ ] **Step 3: Implement the card renderer**

```javascript
function isOverdue(t) {
    if (!t.end_date) return false;
    if (t.status === 'completed' || t.status === 'failed') return false;
    // Compare dates only (end_date is a plain date)
    const today = new Date().toISOString().slice(0, 10);
    return t.end_date < today;
}

function approverChipsHTML(t) {
    const rows = t.staff_task_approvers || [];
    if (!rows.length) return '<span class="text-muted" style="font-size:12px;">No approvers</span>';
    const dot = { pending: '⏳', approved: '✅', sent_back: '↩️', rejected: '❌' };
    return rows.map(a => `
      <span class="badge" style="margin-right:6px;">
        ${dot[a.decision] || ''} ${SystemApp.escapeHtml(staffById[a.approver_id] || 'Unknown')}
      </span>`).join('');
}

function renderTasks(rows) {
    const list = document.getElementById('taskList');
    if (!rows.length) {
        list.innerHTML = `<div class="empty-state">
            <div class="empty-state-icon">✅</div>
            <div>No tasks match. Click "➕ New Task" to create one.</div>
          </div>`;
        return;
    }
    list.innerHTML = rows.map(taskCardHTML).join('');
}

function taskCardHTML(t) {
    const doer = SystemApp.escapeHtml(staffById[t.assigned_to] || 'Unknown');
    const creator = SystemApp.escapeHtml(staffById[t.created_by] || 'Unknown');
    const overdue = isOverdue(t)
        ? `<span class="badge" style="background:rgba(239,68,68,0.15);color:#EF4444;border:1px solid rgba(239,68,68,0.3);">⚠️ Overdue</span>`
        : '';
    const dates = [
        t.start_date ? `Start ${SystemApp.formatDate(t.start_date)}` : null,
        t.end_date ? `Due ${SystemApp.formatDate(t.end_date)}` : null,
    ].filter(Boolean).join(' • ') || 'No dates set';

    return `
    <div class="card" style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
        <div>
          <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:16px;">${SystemApp.escapeHtml(t.title)}</div>
          <div class="text-muted" style="font-size:12px;margin-top:2px;">Doer: <strong>${doer}</strong> · Owner: ${creator}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <span class="badge">${STATUS_LABELS[t.status] || t.status}</span>
          ${overdue}
        </div>
      </div>
      ${t.description ? `<div style="font-size:14px;margin-top:10px;">${SystemApp.escapeHtml(t.description)}</div>` : ''}
      <div style="margin-top:10px;">${approverChipsHTML(t)}</div>
      <div class="text-muted" style="font-size:12px;margin-top:8px;">${dates}</div>
      ${t.reason ? `<div style="margin-top:8px;font-size:13px;color:var(--warning);">Last feedback: ${SystemApp.escapeHtml(t.reason)}</div>` : ''}
      <div class="ticket-card-actions" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
        ${taskActionsHTML(t)}
      </div>
    </div>`;
}

// Filled in Task 6; returns the buttons this viewer may press
function taskActionsHTML(t) { return ''; }
```

- [ ] **Step 4: Verify create + render**

```bash
node --check task.js
```

1. Reload `task.html`. **➕ New Task** → leave title blank → Create. Expected: "Title is required", nothing saved.
2. Fill title `Service counter PCs`, pick a doer, tick two other staff as approvers, set start/end dates → Create. Expected: card appears, status **🔧 In Progress**, doer name shown, two approver chips with ⏳, dates shown.
3. Change the doer dropdown in the modal on a new task. Expected: that person disappears from the approver checkboxes.
4. Create a task with a title containing `<b>hi</b>`. Expected: shows literally, not bold.
5. Reload the page. Expected: tasks persist.

- [ ] **Step 5: Commit**

```bash
git add task.js
git commit -m "Add staff task creation and list rendering"
```

---

### Task 6: Doer Mark Done and approver actions

**Files:**
- Modify: `task.js`

**Interfaces:**
- Consumes: `taskActionsHTML` stub, `confirmReason` stub, `loadTasks`, `needsMyAction` from Task 5.
- Produces: `markDone(id)`, `approve(taskId, rowId)`, `openReason(action, taskId, rowId)`, `confirmReason()`, and window exposure of the onclick handlers.

- [ ] **Step 1: Fill in the action buttons for doer + approver stages**

Replace `taskActionsHTML`:

```javascript
function taskActionsHTML(t) {
    const btns = [];
    // Doer, while in progress
    if (t.status === 'in_progress' && t.assigned_to === currentUser.id) {
        btns.push(`<button class="btn btn-primary btn-sm" onclick="markDone('${t.id}')">✔️ Mark Done</button>`);
    }
    // Approver, while awaiting approval and still pending
    if (t.status === 'awaiting_approval') {
        const mine = (t.staff_task_approvers || [])
            .find(a => a.approver_id === currentUser.id && a.decision === 'pending');
        if (mine) {
            btns.push(`<button class="btn btn-primary btn-sm" onclick="approve('${t.id}','${mine.id}')">✅ Approve</button>`);
            btns.push(`<button class="btn btn-secondary btn-sm" onclick="openReason('approver_send_back','${t.id}','${mine.id}')">↩️ Send Back</button>`);
            btns.push(`<button class="btn btn-danger btn-sm" onclick="openReason('approver_reject','${t.id}','${mine.id}')">❌ Reject</button>`);
        }
    }
    // Owner-stage buttons and the creator-delete button are added in Task 7.
    return btns.join('') || '<span class="text-muted" style="font-size:12px;">No action for you right now</span>';
}
```

- [ ] **Step 2: Implement Mark Done (with the zero-approver shortcut)**

```javascript
async function markDone(id) {
    // Read the approver count to decide the next status
    const { data: task, error: readErr } = await db.from('staff_tasks')
        .select('id, staff_task_approvers(id)').eq('id', id).single();
    if (readErr || !task) { SystemApp.showToast('Failed to read task', 'error'); return; }

    const hasApprovers = (task.staff_task_approvers || []).length > 0;
    const nextStatus = hasApprovers ? 'awaiting_approval' : 'awaiting_owner';

    // Guard on current status + doer so a stale card cannot double-apply
    const { data: updated, error } = await db.from('staff_tasks')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'in_progress')
        .eq('assigned_to', currentUser.id)
        .select('id');
    if (error) { SystemApp.showToast('Failed to update task', 'error'); return; }
    if (!updated || !updated.length) {
        SystemApp.showToast('Task already moved on — refreshed', 'error');
        await loadTasks();
        return;
    }
    await loadTasks();
    SystemApp.showToast('✔️ Marked done!', 'success');
}
```

- [ ] **Step 3: Implement Approve, and the "all approved" check**

```javascript
async function approve(taskId, rowId) {
    // Mark my row approved, guarded on it still being pending
    const { data: updatedRow, error } = await db.from('staff_task_approvers')
        .update({ decision: 'approved', reason: null, decided_at: new Date().toISOString() })
        .eq('id', rowId)
        .eq('approver_id', currentUser.id)
        .eq('decision', 'pending')
        .select('id');
    if (error) { SystemApp.showToast('Failed to approve', 'error'); return; }
    if (!updatedRow || !updatedRow.length) {
        SystemApp.showToast('This task already moved on — refreshed', 'error');
        await loadTasks();
        return;
    }

    // If every approver has now approved, advance to awaiting_owner
    const { data: rows } = await db.from('staff_task_approvers')
        .select('decision').eq('task_id', taskId);
    const allApproved = (rows || []).length > 0 && rows.every(r => r.decision === 'approved');
    if (allApproved) {
        await db.from('staff_tasks')
            .update({ status: 'awaiting_owner', updated_at: new Date().toISOString() })
            .eq('id', taskId)
            .eq('status', 'awaiting_approval');
    }
    await loadTasks();
    SystemApp.showToast('✅ Approved!', 'success');
}
```

- [ ] **Step 4: Implement the reason modal flow (send back / reject, both stages)**

```javascript
function openReason(action, taskId, rowId) {
    pendingReason = { action, taskId, rowId };
    const isReject = action.endsWith('reject');
    document.getElementById('reasonModalTitle').textContent = isReject ? '❌ Reject Task' : '↩️ Send Back';
    document.getElementById('reasonText').value = '';
    document.getElementById('reasonErr').classList.add('hidden');
    document.getElementById('reasonModal').classList.remove('hidden');
}

async function confirmReason() {
    if (!pendingReason) return;
    const reason = document.getElementById('reasonText').value.trim();
    if (!reason) { document.getElementById('reasonErr').classList.remove('hidden'); return; }
    document.getElementById('reasonErr').classList.add('hidden');

    const { action, taskId, rowId } = pendingReason;
    const btn = document.getElementById('confirmReasonBtn');
    btn.disabled = true;
    try {
        if (action === 'approver_reject' || action === 'owner_reject') {
            await failTask(taskId, reason, rowId);
        } else {
            await sendBackTask(taskId, reason, rowId);
        }
        SystemApp.closeModal('reasonModal');
        pendingReason = null;
        await loadTasks();
    }
    catch (err) {
        SystemApp.showToast(err.message || 'Action failed', 'error');
    }
    finally {
        btn.disabled = false;
    }
}

// Reject → failed (terminal). rowId present only at approver stage.
async function failTask(taskId, reason, rowId) {
    if (rowId) {
        await db.from('staff_task_approvers')
            .update({ decision: 'rejected', reason, decided_at: new Date().toISOString() })
            .eq('id', rowId);
    }
    const { error } = await db.from('staff_tasks')
        .update({ status: 'failed', reason, updated_at: new Date().toISOString() })
        .eq('id', taskId);
    if (error) throw error;
    SystemApp.showToast('❌ Task rejected', 'success');
}

// Send back → in_progress, reset all approver rows to pending.
async function sendBackTask(taskId, reason, rowId) {
    const { error } = await db.from('staff_tasks')
        .update({ status: 'in_progress', reason, updated_at: new Date().toISOString() })
        .eq('id', taskId);
    if (error) throw error;
    // Reset every approver row for a fresh round
    await db.from('staff_task_approvers')
        .update({ decision: 'pending', reason: null, decided_at: null })
        .eq('task_id', taskId);
    SystemApp.showToast('↩️ Sent back to doer', 'success');
}
```

- [ ] **Step 4b: Expose the onclick handlers**

Add above `document.addEventListener('DOMContentLoaded', initTask);`:

```javascript
window.markDone = markDone;
window.approve = approve;
window.openReason = openReason;
```

(`acceptTask` and `deleteTask` are added to this list in Task 7, once they exist — exposing a not-yet-defined function here would crash the page on load.)

- [ ] **Step 5: Verify the approver flow**

```bash
node --check task.js
```

Using two staff logins (all are managers):

1. As doer, on an In Progress task → **✔️ Mark Done**. Expected: status → **👀 Awaiting Approval**; Mark Done no longer shown to you.
2. Log in as approver #1 → task shows **Approve / Send Back / Reject**; a non-approver sees "No action for you right now".
3. Approver #1 approves. Expected: their chip → ✅; status stays Awaiting Approval (still waiting on #2).
4. Approver #2 approves. Expected: status → **⭐ Awaiting Owner**.
5. On another task, approver #1 → **Send Back**, blank reason → refused; with reason → task → In Progress, both chips reset to ⏳, "Last feedback" shows the reason.
6. On another task, approver → **Reject** with reason → status **❌ Failed**.
7. A task with **no approvers**: doer Mark Done → jumps straight to **⭐ Awaiting Owner**.

- [ ] **Step 6: Commit**

```bash
git add task.js
git commit -m "Add doer mark-done and approver approve/send-back/reject"
```

---

### Task 7: Owner acceptance and delete

**Files:**
- Modify: `task.js`

**Interfaces:**
- Consumes: `taskActionsHTML`, `openReason`, `failTask`, `sendBackTask`, `loadTasks` from Task 6.
- Produces: `acceptTask(id)`, `deleteTask(id)`, and the owner-stage buttons.

- [ ] **Step 1: Add owner-stage and creator-delete buttons to taskActionsHTML**

In `taskActionsHTML`, replace the closing comment line and `return` from Task 6:

```javascript
    // Owner-stage buttons and the creator-delete button are added in Task 7.
    return btns.join('') || '<span class="text-muted" style="font-size:12px;">No action for you right now</span>';
```

with:

```javascript
    // Creator, at owner stage
    if (t.status === 'awaiting_owner' && t.created_by === currentUser.id) {
        btns.push(`<button class="btn btn-primary btn-sm" onclick="acceptTask('${t.id}')">🏁 Accept</button>`);
        btns.push(`<button class="btn btn-secondary btn-sm" onclick="openReason('owner_send_back','${t.id}','')">↩️ Send Back</button>`);
        btns.push(`<button class="btn btn-danger btn-sm" onclick="openReason('owner_reject','${t.id}','')">❌ Reject</button>`);
    }
    // Creator can always delete their own task
    if (t.created_by === currentUser.id) {
        btns.push(`<button class="btn btn-danger btn-sm" onclick="deleteTask('${t.id}')">🗑️</button>`);
    }
    return btns.join('') || '<span class="text-muted" style="font-size:12px;">No action for you right now</span>';
```

Note the empty `''` rowId — owner actions carry no approver row. `openReason` stores it; `confirmReason` routes `owner_reject` to `failTask(taskId, reason, '')` (falsy rowId, so no approver row is touched) and `owner_send_back` to `sendBackTask`.

- [ ] **Step 2: Guard failTask against the empty rowId**

The empty string is falsy, so the existing `if (rowId)` guard in `failTask` already skips the approver update. Confirm that line reads `if (rowId) {` — no change needed if so.

- [ ] **Step 3: Implement acceptTask and deleteTask**

```javascript
async function acceptTask(id) {
    const { data: updated, error } = await db.from('staff_tasks')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'awaiting_owner')
        .eq('created_by', currentUser.id)
        .select('id');
    if (error) { SystemApp.showToast('Failed to accept', 'error'); return; }
    if (!updated || !updated.length) {
        SystemApp.showToast('Task already moved on — refreshed', 'error');
        await loadTasks();
        return;
    }
    await loadTasks();
    SystemApp.showToast('🏁 Task completed!', 'success');
}

async function deleteTask(id) {
    if (!confirm('Delete this task?\n\nThis cannot be undone.')) return;
    // created_by guard: only the creator's delete will match a row
    const { data: deleted, error } = await db.from('staff_tasks')
        .delete()
        .eq('id', id)
        .eq('created_by', currentUser.id)
        .select('id');
    if (error) { SystemApp.showToast('Failed to delete', 'error'); return; }
    if (!deleted || !deleted.length) {
        SystemApp.showToast('Only the task creator can delete it', 'error');
        return;
    }
    await loadTasks();
    SystemApp.showToast('🗑️ Task deleted', 'success');
}
```

- [ ] **Step 4: Expose acceptTask and deleteTask**

Add to the window-exposure block (both functions now exist):

```javascript
window.acceptTask = acceptTask;
window.deleteTask = deleteTask;
```

- [ ] **Step 5: Verify owner flow + delete**

```bash
node --check task.js
```

1. Take a task to **Awaiting Owner** (from Task 6). As the **creator**, buttons show **Accept / Send Back / Reject**; a non-creator sees none of these.
2. **Accept** → status **✅ Completed**, no more action buttons except the creator's 🗑️.
3. On another awaiting-owner task, creator **Send Back** with reason → **In Progress**, approver chips reset to ⏳.
4. On another, creator **Reject** with reason → **❌ Failed**.
5. **Delete** as creator → task disappears. Confirm in Supabase Table Editor that its `staff_task_approvers` rows are gone too (cascade).

- [ ] **Step 6: Commit**

```bash
git add task.js
git commit -m "Add owner acceptance, send-back, reject and delete"
```

---

### Task 8: Verify filters end to end

**Files:**
- None (the filter code shipped in Task 5; this task is verification only)

- [ ] **Step 1: Verify each filter**

With several tasks in different states and assignees:

1. **Search**: type part of a task title → list narrows to matching titles; clearing restores all.
2. **Assignee**: pick a staff name → only that person's tasks show.
3. **Status**: pick "Awaiting Approval" → only those show.
4. **Needs my action**: toggle on → shows only tasks where it is your turn (a task you doer and it's In Progress; a task awaiting your approval; a task awaiting you as owner). Toggle off → all return.
5. Combine assignee + status → both apply together.
6. The task count in the header matches the visible cards for every filter.

- [ ] **Step 2: Commit (if any tweak was needed)**

If a fix was required, commit it:

```bash
git add task.js
git commit -m "Fix staff task filter behaviour"
```

Otherwise note "no change needed" and move on.

---

### Task 9: Full regression pass and cleanup

**Files:**
- None (verification only)

- [ ] **Step 1: Re-test every pre-existing page**

The `escapeHtml` move and the sidebar swap touch shared code:

1. `dashboard.html` loads, zero console errors; create a ticket via the **top-bar** ➕ New Ticket button.
2. Update a ticket status; upload a ticket photo.
3. `inventory.html`: add/edit/sell a laptop, add/adjust a part — all still work, text with `<`/`>` shows literally.
4. `status.html` finds a real ticket number.
5. `index.html` loads.
6. Sign out redirects to `login.html`.

- [ ] **Step 2: Delete test data**

`config.js` points at production. Delete test rows from `staff_tasks` (approver rows cascade) via the Staff Task page (🗑️ as creator) or Supabase Table Editor.

- [ ] **Step 3: Confirm main is untouched and nothing is pushed**

```bash
git status
git log main --oneline -1
git log origin/feature/staff-task --oneline -1 2>/dev/null || echo "branch not on origin (correct — not pushed)"
```

Expected: clean tree on `feature/staff-task`; `main` still at `d53c5f9`; the branch is not on origin.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "Complete staff task feature" || echo "nothing to commit"
```

Do **not** merge or push. The user reviews first.

---

## Deferred (not in this plan)

Per the spec: notifications, comments/discussion, attachments, linking tasks to tickets, editing task details after creation, and hard date enforcement.
