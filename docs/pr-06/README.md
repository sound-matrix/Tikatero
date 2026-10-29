# PR 06 screenshots

Screenshots use synthetic organiser details in the running mock journey. No government lookup,
real bank transfer, live ID or real email is used. The local screenshot fixture runs the actual
migrations and save RPC in embedded Postgres; CI runs the browser test against local Supabase.

- [Organiser details](01-organiser-details.png)
- [PAN check and name match](02-pan-check.png)
- [Mock DigiLocker result](03-aadhaar-check.png)
- [Review before submission](04-review.png)
