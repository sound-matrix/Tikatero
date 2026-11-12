# Host payments

Sound Matrix receives the full ticket payment through Cashfree standard PG. Staff send each host a bank transfer and record it in **Host payouts**. Tikatero records amounts in integer paise. Dates and working-day calculations use India Standard Time. Saturday and Sunday are excluded from the working-day count.

## Manual transfers

1. Configure Cashfree standard PG through the deployment's secure environment settings. Set `CASHFREE_ENV=production` and add the live PG keys and webhook secret. Configure `PAYOUT_BANK_ENCRYPTION_KEY` as a dedicated 32-byte base64url encryption key. Keep a secure backup of the key. A key change requires re-encrypting the existing account numbers before the old key is retired.
2. Staff can check the payout mode and hold window in **Admin → Settings**. Manual is the default, with two working days after the event ends. If the event has no end time, the window starts one day after the start time. A host needs an approved identity and a successful bank check to sell real paid tickets.
3. For existing approved hosts whose full bank number was never captured, ask the host to open **Your earnings → Confirm your bank account for payments** and verify the original account again. The staff view shows the holder name, last four digits and IFSC. Showing or exporting a full number is audited.
4. Under **Admin → Host payouts**, use the real records and confirm the amount payable and whether payments are on hold. Download a bank transfer sheet if needed. The sheet includes verified destinations with a payable balance. The bank transfer itself takes place outside Tikatero.
5. After sending the transfer, use **Mark as paid** and record the method, bank reference and IST transfer date. An optional event scope attributes the transfer to one event. Otherwise, Tikatero applies it against the oldest available event balances first. A retry with the same transfer details returns the original payment ID. The host receives one email for the recorded payment. Test payments write to the email log without contacting the email provider.
6. To fix an incorrectly recorded transfer, void it with the bank reference and a reason. This restores the recorded balance and preserves the original entry. If money actually moved, reconcile with the bank before recording another transfer.

## Gateway split

The host override takes precedence over the platform mode. To switch a host later, confirm that the gateway's split product has been enabled, provision and verify its recipient in the gateway, then set the host override to `gateway_split` and confirm that the recipient ID is available to checkout before reopening paid sales. Cashfree live recipient provisioning still needs provider onboarding. The legacy mock recipient is for tests. New orders use the effective mode at booking time. Previous orders and their refunds retain their recorded mode, and manual amounts still owed remain available to staff.

Cashfree supports standard PG and the existing optional Easy Split operations. Instamojo is an adapter stub. Razorpay and PayU are selectable values for future implementations. A gateway without a working adapter is unavailable for paid bookings.

## Reconciliation

Open **Admin → Gateway costs → Host earnings reconciliation**. Tikatero independently sums the paid order shares, processed host refund deductions, and completed bank or split payments. Voided transfers are excluded from that calculation and reversed in the earnings record. Staff adjustments are reported explicitly. The expected balance equals host shares less host refund deductions and transfers, plus adjustments. Compare it with the earnings balance and investigate any difference before recording further payments.

Manual refunds are sent through the original payment gateway. Tikatero uses the saved refund allocation to reduce the host's earnings, with payment charges absorbed by Tikatero where the policy applies. Pending approved refunds reserve the host share before a transfer can be recorded. Cancelled events keep ticket proceeds unavailable while refunds are processed.
