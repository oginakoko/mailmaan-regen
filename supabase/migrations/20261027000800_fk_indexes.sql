-- Mailmaan Day 9 — cover unindexed foreign keys (performance-advisor fix).
-- These back project deletes/cascades and dashboard lookups; all are
-- plain btree lookups with no behavior change.
create index if not exists message_events_project_id_idx on public.message_events (project_id);
create index if not exists messages_template_id_idx on public.messages (template_id);
create index if not exists suppression_entries_source_message_id_idx on public.suppression_entries (source_message_id);
create index if not exists webhook_events_message_id_idx on public.webhook_events (message_id);
create index if not exists webhook_events_project_id_idx on public.webhook_events (project_id);
create index if not exists workflow_runs_message_id_idx on public.workflow_runs (message_id);
create index if not exists workflows_template_id_idx on public.workflows (template_id);
