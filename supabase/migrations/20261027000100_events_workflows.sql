-- Mailmaan events & workflows schema (Blueprint §6, applied on Day 1 so the
-- database shape is ready before Day 6 workflow work begins).

create table if not exists public.app_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  external_event_id text,
  event_name text not null,
  payload jsonb not null default '{}'::jsonb,
  dispatch_status text not null default 'pending' check (dispatch_status in ('pending', 'dispatched', 'failed')),
  received_at timestamptz not null default now(),
  dispatched_at timestamptz,
  last_error text
);
create unique index if not exists app_events_project_external_unique
  on public.app_events (project_id, external_event_id) where external_event_id is not null;
create index if not exists app_events_project_name_idx on public.app_events (project_id, event_name);

create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  trigger_event text not null,
  conditions jsonb not null default '{}'::jsonb,
  template_id uuid references public.templates (id) on delete set null,
  recipient_path text not null default 'data.email',
  variable_mappings jsonb not null default '{}'::jsonb,
  delay_seconds integer not null default 0 check (delay_seconds >= 0 and delay_seconds <= 86400),
  enabled boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workflows_project_trigger_idx on public.workflows (project_id, trigger_event) where enabled;

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  app_event_id uuid not null references public.app_events (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'skipped')),
  message_id uuid references public.messages (id) on delete set null,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint workflow_runs_workflow_event_version_unique unique (workflow_id, app_event_id)
);
create index if not exists workflow_runs_project_status_idx on public.workflow_runs (project_id, status);
create index if not exists workflow_runs_app_event_idx on public.workflow_runs (app_event_id);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete set null,
  provider text not null default 'resend',
  provider_event_id text not null,
  event_type text not null,
  message_id uuid references public.messages (id) on delete set null,
  mapping_outcome text,
  processing_status text not null default 'received' check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  error_detail text,
  received_at timestamptz not null default now(),
  constraint webhook_events_provider_event_unique unique (provider, provider_event_id)
);

create table if not exists public.suppression_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  recipient_email text not null,
  reason text not null check (reason in ('hard_bounce', 'complaint', 'manual', 'unsubscribe')),
  source_message_id uuid references public.messages (id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  constraint suppression_entries_project_recipient_unique unique (project_id, recipient_email)
);

alter table public.app_events enable row level security;
alter table public.workflows enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.webhook_events enable row level security;
alter table public.suppression_entries enable row level security;
