-- PR 15. New payout terminal state for a refund. Kept in its own migration so the
-- value is committed before later functions use it.

alter type public.payout_status add value if not exists 'cancelled';
