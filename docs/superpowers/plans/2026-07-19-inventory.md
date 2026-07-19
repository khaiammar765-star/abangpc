# Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a staff-only inventory page to the AbangPC dashboard that tracks used laptops as individual units and parts (GPU/RAM/SSD/other) as counted stock.

**Architecture:** Two new Supabase tables (`inventory_laptops`, `inventory_items`) plus one new page (`inventory.html` + `inventory.js`) following the existing dashboard conventions. Two shared helpers move from `dashboard.js` into `system.js` so the new page can use them. All work on branch `feature/inventory`; `main` and the live site are untouched until a deliberate merge.

**Tech Stack:** Plain ES2017+ JavaScript (no build step), Supabase JS v2 via CDN, Supabase Auth, Supabase Storage, existing `system.css`.

## Global Constraints

- **Branch:** all work on `feature/inventory`. Never commit to `main`.
- **Database changes are additive only.** Only `CREATE TABLE`, `CREATE POLICY`, `CREATE INDEX` on the two new table names. Never `ALTER` or `DROP` on `tickets`, `customers`, `users`, `ticket_comments`, `ticket_photos`, `ticket_status_history`, `diagnose_reports`, `diagnose_laptop_reports`.
- **No TypeScript.** Write `inventory.js` only. The existing `.ts` files are already out of sync with their `.js` counterparts (e.g. `dashboard.ts` lacks `ticket_photos` and the diagnose-report features that `dashboard.js` has), there is no `tsconfig.json` and no build step, and the HTML loads `.js` directly. Adding an `inventory.ts` would repeat that drift.
- **No new CSS file.** Reuse classes in `system.css`. Inline `style=""` for one-off layout is consistent with the existing codebase.
- **Namespace:** shared helpers are reached via `SystemApp.*` (defined at `system.js:401`, exposed at `system.js:416`).
- **Auth guard:** `SystemApp.requireManager()` — matches `dashboard.js:77`. This deviates from the spec's "any signed-in staff", deliberately: the dashboard is manager-only, and inventory must not be more permissive than the page it sits beside.
- **Price is always optional.** Never validate it as required, never default it to 0. Empty means "no price set" and must store `null`.
- **Currency display:** `RM` prefix, two decimals, e.g. `RM 450.00`.
- **No test framework exists** (no `package.json`, no runner). Every task therefore ends with explicit manual browser verification steps instead of automated tests. Do not skip them and do not invent a test framework.

## Local Environment Setup

Required before Task 2. Do this once.

The pages must be served over `http://`, not opened as `file://`, or Supabase Auth session storage behaves inconsistently.

1. In VS Code, install the **Live Server** extension (`ritwickdey.LiveServer`) if not present.
2. Right-click `dashboard.html` → **Open with Live Server**. It serves at `http://127.0.0.1:5500`.
3. You will be redirected to `login.html` — log in with a manager account. This is a separate browser session from abangpc.com, so a fresh login is expected.

**Note:** `config.js` points at the production Supabase project. Local pages read and write the real database. This is intentional (Option B), but it means test data you create is real data — delete it when done.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `system.js` | Modify | Gains `showToast()`, `closeModal()`, and the Inventory sidebar link |
| `dashboard.js` | Modify | Loses `showToast()` and `closeModal()` (moved, not changed) |
| `inventory.html` | Create | Page shell: topbar, two sections, three modals |
| `inventory.js` | Create | All inventory logic: load, render, create, edit, delete, sell |
| `docs/superpowers/plans/2026-07-19-inventory.md` | Create | This plan |

---

### Task 1: Create the database tables

**Files:**
- None (SQL run in the Supabase dashboard)

**Interfaces:**
- Produces: tables `inventory_laptops` and `inventory_items` with the columns used by every later task.

- [ ] **Step 1: Take a manual backup**

Supabase Dashboard → your project → **Database** → **Backups**. The free tier has no restore button, so download a manual dump if offered. If not available, skip — this plan creates no risk to existing tables, but a backup is cheap insurance.

- [ ] **Step 2: Read the SQL before running it**

Confirm by eye that it names only `inventory_laptops` and `inventory_items`, and that there is no `drop`, `alter`, `truncate`, or `delete` anywhere in it.

- [ ] **Step 3: Run the setup SQL**

Supabase Dashboard → **SQL Editor** → New query → paste → **Run**.

```sql
-- Individual used laptops: one row per physical unit
create table if not exists public.inventory_laptops (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  brand       text,
  model       text,
  cpu         text,
  ram         text,
  storage     text,
  condition   text,
  notes       text,
  photo_url   text,
  price       numeric,
  status      text not null default 'in_stock' check (status in ('in_stock', 'sold')),
  sold_at     timestamptz,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.users(id)
);

-- Counted parts: GPU, RAM, SSD, other
create table if not exists public.inventory_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text not null default 'other',
  quantity    integer not null default 0 check (quantity >= 0),
  notes       text,
  price       numeric,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.users(id)
);

create index if not exists inventory_laptops_status_idx
  on public.inventory_laptops (status);
create index if not exists inventory_items_category_idx
  on public.inventory_items (category);

-- Row Level Security: signed-in staff only, no public access
alter table public.inventory_laptops enable row level security;
alter table public.inventory_items  enable row level security;

create policy "staff_full_access_laptops" on public.inventory_laptops
  for all to authenticated using (true) with check (true);

create policy "staff_full_access_items" on public.inventory_items
  for all to authenticated using (true) with check (true);
```

