-- Keep one minimal audit row per PayU delivery, separate from the idempotency log.
alter table public.webhook_events
  add column provider text,
  add column txnid text,
  add column status text,
  add column received_at timestamptz,
  add column hash_valid boolean;
