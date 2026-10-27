-- Soko demo store orders (Day 10 demo). Public storefront, no login:
-- RLS enabled with no policies (service-role only, like api_keys);
-- the demo routes use the service client and unguessable order UUIDs.
create table if not exists public.demo_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  order_number text not null,
  email text not null,
  first_name text not null,
  total text not null,
  currency text not null default 'KES',
  placed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (project_id, order_number)
);
alter table public.demo_orders enable row level security;
create index if not exists demo_orders_project_id_idx on public.demo_orders (project_id);
