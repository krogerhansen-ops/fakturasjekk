-- Fakturasjekk dedicated Supabase schema.
-- This migration is intended ONLY for the dedicated Fakturasjekk Supabase project.
-- Customer document bytes live in private Supabase Storage, never in PostgreSQL.

create table if not exists public.cases (
  id text primary key,
  owner_id text not null,
  state text not null,
  retention_mode text not null check (retention_mode in ('temporary','saved_case')),
  buyer_type text,
  subject text,
  engine_version text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  deleted_at timestamptz
);
create index if not exists idx_cases_owner_updated on public.cases(owner_id, updated_at desc);
create index if not exists idx_cases_retention on public.cases(deleted_at, updated_at);

create table if not exists public.case_events (
  id bigserial primary key,
  case_id text not null references public.cases(id) on delete cascade,
  owner_id text not null,
  event_type text not null,
  event_version integer not null default 1,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_case_events_case_created on public.case_events(case_id, created_at);
create index if not exists idx_case_events_owner on public.case_events(owner_id);

create table if not exists public.documents (
  id text primary key,
  case_id text not null references public.cases(id) on delete cascade,
  owner_id text not null,
  role text not null,
  original_name text not null,
  mime_type text,
  byte_size bigint,
  storage_key text,
  sha256 text,
  upload_status text not null,
  created_at timestamptz not null default now(),
  uploaded_at timestamptz,
  purge_after timestamptz,
  deleted_at timestamptz
);
create index if not exists idx_documents_case on public.documents(case_id);
create index if not exists idx_documents_owner on public.documents(owner_id);
create unique index if not exists idx_documents_storage_key on public.documents(storage_key) where storage_key is not null;

create table if not exists public.analyses (
  id text primary key,
  case_id text not null references public.cases(id) on delete cascade,
  owner_id text not null,
  engine_version text not null,
  rule_registry_version text,
  status text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_analyses_case_created on public.analyses(case_id, created_at desc);
create index if not exists idx_analyses_owner on public.analyses(owner_id);

create table if not exists public.payments (
  id bigserial primary key,
  case_id text not null references public.cases(id) on delete restrict,
  owner_id text not null,
  provider text not null,
  provider_reference text not null,
  amount_minor integer not null check (amount_minor >= 0),
  currency char(3) not null,
  status text not null,
  verified_server_side boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique(provider, provider_reference)
);
create index if not exists idx_payments_case on public.payments(case_id);
create index if not exists idx_payments_owner on public.payments(owner_id);

create table if not exists public.payment_event_claims (
  provider text not null,
  provider_reference text not null,
  case_id text not null references public.cases(id) on delete restrict,
  first_seen_at timestamptz not null default now(),
  primary key(provider, provider_reference)
);
create index if not exists idx_payment_event_claims_case on public.payment_event_claims(case_id);

create table if not exists public.drafts (
  id text primary key,
  case_id text not null references public.cases(id) on delete cascade,
  owner_id text not null,
  analysis_id text references public.analyses(id) on delete set null,
  mode text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_drafts_owner on public.drafts(owner_id);

create table if not exists public.supplier_responses (
  id text primary key,
  case_id text not null references public.cases(id) on delete cascade,
  owner_id text not null,
  document_id text references public.documents(id) on delete set null,
  response_text text,
  structured_response jsonb,
  received_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_supplier_responses_owner on public.supplier_responses(owner_id);

create table if not exists public.followups (
  id text primary key,
  case_id text not null references public.cases(id) on delete cascade,
  owner_id text not null,
  supplier_response_id text references public.supplier_responses(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_followups_owner on public.followups(owner_id);

create table if not exists public.idempotency_keys (
  namespace text primary key,
  owner_id text,
  operation text,
  state text not null,
  response jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_idempotency_expiry on public.idempotency_keys(expires_at);

create table if not exists public.audit_log (
  id bigserial primary key,
  actor_id text,
  case_id text,
  action text not null,
  outcome text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_case_created on public.audit_log(case_id, created_at desc);

create table if not exists public.rate_limit_windows (
  owner_id text not null,
  action text not null,
  window_start_ms bigint not null,
  count integer not null check (count >= 0),
  expires_at timestamptz not null,
  primary key(owner_id, action, window_start_ms)
);
create index if not exists idx_rate_limit_windows_expiry on public.rate_limit_windows(expires_at);

-- Defense in depth: all application tables created through SQL explicitly use RLS.
alter table public.cases enable row level security;
alter table public.case_events enable row level security;
alter table public.documents enable row level security;
alter table public.analyses enable row level security;
alter table public.payments enable row level security;
alter table public.payment_event_claims enable row level security;
alter table public.drafts enable row level security;
alter table public.supplier_responses enable row level security;
alter table public.followups enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.audit_log enable row level security;
alter table public.rate_limit_windows enable row level security;

-- V1 browser policy: no direct table access. Authenticated customers call the trusted API/Edge Function.
revoke all on table public.cases, public.case_events, public.documents, public.analyses,
  public.payments, public.payment_event_claims, public.drafts, public.supplier_responses,
  public.followups, public.idempotency_keys, public.audit_log, public.rate_limit_windows
from anon, authenticated;

-- Do not rely on implicit sequence privileges for browser roles.
revoke all on all sequences in schema public from anon, authenticated;

-- Dedicated private document bucket. No storage.objects policies are created for anon/authenticated;
-- Storage therefore remains deny-by-default from the browser. Trusted server code creates short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'case-documents-private',
  'case-documents-private',
  false,
  15728640,
  array['application/pdf','image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.cases is 'Fakturasjekk cases. Direct browser access is intentionally revoked; trusted API only.';
comment on table public.documents is 'Document metadata only. Source bytes are stored in the private case-documents-private bucket.';
comment on table public.audit_log is 'Data-minimized audit metadata only; never document text, user notes, supplier responses, drafts, secrets or tokens.';
