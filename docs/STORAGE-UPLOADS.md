# Supabase Storage uploads

Uses `NEXT_PUBLIC_SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE_KEY` on the existing project. No extra storage credentials or custom domain are needed.

Apply `20261111144606_supabase_storage.sql` in the normal deployment process:

- `event-media`: public images, 5 MB maximum, JPEG/PNG/WebP only.
- `private-files`: private documents, ticket PDFs, exports and temporary upload parts, 10 MB maximum. Server-issued read links expire within five minutes.

Storage RLS permits public reads of event-media only. Restrictive policies deny all browser-role writes on both buckets and all browser-role private reads, even if a broader permissive policy is added later. Service-role access remains server-only.

## Upload flow

1. `POST /api/uploads/sign` validates metadata and the active account's organiser/event ownership. The response keeps the existing `url`, `key`, `publicUrl`, `expiresIn`, `mime` fields and adds an opaque `headers` object.
2. The browser sends sequential 3 MB parts to `PUT /api/uploads/file?part=N`, using those headers. Each request rechecks the account and ownership, verifies a five-minute HMAC ticket, and bounds the streamed body to the signed size. Small parts fit Vercel's 4.5 MB request limit while allowing 5 MB images and 10 MB KYC files.
3. Multi-part files remain in private staging until all signed sizes and the actual JPEG/PNG/WebP/PDF magic bytes pass. The server uploads through Supabase's service-role client, then removes staging parts. A cancelled/failed browser upload asks the authorised DELETE route to discard its parts. Starting another upload performs bounded cleanup of expired abandoned parts; they remain private until removal. Upserts are disabled for user uploads.
4. Public object keys start with `media/`; public URLs are `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/event-media/<key>`. Old URLs and legacy public keys display as missing images. Existing DB columns and historical migrations are retained. No existing production data is migrated.

Clients never receive service-role keys or unrestricted storage upload URLs. The file component displays the resulting public URL after upload, so it also verifies that the saved image is readable.

`getSignedReadUrl(key, ttlSeconds)` retains staff-only KYC checks in `/api/uploads/read`. `signTicketPdf` retains buyer/order authorisation in the ticket route. Both return attachment URLs; routes send private/no-store headers. Private storage objects are never added to Next Image's allow-list.

## Checks

Unit tests cover paths, ticket expiry/tampering, byte sniffing, caps, private signing and multi-part assembly. Upload-route tests cover anonymous/blocked callers, ownership changes, staff access and provider failures. `supabase/tests/storage.test.sql` verifies bucket settings and role isolation. Playwright exercises both transport errors and a real authenticated upload against local Supabase, then renders the stored event poster. Never run the fixture against a hosted database.
