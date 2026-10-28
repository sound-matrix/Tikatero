# Tikatero — Build Plan (v1, 28 Oct 2026 IST)
Source of truth: `tikatero-v3-prototype.html` (approved), `tikatero-pricing.md`, `tikatero-kyc.md`, `review.md`, `brand/`.
Stack: Next.js (App Router, TS) on Vercel · Supabase (Postgres, Auth, RLS, Edge Functions/cron) · Cashfree PG + Easy Split + Secure ID · Resend · Cloudflare R2 · (WhatsApp provider later).
Domains/DNS: handled by Anthony (tikatero.com, mail sending domain for Resend, R2 custom domain `media.`).

## 0. Non-negotiable rules (put in every PR)
- White background; P4 logo (`brand/tikatero-logo.svg`, horizontal/stacked JPG fallbacks, app icon).
- Tokens from v3: coral `#F25C54` → orange `#FF9F43` gradient for CTAs; ink `#2D3142`; muted `#5C6170`; line `#E7E8EC`; soft `#F7F8FA`; **teal `#0E9F9A` = trust/verified/secure**; **gold `#C9A227` = VIP**; green `#1F9D55` success; red `#D93025` errors.
- Simple UX for common people: big tap targets, plain English (Hindi later), checkout on one page, no signup needed to pay.
- All prices INR, **shown inclusive of GST**; "No hidden fees. What you see is what you pay."
- Footer/legal: only "© Sound Matrix". No registration numbers, no addresses.
- Times shown in IST. Money stored as integer paise.
- Never commit/print secrets; `.env.example` only lists names.

## 1. Phases & timing (season-first)
Key dates: Diwali 8 Nov 2026 · Christmas 25 Dec · New Year's Eve 31 Dec. Diwali is 11 days away, so full self-serve paid ticketing for Diwali isn't realistic.

| Phase | Window | Goal |
|---|---|---|
| **P0 Foundations** | 29 Oct – 4 Nov | Repo, design system, Supabase schema + RLS, auth + roles, R2 uploads, Resend. |
| **P0.5 Diwali pilot (optional)** | live by ~6 Nov | **Free/RSVP events + admin-assisted paid events** for 1–3 hand-picked organisers (staff create event, manual KYC, Cashfree PG to Sound Matrix with Easy Split vendor added manually). QR email ticket + scanner. |
| **P1 MVP — Christmas/NYE** | 5 Nov – 30 Nov (public 1 Dec) | Self-serve organiser signup + India KYC + admin approval, event wizard (tiers, themes, VIP guests, map), one-page checkout with Cashfree, Easy Split payouts T+2, QR tickets + PDF + email, offline-capable scanner PWA, organiser dashboard, admin CMS (KYC queue, pricing, blocks, audit log), legal pages, account deletion. |
| **P1.1 Hardening** | 1 – 15 Dec | Load test (NYE spikes), refunds (72h policy), webhook reconciliation, ticket transfer, coupons, waitlist, monitoring. Sales open for NYE. |
| **P2** | Jan – Mar 2027 | International KYC (Veriff/Stripe Identity), WhatsApp tickets/reminders, GST invoices monthly, bulk PDF batch for physical tickets, broadcasts, team roles beyond door, map discovery, Hindi. |
| **P3** | Apr 2027+ | Foreign payouts, API/webhooks, white-label, Pro plans, FilmyAI/Learning Mind tie-ins. |

