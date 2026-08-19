\set ON_ERROR_STOP on

-- Run only against the dedicated Fakturasjekk production database.
-- This script intentionally fails on the first security mismatch.

DO $$
DECLARE
  table_name text;
  app_tables text[] := ARRAY[
    'cases','case_events','documents','analyses','payments','payment_event_claims',
    'drafts','supplier_responses','followups','idempotency_keys','audit_log','rate_limit_windows'
  ];
BEGIN
  FOREACH table_name IN ARRAY app_tables LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = table_name AND c.relkind IN ('r','p')
    ) THEN
      RAISE EXCEPTION 'Missing Fakturasjekk table: public.%', table_name;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = table_name AND c.relrowsecurity = true
    ) THEN
      RAISE EXCEPTION 'RLS is not enabled on public.%', table_name;
    END IF;

    IF has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
       OR has_table_privilege('anon', format('public.%I', table_name), 'INSERT')
       OR has_table_privilege('anon', format('public.%I', table_name), 'UPDATE')
       OR has_table_privilege('anon', format('public.%I', table_name), 'DELETE') THEN
      RAISE EXCEPTION 'anon has direct privilege on public.%', table_name;
    END IF;

    IF has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT')
       OR has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
       OR has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
       OR has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') THEN
      RAISE EXCEPTION 'authenticated has direct privilege on public.%', table_name;
    END IF;

    IF NOT has_table_privilege('service_role', format('public.%I', table_name), 'SELECT')
       OR NOT has_table_privilege('service_role', format('public.%I', table_name), 'INSERT')
       OR NOT has_table_privilege('service_role', format('public.%I', table_name), 'UPDATE')
       OR NOT has_table_privilege('service_role', format('public.%I', table_name), 'DELETE') THEN
      RAISE EXCEPTION 'service_role lacks required CRUD access on public.%', table_name;
    END IF;

    IF has_table_privilege('service_role', format('public.%I', table_name), 'TRUNCATE')
       OR has_table_privilege('service_role', format('public.%I', table_name), 'REFERENCES')
       OR has_table_privilege('service_role', format('public.%I', table_name), 'TRIGGER') THEN
      RAISE EXCEPTION 'service_role has privilege beyond required CRUD on public.%', table_name;
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'rate_limit_windows_prelaunch_legacy'
      AND grantee IN ('anon','authenticated','service_role')
  ) THEN
    RAISE EXCEPTION 'Pre-launch legacy rate-limit table must have no app-role privileges.';
  END IF;
END $$;

DO $$
DECLARE
  bucket_record record;
BEGIN
  SELECT id, name, public, file_size_limit, allowed_mime_types
  INTO bucket_record
  FROM storage.buckets
  WHERE id = 'case-documents-private';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Private Fakturasjekk bucket is missing.';
  END IF;
  IF bucket_record.public IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'case-documents-private must not be public.';
  END IF;
  IF bucket_record.file_size_limit IS DISTINCT FROM 15728640::bigint THEN
    RAISE EXCEPTION 'Unexpected file size limit on case-documents-private: %', bucket_record.file_size_limit;
  END IF;
  IF NOT (bucket_record.allowed_mime_types @> ARRAY['application/pdf','image/jpeg','image/png','image/webp']::text[]) THEN
    RAISE EXCEPTION 'Private bucket MIME allowlist is incomplete.';
  END IF;
END $$;

DO $$
BEGIN
  -- V1 has no direct browser Storage policies. A policy for anon/authenticated on storage.objects
  -- would expand the attack surface and therefore fails this verification until intentionally reviewed.
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        roles @> ARRAY['anon']::name[]
        OR roles @> ARRAY['authenticated']::name[]
        OR roles @> ARRAY['public']::name[]
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected browser-access policy exists on storage.objects.';
  END IF;
END $$;

DO $$
DECLARE
  fn text;
  server_functions text[] := ARRAY[
    'fakturasjekk_increment_rate_limit_window(text,bigint)',
    'fakturasjekk_claim_payment_event(text,text,text)'
  ];
BEGIN
  FOREACH fn IN ARRAY server_functions LOOP
    IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role lacks EXECUTE on %', fn;
    END IF;
    IF has_function_privilege('anon', fn, 'EXECUTE')
       OR has_function_privilege('authenticated', fn, 'EXECUTE')
       OR has_function_privilege('public', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Browser/public role can execute server-only function %', fn;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('fakturasjekk_increment_rate_limit_window','fakturasjekk_claim_payment_event')
      AND p.prosecdef = true
  ) THEN
    RAISE EXCEPTION 'Fakturasjekk server RPC must remain SECURITY INVOKER.';
  END IF;
END $$;

SELECT
  'OK' AS status,
  'Fakturasjekk Supabase schema/RLS/least-privilege grants/private bucket/RPC boundary verified' AS check_result;
