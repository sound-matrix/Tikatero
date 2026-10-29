-- PR 03: self-service signup may create a draft only. PR 02 already creates
-- profiles on signup and owner memberships on organiser insert; reuse both.
-- A restrictive policy composes with PR 02's ownership policy rather than
-- replacing it. Service-role administration remains outside authenticated RLS.
create policy organisers_signup_draft
on public.organisers
as restrictive
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and blocked_at is null
  )
  and (
    public.is_staff()
    or (
      owner_id = (select auth.uid())
      and kyc_status = 'draft'
      and approved_at is null
      and approved_by is null
      and payouts_on_hold = false
      and sales_paused = false
      and cashfree_vendor_id is null
    )
  )
);