Expected: `Success. No rows returned`.

- [ ] **Step 4: Verify the tables exist and are protected**

Run in the SQL Editor:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename like 'inventory%';
```

Expected: two rows, `inventory_laptops` and `inventory_items`, both with `rowsecurity = true`.

- [ ] **Step 5: Verify existing tables are untouched**

```sql
select count(*) from public.tickets;
select count(*) from public.customers;
```

Expected: the same counts as before you started. If either errors or reads zero unexpectedly, stop and report.

- [ ] **Step 6: Save the rollback script**

Create `docs/superpowers/plans/inventory-rollback.sql`:

```sql
-- Undo Task 1. Destroys all inventory data. Touches nothing else.
drop table if exists public.inventory_laptops;
drop table if exists public.inventory_items;
```

```bash
git add docs/superpowers/plans/inventory-rollback.sql
git commit -m "Add inventory rollback SQL"
```

---

### Task 2: Move shared helpers into system.js

**Files:**
- Modify: `system.js` (add two functions, extend the `SystemApp` object at line 401)
- Modify: `dashboard.js:649-680` (remove the two functions)

**Interfaces:**
- Produces: global `showToast(msg, type)` and `closeModal(id)`, also reachable as `SystemApp.showToast` / `SystemApp.closeModal`.

Both are plain top-level `function` declarations in a classic (non-module) script, so they remain globals after moving. `dashboard.js` keeps calling them bare with no edits to its call sites. `system.js` is loaded before `dashboard.js` on every page (`dashboard.html:895-896`), so ordering is already correct.

- [ ] **Step 1: Add the two functions to system.js**

Insert immediately above the `// EXPOSE TO HTML PAGES` comment near `system.js:398`. This is the exact current implementation from `dashboard.js:649-680`, unchanged:

```javascript
// =============================================
// MODAL HELPERS
// =============================================
function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}
// =============================================
// TOAST NOTIFICATION
// =============================================
function showToast(msg, type = 'info') {
    const existing = document.getElementById('toast');
    if (existing)
        existing.remove();
    const colors = {
        success: 'var(--success)',
        error: 'var(--danger)',
        info: 'var(--yellow)',
    };
    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.textContent = msg;
    toast.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    background:var(--card);border:1px solid ${colors[type]};
    color:${colors[type]};padding:12px 20px;border-radius:10px;
    font-size:14px;font-weight:600;
    box-shadow:0 4px 20px rgba(0,0,0,0.4);
    animation:fadeInUp 0.3s ease;
  `;
    const style = document.createElement('style');
    style.textContent = `@keyframes fadeInUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`;
    document.head.appendChild(style);
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
```

- [ ] **Step 2: Confirm it matches the original byte for byte**

```bash
git diff dashboard.js
```

The removed lines in `dashboard.js` must be identical to what was added to `system.js`. Behaviour must not change.

- [ ] **Step 3: Add them to the SystemApp object**

In `system.js:401`, extend the object:

```javascript
const SystemApp = {
    initLogin,
    initStatusChecker,
    requireAuth,
    requireManager,
    getCurrentUser,
    renderSidebar,
    logout,
    formatDate,
    formatDateTime,
    formatDuration,
    getStatusLabel,
    getStatusBadgeHTML,
    getUserInitials,
    showToast,
    closeModal,
};
```

- [ ] **Step 4: Delete the originals from dashboard.js**

Remove the `closeModal` and `showToast` function declarations from `dashboard.js`. Leave every *call* to them exactly as-is.

- [ ] **Step 5: Verify no duplicate definitions remain**

```bash
grep -n "function showToast\|function closeModal" *.js
```

Expected: exactly two lines, both in `system.js`. If any appear in `dashboard.js`, deletion was incomplete.

- [ ] **Step 6: Regression-test the dashboard in the browser**

This is the step that catches a broken move. With Live Server running on `dashboard.html`:

1. Load the dashboard — the ticket table populates. Open DevTools Console (F12): **zero** errors.
2. Open any ticket → **Update Status** → change status → Save. Expected: modal closes and a green success toast appears. *(Exercises both moved functions.)*
3. Open a ticket → upload a photo. Expected: modal closes, toast appears, photo shows.
4. Console still shows zero `showToast is not defined` or `closeModal is not defined` errors.

If any step fails, `git checkout -- system.js dashboard.js` and redo from Step 1.

- [ ] **Step 7: Commit**

```bash
git add system.js dashboard.js
git commit -m "Move showToast and closeModal into system.js for reuse"
```

---

### Task 3: Add the Inventory link to the sidebar

**Files:**
- Modify: `system.js:161-163` (inside `renderSidebar`)

**Interfaces:**
- Consumes: `renderSidebar(user, activePage)` from Task 2's file.
- Produces: an `activePage` value of `'inventory'` that Task 4 passes in.

- [ ] **Step 1: Add the nav item**

In `renderSidebar`, immediately after the "New Ticket" anchor (`system.js:161-163`) and before the `Tools` section label:

```javascript
      <a href="inventory.html" class="nav-item ${activePage === 'inventory' ? 'active' : ''}">
        <span class="nav-item-icon">📦</span> Inventory
      </a>
