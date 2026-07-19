# Parts Sales Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every `−` click as a sale so the Sold tab shows sold parts alongside sold laptops.

**Architecture:** One new additive table, `inventory_sales`, written to by `adjustQty()` after a successful decrement. The existing In Stock / Sold tabs move from the Laptops card header to the page toolbar and drive both sections; `loadItems()` becomes filter-aware and renders two different table shapes.

**Tech Stack:** Plain ES2017+ JavaScript (no build step), Supabase JS v2 via CDN, Supabase Auth, existing `system.css`.

## Global Constraints

- **Branch:** all work on `feature/inventory`. Never commit to `main`.
- **Database changes are additive only.** Only `CREATE TABLE`, `CREATE POLICY`, `CREATE INDEX` on `inventory_sales`. Never `ALTER` or `DROP` on any existing table, including `inventory_items` and `inventory_laptops`.
- **Every `−` is a sale.** No reason prompt, no extra staff step. Explicitly decided by the user.
- **`+` logs nothing.** That is restocking.
- **Stock accuracy beats log completeness.** If the decrement succeeds but the log insert fails, keep the decrement and show an error toast. Never roll back stock to preserve a log line.
- **Sold rows are history.** No edit, delete, `−` or `+` actions in the Sold view.
- **Price display:** `RM` prefix, two decimals. A part with no price shows `—`, never `RM 0.00`.
- **No TypeScript, no new CSS file.** Reuse `system.css` classes; inline `style=""` for one-off layout matches the existing code.
- **No test framework exists.** Each task ends with explicit manual browser verification via VS Code Live Server on `http://127.0.0.1:5500`.
- **`config.js` points at production.** Test data is real data; delete it afterwards.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `inventory.html` | Modify | Move filter tabs to page toolbar; give the parts `<thead>` an id so it can change per tab |
| `inventory.js` | Modify | Log sales in `adjustQty`; rename `laptopFilter` → `stockFilter`; split parts rendering into stock and sold views |
| `docs/superpowers/plans/inventory-rollback.sql` | Modify | Add the new table to the rollback script |

---

### Task S1: Create the inventory_sales table

**Files:**
- None (SQL run in the Supabase dashboard)
- Modify: `docs/superpowers/plans/inventory-rollback.sql`

**Interfaces:**
- Produces: table `inventory_sales` with columns `id`, `item_id`, `item_name`, `item_category`, `quantity`, `price`, `sold_by`, `sold_at`, used by Tasks S2 and S3.

- [ ] **Step 1: Read the SQL before running it**

Confirm by eye that it names only `inventory_sales`, and contains no `drop`, `alter`, `truncate`, or `delete`.

- [ ] **Step 2: Run the setup SQL**

Supabase Dashboard → **SQL Editor** → New query → paste → **Run**.

```sql
-- One row per "−" click on a part
create table if not exists public.inventory_sales (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid references public.inventory_items(id) on delete set null,
  item_name      text not null,
  item_category  text not null,
  quantity       integer not null default 1,
  price          numeric,
  sold_by        uuid references public.users(id),
  sold_at        timestamptz not null default now()
);

create index if not exists inventory_sales_sold_at_idx
  on public.inventory_sales (sold_at desc);

alter table public.inventory_sales enable row level security;

create policy "staff_full_access_sales" on public.inventory_sales
  for all to authenticated using (true) with check (true);
```

Expected: `Success. No rows returned`.

`on delete set null` is what lets a part be deleted without destroying its sales history. `item_name` and `item_category` are snapshots, so the row still reads correctly afterwards.

- [ ] **Step 3: Verify the table exists and is protected**

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename = 'inventory_sales';
```

Expected: one row, `rowsecurity = true`.

- [ ] **Step 4: Verify the foreign key name**

Task S3 joins `users` using an explicit constraint name. Confirm it matches:

```sql
select conname from pg_constraint
where conrelid = 'public.inventory_sales'::regclass and contype = 'f';
```

Expected to include `inventory_sales_sold_by_fkey`. If the name differs, use the actual name in Task S3's `select` string.

- [ ] **Step 5: Update the rollback script**

Replace the contents of `docs/superpowers/plans/inventory-rollback.sql`:

```sql
-- =============================================
-- INVENTORY ROLLBACK
-- =============================================
-- Undoes the inventory feature's database setup.
--
-- WARNING: destroys all inventory data (laptops, parts, sales).
-- Everything else is untouched: tickets, customers, users,
-- ticket_comments, ticket_photos, ticket_status_history,
-- diagnose_reports and diagnose_laptop_reports are never
-- referenced here.
--
-- Run in: Supabase Dashboard -> SQL Editor
-- =============================================

