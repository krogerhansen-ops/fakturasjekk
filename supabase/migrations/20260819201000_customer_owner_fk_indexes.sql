-- Cover the composite (case_id, owner_id) ownership foreign keys introduced by
-- customer_ownership_integrity. Tables are prelaunch/empty, so normal transactional
-- index creation is preferred over CREATE INDEX CONCURRENTLY in this migration.

create index if not exists idx_case_events_case_owner
  on public.case_events(case_id, owner_id);

create index if not exists idx_documents_case_owner
  on public.documents(case_id, owner_id);

create index if not exists idx_analyses_case_owner
  on public.analyses(case_id, owner_id);

create index if not exists idx_payments_case_owner
  on public.payments(case_id, owner_id);

create index if not exists idx_drafts_case_owner
  on public.drafts(case_id, owner_id);

create index if not exists idx_supplier_responses_case_owner
  on public.supplier_responses(case_id, owner_id);

create index if not exists idx_followups_case_owner
  on public.followups(case_id, owner_id);
