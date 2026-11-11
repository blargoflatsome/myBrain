-- SPEC §5 Tasks (feedback round 4): "Clear crossed-off" hides done tasks from the list but keeps them, so the
-- Journal, Dashboard and future achievements still count them (SPEC §10 keeps full completion histories).
alter table public.tasks add column cleared_at timestamptz;