```

- [ ] **Step 2: Verify in the browser**

Reload `dashboard.html`. Expected: **📦 Inventory** appears under Management, below New Ticket. Clicking it 404s — correct at this stage, since `inventory.html` does not exist yet.

- [ ] **Step 3: Commit**

```bash
git add system.js
git commit -m "Add Inventory link to dashboard sidebar"
```

---

### Task 4: Page shell and authentication

**Files:**
- Create: `inventory.html`
- Create: `inventory.js`

**Interfaces:**
- Produces: `loadLaptops()` and `loadItems()` (async, no args), called by `initInventory()`. Tasks 5–9 fill these in.
- Produces: DOM ids `laptopGrid`, `itemsBody`, `laptopModal`, `itemModal`.

- [ ] **Step 1: Create inventory.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>AbangPC – Inventory</title>
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
        <span class="topbar-title">Inventory</span>
      </div>
      <div class="topbar-right">
        <button class="btn btn-secondary btn-sm" id="addItemBtn">➕ Add Part</button>
        <button class="btn btn-primary btn-sm" id="addLaptopBtn">💻 Add Laptop</button>
      </div>
    </div>

    <div class="page-content">

      <!-- LAPTOPS -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">💻 Used Laptops</span>
          <div class="status-tabs" id="laptopFilter">
            <button class="status-tab active" data-filter="in_stock">In Stock</button>
            <button class="status-tab" data-filter="sold">Sold</button>
          </div>
        </div>
        <div class="tickets-grid" id="laptopGrid"></div>
      </div>

      <!-- PARTS -->
      <div class="card" style="margin-top:20px;">
        <div class="card-header">
          <span class="card-title">🔩 Parts Stock</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Category</th><th>Quantity</th><th>Price</th><th>Notes</th><th></th>
              </tr>
            </thead>
            <tbody id="itemsBody"></tbody>
          </table>
        </div>
      </div>

    </div>
  </div>
</div>

<!-- ===== LAPTOP MODAL ===== -->
<div class="modal-overlay hidden" id="laptopModal">
  <div class="modal" style="max-width:620px;">
    <div class="modal-header">
      <span class="modal-title" id="laptopModalTitle">💻 Add Laptop</span>
      <button class="modal-close" id="closeLaptopModal">✕</button>
    </div>
    <div class="modal-body">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div class="field-group" style="grid-column:1/-1;">
          <label>Title *</label>
          <div class="input-wrap">
            <span class="input-icon">💻</span>
            <input type="text" id="lapTitle" placeholder="e.g. Dell Latitude 7490" />
          </div>
          <span class="field-err hidden" id="lapTitleErr">Title is required</span>
        </div>
        <div class="field-group">
          <label>Brand</label>
          <div class="input-wrap"><span class="input-icon">🏷️</span>
            <input type="text" id="lapBrand" placeholder="Dell" /></div>
        </div>
        <div class="field-group">
          <label>Model</label>
          <div class="input-wrap"><span class="input-icon">#️⃣</span>
            <input type="text" id="lapModel" placeholder="7490" /></div>
        </div>
        <div class="field-group">
          <label>CPU</label>
          <div class="input-wrap"><span class="input-icon">🧠</span>
            <input type="text" id="lapCpu" placeholder="i5-8350U" /></div>
        </div>
        <div class="field-group">
          <label>RAM</label>
          <div class="input-wrap"><span class="input-icon">🧩</span>
            <input type="text" id="lapRam" placeholder="8GB DDR4" /></div>
        </div>
        <div class="field-group">
          <label>Storage</label>
          <div class="input-wrap"><span class="input-icon">💾</span>
            <input type="text" id="lapStorage" placeholder="256GB NVMe" /></div>
        </div>
        <div class="field-group">
          <label>Condition</label>
          <select id="lapCondition" class="diag-select">
            <option value="">— Not set —</option>
            <option value="Like New">Like New</option>
            <option value="Good">Good</option>
            <option value="Fair">Fair</option>
          </select>
        </div>
        <div class="field-group">
          <label>Price (optional)</label>
          <div class="input-wrap"><span class="input-icon">💰</span>
            <input type="number" step="0.01" min="0" id="lapPrice" placeholder="Leave empty if not set" /></div>
        </div>
        <div class="field-group">
          <label>Photo (optional)</label>
          <input type="file" id="lapPhoto" accept="image/*" />
        </div>
        <div class="field-group" style="grid-column:1/-1;">
          <label>Notes</label>
          <textarea id="lapNotes" rows="2" placeholder="Scratches, missing charger, etc."></textarea>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="cancelLaptopBtn">Cancel</button>
      <button class="btn btn-primary" id="saveLaptopBtn">💾 Save Laptop</button>
    </div>
  </div>
</div>

<!-- ===== PART MODAL ===== -->
<div class="modal-overlay hidden" id="itemModal">
  <div class="modal" style="max-width:460px;">
    <div class="modal-header">
      <span class="modal-title" id="itemModalTitle">🔩 Add Part</span>
      <button class="modal-close" id="closeItemModal">✕</button>
    </div>
    <div class="modal-body">
      <div class="field-group">
        <label>Name *</label>
        <div class="input-wrap"><span class="input-icon">🔩</span>
          <input type="text" id="itemName" placeholder="e.g. Kingston 8GB DDR4 3200" /></div>
        <span class="field-err hidden" id="itemNameErr">Name is required</span>
      </div>
      <div class="field-group">
        <label>Category *</label>
        <select id="itemCategory" class="diag-select">
          <option value="gpu">GPU</option>
          <option value="ram">RAM</option>
          <option value="ssd">SSD</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="field-group">
        <label>Quantity</label>
        <div class="input-wrap"><span class="input-icon">🔢</span>
          <input type="number" min="0" step="1" id="itemQty" value="0" /></div>
      </div>
      <div class="field-group">
        <label>Price (optional)</label>
        <div class="input-wrap"><span class="input-icon">💰</span>
          <input type="number" step="0.01" min="0" id="itemPrice" placeholder="Leave empty if not set" /></div>
      </div>
      <div class="field-group">
        <label>Notes</label>
        <textarea id="itemNotes" rows="2"></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="cancelItemBtn">Cancel</button>
      <button class="btn btn-primary" id="saveItemBtn">💾 Save Part</button>
    </div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="config.js"></script>
<script src="system.js"></script>
<script src="inventory.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create inventory.js with auth and empty loaders**

```javascript
// =============================================
// AbangPC - Inventory
// =============================================
let currentUser = null;
let laptopFilter = 'in_stock';
let editingLaptopId = null;
let editingItemId = null;

