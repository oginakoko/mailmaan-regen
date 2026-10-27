-- Mailmaan Day 8 — persist API request IDs for evidence-based diagnostics.
alter table if exists public.messages add column if not exists request_id text;
alter table if exists public.app_events add column if not exists request_id text;
create index if not exists messages_request_id_idx on public.messages (request_id) where request_id is not null;
create index if not exists app_events_request_id_idx on public.app_events (request_id) where request_id is not null;
