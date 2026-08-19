-- Defense in depth for optional cross-references between customer-owned records.
-- A draft may only point to an analysis from the same case+owner; a supplier response
-- may only point to a document from the same case+owner; a follow-up may only point
-- to a supplier response from the same case+owner.

alter table public.analyses
  add constraint analyses_id_case_owner_key unique (id, case_id, owner_id);

alter table public.documents
  add constraint documents_id_case_owner_key unique (id, case_id, owner_id);

alter table public.supplier_responses
  add constraint supplier_responses_id_case_owner_key unique (id, case_id, owner_id);

alter table public.drafts drop constraint drafts_analysis_id_fkey;
alter table public.drafts
  add constraint drafts_analysis_case_owner_fkey
  foreign key (analysis_id, case_id, owner_id)
  references public.analyses(id, case_id, owner_id)
  on delete set null (analysis_id);

alter table public.supplier_responses drop constraint supplier_responses_document_id_fkey;
alter table public.supplier_responses
  add constraint supplier_responses_document_case_owner_fkey
  foreign key (document_id, case_id, owner_id)
  references public.documents(id, case_id, owner_id)
  on delete set null (document_id);

alter table public.followups drop constraint followups_supplier_response_id_fkey;
alter table public.followups
  add constraint followups_supplier_response_case_owner_fkey
  foreign key (supplier_response_id, case_id, owner_id)
  references public.supplier_responses(id, case_id, owner_id)
  on delete set null (supplier_response_id);

-- Exact covering indexes for the new composite referencing columns.
create index if not exists idx_drafts_analysis_case_owner
  on public.drafts(analysis_id, case_id, owner_id);

create index if not exists idx_supplier_responses_document_case_owner
  on public.supplier_responses(document_id, case_id, owner_id);

create index if not exists idx_followups_supplier_response_case_owner
  on public.followups(supplier_response_id, case_id, owner_id);
