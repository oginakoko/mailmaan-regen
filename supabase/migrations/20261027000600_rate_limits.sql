-- Mailmaan Day 9 — DB-backed API rate limiting (fixed windows).
-- Service-role only: RLS enabled, no browser policies (same model as api_keys).
create table if not exists public.api_rate_limits (
  key_hash text not null,
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (key_hash, bucket, window_start)
);
alter table public.api_rate_limits enable row level security;

-- Atomic insert-or-increment; also sweeps windows older than an hour.
create or replace function public.api_rate_limit_bump(
  p_key_hash text,
  p_bucket text,
  p_window_start timestamptz
)
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  insert into public.api_rate_limits (key_hash, bucket, window_start, count, updated_at)
  values (p_key_hash, p_bucket, p_window_start, 1, now())
  on conflict (key_hash, bucket, window_start)
  do update set count = api_rate_limits.count + 1, updated_at = now()
  returning count into v_count;
  delete from public.api_rate_limits where window_start < p_window_start - interval '1 hour';
  return v_count;
end;
$$;
