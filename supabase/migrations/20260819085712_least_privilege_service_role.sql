-- Live hardening after bootstrap verification.
-- Restrict service_role to the exact table privileges used by Fakturasjekk server adapters.

alter default privileges for role postgres in schema public
  revoke all on tables from service_role;

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
from service_role;

revoke all on table public.rate_limit_windows_prelaunch_legacy from service_role;

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

revoke all on all sequences in schema public from service_role;
grant usage, select, update on all sequences in schema public to service_role;
