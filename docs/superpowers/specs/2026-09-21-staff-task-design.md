# Staff Task — Design Spec

**Date:** 2026-09-21
**Branch:** `feature/staff-task`
**Status:** Approved for implementation

## Purpose

AbangPC wants to assign work to staff and track it through an approval chain, the way a leave application passes through stages before it is granted. The owner writes a task, assigns it to one staff member (the doer), and names any number of other staff who must verify the work. Once every named approver signs off, the owner gives final acceptance.

This is a staff-facing feature. It has no customer-facing side.

## Scope

**In scope**

- The owner creates tasks manually: title, description, one doer, any number of approvers, a start date and an end date.
- The doer marks a task done, which opens it for approval.
- Named approvers each Approve, Send Back, or Reject, in any order (parallel).
- The task creator gives final acceptance, or Sends Back / Rejects.
- Every staff member sees every task.
- Filter and search: by assignee, by status, free-text on title, and a "Needs my action" toggle.

**Out of scope**

- Email, SMS, or push notifications. There is no notification infrastructure in the app, and none is added. Staff notice pending work through the "Needs my action" filter.
- Roles or permissions beyond what already exists. Every staff account is a manager and can already reach the staff area; no new access tiers.
- Recurring or templated tasks, sub-tasks, checklists, attachments, or comments.
- Linking a task to a repair ticket.
- Editing a task after creation (beyond the workflow actions). A mistaken task is deleted by its creator and recreated.

## Roles within a task

Identity comes from the existing Supabase Auth login. Every staff member logs in as themselves, so the system always knows who acted.

- **Creator** — whoever created the task. This person gives final acceptance. There is no separate "owner" account; the creator *is* the owner for that task. In practice the shop owner creates tasks, but the model does not depend on a special role.
- **Doer** (`assigned_to`) — the one staff member who does the work. Exactly one per task. The doer cannot also be an approver of the same task.
- **Approvers** — zero or more named staff who must verify the work. Order does not matter (parallel approval).

## Data model

Two tables, mirroring the existing `tickets` + `ticket_status_history` pattern.

### `staff_tasks`

One row per task.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | default `gen_random_uuid()` |
| `title` | text, not null | short name of the task |
| `description` | text, nullable | the detail the owner writes |
| `assigned_to` | uuid, not null | FK to `users(id)` — the doer |
| `created_by` | uuid, not null | FK to `users(id)` — the final acceptor |
| `start_date` | date, nullable | planned start |
| `end_date` | date, nullable | due date; drives the overdue flag |
| `status` | text, not null | see status flow; default `in_progress` |
| `reason` | text, nullable | reason attached to the most recent send-back or reject at the task level (owner stage) |
| `created_at` | timestamptz, not null | default `now()` |
| `updated_at` | timestamptz, nullable | set whenever the workflow advances |

`status` is one of: `in_progress`, `awaiting_approval`, `awaiting_owner`, `completed`, `failed`.

### `staff_task_approvers`

One row per approver per task.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | default `gen_random_uuid()` |
| `task_id` | uuid, not null | FK to `staff_tasks(id)` `on delete cascade` |
| `approver_id` | uuid, not null | FK to `users(id)` |
| `decision` | text, not null | `pending`, `approved`, `sent_back`, `rejected`; default `pending` |
| `reason` | text, nullable | required when decision is `sent_back` or `rejected` |
| `decided_at` | timestamptz, nullable | when this approver acted |

`on delete cascade` means deleting a task removes its approver rows automatically.

## Status flow

```
in_progress
  │  doer presses "Mark Done"
  ▼
awaiting_approval
  │  every approver has decision = approved
  ▼
awaiting_owner
  │  creator presses "Accept"
  ▼
completed   (terminal)

At awaiting_approval, any approver may instead:
  • Send Back  → task back to in_progress (reason required); all approver
                 decisions reset to pending for the next round
  • Reject     → task to failed (reason required, terminal)

At awaiting_owner, the creator may instead:
  • Send Back  → task back to in_progress (reason required); approver
                 decisions reset to pending
  • Reject     → task to failed (reason required, terminal)
```

When a task returns to `in_progress` via Send Back, all rows in `staff_task_approvers` for that task reset to `decision = pending` (with prior reason cleared), so the next submission is reviewed fresh.

A task with **no approvers** goes straight from `awaiting_approval` to `awaiting_owner` when the doer marks it done — there is nobody to wait on, so the "all approvers approved" condition is vacuously true.

## Permissions (enforced in the page, backed by RLS)

- **Create a task:** superadmin only (AbangPC). Enforced by a `users.is_superadmin` boolean flag; the New Task button is hidden and `openTaskModal` refuses for non-superadmins. Role stays `manager` for the superadmin account so the existing page gates (`requireManager`) still admit them — the flag is additive and never replaces the role. Because only the superadmin creates tasks, `created_by` is always the superadmin, so final acceptance and delete (both guarded by `created_by`) are superadmin-only automatically.
- **Mark Done:** only the doer, only while `in_progress`.
- **Approve / Send Back / Reject at approval stage:** only a named approver of that task, only while `awaiting_approval`, and only if their own decision is still `pending`.
- **Accept / Send Back / Reject at owner stage:** only the creator, only while `awaiting_owner`.
- **Delete a task:** only the creator.
- **View:** any signed-in staff sees every task.

