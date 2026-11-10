-- PR 13 security fix. redeem_ticket checks HMAC(code, tickets.qr_secret).
-- PR 12 stores the public key version 'v1' in that column, so anyone who can
-- call the function can forge a signature. Browser roles must not execute it.
-- All redemption goes through public.scan_redeem on the server.

revoke all on function public.redeem_ticket(text, text, text) from public, anon, authenticated;

comment on function public.redeem_ticket(text, text, text) is
  'Retired for browser roles. qr_secret is a public key version, not a signing key. The server calls scan_redeem after it verifies the ticket signature.';

-- New scan outcome for orders.is_test. Added in its own migration so later
-- functions can use the value after this transaction commits.
alter type public.scan_result add value if not exists 'test';
