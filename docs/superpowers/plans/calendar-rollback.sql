-- =============================================
-- CALENDAR ROLLBACK
-- =============================================
-- Undo the calendar feature's database setup.
--
-- WARNING: destroys all calendar data (events and leave requests).
-- Everything else is untouched: tickets, customers, users, inventory,
-- staff task and diagnose tables are never referenced here.
--
-- Run in: Supabase Dashboard -> SQL Editor
-- =============================================

drop table if exists public.staff_leave;
drop table if exists public.calendar_events;
