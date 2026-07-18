# Inventory — Design Spec

**Date:** 2026-07-19
**Branch:** `feature/inventory`
**Status:** Approved for implementation

## Purpose

AbangPC sells hardware — used laptops, GPUs, RAM, SSDs and other parts — but the system tracks none of it. Stock levels live in staff memory or on paper. This feature adds a stock list to the existing staff dashboard so anyone signed in can see what is available, add new stock, and record when something sells.

Pricing is deliberately optional. Prices at AbangPC are negotiated per sale, not fixed per item, so a price field exists but is never required.

## Scope

**In scope (v1)**

- Two kinds of stock: individual used laptops, and counted parts.
- Staff can add, edit, and delete stock items.
- Laptops can be marked sold; sold laptops are retained as history.
- Parts have a quantity that staff adjust up and down.
- Optional photo per laptop.
- Optional price on any item.

**Out of scope (v1)**

- Per-sale history for parts. Adjusting a quantity changes the number without recording who sold what or when. Adding this later requires a third table logging stock movements; see "Deferred" below.
- Any link between inventory and repair tickets. Parts consumed during repairs are not tracked.
- Any public-facing display. Inventory is staff-only; the homepage product list at `app.js:7` stays hardcoded.
- Purchase cost, supplier, or profit tracking.

## Data model

Two tables, because the two kinds of stock have genuinely different shapes. A used laptop is a specific physical unit with its own condition and photo. A stick of RAM is one of several identical units you count.

### `inventory_laptops`

One row per physical laptop.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | default `gen_random_uuid()` |
| `title` | text, not null | e.g. "Dell Latitude 7490" |
| `brand` | text, nullable | for searching |
| `model` | text, nullable | for searching |
| `cpu` | text, nullable | e.g. "i5-8350U" |
| `ram` | text, nullable | e.g. "8GB DDR4" |
| `storage` | text, nullable | e.g. "256GB NVMe" |
| `condition` | text, nullable | e.g. Like New / Good / Fair |
| `notes` | text, nullable | scratches, missing charger, etc. |
| `photo_url` | text, nullable | Supabase Storage public URL |
| `price` | numeric, nullable | optional, never required |
| `status` | text, not null | `in_stock` or `sold`, default `in_stock` |
| `sold_at` | timestamptz, nullable | set when marked sold |
| `created_at` | timestamptz, not null | default `now()` |
| `created_by` | uuid, nullable | FK to `users.id` |

Spec fields are text rather than structured, because the values are quoted to customers verbatim and vary in format.

### `inventory_items`

Counted parts.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | default `gen_random_uuid()` |
| `name` | text, not null | e.g. "Kingston 8GB DDR4 3200" |
| `category` | text, not null | `gpu`, `ram`, `ssd`, `other` — free text so new categories need no migration |
| `quantity` | integer, not null | default 0, must be >= 0 |
| `notes` | text, nullable | |
| `price` | numeric, nullable | optional |
| `created_at` | timestamptz, not null | default `now()` |
| `created_by` | uuid, nullable | FK to `users.id` |

`category` is free text with a fixed set offered in the UI dropdown plus an "other" option. This lets staff introduce categories without a database change.

## Security

Both tables have RLS enabled. Policies match the existing pattern: authentication is Supabase Auth (`db.auth.getUser()` in `system.js:70`), with the app's `users` table keyed to the auth user id.

- **Database (RLS):** select, insert, update, delete for the `authenticated` role.
- **No public access.** Unlike `tickets`, inventory has no customer-facing page, so the anon role gets nothing.
- **Page guard:** `SystemApp.requireManager()`, matching `dashboard.js:77`.

The page guard is manager-only rather than any-signed-in-staff, so that inventory is not more permissive than the dashboard it sits beside. Loosening it later to `requireAuth()` is a one-word change if technicians should see stock.

Shared functions are reached through the `SystemApp` namespace object (`system.js:401`, exposed at `system.js:416`), not as bare globals.

## User interface

### Navigation

One line added to `renderSidebar()` in `system.js` (after the "New Ticket" entry, around line 163):

```html
<a href="inventory.html" class="nav-item ${activePage === 'inventory' ? 'active' : ''}">
  <span class="nav-item-icon">📦</span> Inventory
</a>
```

