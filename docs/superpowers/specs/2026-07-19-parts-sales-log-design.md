# Parts Sales Log — Design Spec

**Date:** 2026-07-19
**Branch:** `feature/inventory`
**Status:** Approved for implementation
**Follows:** `2026-07-19-inventory-design.md`

## Purpose

The inventory feature's Sold tab filters laptops but not parts, because parts have no record of being sold. Clicking `−` decrements `inventory_items.quantity` and discards everything else — what sold, when, and who sold it.

This adds a sales log so the Sold tab shows parts alongside laptops.

## Scope

**In scope**

- A new `inventory_sales` table, one row per `−` click.
- The Sold tab lists sold parts as well as sold laptops.
- Sale rows survive deletion of the part they came from.

**Out of scope**

- Reasons for stock leaving (sold vs. used-in-repair vs. damaged). Every `−` is recorded as a sale. Explicitly declined by the user to avoid adding steps to the staff workflow.
- Logging `+`. That is restocking, not selling, and is not recorded.
- Quantity changes made through the edit modal. See "Known gap" below.
- Editing or voiding a recorded sale.
- Revenue totals, charts, or reporting built on this data.

## Data model

### `inventory_sales`

One row per `−` click. Quantity is always 1, since `−` decrements by one.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | default `gen_random_uuid()` |
| `item_id` | uuid, nullable | FK to `inventory_items(id)` `on delete set null` |
| `item_name` | text, not null | snapshot at time of sale |
| `item_category` | text, not null | snapshot at time of sale |
| `quantity` | integer, not null | default 1 |
| `price` | numeric, nullable | snapshot at time of sale; null if the part had no price |
| `sold_by` | uuid, nullable | FK to `users(id)` |
| `sold_at` | timestamptz, not null | default `now()` |

**Why snapshot the name, category and price.** A sale is a historical fact. If a part is renamed, repriced, or deleted, past sales must still read correctly. `item_id` is kept as a nullable link for future grouping, but no display depends on it — `on delete set null` means deleting a part leaves its sales intact and readable.

## Security

RLS enabled, matching the two existing inventory tables: full access for the `authenticated` role, nothing for anon.

## Behaviour

### Recording a sale

`adjustQty(id, -1)` currently reads the row, clamps at zero, and updates. It gains one step: after a successful decrement, insert a row into `inventory_sales` snapshotting the part's `name`, `category` and `price`, with `sold_by = currentUser.id`.

Order matters. The decrement happens first; the log is written only if it succeeded. A failed log does not roll back the decrement — it shows an error toast and leaves stock correct. Stock accuracy is what staff act on daily; a missing log line is the lesser loss.

The `−` button remains disabled at quantity 0, so no sale is recorded for stock that is not there.

### Displaying sold parts

`loadItems()` currently ignores the laptop filter. It becomes filter-aware:

- **In Stock** — unchanged: current stock from `inventory_items`.
- **Sold** — reads `inventory_sales` ordered by `sold_at` descending, showing name, category, price, when, and who.

The parts table header changes with the tab, since the two views show different columns:

- In Stock: Name · Category · Quantity · Price · Notes · actions
- Sold: Name · Category · Qty · Price · Sold · By

Row actions (`−`, `+`, edit, delete) appear only in the In Stock view. Sold rows are history and are not editable.

The existing `#laptopFilter` tabs drive both sections. Because they now control the whole page rather than just laptops, they move out of the Laptops card header into the page toolbar, and `laptopFilter` is renamed `stockFilter` to match what it does.

## Known gap

Editing a part's quantity through the ✏️ modal writes the new number directly and logs nothing. A staff member could reduce stock from 5 to 2 there and record no sale.

Accepted for this version. The edit modal is for correcting mistakes, not for selling, and `−` is the fast path staff will use. Closing this gap would mean either logging edit-time decreases as sales (wrong — corrections are not sales) or removing quantity from the edit form (worse — mistakes then become uncorrectable). Worth revisiting only if the numbers drift in practice.

## Error handling

- Failed sales-log insert: error toast, stock change stands.
- Failed load of `inventory_sales`: inline error row in the table body, matching the existing `loadItems` failure path.
- Empty sold list: "No parts sold yet."

## Testing

Manual, against production Supabase, consistent with the existing inventory work:

1. Click `−` on a part with a price. Confirm quantity drops by one and the Sold tab shows one row with the correct name, category, price, timestamp and staff name.
2. Click `−` on a part with no price. Confirm the sold row shows `—` for price, not `RM 0.00`.
3. Click `+`. Confirm no new sold row appears.
4. Sell the same part three times. Confirm three separate rows.
5. Delete the part from stock. Confirm its sold rows remain and still show the name and category.
6. Confirm `−` is disabled at quantity 0 and records nothing.
7. Switch tabs repeatedly. Confirm laptops and parts both follow the filter and the table header changes.
8. Confirm the In Stock view is unchanged from before this feature.

## Rollback

**Code:** all work on `feature/inventory`; `main` unaffected.

**Database:**

```sql
drop table if exists public.inventory_sales;
```

`inventory_items` and `inventory_laptops` are not modified by this feature — no column is added, altered, or dropped — so this rollback returns the database to its post-inventory state exactly.