## 2. Surfaces & routes
**Attendee (public, `tikatero.com`)**
- `/` discover (search, city/country picker, trending festive) · `/events?city=&q=&date=` · `/map` (P2)
- `/e/[slug]` event page (poster, date/venue, Open in Maps, VIP guests, tiers, refund policy, organiser verified badge in teal)
- `/e/[slug]/checkout` one-page checkout (name, email, phone, qty, fee display incl GST, Cashfree)
- `/orders/[orderId]/status` (return URL; polls payment) · `/t/[ticketCode]` ticket view (QR, offline, brightness hint, transfer P1.1)
- `/me` tickets, `/me/settings` (data access/delete) · `/login` (email OTP / magic link) · `/legal/terms|privacy|refunds` · `/help`
**Organiser console (`/console`)**
- `/console/onboarding` (account type → KYC India / outside India(P2)) · `/console/pending`
- `/console/events` · `/console/events/new` (wizard: basics → venue/map → poster/theme → VIP guests → tiers → fees/refunds → review/publish) · `/console/events/[id]` (overview, sales, attendees, refunds, waitlist)
- `/console/events/[id]/team` · `/console/events/[id]/scan` (scanner PWA) · `/console/payouts` · `/console/settings`
**Admin CMS (`/admin`, staff only)**
- `/admin` dashboard · `/admin/kyc` queue + `/admin/kyc/[id]` (approve / reject / request docs, note) · `/admin/organisers` · `/admin/events` (feature, unpublish) · `/admin/pricing` (fee %, fixed fee, gateway pass mode, payout T+N; versioned) · `/admin/broadcasts` (P1.1: segments like ticket holders of event, attendees in city, organisers pending KYC) · `/admin/accounts` (block/suspend, reason required, hold payouts & pause sales) · `/admin/audit` (append-only, IST) · `/admin/content` (homepage trending, legal page text)
**API / server**
- `/api/cashfree/webhook` (payments, refunds, split settlement) · `/api/kyc/*` (Secure ID calls server-side) · `/api/uploads/sign` (R2 presigned) · `/api/tickets/[code]/pdf` · `/api/scan` (validate+redeem) · `/api/scan/sync` · cron: reconciliation, reminders, payout status.

## 3. Supabase schema (outline)
Enums: `user_role (attendee, organiser, staff, admin)`, `kyc_status (draft, submitted, auto_passed, needs_docs, approved, rejected)`, `event_status (draft, pending, published, unpublished, ended, cancelled)`, `order_status (created, pending, paid, failed, refunded, partially_refunded, expired)`, `ticket_status (valid, used, void, transferred, refunded)`, `team_role (owner, manager, door)`, `fee_payer (organiser, buyer)`.

| Table | Key columns |
|---|---|
| `profiles` | id (=auth.users), full_name, phone, role, country, blocked_at, block_reason, created_at |
| `organisers` | id, owner_id, display_name, slug, legal_name, country, kyc_status, approved_at, approved_by, payouts_on_hold bool, sales_paused bool, cashfree_vendor_id |
| `organiser_members` | organiser_id, user_id, role (owner/manager), invited_email |
| `kyc_applications` | id, organiser_id, region (IN/INTL), pan_last4, pan_name, pan_name_match, aadhaar_last4, gstin, bank_ifsc, bank_acct_last4, bank_holder_name, liveness_score, face_match_score, provider_refs jsonb (no raw docs), doc_keys (R2 private keys), status, reviewer_id, reviewer_note, submitted_at, decided_at |
| `events` | id, organiser_id, slug unique, title, description, category, starts_at, ends_at, gates_open_at, timezone, venue_name, address, city, country, lat, lng, maps_url, poster_key, theme (diwali/christmas/newyear/…), status, is_free, fee_payer, refund_policy (e.g. 72h), capacity, published_at |
| `event_guests` | event_id, name, title, photo_key, sort, is_vip |
| `ticket_types` | id, event_id, name, price_paise (incl GST shown), qty_total, qty_sold, per_order_max, sales_start/end, is_vip, design jsonb, sort |
| `event_team` | event_id, user_id/email, role (manager/door), invited_by |
| `orders` | id, event_id, buyer_id nullable, buyer_name/email/phone, subtotal_paise, platform_fee_paise, platform_fee_gst_paise, gateway_fee_paise, total_paise, fee_payer, status, cf_order_id, cf_payment_id, pricing_version_id, created_at, paid_at |
| `order_items` | order_id, ticket_type_id, qty, unit_price_paise |
| `tickets` | id, order_id, event_id, ticket_type_id, code (TK-XXXXX-NN), holder_name, holder_email, qr_secret (HMAC nonce), status, used_at, used_by, gate, transferred_to |
| `scans` | id, ticket_id, event_id, scanner_user_id, result (ok/duplicate/invalid/wrong_event), gate, scanned_at, device_id, synced_at |
| `refunds` | id, order_id, amount_paise, reason, status, requested_by, approved_by, cf_refund_id |
| `payouts` | id, organiser_id, event_id, order_id, cf_split_ref, amount_paise, status (scheduled/settled/failed/on_hold), expected_at, settled_at |
| `pricing_versions` | id, platform_pct (bps), fixed_fee_paise, gst_bps, gateway_mode (pass_at_cost/absorb), gateway_bps, payout_days, effective_from, created_by |
| `waitlist` (P1.1) | event_id, ticket_type_id, email, created_at |
| `coupons` (P1.1) | event_id, code, pct/amount, max_uses, used |
| `email_log` | id, to_email, template, entity_ref, resend_id, status, created_at |
| `broadcasts` (P1.1) | id, segment jsonb, channel, subject, body, sent_count, created_by |
| `audit_log` | id, actor_id, action, entity, entity_id, before jsonb, after jsonb, reason, created_at — **insert-only** (no UPDATE/DELETE grants; trigger blocks) |
| `webhook_events` | id, source, event_id unique (idempotency), payload jsonb, processed_at |

