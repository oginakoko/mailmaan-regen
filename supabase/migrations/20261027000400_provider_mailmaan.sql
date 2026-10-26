-- Mailmaan Day 4 — delivery provider is the Mailmaan service (ADR-0002).
-- New messages record provider='mailmaan'; Resend was descoped.
alter table if exists public.messages alter column provider set default 'mailmaan';