async function initInventory() {
    try {
        currentUser = await SystemApp.requireManager();
        SystemApp.renderSidebar(currentUser, 'inventory');
        bindEvents();
        await Promise.all([loadLaptops(), loadItems()]);
    }
    catch (err) {
        console.error(err);
    }
}

function bindEvents() {
    document.getElementById('menuBtn')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('open');
    });
}

async function loadLaptops() {
    // Task 7
}

async function loadItems() {
    // Task 5
}

// =============================================
// START
// =============================================
document.addEventListener('DOMContentLoaded', initInventory);
```

- [ ] **Step 3: Verify the page loads and is protected**

1. Live Server → open `inventory.html`. Expected: sidebar renders with **📦 Inventory** highlighted, topbar reads "Inventory", two empty cards, zero console errors.
2. Sign out, then browse directly to `inventory.html`. Expected: redirected to `login.html`.
3. Log back in as manager and confirm the page loads again.

- [ ] **Step 4: Commit**

```bash
git add inventory.html inventory.js
git commit -m "Add inventory page shell with manager auth guard"
```

---

### Task 5: Parts — list and create

**Files:**
- Modify: `inventory.js`

**Interfaces:**
- Consumes: `loadItems()` stub from Task 4.
- Produces: `loadItems()`, `renderItems(rows)`, `openItemModal(id)`, `saveItem()`, `fmtPrice(v)`, `escapeHtml(s)`. Tasks 6 and 7 reuse `fmtPrice` and `escapeHtml` — do not redefine them there.

- [ ] **Step 1: Add the shared formatting helpers**

Place near the top of `inventory.js`, below the state variables:

```javascript
function fmtPrice(v) {
    if (v === null || v === undefined || v === '') return '—';
    return 'RM ' + Number(v).toFixed(2);
}

function escapeHtml(s) {
    if (!s) return '';
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const CATEGORY_LABELS = { gpu: 'GPU', ram: 'RAM', ssd: 'SSD', other: 'Other' };
```

- [ ] **Step 2: Implement loadItems and renderItems**

```javascript
async function loadItems() {
    const tbody = document.getElementById('itemsBody');
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--muted);">Loading...</td></tr>`;

    const { data, error } = await db
        .from('inventory_items')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--danger);">Failed to load parts.</td></tr>`;
        return;
    }
    renderItems(data || []);
}

function renderItems(rows) {
    const tbody = document.getElementById('itemsBody');
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--muted);">No parts yet. Click "➕ Add Part" to start.</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr${r.quantity === 0 ? ' style="opacity:0.45;"' : ''}>
        <td>${escapeHtml(r.name)}</td>
        <td><span class="badge">${CATEGORY_LABELS[r.category] || escapeHtml(r.category)}</span></td>
        <td><strong>${r.quantity}</strong></td>
        <td>${fmtPrice(r.price)}</td>
        <td class="text-muted">${escapeHtml(r.notes) || '—'}</td>
        <td></td>
      </tr>
    `).join('');
}
```

- [ ] **Step 3: Implement the add modal**