**RLS outline**
- Helper SQL functions: `is_staff()`, `is_org_member(org_id)`, `is_event_team(event_id, roles[])`.
- `events`, `ticket_types`, `event_guests`: public SELECT where status='published'; org members full CRUD on own; publish UPDATE only if organiser.kyc_status='approved' and not sales_paused (enforced by trigger too).
- `orders`/`tickets`: buyer SELECT own (buyer_id=auth.uid() or email match via signed token route); org members SELECT for their events (PII limited via view `event_attendees_v`); INSERT/UPDATE **only via service role** (server actions/webhook).
- `scans`: door/manager INSERT for their event via RPC `redeem_ticket(code, sig, gate)` (SECURITY DEFINER, row lock, single-use).
- `kyc_applications`: owner INSERT/SELECT own (masked fields); staff SELECT/UPDATE; doc_keys never exposed to client.
- `pricing_versions`, `broadcasts`, `audit_log`: staff only; audit_log no update/delete for anyone.
- `profiles`: self read/update limited columns; staff read all.
- Storage: R2 (not Supabase Storage). Public bucket = posters/guest photos; private bucket = KYC docs, ticket PDFs (signed URLs, short TTL).

## 4. Money: Cashfree PG + Easy Split
1. Organiser approved → server creates Easy Split **vendor** (bank verified name = KYC name) → store `cashfree_vendor_id`.
2. Checkout: server computes fees from current `pricing_versions` (all in paise, integer rounding documented):
   - platform_fee = round(price × 1.5%) + ₹5 per paid ticket; GST 18% on platform fee; gateway 1.95% + GST (pass at cost).
   - `fee_payer=organiser`: buyer pays ticket price; `fee_payer=buyer`: buyer pays price + fees (shown as one inclusive total with breakdown).
   - Reproduce pricing-doc examples in unit tests (₹1,000 → organiser ₹953.39; ₹299 → ₹280.92; ₹4,999 → ₹4,789.58).
3. Create Cashfree order with `order_splits` [{vendor_id, amount = organiser share}]; remainder stays with Sound Matrix (platform fee + GST). Reserve tickets (qty hold 10 min) before redirect.
4. Webhook (signature verified, idempotent by event id) → mark paid → issue tickets → email. Also poll `/orders/{id}` on return page and a 5-min reconciliation cron.
5. Settlement: Cashfree settles T+1; vendor split payout scheduled so money reaches organiser **within 2 working days of settlement**. Track in `payouts`; admin "hold payouts" toggles vendor settlement hold via API.
6. Refunds: within policy (default full refund ≥72h before event) → Cashfree refund API with split reversal; platform fee refund policy = open question.
7. Festive offer: 0% gateway on first ₹20L GMV till 31 Mar 2027 — config flag in pricing_versions (`gateway_bps=0`) if Anthony chooses to pass it on.

## 5. KYC flow (India in MVP)
Apply → PAN verify (Secure ID, name) → Aadhaar via DigiLocker/offline XML (store last 4 only) → GSTIN (optional) → bank penny-drop + name match → selfie liveness + face match → status `auto_passed` or `needs_docs` → **admin review** (approve/reject/request docs, note; audited) → email → publish unlocked + Easy Split vendor created. Organisers can draft events while pending. Outside India: UI stub "coming soon" in MVP; Veriff/Stripe Identity in P2. Raw documents: encrypted private R2, deleted after retention period (open question).

