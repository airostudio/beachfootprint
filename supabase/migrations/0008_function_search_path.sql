-- ============================================================
-- Pin search_path on the two helper functions flagged by the Supabase security advisor
-- (lint 0011_function_search_path_mutable). Without it, a role that can create objects in a
-- schema earlier on the caller's search_path could shadow a table or function these reference.
--
-- Deliberately NOT done here: revoking EXECUTE on is_tenant_member from anon/authenticated
-- (lints 0028/0029). The RLS policies call it, and PostgreSQL evaluates every permissive policy
-- for a query — so revoking it would make anonymous storefront reads fail with "permission
-- denied for function". It only answers "is the caller a member of this tenant", which reveals
-- nothing to an anonymous caller (always false).
--
-- Safe to re-run.
-- ============================================================

alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.is_tenant_member(uuid) set search_path = public, pg_temp;