```javascript
function openItemModal(id) {
    editingItemId = id || null;
    document.getElementById('itemModalTitle').textContent = id ? '🔩 Edit Part' : '🔩 Add Part';
    document.getElementById('itemNameErr').classList.add('hidden');

    if (!id) {
        document.getElementById('itemName').value = '';
        document.getElementById('itemCategory').value = 'other';
        document.getElementById('itemQty').value = '0';
        document.getElementById('itemPrice').value = '';
        document.getElementById('itemNotes').value = '';
    }
    document.getElementById('itemModal').classList.remove('hidden');
}

async function saveItem() {
    const name = document.getElementById('itemName').value.trim();
    const errEl = document.getElementById('itemNameErr');

    if (!name) {
        errEl.classList.remove('hidden');
        return;
    }
    errEl.classList.add('hidden');

    const priceRaw = document.getElementById('itemPrice').value.trim();
    const payload = {
        name,
        category: document.getElementById('itemCategory').value,
        quantity: parseInt(document.getElementById('itemQty').value, 10) || 0,
        price: priceRaw === '' ? null : Number(priceRaw),
        notes: document.getElementById('itemNotes').value.trim() || null,
    };

    const btn = document.getElementById('saveItemBtn');
    btn.disabled = true;
    const wasEditing = editingItemId;
    try {
        let error;
        if (wasEditing) {
            ({ error } = await db.from('inventory_items').update(payload).eq('id', wasEditing));
        } else {
            payload.created_by = currentUser.id;
            ({ error } = await db.from('inventory_items').insert(payload));
        }
        if (error) throw error;

        // Only clear the edit id on success. Clearing it on failure would turn
        // a retry into an INSERT, silently duplicating the row.
        editingItemId = null;
        closeModal('itemModal');
        await loadItems();
        showToast(wasEditing ? '✅ Part updated!' : '✅ Part added!', 'success');
    }
    catch (err) {
        showToast(err.message || 'Failed to save part', 'error');
    }
    finally {
        btn.disabled = false;
    }
}
```

- [ ] **Step 4: Wire the buttons in bindEvents**

Add inside `bindEvents()`:

```javascript
    document.getElementById('addItemBtn')?.addEventListener('click', () => openItemModal(null));
    document.getElementById('saveItemBtn')?.addEventListener('click', saveItem);
    document.getElementById('cancelItemBtn')?.addEventListener('click', () => closeModal('itemModal'));
    document.getElementById('closeItemModal')?.addEventListener('click', () => closeModal('itemModal'));
```

- [ ] **Step 5: Verify in the browser**

1. Reload `inventory.html`. Expected: Parts table shows "No parts yet."
2. **➕ Add Part** → leave Name blank → Save. Expected: red "Name is required", modal stays open, nothing saved.
3. Fill Name `Kingston 8GB DDR4 3200`, Category `RAM`, Quantity `5`, leave Price empty → Save. Expected: modal closes, green toast, row appears with quantity 5 and price `—`.
4. Add a second part with Price `120` → Expected: displays `RM 120.00`.
5. Add a part with Quantity `0` → Expected: row appears visibly dimmed.
6. Reload the page. Expected: all parts persist.

- [ ] **Step 6: Commit**

```bash
git add inventory.js
git commit -m "Add parts inventory listing and creation"
```

---

### Task 6: Parts — quantity adjust, edit, delete

**Files:**
- Modify: `inventory.js`

**Interfaces:**
- Consumes: `loadItems()`, `renderItems()`, `openItemModal(id)` from Task 5.
- Produces: `adjustQty(id, delta)`, `editItem(id)`, `deleteItem(id)` — all exposed on `window` for inline `onclick`.

- [ ] **Step 1: Add action buttons to the row template**

Replace the empty `<td></td>` in `renderItems` with:

```javascript
        <td style="white-space:nowrap;">
          <button class="btn btn-secondary btn-sm" onclick="adjustQty('${r.id}', -1)" ${r.quantity === 0 ? 'disabled' : ''}>−</button>
          <button class="btn btn-secondary btn-sm" onclick="adjustQty('${r.id}', 1)">+</button>
          <button class="btn btn-secondary btn-sm" onclick="editItem('${r.id}')">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteItem('${r.id}')">🗑️</button>
        </td>
```

- [ ] **Step 2: Implement the three actions**

```javascript
async function adjustQty(id, delta) {
    const { data: row, error: readErr } = await db
        .from('inventory_items').select('quantity').eq('id', id).single();
    if (readErr) {
        showToast('Failed to read stock', 'error');
        return;
    }
    const next = Math.max(0, (row.quantity || 0) + delta);
    const { error } = await db.from('inventory_items').update({ quantity: next }).eq('id', id);
    if (error) {
        showToast('Failed to update stock', 'error');
        return;
    }
    await loadItems();
}

async function editItem(id) {
    const { data, error } = await db.from('inventory_items').select('*').eq('id', id).single();
    if (error || !data) {
        showToast('Failed to load part', 'error');
        return;
    }
    document.getElementById('itemName').value = data.name || '';
    document.getElementById('itemCategory').value = data.category || 'other';
    document.getElementById('itemQty').value = data.quantity ?? 0;
    document.getElementById('itemPrice').value = data.price ?? '';
    document.getElementById('itemNotes').value = data.notes || '';
    openItemModal(id);
}

async function deleteItem(id) {
    if (!confirm('Delete this part from inventory?\n\nThis cannot be undone.')) return;
    const { error } = await db.from('inventory_items').delete().eq('id', id);
    if (error) {
        showToast('Failed to delete part', 'error');
        return;
    }
    await loadItems();
    showToast('🗑️ Part deleted', 'success');
}
```

- [ ] **Step 3: Expose to window for the inline onclick handlers**

Add above the `// START` block, matching the pattern at `dashboard.js:1700`:

```javascript
window.adjustQty = adjustQty;
window.editItem = editItem;
window.deleteItem = deleteItem;
```

- [ ] **Step 4: Verify in the browser**