## 6. Email events (Resend, React Email templates, branded white)
| Trigger | To |
|---|---|
| Login OTP / magic link (Supabase Auth via Resend SMTP) | user |
| Order confirmed + tickets (PDF attached, QR, Open in Maps, add to calendar) | buyer (+ each holder if named) |
| Payment failed / order expired | buyer |
| Event reminder (24h, and day-of gates-open change) | ticket holders |
| Event changed / cancelled | ticket holders |
| Refund requested / processed | buyer, organiser |
| Ticket transferred (P1.1) | sender, recipient |
| Organiser KYC submitted / needs docs / approved / rejected | organiser |
| Team invite (manager/door) | invitee |
| Payout settled / on hold | organiser |
| Account blocked / sales paused (with reason) | organiser/user |
| Admin alert: new KYC, webhook failure, payout failure | staff |
Footer: "© Sound Matrix · Help · Privacy". All logged in `email_log`.

## 7. R2 media
- Buckets: `tikatero-public` (posters, guest photos, logos; served via `media.tikatero.com` — Anthony sets DNS) and `tikatero-private` (KYC docs, generated PDFs).
- Upload: client asks `/api/uploads/sign` (auth + role check, mime/size allow-list: jpg/png/webp ≤ 5 MB) → presigned PUT → store key only. Resize via Next/Image loader or Cloudflare Images (open question).
- Ticket PDFs generated on demand (`@react-pdf/renderer`), cached in private bucket, signed GET 10 min.

## 8. Non-functional
- QR = `code.signature` (HMAC-SHA256 with server secret) — verifiable offline by scanner with event-scoped key; redemption syncs and resolves duplicates by earliest scan.
- Scanner PWA: service worker, IndexedDB ticket list download per event, manual name/phone search.
- Rate limits on checkout/OTP, Turnstile on checkout & signup. Sentry + Vercel logs. Load target: 200 orders/min NYE peak.
- Accessibility: WCAG AA contrast (check coral text on white — use ink text on coral buttons if needed), 44px targets.
- DPDP: consent at checkout, data export/delete in settings, grievance contact on Help (no address).

## 9. Open questions for Anthony
1. **Diwali**: do we run an admin-assisted pilot (free/RSVP + 1–3 known organisers) by ~6 Nov, or skip Diwali and launch publicly 1 Dec for Christmas/NYE?
2. **Cashfree**: is the Sound Matrix merchant account + Easy Split + Secure ID activated? Confirm Easy Split fee (0.20% vs 0.25%) and festive 0% offer eligibility for a marketplace; do we pass the 0% gateway to organisers as a launch hook?
3. **Tax/legal**: CA sign-off on GST on platform fee, TCS/TDS as e-commerce operator, and who issues the ticket invoice (organiser vs Sound Matrix). Lawyer review of terms/refunds/privacy drafts.
4. Refunds: is the platform fee refunded on cancellation? Who bears gateway fee on refunds? Event-cancelled policy?
5. Login: email OTP only for MVP, or phone OTP (SMS cost ~₹0.12–0.20)? WhatsApp provider choice for P2.
6. KYC document retention period; who are the staff reviewers (names/emails for admin seats)?
7. Domains: `tikatero.com` + `media.` (R2) + Resend sending subdomain (e.g. `mail.`) — DNS ready by 2 Nov?
8. Supabase region (Mumbai `ap-south-1`) and Vercel team/plan; one Supabase project per env (dev/prod)?
9. Are ticket prices entered by organisers GST-inclusive (assumed yes) — and do organisers need GSTIN on their tickets?
10. Max tickets per order, and is resale/transfer allowed in MVP?

## 10. PR sequence (see `codex-prompts/`)
01 scaffold & design system → 02 schema + RLS → 03 auth & roles → 04 R2 uploads → 05 email (Resend) → 06 organiser onboarding & KYC India → 07 admin KYC queue, accounts, audit → 08 event wizard → 09 public discovery & event page → 10 pricing engine + admin pricing → 11 Cashfree checkout & webhook → 12 tickets, QR, PDF, confirmation email → 13 scanner PWA + team → 14 organiser dashboard & payouts (Easy Split vendor) → 15 refunds, legal pages, account deletion → 16 hardening, reconciliation, load test, launch checklist.
