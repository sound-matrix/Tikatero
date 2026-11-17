# PayU payment migration (in progress; NOT live)
## Payment credentials
Configure secret environment variables in Vercel server settings:
- PAYU_ENV=test (or production after merchant approval, full review, sandbox test)
- PAYU_MERCHANT_KEY=<PayU key>
- PAYU_MERCHANT_SALT=<PayU salt>
Never store credentials in source control, commits, PR descriptions, or frontend variables.
Regenerate any merchant salt exposed outside the secret manager.

## Scope of required cutover
1. Extend database provider constraints and checkout-hold RPCs to accept payu with manual payouts; inspect `checkout_hold_with_profile` and any order provider constraints.
2. Wire PayU into `paymentProvider` and `checkoutData`. Maintain provider-specific test-order flags and fail-closed behaviour.
3. Render signed PayU hosted checkout with a POST form from the server; do not expose the Salt.
4. Add PayU callback and webhook endpoints with constant-time reverse-hash verification, authenticated order association, amount matching, and server-side `verify_payment` before marking paid.
5. Reconcile pending PayU payments in cron with provider checks, tolerate multiple payment attempts and late success without overselling.
6. Integrate/refuse refunds safely; neither Cashfree refunds nor mock success may process PayU orders. Ensure partial refunds and cancellation workflows are tested.
7. Keep legacy Cashfree pending orders, refunds, webhooks and order history operational until settled. Keep organiser payouts manual.
8. Add integration tests for checkout, verification, webhook retries, idempotency, failure, expiry, refunds and SQL; deploy preview, sandbox test, verify production settings, then switch the active gateway in CMS.

## Existing dependencies
Cashfree is referenced by the purchase page, frontend checkout form, payment provider factory,
order reconciliation, refund routing, webhook, environment flags, database RPC checks,
and test-order classification. Do not activate PayU by editing admin settings alone.

## Reference
- https://docs.payu.in/reference/_payment_payu_hosted_checkout
- https://docs.payu.in/docs/hashing-request-and-response
- https://docs.payu.in/docs/apis-used-for-merchant-integration
