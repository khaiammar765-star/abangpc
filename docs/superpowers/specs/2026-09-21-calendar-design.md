# Calendar — Design Spec

**Date:** 2026-09-21
**Branch:** `feature/calendar` (based on `feature/staff-task`, which it depends on for `escapeHtml` in `system.js` and the `is_superadmin` flag)
**Status:** Approved for implementation

## Purpose

AbangPC wants a shared calendar so staff can see, in one place: which days the shop is closed, what company activities are happening, and who is on approved leave. Staff can apply for leave through it; only AbangPC approves or rejects (with a reason).

Staff-facing feature. No customer-facing side.

## Scope

**In scope**

- A month-grid calendar everyone can view and page through month to month.
- AbangPC posts **shop closures** (custom days the shop is shut — not tied to any public-holiday list) and **activities** (camping, company trips, etc.), each over a single day or a date range.
- Staff **apply for leave** over a date range, with an optional note.
- AbangPC **approves or rejects** leave; a rejection carries a required reason the applicant can read.
- Approved leave, closures, and activities show on the calendar. Pending/rejected leave shows only in a Leave Requests list, not on the grid.

**Out of scope**

- Public-holiday auto-population. Closures are entered by hand.
- Leave types (annual / sick / emergency) — a single kind of leave with an optional note.
- Notifications of any kind (matches the rest of the app; no infrastructure exists).
- Editing an entry after creation — delete and recreate.
- Recurring events, half-days, attachments, linking to tickets or tasks.
- Multi-approver leave chains — leave has exactly one approver (AbangPC).

## Data model

Two additive tables. Leave has its own approval shape, so it is separate from the owner-posted events (the same two-shapes-two-tables reasoning used for inventory and tasks).

### `calendar_events`

Owner-posted closures and activities. One row per entry.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | default `gen_random_uuid()` |
| `event_type` | text, not null | `closure` or `activity` (check constraint) |
| `title` | text, not null | shown on the day cell |
| `description` | text, nullable | optional detail |
| `start_date` | date, not null | first day |
| `end_date` | date, not null | last day (equals start_date for a single day) |
| `created_by` | uuid, not null | FK to `users(id)` |
| `created_at` | timestamptz, not null | default `now()` |

### `staff_leave`

Leave applications. One row per request.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | default `gen_random_uuid()` |
| `staff_id` | uuid, not null | FK to `users(id)` — the applicant |
| `start_date` | date, not null | first day off |
| `end_date` | date, not null | last day off |
| `note` | text, nullable | applicant's optional reason |
| `status` | text, not null | `pending` / `approved` / `rejected`, default `pending` |
| `decision_reason` | text, nullable | required when rejected; AbangPC's reason |
| `decided_by` | uuid, nullable | FK to `users(id)` |
| `decided_at` | timestamptz, nullable | when decided |
| `created_at` | timestamptz, not null | default `now()` |

## Permissions (enforced in the page, backed by RLS)

Same model as the rest of the app: RLS grants the `authenticated` role full access; the page enforces the finer rules. Identity is the Supabase Auth login; the superadmin is identified by the existing `users.is_superadmin` flag (AbangPC).

- **Add / delete closures and activities:** superadmin only. Buttons hidden and guarded for others.
- **Approve / reject leave:** superadmin only.
- **Apply for leave:** any signed-in staff, for themselves.
- **Delete own pending leave:** the applicant may withdraw a request while it is still pending.
- **View:** any signed-in staff sees the whole calendar and every leave request's status; each staff sees their own requests, and the superadmin sees all.

This is the same accepted limitation documented for tasks: workflow is UI-enforced over broad RLS, acceptable because all staff are trusted managers.

## User interface

New files `calendar.html` and `calendar.js`, following the conventions of `task.html` / `task.js`:

- Guarded by `SystemApp.requireManager()` on load.
- Sidebar rendered via `SystemApp.renderSidebar(user, 'calendar')`.
- Reuses `system.css`, `SystemApp.escapeHtml`, `showToast`, `closeModal`, `formatDate`.

