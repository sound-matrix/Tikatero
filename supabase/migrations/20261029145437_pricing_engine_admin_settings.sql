-- Append-only configuration; PR 2 already supplies the order FK and row mutation guards.
insert into public.pricing_versions(id,platform_pct,fixed_fee_paise,gst_bps,gateway_mode,gateway_bps,payout_days)
select '00000000-0000-4000-8000-000000000010',150,500,1800,'pass_at_cost',195,2
where not exists(select 1 from public.pricing_versions);

revoke insert,update,delete,truncate on public.pricing_versions from public,anon,authenticated,service_role;
drop policy pricing_versions_insert on public.pricing_versions;
create trigger pricing_versions_reject_truncate before truncate on public.pricing_versions
for each statement execute function public.reject_pricing_version_mutation();
alter table public.pricing_versions add constraint pricing_fixed_safe_integer check(fixed_fee_paise <= 9007199254740991);
alter table public.pricing_versions add constraint pricing_payout_days_limit check(payout_days <= 365);

-- Expose only the active, non-sensitive configuration. Creator and audit metadata
-- stay behind the existing staff-only table SELECT policy.
create schema pricing_private;
revoke all on schema pricing_private from public;
grant usage on schema pricing_private to anon,authenticated,service_role;
create function pricing_private.active_version()
returns table(id uuid,platform_pct integer,fixed_fee_paise bigint,gst_bps integer,gateway_mode public.gateway_mode,gateway_bps integer,payout_days integer)
language sql stable security definer set search_path='' as $$
  select p.id,p.platform_pct,p.fixed_fee_paise,p.gst_bps,p.gateway_mode,p.gateway_bps,p.payout_days
  from public.pricing_versions p where p.effective_from <= statement_timestamp()
  order by p.effective_from desc,p.id desc limit 1;
$$;
create function public.active_pricing_version()
returns table(id uuid,platform_pct integer,fixed_fee_paise bigint,gst_bps integer,gateway_mode public.gateway_mode,gateway_bps integer,payout_days integer)
language sql stable security invoker set search_path='' as $$ select * from pricing_private.active_version(); $$;
revoke all on function pricing_private.active_version(),public.active_pricing_version() from public;
grant execute on function pricing_private.active_version(),public.active_pricing_version() to anon,authenticated,service_role;

create function admin_private.save_pricing_version(p_platform_pct integer,p_fixed_fee_paise bigint,p_gateway_mode public.gateway_mode,p_gateway_bps integer,p_payout_days integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=admin_private.require_staff(); prior public.pricing_versions; saved public.pricing_versions;
begin
  -- Serialise saves so active ordering is deterministic even across concurrent staff requests.
  lock table public.pricing_versions in share row exclusive mode;
  select * into prior from public.pricing_versions order by effective_from desc,id desc limit 1;
  insert into public.pricing_versions(platform_pct,fixed_fee_paise,gst_bps,gateway_mode,gateway_bps,payout_days,created_by,effective_from)
  values(p_platform_pct,p_fixed_fee_paise,coalesce(prior.gst_bps,1800),p_gateway_mode,p_gateway_bps,p_payout_days,actor,
    greatest(clock_timestamp(),prior.effective_from+interval '1 microsecond')) returning * into saved;
  insert into public.audit_log(actor_id,action,entity,entity_id,before,after)
  values(actor,'pricing_version_created','pricing_versions',saved.id,to_jsonb(prior),to_jsonb(saved));
  return saved.id;
end;
$$;
create function public.admin_save_pricing_version(p_platform_pct integer,p_fixed_fee_paise bigint,p_gateway_mode public.gateway_mode,p_gateway_bps integer,p_payout_days integer)
returns uuid language sql security invoker set search_path='' as $$
  select admin_private.save_pricing_version(p_platform_pct,p_fixed_fee_paise,p_gateway_mode,p_gateway_bps,p_payout_days);
$$;
revoke all on function admin_private.save_pricing_version(integer,bigint,public.gateway_mode,integer,integer),public.admin_save_pricing_version(integer,bigint,public.gateway_mode,integer,integer) from public,anon,authenticated,service_role;
grant execute on function admin_private.save_pricing_version(integer,bigint,public.gateway_mode,integer,integer),public.admin_save_pricing_version(integer,bigint,public.gateway_mode,integer,integer) to authenticated;

-- Fill omitted versions on new orders only. Historical orders, including legacy
-- NULL references, are never rewritten when settings change.
create function public.pin_order_pricing_version() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.pricing_version_id is distinct from old.pricing_version_id then
      raise exception 'Order pricing version is immutable' using errcode='P0001';
    end if;
  elsif new.pricing_version_id is null then
    select p.id into new.pricing_version_id from public.active_pricing_version() p;
    if new.pricing_version_id is null then raise exception 'No active pricing version'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.pin_order_pricing_version() from public,anon,authenticated,service_role;
create trigger orders_pin_pricing_version before insert or update on public.orders
for each row execute function public.pin_order_pricing_version();
