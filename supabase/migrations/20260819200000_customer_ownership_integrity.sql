-- Defense in depth for server-side service-key access.
-- The trusted API derives owner_id from verified Auth, but the database must also reject
-- accidental cross-owner writes because server secret keys intentionally bypass RLS.

-- Composite parent key used by all customer-owned child tables.
alter table public.cases
  add constraint cases_id_owner_id_key unique (id, owner_id);

-- Replace case-only foreign keys with case+owner foreign keys while preserving delete behavior.
alter table public.case_events drop constraint case_events_case_id_fkey;
alter table public.case_events
  add constraint case_events_case_owner_fkey
  foreign key (case_id, owner_id) references public.cases(id, owner_id) on delete cascade;

alter table public.documents drop constraint documents_case_id_fkey;
alter table public.documents
  add constraint documents_case_owner_fkey
  foreign key (case_id, owner_id) references public.cases(id, owner_id) on delete cascade;

alter table public.analyses drop constraint analyses_case_id_fkey;
alter table public.analyses
  add constraint analyses_case_owner_fkey
  foreign key (case_id, owner_id) references public.cases(id, owner_id) on delete cascade;

alter table public.payments drop constraint payments_case_id_fkey;
alter table public.payments
  add constraint payments_case_owner_fkey
  foreign key (case_id, owner_id) references public.cases(id, owner_id) on delete restrict;

alter table public.drafts drop constraint drafts_case_id_fkey;
alter table public.drafts
  add constraint drafts_case_owner_fkey
  foreign key (case_id, owner_id) references public.cases(id, owner_id) on delete cascade;

alter table public.supplier_responses drop constraint supplier_responses_case_id_fkey;
alter table public.supplier_responses
  add constraint supplier_responses_case_owner_fkey
  foreign key (case_id, owner_id) references public.cases(id, owner_id) on delete cascade;

alter table public.followups drop constraint followups_case_id_fkey;
alter table public.followups
  add constraint followups_case_owner_fkey
  foreign key (case_id, owner_id) references public.cases(id, owner_id) on delete cascade;

-- A case owner is immutable after creation, even when trusted server credentials are used.
create or replace function public.fakturasjekk_reject_case_owner_change()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Fakturasjekk case owner_id is immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.fakturasjekk_reject_case_owner_change() from public, anon, authenticated;

drop trigger if exists fakturasjekk_case_owner_immutable on public.cases;
create trigger fakturasjekk_case_owner_immutable
before update of owner_id on public.cases
for each row
execute function public.fakturasjekk_reject_case_owner_change();

comment on constraint cases_id_owner_id_key on public.cases is
  'Composite ownership key used to prevent cross-owner child rows when trusted server credentials bypass RLS.';
comment on function public.fakturasjekk_reject_case_owner_change() is
  'Defense in depth: a Fakturasjekk case can never be reassigned to another Auth owner after creation.';