-- Drop sales first: it references inventory_items.
drop table if exists public.inventory_sales;
drop table if exists public.inventory_laptops;
drop table if exists public.inventory_items;
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/plans/inventory-rollback.sql
git commit -m "Add inventory_sales to rollback script"
```

---

### Task S2: Log a sale on every decrement

**Files:**
- Modify: `inventory.js` (`adjustQty`)

**Interfaces:**
- Consumes: `inventory_sales` from Task S1; `currentUser`, `showToast`, `loadItems` already in `inventory.js`.
- Produces: `adjustQty(id, delta)` with unchanged signature — Task S3 does not alter it.

- [ ] **Step 1: Replace adjustQty**

The current version reads `quantity` only. It now reads the fields it must snapshot, and logs after a successful decrement.

```javascript
async function adjustQty(id, delta) {
    const { data: row, error: readErr } = await db
        .from('inventory_items')
        .select('quantity, name, category, price')
        .eq('id', id)
        .single();
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

    // A decrement is a sale. Log it with a snapshot of the part, so the record
    // still reads correctly if the part is later renamed, repriced or deleted.
    // Stock has already changed successfully at this point: if the log fails we
    // report it but keep the stock change, because stock is what staff act on.
    if (delta < 0) {
        const { error: logErr } = await db.from('inventory_sales').insert({
            item_id: id,
            item_name: row.name,
            item_category: row.category,
            quantity: 1,
            price: row.price ?? null,
            sold_by: currentUser.id,
        });
        if (logErr)
            showToast('Stock updated, but the sale was not logged', 'error');
    }

    await loadItems();
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check inventory.js`
Expected: no output (success).

- [ ] **Step 3: Verify in the browser**

Live Server → `inventory.html`, logged in as manager.

1. Click `−` on a part that has a price. Expected: quantity drops by one, no error toast.
2. Supabase → Table Editor → `inventory_sales`. Expected: one new row with the correct `item_name`, `item_category`, `price`, a `sold_by` matching your user id, and a `sold_at` timestamp.
3. Click `+` on the same part. Expected: quantity rises, and **no** new row appears in `inventory_sales`.
4. Click `−` on a part with **no** price. Expected: new row with `price` = null (shown as empty in the table editor), not 0.
5. Reduce a part to quantity 0. Expected: `−` becomes disabled and no further rows are logged.

- [ ] **Step 4: Commit**

```bash
git add inventory.js
git commit -m "Log every parts decrement as a sale"
```

---

### Task S3: Show sold parts under the Sold tab

**Files:**
- Modify: `inventory.html` (move filter tabs to the toolbar; add `id="itemsHead"` to the parts `<thead>`)
- Modify: `inventory.js` (rename `laptopFilter` → `stockFilter`; split parts rendering)

**Interfaces:**
- Consumes: `inventory_sales` from Task S1; `fmtPrice()`, `escapeHtml()`, `CATEGORY_LABELS`, `SystemApp.formatDateTime()`.
- Produces: `stockFilter` (module-level string, `'in_stock'` or `'sold'`), `loadItems()`, `renderItemsStock(rows)`, `renderItemsSold(rows)`.

- [ ] **Step 1: Move the filter tabs into the page toolbar**

In `inventory.html`, remove the tabs from the Laptops card header so it reads:

```html
        <div class="card-header">
          <span class="card-title">💻 Used Laptops</span>
        </div>
```

Then add the tabs as the first element inside `<div class="page-content">`, above the Laptops card:

```html
      <!-- PAGE-WIDE FILTER -->
      <div class="status-tabs" id="stockFilter" style="margin-bottom:18px;">
        <button class="status-tab active" data-filter="in_stock">In Stock</button>
        <button class="status-tab" data-filter="sold">Sold</button>
      </div>
```

The id changes from `laptopFilter` to `stockFilter` because it now controls the whole page.

- [ ] **Step 2: Give the parts table head an id**

In `inventory.html`, change the parts `<thead>` opening tag so its contents can be swapped per tab:

```html
            <thead id="itemsHead">
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Quantity</th>
                <th>Price</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
```

- [ ] **Step 3: Rename the state variable**

In `inventory.js`, change the declaration near the top:

```javascript
let stockFilter = 'in_stock';
```

Then update its three other uses — two in `loadLaptops`/`renderLaptops`, one in the tab handler. Verify none remain:

Run: `grep -n "laptopFilter" inventory.js`
Expected: no output.

In `loadLaptops`, the query line becomes:

```javascript
        .eq('status', stockFilter)
```

In `renderLaptops`, the empty-state line becomes:

```javascript
            <div>${stockFilter === 'sold' ? 'No laptops sold yet.' : 'No laptops in stock. Click "💻 Add Laptop" to start.'}</div>
```

- [ ] **Step 4: Update the tab handler to refresh both sections**

In `bindEvents()`, replace the filter block:

```javascript
    // In Stock / Sold filter — drives both laptops and parts
    document.querySelectorAll('#stockFilter .status-tab').forEach(tab => {
        tab.addEventListener('click', async () => {
            document.querySelectorAll('#stockFilter .status-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            stockFilter = tab.dataset.filter;
            await Promise.all([loadLaptops(), loadItems()]);
        });
    });
```

- [ ] **Step 5: Make loadItems filter-aware**

Replace `loadItems` in `inventory.js`:

```javascript
async function loadItems() {
    const tbody = document.getElementById('itemsBody');
    const thead = document.getElementById('itemsHead');
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--muted);">Loading...</td></tr>`;

    if (stockFilter === 'sold') {
        thead.innerHTML = `<tr><th>Name</th><th>Category</th><th>Qty</th><th>Price</th><th>Sold</th><th>By</th></tr>`;
        const { data, error } = await db
            .from('inventory_sales')
            .select('*, seller:users!inventory_sales_sold_by_fkey(full_name)')
            .order('sold_at', { ascending: false });
        if (error) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--danger);">Failed to load sales.</td></tr>`;
            return;
        }
        renderItemsSold(data || []);
        return;
    }

    thead.innerHTML = `<tr><th>Name</th><th>Category</th><th>Quantity</th><th>Price</th><th>Notes</th><th></th></tr>`;
    const { data, error } = await db
        .from('inventory_items')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });
    if (error) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--danger);">Failed to load parts.</td></tr>`;
        return;
    }
    renderItemsStock(data || []);
}
```

- [ ] **Step 6: Rename renderItems and add the sold renderer**

Rename the existing `renderItems` to `renderItemsStock` — its body is unchanged. Then add below it:

```javascript
function renderItemsSold(rows) {
    const tbody = document.getElementById('itemsBody');
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--muted);">No parts sold yet.</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${escapeHtml(r.item_name)}</td>
        <td><span class="badge">${CATEGORY_LABELS[r.item_category] || escapeHtml(r.item_category)}</span></td>
        <td><strong>${r.quantity}</strong></td>
        <td>${fmtPrice(r.price)}</td>
        <td class="text-muted">${SystemApp.formatDateTime(r.sold_at)}</td>
        <td class="text-muted">${escapeHtml(r.seller?.full_name) || '—'}</td>
      </tr>
    `).join('');
}
```

