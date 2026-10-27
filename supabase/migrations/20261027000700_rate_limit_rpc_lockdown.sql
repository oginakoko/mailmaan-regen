-- Mailmaan Day 9 — lock down the rate-limit RPC (security-audit fix).
--
-- Findings fixed:
-- 1. `api_rate_limit_bump` was SECURITY DEFINER + executable by anon and
--    authenticated via /rest/v1/rpc. The sweep clause trusted the
--    caller-supplied window, so a future `p_window_start` wiped every
--    current window (rate-limit bypass). EXECUTE is now service_role only.
-- 2. Mutable search_path on a SECURITY DEFINER function (fixed with
--    SET search_path = ''; all references are schema-qualified built-ins).
-- 3. The sweep is anchored to the server clock (now()) instead of the
--    caller-supplied window, so even a privileged caller cannot widen it.
create or replace function public.api_rate_limit_bump(
  p_key_hash text,
  p_bucket text,
  p_window_start timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.api_rate_limits (key_hash, bucket, window_start, count, updated_at)
  values (p_key_hash, p_bucket, p_window_start, 1, now())
  on conflict (key_hash, bucket, window_start)
  do update set count = api_rate_limits.count + 1, updated_at = now()
  returning count into v_count;
  delete from public.api_rate_limits where window_start < now() - interval '1 hour';
  return v_count;
end;
$$;

-- NOTE: revoke the named roles explicitly — anon/authenticated hold direct
-- EXECUTE grants on Supabase that a bare `from public` does not remove.
revoke all on function public.api_rate_limit_bump(text, text, timestamptz) from anon, authenticated, public;
grant execute on function public.api_rate_limit_bump(text, text, timestamptz) to service_role;