1. On a part with quantity 5, click `+`. Expected: shows 6, persists after reload.
2. Click `−` four times. Expected: 2.
3. Reduce to 0. Expected: row dims and the `−` button becomes disabled — it cannot go negative.
4. Click ✏️ on a part. Expected: modal opens pre-filled with that part's values, title reads "Edit Part". Change the name → Save → row updates, no duplicate row is created.
5. **Duplicate-on-retry check.** Open ✏️ on a part, then turn off your network (DevTools → Network → Offline). Click Save. Expected: red error toast, modal stays open. Turn the network back on and click Save again. Expected: the part is **updated**, and the parts list still has the same number of rows. A second row appearing means the edit id was cleared on failure — a bug.
6. Click 🗑️ → Cancel. Expected: nothing happens. Click 🗑️ → OK. Expected: row disappears, toast shown.

- [ ] **Step 5: Commit**

```bash
git add inventory.js
git commit -m "Add parts quantity adjust, edit and delete"
```

---

### Task 7: Laptops — list and create (without photo)

**Files:**
- Modify: `inventory.js`

**Interfaces:**
- Consumes: `fmtPrice()`, `escapeHtml()` from Task 5.
- Produces: `loadLaptops()`, `renderLaptops(rows)`, `openLaptopModal(id)`, `saveLaptop()`. Task 8 extends `saveLaptop()` with photo upload; Task 9 adds edit/sell/delete.

- [ ] **Step 1: Implement loadLaptops and renderLaptops**

```javascript
async function loadLaptops() {
    const grid = document.getElementById('laptopGrid');
    grid.innerHTML = `<div style="padding:30px;color:var(--muted);">Loading...</div>`;

    const { data, error } = await db
        .from('inventory_laptops')
        .select('*')
        .eq('status', laptopFilter)
        .order('created_at', { ascending: false });

    if (error) {
        grid.innerHTML = `<div style="padding:30px;color:var(--danger);">Failed to load laptops.</div>`;
        return;
    }
    renderLaptops(data || []);
}

function renderLaptops(rows) {
    const grid = document.getElementById('laptopGrid');
    if (!rows.length) {
        grid.innerHTML = `<div class="empty-state">
            <div class="empty-state-icon">💻</div>
            <div>${laptopFilter === 'sold' ? 'No laptops sold yet.' : 'No laptops in stock. Click "💻 Add Laptop" to start.'}</div>
          </div>`;
        return;
    }
    grid.innerHTML = rows.map(r => {
        const specs = [r.cpu, r.ram, r.storage].filter(Boolean).map(escapeHtml).join(' • ');
        return `
      <div class="ticket-card">
        ${r.photo_url
            ? `<img src="${escapeHtml(r.photo_url)}" alt="" style="width:100%;height:150px;object-fit:cover;border-radius:8px;margin-bottom:10px;" />`
            : `<div style="width:100%;height:150px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:10px;font-size:38px;">💻</div>`}
        <div class="ticket-card-header">
          <span class="ticket-num">${escapeHtml(r.title)}</span>
          ${r.condition ? `<span class="badge">${escapeHtml(r.condition)}</span>` : ''}
        </div>
        <div class="ticket-card-device">${escapeHtml([r.brand, r.model].filter(Boolean).join(' ')) || '—'}</div>
        <div class="ticket-card-issue">${specs || 'No specs recorded'}</div>
        ${r.notes ? `<div class="text-muted" style="font-size:12px;margin-top:6px;">${escapeHtml(r.notes)}</div>` : ''}
        <div class="ticket-card-footer">
          <span class="ticket-price">${fmtPrice(r.price)}</span>
          <div class="ticket-card-actions"></div>
        </div>
      </div>`;
    }).join('');
}
```

- [ ] **Step 2: Implement the laptop modal and save**

```javascript
function openLaptopModal(id) {
    editingLaptopId = id || null;
    document.getElementById('laptopModalTitle').textContent = id ? '💻 Edit Laptop' : '💻 Add Laptop';
    document.getElementById('lapTitleErr').classList.add('hidden');

    if (!id) {
        ['lapTitle','lapBrand','lapModel','lapCpu','lapRam','lapStorage','lapPrice','lapNotes']
            .forEach(f => { document.getElementById(f).value = ''; });
        document.getElementById('lapCondition').value = '';
        document.getElementById('lapPhoto').value = '';
    }
    document.getElementById('laptopModal').classList.remove('hidden');
}

async function saveLaptop() {
    const title = document.getElementById('lapTitle').value.trim();
    const errEl = document.getElementById('lapTitleErr');

    if (!title) {
        errEl.classList.remove('hidden');
        return;
    }
    errEl.classList.add('hidden');

    const priceRaw = document.getElementById('lapPrice').value.trim();
    const payload = {
        title,
        brand:     document.getElementById('lapBrand').value.trim() || null,
        model:     document.getElementById('lapModel').value.trim() || null,
        cpu:       document.getElementById('lapCpu').value.trim() || null,
        ram:       document.getElementById('lapRam').value.trim() || null,
        storage:   document.getElementById('lapStorage').value.trim() || null,
        condition: document.getElementById('lapCondition').value || null,
        notes:     document.getElementById('lapNotes').value.trim() || null,
        price:     priceRaw === '' ? null : Number(priceRaw),
    };

    const btn = document.getElementById('saveLaptopBtn');
    btn.disabled = true;
    const wasEditing = editingLaptopId;
    try {
        let error;
        if (wasEditing) {
            ({ error } = await db.from('inventory_laptops').update(payload).eq('id', wasEditing));
        } else {
            payload.created_by = currentUser.id;
            ({ error } = await db.from('inventory_laptops').insert(payload));
        }
        if (error) throw error;

        // Only clear the edit id on success. Clearing it on failure would turn
        // a retry into an INSERT, silently duplicating the row.
        editingLaptopId = null;
        closeModal('laptopModal');
        await loadLaptops();
        showToast(wasEditing ? '✅ Laptop updated!' : '✅ Laptop added!', 'success');
    }
    catch (err) {
        showToast(err.message || 'Failed to save laptop', 'error');
    }
    finally {
        btn.disabled = false;
    }
}
```

