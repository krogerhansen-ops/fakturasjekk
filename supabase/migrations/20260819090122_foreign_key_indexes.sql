-- Cover foreign keys used by case cleanup and follow-up relations before customer traffic.

create index if not exists idx_drafts_case on public.drafts(case_id);
create index if not exists idx_drafts_analysis on public.drafts(analysis_id);
create index if not exists idx_supplier_responses_case on public.supplier_responses(case_id);
create index if not exists idx_supplier_responses_document on public.supplier_responses(document_id);
create index if not exists idx_followups_case on public.followups(case_id);
create index if not exists idx_followups_supplier_response on public.followups(supplier_response_id);
