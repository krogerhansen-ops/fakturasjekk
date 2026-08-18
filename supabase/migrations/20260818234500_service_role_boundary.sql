-- Fakturasjekk server-side Data API boundary.
-- Browser roles remain revoked. service_role is granted only the app tables/sequences needed by trusted server/Edge code.
-- Future public tables/functions do not become API-accessible merely because they are created.

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select, update on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public;

grant select, insert, update, delete on table
  public.cases,
  public.case_events,
  public.documents,
  public.analyses,
  public.payments,
  public.payment_event_claims,
  public.drafts,
  public.supplier_responses,
  public.followups,
  public.idempotency_keys,
  public.audit_log,
  public.rate_limit_windows
to service_role;

grant usage, select, update on all sequences in schema public to service_role;

-- Reassert that browser roles have no direct application-table or sequence privileges.
revoke all on table
  public.cases,
  public.case_events,
  public.documents,
  public.analyses,
  public.payments,
  public.payment_event_claims,
  public.drafts,
  public.supplier_responses,
  public.followups,
  public.idempotency_keys,
  public.audit_log,
  public.rate_limit_windows
from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
