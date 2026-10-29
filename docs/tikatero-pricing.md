# Tikatero pricing contract

Configuration is stored in immutable `pricing_versions`. The launch configuration is
150 platform basis points (1.5%) plus 500 paise (₹5) per paid ticket, 1800 GST basis
points (18%), gateway mode `pass_at_cost` at 195 basis points (1.95%), payout after 2 days.
Admin saves insert a new version and an audit row in one transaction. No UPDATE,
DELETE, or TRUNCATE is allowed. Public RPC `active_pricing_version` returns only the
active version's non-sensitive fee fields; staff can read historical versions.

All money is integer paise, all rates integer basis points. `lib/pricing/compute.ts`
is the single pure calculation engine. Bigint intermediates avoid overflow or float
rounding. Each percentage component rounds half-up **per ticket**, before quantity:

1. Platform fee = round(ticket price × platform bps / 10000) + fixed fee.
2. Platform GST = round(platform fee × GST bps / 10000).
3. Gateway base = round(ticket price × gateway bps / 10000).
4. Gateway inclusive = gateway base + round(gateway base × GST bps / 10000).
   This is zero for gateway mode `absorb` or a zero gateway rate.

Gateway is calculated on ticket price, not the inclusive buyer total; no gross-up.
Free events and zero-priced tickets have zero fees. Quantity zero contributes zero.

For `fee_payer=organiser`, buyer pays the ticket price and the organiser receives
price minus platform fee, platform GST, and gateway inclusive.
For `fee_payer=buyer`, buyer pays price plus those components, and the organiser
receives the full ticket price. `platform_share` includes the platform fee and its
GST; it is a settlement allocation, not revenue net of tax. Always:
`buyer_total = organiser_share + platform_share + gateway_fee`.
A low-priced paid ticket may produce a negative organiser allocation. The engine
preserves that result rather than silently clamping it and breaking conservation;
checkout handling of uneconomic prices is outside PR 10.

| Ticket incl. GST | Platform + GST | Gateway incl. GST | Organiser absorbs: receives | Buyer pays fees: total |
| ---------------- | -------------- | ----------------- | --------------------------- | ---------------------- |
| ₹299             | ₹11.20         | ₹6.88             | ₹280.92                     | ₹317.08                |
| ₹1,000           | ₹23.60         | ₹23.01            | ₹953.39                     | ₹1,046.61              |
| ₹4,999           | ₹94.39         | ₹115.03           | ₹4,789.58                   | ₹5,208.42              |

New orders pin `pricing_version_id` on insert if omitted. Changing an order's version
is rejected; settings saves never rewrite order fees or old versions. Call the engine
with an order's stored version when inspecting an old order. PR 11 owns checkout
amount writes and payment gateway integration.

The wizard and homepage load request-fresh active configuration, without cached
launch numbers. Unconfigured local previews use the same launch defaults centrally;
a configured deployment fails closed if pricing cannot load. The homepage displays
an unavailable message rather than quoting stale fees. The wizard's ₹1,000 example
is explicitly a paid-ticket illustration, even while building a free event.

No additional environment variables are required.