`renderSidebar()` is shared by every dashboard page, so this appears everywhere automatically.

### Page structure

New files `inventory.html` and `inventory.js`, following the existing conventions of `dashboard.html` / `dashboard.js`:

- Page guarded by `requireAuth()` on load.
- Sidebar rendered via `renderSidebar(user, 'inventory')`.
- Reuses `system.css` and `style.css`; no new stylesheet.
- Script load order matches existing pages: `config.js`, `system.js`, then `inventory.js`.

### Shared helper refactor (prerequisite)

`showToast()` and `closeModal()` are currently defined in `dashboard.js` (lines 649 and 655), not in the shared `system.js`. Every page loads `system.js` before its own page script, so these two functions move to `system.js` unchanged and are then available to `inventory.js`.

This is a pure move — no behaviour change, no signature change. `dashboard.js` continues to call them exactly as before, because `system.js` is loaded first on every page that uses them (`dashboard.html:895-896`). This must be done before `inventory.js` can use them, and it is the only change this feature makes to existing production code.

Two sections on a single page:

**Laptops** — card grid. Each card shows photo (or placeholder), title, key specs, condition, price if set, and actions: Edit, Mark Sold, Delete. A filter toggles between In Stock (default) and Sold.

**Parts** — table grouped or filterable by category. Columns: name, category, quantity, price if set, actions. Quantity has inline `−` and `+` buttons for fast adjustment as stock moves. Rows at quantity 0 are visually dimmed but not hidden.

Each section has its own "➕ Add" button opening a modal form.

### Photos

Laptop photos reuse the existing `ticket-photos` Supabase Storage bucket with an `inventory/` path prefix. The upload logic mirrors `dashboard.js:554-599`. This avoids any new bucket or storage policy configuration. The bucket name is a poor fit semantically and may be split out later; this is a deliberate trade for zero setup.

## Error handling

- Failed loads show an inline error in the section body, matching `dashboard.js:412`.
- Failed writes surface via `showToast(msg, 'error')`.
- Quantity is clamped at zero; the `−` button is disabled at 0 rather than allowing negatives.
- Required fields (`title` for laptops, `name` and `category` for parts) are validated before submit, with inline field errors.
- Photo upload failures do not block saving the laptop record; the item saves without a photo and the user is told.

## Testing

Manual verification against the production Supabase project, since v1 is additive and staff-only:

1. Add a laptop with all fields; confirm it appears in the In Stock grid.
2. Add a laptop with only a title; confirm nullable fields are handled and no price displays.
3. Upload a photo; confirm it renders and the URL resolves.
4. Edit a laptop; confirm changes persist after reload.
5. Mark a laptop sold; confirm it leaves In Stock, appears under Sold, and `sold_at` is set.
6. Add parts in each category; confirm grouping.
7. Adjust quantity with `−` / `+`; confirm it persists and cannot go below zero.
8. Delete a laptop and a part; confirm removal.
9. Sign out and visit `inventory.html` directly; confirm redirect to `login.html`.
10. Confirm existing dashboard, tickets, and status pages still work — the sidebar change and the `showToast()` / `closeModal()` move both touch every page. Specifically re-test a ticket status update and a photo upload, since both rely on those two helpers.

## Rollback

**Code:** all work is on `feature/inventory`. GitHub Pages publishes only `main`, so nothing reaches abangpc.com until deliberately merged. Revert is `git checkout main`.

**Database:** setup SQL contains only `CREATE TABLE` statements for the two new tables. No existing table (`tickets`, `customers`, `users`, `ticket_comments`, `ticket_photos`, `ticket_status_history`, `diagnose_reports`, `diagnose_laptop_reports`) is named in any statement. Undo:

```sql
drop table if exists inventory_laptops;
drop table if exists inventory_items;
```

A manual database backup is recommended before running the setup SQL, as the Supabase free tier does not provide restore points.

## Deferred

- **Parts sales history.** A `inventory_movements` table (item_id, delta, reason, user_id, created_at) would record every quantity change. Deferred to keep v1 small; the current design does not block it.
- **Linking parts to repair tickets** so stock decrements automatically when a part is used on a job.
- **Publishing stock to the public site**, replacing the hardcoded product list in `app.js:7`.
- **Splitting inventory photos into their own storage bucket.**
- **Manager-only restrictions** on delete or price editing.