Sold rows carry no action buttons — they are history, not editable stock.

- [ ] **Step 7: Verify the rename is complete and syntax is valid**

```bash
node --check inventory.js
grep -n "laptopFilter\|renderItems(" inventory.js
```

Expected: `node --check` silent; `grep` returns nothing (`renderItems(` must not appear — only `renderItemsStock(` and `renderItemsSold(`).

- [ ] **Step 8: Verify in the browser**

1. Load `inventory.html`. Expected: In Stock / Sold tabs sit at the **top of the page**, not inside the Laptops card. In Stock is active.
2. In Stock view. Expected: identical to before — parts table has Name, Category, Quantity, Price, Notes and action buttons.
3. Click **Sold**. Expected: laptops show sold laptops; the parts table header changes to Name, Category, Qty, Price, Sold, By; rows show your logged sales with timestamp and your name.
4. Confirm sold rows have **no** `−`, `+`, ✏️ or 🗑️ buttons.
5. Sell a part with no price, then check the Sold view. Expected: price shows `—`, not `RM 0.00`.
6. Sell the same part three times. Expected: three separate rows.
7. Delete that part from the In Stock view, then return to Sold. Expected: its sale rows are **still there** and still show the name and category. This is the snapshot working.
8. Switch tabs back and forth several times. Expected: both sections stay in step, no console errors.

- [ ] **Step 9: Commit**

```bash
git add inventory.html inventory.js
git commit -m "Show sold parts under the Sold tab"
```

---

### Task S4: Full regression pass and cleanup

**Files:**
- None (verification only)

This absorbs Task 10 of the original inventory plan, which was never completed.

- [ ] **Step 1: Re-test the inventory page end to end**

Parts: add with and without a price; edit; `+`/`−`; delete. Laptops: add with and without a photo; edit a laptop that has a photo **without** re-picking a file and confirm the photo survives; mark sold; restock; delete.

- [ ] **Step 2: Re-test every pre-existing page**

The sidebar change and the `showToast`/`closeModal` move touch all of them:

1. `dashboard.html` loads, zero console errors.
2. Create a ticket end to end.
3. Update a ticket status with a note.
4. Upload a ticket photo.
5. Preview a diagnose report PDF.
6. Export to Excel.
7. `status.html` finds a real ticket number.
8. `index.html` loads with products and services.
9. Sign out redirects to `login.html`.

- [ ] **Step 3: Delete test data**

`config.js` points at production. Remove test rows from `inventory_items`, `inventory_laptops` and `inventory_sales`, and test images from Storage → `ticket-photos` → `inventory/`.

- [ ] **Step 4: Confirm main is untouched**

```bash
git status
git log main --oneline -1
```

Expected: clean tree on `feature/inventory`; `main` still at `a8eb4ab`.

Do **not** merge or push without explicit approval. Merging publishes to abangpc.com.

---

## Deferred (not in this plan)

Per the spec: reasons for stock leaving (sold vs. used-in-repair vs. damaged), logging `+` restocks, logging quantity changes made through the edit modal, editing or voiding a recorded sale, and revenue reporting built on this data.