### Navigation

A new item added to `renderSidebar()` under Management, after Inventory:

```html
<a href="calendar.html" class="nav-item ${activePage === 'calendar' ? 'active' : ''}">
  <span class="nav-item-icon">📅</span> Calendar
</a>
```

### Page layout

**Top — month grid.**
- A 7-column grid (Mon–Sun) for the visible month, with prev/next-month buttons and the month/year label.
- Each day cell shows its date and any entries overlapping that day: 🔴 closure, 🔵 activity, 🟢 approved leave (with the staff name). An entry spanning several days appears on each day it covers.
- Today's cell is highlighted.
- A superadmin sees an "➕ Add Event" button (choose closure or activity, title, description, date range).

**Bottom — Leave Requests.**
- An "🌴 Apply for Leave" button (any staff): date range + optional note.
- A list of requests. A normal staff member sees only their own, with status and, if rejected, the reason. The superadmin sees all `pending` requests with **Approve** / **Reject** buttons (Reject opens the shared reason modal; a blank reason is refused), plus the decided ones for reference.

### Modals
- **Event modal** (superadmin): type (closure/activity), title (required), description, start date, end date.
- **Leave modal** (any staff): start date, end date, optional note.
- **Reason modal** (superadmin, on reject): the same reason-capture modal pattern as tasks.

## Behaviour

- **Only approved leave reaches the grid.** Pending and rejected requests live in the list, keeping the calendar trustworthy.
- **Date ranges** render across every covered day. `end_date` must be on or after `start_date`; the apply/add forms validate this before submit.
- **Reject requires a reason;** approve does not. A guarded update writes the decision only if the request is still `pending`, so two tabs cannot double-decide.
- **Withdraw:** a staff member deleting their own request is allowed only while `status = 'pending'`.

## Error handling

- Failed loads: inline error in the relevant section, matching the other pages.
- Failed writes: `showToast(msg, 'error')`.
- Required-field and date-order validation before submit, with inline messages.
- Concurrent decisions guarded on `status = 'pending'`, reloading with a notice if the guard matches nothing (same pattern as inventory/tasks).

## Performance and impact

- **DB resource:** negligible. Closures, activities, and leave are a handful of small date/text rows per year — kilobytes against a 500 MB free tier.
- **Speed:** the calendar page loads only its own two small tables, filtered to the visible month; it never touches tickets, inventory, or tasks, so no existing page is affected.
- **Existing features:** purely additive — two new tables, one new page, one sidebar line. No existing table or code path changes.
- The Supabase free-tier pause is driven by inactivity, not data size, so this feature neither raises nor lowers that risk.

## Testing

Manual, against production Supabase (all staff are managers, so different logins can be used).

1. Superadmin adds a single-day closure; it appears on that day in 🔴.
2. Superadmin adds a multi-day activity; it appears on every covered day in 🔵.
3. A non-superadmin does not see the "Add Event" button.
4. Staff applies for leave over a range with a note; it appears in their Leave Requests as pending; it does **not** appear on the grid yet.
5. Superadmin sees the pending request, Approves it; it now shows on the grid in 🟢 with the staff name across the range.
6. Superadmin Rejects another request; a blank reason is refused; with a reason, the applicant sees status rejected and the reason.
7. Applicant withdraws (deletes) a still-pending request; an approved/rejected one offers no withdraw.
8. Month navigation moves forward and back; entries show in the correct months; today is highlighted.
9. A range where end_date is before start_date is refused in both the event and leave forms.
10. Existing pages unaffected: dashboard, tasks, inventory, status, sign-out all still work.

## Rollback

**Code:** all work on `feature/calendar`; `main` untouched until a deliberate merge.

**Database:**

```sql
drop table if exists public.staff_leave;
drop table if exists public.calendar_events;
```

No existing table is altered.

## Deferred (not in this version)

Public-holiday auto-population, leave types, notifications, editing entries, recurring events, half-days, and multi-approver leave.
