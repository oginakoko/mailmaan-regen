-- Mailmaan Day 2 — owner-scoped RLS policies (Blueprint §6, Day 2).
-- Every public table already has RLS enabled (Day 1). Until now the only
-- data path was the service role. These policies open exactly one more path:
-- an authenticated owner acting through the dashboard on their own projects.
--
-- Authorization model (Blueprint §6):
--   * Browser/publishable-key access is restricted by RLS to projects the
--     caller owns (projects.owner_user_id = auth.uid()).
--   * Child rows are reachable only through an owned project.
--   * api_keys rows never expose key_hash to the browser: the dashboard reads
--     safe columns only through service-role API routes, so NO policies are
--     created for public.api_keys — the browser can never read key material.
--   * The public REST API keeps using the service role + Mailmaan API keys,
--     deriving project identity from the stored key record (never from a
--     client-supplied project_id).

-- projects: owner can read/create/update their own projects; delete stays
-- service-role-only for the hackathon to avoid orphaning child data.
create policy projects_owner_select on public.projects
  for select to authenticated using (owner_user_id = (select auth.uid()));
create policy projects_owner_insert on public.projects
  for insert to authenticated with check (owner_user_id = (select auth.uid()));
create policy projects_owner_update on public.projects
  for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

-- templates: reachable only through an owned project.
create policy templates_owner_select on public.templates
  for select to authenticated using (
    exists (select 1 from public.projects p
            where p.id = templates.project_id
              and p.owner_user_id = (select auth.uid())));
create policy templates_owner_insert on public.templates
  for insert to authenticated with check (
    exists (select 1 from public.projects p
            where p.id = templates.project_id
              and p.owner_user_id = (select auth.uid())));
create policy templates_owner_update on public.templates
  for update to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = templates.project_id
                   and p.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p
                      where p.id = templates.project_id
                        and p.owner_user_id = (select auth.uid())));

-- messages: owner read-only (writes flow through the API/Inngest pipeline).
create policy messages_owner_select on public.messages
  for select to authenticated using (
    exists (select 1 from public.projects p
            where p.id = messages.project_id
              and p.owner_user_id = (select auth.uid())));

-- message_events: owner read-only timeline.
create policy message_events_owner_select on public.message_events
  for select to authenticated using (
    exists (select 1 from public.projects p
            where p.id = message_events.project_id
              and p.owner_user_id = (select auth.uid())));

-- app_events: owner read-only.
create policy app_events_owner_select on public.app_events
  for select to authenticated using (
    exists (select 1 from public.projects p
            where p.id = app_events.project_id
              and p.owner_user_id = (select auth.uid())));

-- workflows: owner read/write through owned projects.
create policy workflows_owner_select on public.workflows
  for select to authenticated using (
    exists (select 1 from public.projects p
            where p.id = workflows.project_id
              and p.owner_user_id = (select auth.uid())));
create policy workflows_owner_insert on public.workflows
  for insert to authenticated with check (
    exists (select 1 from public.projects p
            where p.id = workflows.project_id
              and p.owner_user_id = (select auth.uid())));
create policy workflows_owner_update on public.workflows
  for update to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = workflows.project_id
                   and p.owner_user_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p
                      where p.id = workflows.project_id
                        and p.owner_user_id = (select auth.uid())));

-- workflow_runs: owner read-only.
create policy workflow_runs_owner_select on public.workflow_runs
  for select to authenticated using (
    exists (select 1 from public.projects p
            where p.id = workflow_runs.project_id
              and p.owner_user_id = (select auth.uid())));

-- webhook_events: provider-pipeline only; owner read-only, no browser writes.
create policy webhook_events_owner_select on public.webhook_events
  for select to authenticated using (
    project_id is not null and exists (
      select 1 from public.projects p
      where p.id = webhook_events.project_id
        and p.owner_user_id = (select auth.uid())));

-- suppression_entries: owner read-only (management UI arrives with Day 5+).
create policy suppression_entries_owner_select on public.suppression_entries
  for select to authenticated using (
    exists (select 1 from public.projects p
            where p.id = suppression_entries.project_id
              and p.owner_user_id = (select auth.uid())));
