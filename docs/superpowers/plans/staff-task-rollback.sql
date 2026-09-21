-- =============================================
-- STAFF TASK ROLLBACK
-- =============================================
-- Undo the staff task feature's database setup.
--
-- WARNING: destroys all staff task data (tasks and their approvers).
-- Everything else is untouched: tickets, customers, users, inventory
-- and diagnose tables are never referenced here.
--
-- Run in: Supabase Dashboard -> SQL Editor
-- =============================================

-- Drop approvers first: it references staff_tasks.
drop table if exists public.staff_task_approvers;
drop table if exists public.staff_tasks;

-- Optional: remove the superadmin flag added for this feature.
-- Harmless to leave in place (an unused boolean). Uncomment to fully revert.
-- alter table public.users drop column if exists is_superadmin;