Database access uses the same RLS shape as inventory: full access for the `authenticated` role, nothing for anon. The finer per-role rules above are enforced in the page logic. This matches the existing app, where RLS is the outer boundary and the UI enforces workflow. It means a technically capable staff member could in principle act out of turn via direct API calls; given all staff are trusted managers, this is an accepted limitation, consistent with the rest of the system.

## User interface

New files `task.html` and `task.js`, following the conventions of `inventory.html` / `inventory.js`:

- Guarded by `SystemApp.requireManager()` on load (matches dashboard and inventory).
- Sidebar rendered via `SystemApp.renderSidebar(user, 'task')`.
- Reuses `system.css`, and `showToast`, `closeModal`, `formatDate`, `getStatusBadgeHTML` already in `system.js`.

### One shared-helper move (prerequisite)

`escapeHtml()` — which safely renders user-typed text and is essential here, since tasks are full of free-text titles, descriptions and reasons — currently lives in `inventory.js` (line 23), not in the shared `system.js`. It must move into `system.js` and be added to the `SystemApp` export, exactly as `showToast` and `closeModal` were moved during the inventory work.

This is a pure move, no behaviour change. `inventory.js` keeps calling `escapeHtml` bare; it works because `system.js` loads before every page script. It is the only change this feature makes to existing production code, so the test plan re-checks that inventory still renders correctly.

### Navigation change

In `renderSidebar()` (`system.js`), the **New Ticket** item (`dashboard.html#create`) is replaced by:

```html
<a href="task.html" class="nav-item ${activePage === 'task' ? 'active' : ''}">
  <span class="nav-item-icon">✅</span> Staff Task
</a>
```

This is safe: the dashboard top bar already has a "➕ New Ticket" button (`newTicketBtn`), so ticket creation is not lost.

### Page layout

- Top bar: title "Staff Task" and a "➕ New Task" button.
- Filter row: assignee dropdown, status dropdown, free-text search on title, and a "Needs my action" toggle.
- Task list: one card per task showing title, doer, status badge, the approver chain with each approver's state (pending / approved / sent back / rejected), start and end dates, and an overdue flag when past `end_date` and not yet terminal.
- Each card shows only the action buttons the current viewer is allowed to press at the task's current stage.

### Create / edit modal

Fields: title (required), description, doer (dropdown of staff), approvers (multi-select of staff, excluding the chosen doer), start date, end date. On save, inserts the `staff_tasks` row and one `staff_task_approvers` row per chosen approver.

## Design decisions

- **Dates are informational, not hard locks.** A task past its `end_date` shows a red overdue flag, but the doer can still mark it done late. This mirrors the existing ticket "age" badge and avoids trapping staff behind a deadline. (Alternative considered: hard-lock after `end_date`. Rejected as too rigid for a small shop.)
- **A reason is required on Send Back and Reject, optional elsewhere.** The doer must know why work was returned or failed.
- **Approval is parallel.** Approvers act in any order; the task advances only when all have approved.
- **The creator is the final acceptor.** Avoids needing a special owner role, since every account is a manager.

## Error handling

- Failed load: inline error in the list body, matching `inventory.js`.
- Failed writes: `showToast(msg, 'error')`.
- Required-field validation (title on create; reason on send-back/reject) with inline messages before submit.
- Concurrent approval: an approver's action is written with a guard on the current status and their own `pending` decision, so a stale card cannot double-apply. If the guard matches nothing, the page reloads and tells the viewer the task moved on. (Same pattern as the inventory stock guards.)

## Testing

Manual, against production Supabase, consistent with prior features. All staff accounts are managers, so tests can be run by logging in as different staff.

1. Owner creates a task with a doer and two approvers; confirm it appears In Progress with both approvers pending.
2. A non-doer cannot see a Mark Done button; the doer can. Doer marks done → Awaiting Approval.
3. Each approver approves in turn; after the last, status becomes Awaiting Owner.
4. An approver Sends Back with a reason → task returns to In Progress, approver decisions reset to pending, reason visible to the doer.
5. An approver Rejects with a reason → task Failed, terminal.
6. Creator Accepts at owner stage → Completed.
7. Creator Sends Back at owner stage → In Progress, decisions reset.
8. Create a task with no approvers; doer marks done → jumps straight to Awaiting Owner.
9. A reason left blank on Send Back / Reject is refused.
10. Filters: by assignee, by status, title search, and "Needs my action" each narrow the list correctly.
11. Overdue flag shows on a task past end_date that is not completed or failed.
12. Deleting a task (as creator) removes it and its approver rows.
13. After the `escapeHtml` move: inventory page still renders parts and laptops correctly, with any HTML-special characters in names/notes shown as text (confirms the move did not break escaping).
14. Existing pages unaffected: dashboard still loads and creates tickets via the top-bar button; inventory and status pages work; sign-out redirects to login.

## Rollback

**Code:** all work on `feature/staff-task`. `main` and the live site are untouched until a deliberate merge. Revert is `git checkout main`.

**Database:** setup SQL is `CREATE TABLE` only, on the two new names. No existing table is altered. Undo:

```sql
drop table if exists public.staff_task_approvers;
drop table if exists public.staff_tasks;
```

(`staff_task_approvers` dropped first because it references `staff_tasks`.)

## Deferred (not in this version)

- Notifications when a task needs your action.
- Comments or a discussion thread on a task.
- Attachments or proof-of-work uploads.
- Linking tasks to repair tickets.
- Editing task details after creation.
- Hard date enforcement.
