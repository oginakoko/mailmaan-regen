-- Mailmaan Day 4 — per-project SMTP configs (ADR-0002, Blueprint §6).
-- Every project brings its own SMTP mailbox. Passwords are stored only as
-- AES-256-GCM envelopes (see src/lib/smtp/encryption.ts) and decrypted in
-- memory on the send path. Sends for a project without a config are blocked;
-- there is no fallback to any shared mailbox.
--
-- Access model mirrors api_keys: RLS is enabled and NO browser policies are
-- created. The dashboard manages SMTP only through service-role API routes
-- that return masked values; the public API resolves configs server-side
-- from the authenticated project.

create table if not exists public.project_smtp_configs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  smtp_host text not null,
  smtp_port integer not null check (smtp_port between 1 and 65535),
  smtp_secure boolean not null default false,
  smtp_user text not null,
  smtp_pass_encrypted text not null,
  from_email text not null,
  from_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_smtp_configs_project_unique unique (project_id)
);
create index if not exists project_smtp_configs_project_id_idx
  on public.project_smtp_configs (project_id);

alter table public.project_smtp_configs enable row level security;