- [ ] **Step 3: Wire buttons and the In Stock / Sold filter**

Add inside `bindEvents()`:

```javascript
    document.getElementById('addLaptopBtn')?.addEventListener('click', () => openLaptopModal(null));
    document.getElementById('saveLaptopBtn')?.addEventListener('click', saveLaptop);
    document.getElementById('cancelLaptopBtn')?.addEventListener('click', () => closeModal('laptopModal'));
    document.getElementById('closeLaptopModal')?.addEventListener('click', () => closeModal('laptopModal'));

    document.querySelectorAll('#laptopFilter .status-tab').forEach(tab => {
        tab.addEventListener('click', async () => {
            document.querySelectorAll('#laptopFilter .status-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            laptopFilter = tab.dataset.filter;
            await loadLaptops();
        });
    });
```

- [ ] **Step 4: Verify in the browser**

1. Reload. Expected: Laptops card shows the empty state with the 💻 icon.
2. **💻 Add Laptop** → leave Title blank → Save. Expected: "Title is required", nothing saved.
3. Add title `Dell Latitude 7490`, brand `Dell`, model `7490`, CPU `i5-8350U`, RAM `8GB DDR4`, storage `256GB NVMe`, condition `Good`, price `1200` → Save. Expected: card appears with 💻 placeholder, specs joined by `•`, `RM 1200.00`, `Good` badge.
4. Add a laptop with only a title. Expected: card shows `—` for brand/model, "No specs recorded", price `—`. No crash on the empty fields.
5. Click the **Sold** tab. Expected: "No laptops sold yet." Click **In Stock**. Expected: laptops return.
6. Reload. Expected: everything persists.

- [ ] **Step 5: Commit**

```bash
git add inventory.js
git commit -m "Add used laptop listing and creation"
```

---

### Task 8: Laptops — photo upload

**Files:**
- Modify: `inventory.js` (extend `saveLaptop()` from Task 7)

**Interfaces:**
- Consumes: `saveLaptop()` from Task 7.
- Produces: `uploadLaptopPhoto(file)` returning `Promise<string|null>` — the public URL, or `null` if upload failed.

Reuses the existing `ticket-photos` Storage bucket with an `inventory/` prefix, mirroring `dashboard.js:571-578`. No new bucket or storage policy is required.

- [ ] **Step 1: Add the upload helper**

```javascript
async function uploadLaptopPhoto(file) {
    const ext = file.name.split('.').pop();
    const path = `inventory/${Date.now()}.${ext}`;
    const { error: uploadErr } = await db.storage
        .from('ticket-photos')
        .upload(path, file, { cacheControl: '3600', upsert: false });
    if (uploadErr) {
        showToast('Photo upload failed — saving without photo', 'error');
        return null;
    }
    const { data: urlData } = db.storage.from('ticket-photos').getPublicUrl(path);
    return urlData.publicUrl;
}
```

A failed upload returns `null` rather than throwing, so the laptop still saves. Losing a photo must never lose the stock record.

- [ ] **Step 2: Call it from saveLaptop**

In `saveLaptop()`, immediately after `btn.disabled = true;` and inside the `try` block, before the insert/update:

```javascript
        const fileInput = document.getElementById('lapPhoto');
        if (fileInput.files && fileInput.files.length > 0) {
            btn.textContent = 'Uploading photo...';
            const url = await uploadLaptopPhoto(fileInput.files[0]);
            if (url) payload.photo_url = url;
        }
```

And in the `finally` block, restore the label:

```javascript
        btn.textContent = '💾 Save Laptop';
```

- [ ] **Step 3: Verify in the browser**

1. Add a laptop with a photo. Expected: button reads "Uploading photo...", then the card shows the real image, not the 💻 placeholder.
2. Reload. Expected: photo still displays (the URL resolves from Storage).
3. Add a laptop with no photo. Expected: saves normally with the placeholder, no upload attempted.
4. Supabase Dashboard → Storage → `ticket-photos`. Expected: an `inventory/` folder containing the file, with existing ticket photos untouched.

- [ ] **Step 4: Commit**

```bash
git add inventory.js
git commit -m "Add photo upload for inventory laptops"
```

---

### Task 9: Laptops — edit, mark sold, delete

**Files:**
- Modify: `inventory.js`

**Interfaces:**
- Consumes: `renderLaptops()`, `openLaptopModal(id)`, `loadLaptops()` from Task 7.
- Produces: `editLaptop(id)`, `markSold(id)`, `unmarkSold(id)`, `deleteLaptop(id)` — all exposed on `window`.

- [ ] **Step 1: Add action buttons to the card template**

Replace the empty `<div class="ticket-card-actions"></div>` in `renderLaptops` with:

