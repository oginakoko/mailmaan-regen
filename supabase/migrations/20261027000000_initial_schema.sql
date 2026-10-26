-- Mailmaan initial schema — Day 1 foundation (Blueprint §6)
-- Core tables: projects, api_keys, templates, messages, message_events
-- RLS is enabled on every table. Dashboard/owner policies land in Day 2;
-- until then the server (service-role) is the only data path, which is
-- intentional for the project API-key architecture.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users (id) on delete set null,
  name text not null,
  slug text not null,
  brand_config jsonb not null default '{}'::jsonb,
  default_from_email text,
  default_from_name text,
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_owner_slug_unique unique (owner_user_id, slug)
);

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text,
  prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}',
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists api_keys_project_id_idx on public.api_keys (project_id);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  slug text not null,
  name text not null,
  purpose text not null default 'custom'
    check (purpose in ('welcome', 'password_reset', 'receipt', 'notification', 'custom')),
  subject_template text not null,
  html_template text not null,
  text_template text,
  variables_schema jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  version integer not null default 1,
  generation_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint templates_project_slug_version_unique unique (project_id, slug, version)
);
create index if not exists templates_project_id_idx on public.templates (project_id);
create index if not exists templates_project_status_idx on public.templates (project_id, status);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  template_id uuid references public.templates (id) on delete set null,
  template_version integer,
  recipient_email text not null,
  from_email text not null,
  subject text not null,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'accepted', 'delivered', 'failed', 'bounced', 'complained', 'delivery_delayed', 'suppressed')),
  provider text not null default 'resend',
  provider_message_id text,
  idempotency_key text,
  request_hash text,
  error_code text,
  error_message text,
  queued_at timestamptz,
  accepted_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists messages_project_idempotency_unique
  on public.messages (project_id, idempotency_key) where idempotency_key is not null;
create index if not exists messages_project_created_idx on public.messages (project_id, created_at desc);
create index if not exists messages_project_status_idx on public.messages (project_id, status);
create index if not exists messages_provider_message_id_idx on public.messages (provider_message_id) where provider_message_id is not null;

create table if not exists public.message_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  source text not null check (source in ('mailmaan', 'provider', 'workflow')),
  provider_event_id text,
  event_type text not null,
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  payload_redacted jsonb not null default '{}'::jsonb
);
create unique index if not exists message_events_provider_event_unique
  on public.message_events (source, provider_event_id) where provider_event_id is not null;
create index if not exists message_events_message_occurred_idx on public.message_events (message_id, occurred_at);

alter table public.projects enable row level security;
alter table public.api_keys enable row level security;
alter table public.templates enable row level security;
alter table public.messages enable row level security;
alter table public.message_events enable row level security;
