-- Fakturasjekk atomic server-side operations for Supabase Data API.
-- Pre-launch migration: rate_limit_windows is realigned to the canonical server schema before customer traffic exists.
-- Preserve the original empty pre-launch table rather than dropping it; it is isolated with no app-role privileges.

ALTER TABLE public.rate_limit_windows RENAME TO rate_limit_windows_prelaunch_legacy;
ALTER TABLE public.rate_limit_windows_prelaunch_legacy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limit_windows_prelaunch_legacy FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.rate_limit_windows (
  key text PRIMARY KEY,
  count integer NOT NULL CHECK (count >= 0),
  reset_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rate_limit_windows_reset_at ON public.rate_limit_windows(reset_at);
ALTER TABLE public.rate_limit_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limit_windows FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rate_limit_windows TO service_role;

CREATE OR REPLACE FUNCTION public.fakturasjekk_increment_rate_limit_window(
  p_key text,
  p_window_ms bigint
)
RETURNS TABLE(count integer, reset_at_ms bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
  v_reset_at timestamptz;
BEGIN
  IF p_key IS NULL OR length(p_key) = 0 OR p_window_ms IS NULL OR p_window_ms <= 0 THEN
    RAISE EXCEPTION 'invalid rate-limit input';
  END IF;

  INSERT INTO public.rate_limit_windows(key, count, reset_at, updated_at)
  VALUES (p_key, 1, now() + (p_window_ms * interval '1 millisecond'), now())
  ON CONFLICT (key) DO UPDATE SET
    count = CASE WHEN public.rate_limit_windows.reset_at <= now() THEN 1 ELSE public.rate_limit_windows.count + 1 END,
    reset_at = CASE WHEN public.rate_limit_windows.reset_at <= now()
      THEN now() + (p_window_ms * interval '1 millisecond')
      ELSE public.rate_limit_windows.reset_at END,
    updated_at = now()
  RETURNING public.rate_limit_windows.count, public.rate_limit_windows.reset_at
  INTO v_count, v_reset_at;

  RETURN QUERY SELECT v_count, (extract(epoch from v_reset_at) * 1000)::bigint;
END;
$$;

CREATE OR REPLACE FUNCTION public.fakturasjekk_claim_payment_event(
  p_provider text,
  p_provider_reference text,
  p_case_id text
)
RETURNS TABLE(status text, existing_case_id text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_case_id text;
BEGIN
  IF p_provider IS NULL OR p_provider_reference IS NULL OR p_case_id IS NULL THEN
    RAISE EXCEPTION 'invalid payment claim input';
  END IF;

  INSERT INTO public.payment_event_claims(provider, provider_reference, case_id)
  VALUES (p_provider, p_provider_reference, p_case_id)
  ON CONFLICT (provider, provider_reference) DO NOTHING
  RETURNING case_id INTO v_case_id;

  IF FOUND THEN
    RETURN QUERY SELECT 'new'::text, NULL::text;
    RETURN;
  END IF;

  SELECT case_id INTO v_case_id
  FROM public.payment_event_claims
  WHERE provider = p_provider AND provider_reference = p_provider_reference
  LIMIT 1;

  IF v_case_id = p_case_id THEN
    RETURN QUERY SELECT 'duplicate_same_case'::text, v_case_id;
  ELSE
    RETURN QUERY SELECT 'conflict'::text, v_case_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fakturasjekk_increment_rate_limit_window(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fakturasjekk_claim_payment_event(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fakturasjekk_increment_rate_limit_window(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fakturasjekk_claim_payment_event(text, text, text) TO service_role;