```javascript
          <div class="ticket-card-actions">
            <button class="btn btn-secondary btn-sm" onclick="editLaptop('${r.id}')">✏️</button>
            ${r.status === 'in_stock'
                ? `<button class="btn btn-primary btn-sm" onclick="markSold('${r.id}')">💰 Sold</button>`
                : `<button class="btn btn-secondary btn-sm" onclick="unmarkSold('${r.id}')">↩️ Restock</button>`}
            <button class="btn btn-danger btn-sm" onclick="deleteLaptop('${r.id}')">🗑️</button>
          </div>
```

- [ ] **Step 2: Implement the actions**

```javascript
async function editLaptop(id) {
    const { data, error } = await db.from('inventory_laptops').select('*').eq('id', id).single();
    if (error || !data) {
        showToast('Failed to load laptop', 'error');
        return;
    }
    document.getElementById('lapTitle').value     = data.title || '';
    document.getElementById('lapBrand').value     = data.brand || '';
    document.getElementById('lapModel').value     = data.model || '';
    document.getElementById('lapCpu').value       = data.cpu || '';
    document.getElementById('lapRam').value       = data.ram || '';
    document.getElementById('lapStorage').value   = data.storage || '';
    document.getElementById('lapCondition').value = data.condition || '';
    document.getElementById('lapPrice').value     = data.price ?? '';
    document.getElementById('lapNotes').value     = data.notes || '';
    document.getElementById('lapPhoto').value     = '';
    openLaptopModal(id);
}

async function markSold(id) {
    if (!confirm('Mark this laptop as sold?\n\nIt will move to the Sold list.')) return;
    const { error } = await db.from('inventory_laptops')
        .update({ status: 'sold', sold_at: new Date().toISOString() })
        .eq('id', id);
    if (error) {
        showToast('Failed to mark as sold', 'error');
        return;
    }
    await loadLaptops();
    showToast('💰 Marked as sold!', 'success');
}

async function unmarkSold(id) {
    const { error } = await db.from('inventory_laptops')
        .update({ status: 'in_stock', sold_at: null })
        .eq('id', id);
    if (error) {
        showToast('Failed to restock', 'error');
        return;
    }
    await loadLaptops();
    showToast('↩️ Back in stock', 'success');
}

async function deleteLaptop(id) {
    if (!confirm('Delete this laptop from inventory?\n\nThis cannot be undone.')) return;
    const { error } = await db.from('inventory_laptops').delete().eq('id', id);
    if (error) {
        showToast('Failed to delete laptop', 'error');
        return;
    }
    await loadLaptops();
    showToast('🗑️ Laptop deleted', 'success');
}
```

- [ ] **Step 3: Expose to window**

```javascript
window.editLaptop = editLaptop;
window.markSold = markSold;
window.unmarkSold = unmarkSold;
window.deleteLaptop = deleteLaptop;
```

- [ ] **Step 4: Verify in the browser**

1. ✏️ on a laptop. Expected: modal pre-filled, title "Edit Laptop". Change price → Save → card updates, no duplicate created.
2. Edit a laptop that has a photo, save **without** choosing a new file. Expected: the existing photo is still there — editing must not wipe it.
3. **💰 Sold** → Cancel. Expected: nothing changes. **💰 Sold** → OK. Expected: card leaves In Stock, toast appears.
4. **Sold** tab. Expected: the laptop is listed, with a **↩️ Restock** button instead of Sold.
5. Verify `sold_at` was set — Supabase → Table Editor → `inventory_laptops`. Expected: a timestamp, not null.
6. **↩️ Restock**. Expected: returns to In Stock and `sold_at` is null again.
7. 🗑️ → OK. Expected: card disappears.

- [ ] **Step 5: Commit**

```bash
git add inventory.js
git commit -m "Add laptop edit, mark sold, restock and delete"
```

---

### Task 10: Full regression pass and cleanup

**Files:**
- None (verification only)

- [ ] **Step 1: Re-test every existing page**

The sidebar change and the helper move touch every dashboard page. Confirm nothing regressed:

1. `dashboard.html` — ticket table loads, zero console errors.
2. Create a new ticket end to end. Expected: succeeds, toast appears.
3. Update a ticket's status with a note. Expected: succeeds, note saved in history.
4. Upload a ticket photo. Expected: succeeds.
5. Generate a diagnose report PDF preview. Expected: opens.
6. Export to Excel. Expected: file downloads.
7. `status.html` — look up a real ticket number. Expected: timeline shows.
8. `index.html` — homepage loads, products and services render.
9. Sign out from any page. Expected: redirects to `login.html`.

- [ ] **Step 2: Delete test data**

`config.js` points at production, so the rows created while testing are real. Remove them via the Inventory page (🗑️ on each) or Supabase Table Editor. Also delete test images from Storage → `ticket-photos` → `inventory/`.

- [ ] **Step 3: Confirm main is untouched**

```bash
git status
git log main --oneline -1
```

Expected: clean tree on `feature/inventory`; `main` still at `a8eb4ab`.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "Complete inventory feature"
```

Do **not** merge to `main` or push without explicit approval. Merging publishes to abangpc.com.

---

## Deferred (not in this plan)

Per the spec: parts sales history (`inventory_movements` table), linking parts to repair tickets, publishing stock to the public site, a dedicated storage bucket, and manager-only field restrictions.
