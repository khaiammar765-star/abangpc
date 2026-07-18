-- =============================================
-- INVENTORY ROLLBACK
-- =============================================
-- Undoes the inventory feature's database setup.
--
-- WARNING: destroys all inventory data (laptops and parts).
-- Everything else is untouched: tickets, customers, users,
-- ticket_comments, ticket_photos, ticket_status_history,
-- diagnose_reports and diagnose_laptop_reports are never
-- referenced here.
--
-- Run in: Supabase Dashboard -> SQL Editor
-- =============================================

drop table if exists public.inventory_laptops;
drop table if exists public.inventory_items;
