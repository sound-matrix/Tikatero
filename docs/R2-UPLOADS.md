# R2 media uploads

No database changes or auth-routing changes are needed. These endpoints reuse
PR 03's verified account/membership lookup and PR 02's `is_staff()` function.
No service-role Supabase client is used.

## Environment

Set these names in the host's secret/environment store; never commit values:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BUCKET`
- `R2_PRIVATE_BUCKET`
- `R2_PUBLIC_BASE_URL`

The first three names already existed in `.env.example`. The bucket placeholders
are renamed from `R2_BUCKET_PUBLIC`/`R2_BUCKET_PRIVATE` to the required names above;
`R2_PUBLIC_BASE_URL` is new. Use separate buckets. The private bucket must have
public access disabled, with no public custom domain. Scope the R2 API token to
Object Read & Write for only these buckets. Never prefix these credentials with
`NEXT_PUBLIC_`.

`R2_PUBLIC_BASE_URL` must be an HTTPS public-bucket origin, optionally with a
fixed path prefix, without query strings, fragments, credentials or wildcards.
It is used server-side to construct public URLs and at build time to configure
Next Image's exact origin/path allow-list. Private R2 endpoints are not image
optimizer sources. Image redirects are disabled. Redeploy after changing this URL.

## R2 CORS

Both buckets need CORS configured before browser PUT uploads will work. Use your
exact production/approved preview origins in `AllowedOrigins` (add localhost only
for development). For example, with your real origin substituted:

```json
[
  {
    "AllowedOrigins": ["https://your-tikatero-host.example"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type", "Content-Length"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 300
  }
]
```

CORS does not make the private bucket public. Signed PUT URLs use the R2 S3 API
domain; public asset URLs use `R2_PUBLIC_BASE_URL`. Private GET links download an
attachment, so staff review does not require browser script access to document
bodies. Add GET CORS only if a later reviewer UI needs fetch-based reads.

## Signing API

`POST /api/uploads/sign`, JSON:

```json
{ "kind": "poster", "mime": "image/jpeg", "size": 123456, "entityId": "<event UUID>" }
```

`kind` is `poster`, `guest_photo`, `org_logo` or `kyc_doc`. The first two require
membership of the organiser that owns the event. The latter two take the
organiser UUID and require membership of that organiser. Staff also need a
membership to sign uploads; they have no upload override. Pending/draft members
can upload, including documents needed for future verification forms.

Images allow `image/jpeg`, `image/png`, `image/webp` up to 5 × 1024² bytes.
`kyc_doc` also allows `application/pdf`, up to 10 × 1024² bytes. Empty,
fractional, non-numeric and oversized sizes are rejected. File-name extensions
are generated from the allow-listed MIME, never the original file name.

Response: `{ url, key, publicUrl?, expiresIn: 300, mime }`. Keys have the form
`kind/entityId/random-uuid.ext`; `kyc_doc` is signed only for the private bucket
and never gets a public URL. PUT the original File bytes directly to `url`,
using `Content-Type: mime`; browsers automatically set `Content-Length`.
The signature binds both headers to prevent changing the declared type or size.
Use raw File bytes, not multipart FormData. Request a new URL when retrying.

These are declared MIME checks, not file-content inspection. A later asset
attachment/publishing flow must perform any required content inspection and
verify the uploaded key before persisting it. This PR does not attach keys to
events, guests, logos or KYC rows. Presigned URLs are reusable bearer links until
they expire; do not log, persist or share them.

## Private KYC reads

`getSignedReadUrl(key, ttlSeconds)` is in the server-only `lib/r2.ts` module.
`POST /api/uploads/read` accepts `{ key, ttlSeconds?: 300 }` and requires an
active staff/admin account using the existing database role helper. Non-staff
receive 403, anonymous callers 401. Only canonical `kyc_doc/...` keys are
accepted; the bucket cannot be supplied by a caller. TTL must be an integer
between 1 and 300 seconds. The response is `{ url, expiresIn }`, marked private
and no-store. The signed GET overrides content disposition to attachment and
cache control to private/no-store.

## Component

```tsx
<ImageUpload
  kind="poster"
  entityId={event.id}
  label="Event poster"
  onUpload={({ key, publicUrl }) => {
    /* pass to a later asset attachment form */
  }}
/>
```

The component validates before signing, previews local images, shows PDF names
without embedding documents, reports actual XHR upload progress and allows a
retry after failure. Blob previews are revoked and active requests are aborted
on unmount. Its callback returns only a key and optional permanent public URL,
never the presigned URL. A live component example is in `/styleguide`; that
example uses a placeholder event and cannot upload to a real event without an
authorised consumer supplying an existing entity ID.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build && pnpm check:no-secrets
pnpm exec playwright test e2e/media-upload.spec.ts
```

Unit tests mock the S3 client and presigner for API/role checks. One additional
offline SDK test generates a signature using random test credentials to verify
that type and exact length appear in signed headers. No test contacts R2 or
requires real R2 credentials. Browser component tests intercept signing/storage
requests; the existing auth tests still run against local Supabase in CI.
