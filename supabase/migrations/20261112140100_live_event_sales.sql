-- Keep the existing sales and CSV contract. The live figures include refunds and active holds.
create function payout_private.live_event_sales(p_event_id uuid, p_detail boolean)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  ev public.events;
  report jsonb;
  channels jsonb;
begin
  select * into ev from public.events where id = p_event_id;
  if not found then return null; end if;

  with paid as materialized (
    select * from public.orders where event_id = p_event_id and not is_test
      and paid_at is not null and status in ('paid', 'partially_refunded', 'refunded')
  ), refunded as (
    select r.order_id, count(*) filter (where r.status in ('approved', 'processed')) as refund_count,
      coalesce(sum(r.amount_paise) filter (where r.status in ('approved', 'processed')), 0) as refunded_paise,
      coalesce(sum(r.organiser_reversal_paise) filter (where r.status in ('approved', 'processed')), 0) as reversal,
      count(*) filter (where r.status = 'requested') as pending
    from public.refunds r join paid o on o.id = r.order_id
    group by r.order_id
  ), order_money as materialized (
    select o.*, coalesce(r.refunded_paise, 0) as refunded_paise,
      coalesce(r.reversal, 0) as reversal, coalesce(r.pending, 0) as pending,
      coalesce(r.refund_count, 0) as refund_count
    from paid o left join refunded r on r.order_id = o.id
  ), tickets as (
    select t.ticket_type_id,
      count(*) filter (where t.status = 'refunded') as refunded,
      count(*) filter (where t.status = 'void') as voided,
      count(*) filter (where t.status = 'used') as checked_in,
      count(*) filter (where not exists (select 1 from public.order_items i
        where i.order_id = t.order_id and i.ticket_type_id = t.ticket_type_id)) as issued_without_line
    from public.tickets t join paid o on o.id = t.order_id
    group by t.ticket_type_id
  ), line_money as (
    select i.ticket_type_id, i.order_id, i.qty, i.qty * i.unit_price_paise as money,
      o.organiser_share_paise - o.reversal as share, o.subtotal_paise,
      sum(i.qty * i.unit_price_paise) over (partition by i.order_id order by i.ticket_type_id) as running_money
    from public.order_items i join order_money o on o.id = i.order_id
  ), line_totals as (
    -- Allocate the stored order share by ticket money, carrying rounding remainders
    -- across lines so each order reconciles to its exact share.
    select ticket_type_id, sum(qty) as sold, sum(money) as money,
      sum(case when subtotal_paise = 0 then 0 else
        floor(share * running_money / subtotal_paise) -
        floor(share * (running_money - money) / subtotal_paise) end) as share
    from line_money group by ticket_type_id
  ), holds as (
    select i.ticket_type_id, sum(i.qty) as qty_held
    from public.order_items i join public.orders o on o.id = i.order_id
    where o.event_id = p_event_id and not o.is_test and o.status in ('created', 'pending')
      and o.hold_expires_at > statement_timestamp()
    group by i.ticket_type_id
  ), test_inventory as (
    select i.ticket_type_id, sum(i.qty) as sold
    from public.order_items i join public.orders o on o.id = i.order_id
    where o.event_id = p_event_id and o.is_test and o.status in ('paid','partially_refunded','refunded')
      and o.paid_at is not null
    group by i.ticket_type_id
  ), ticket_types as (
    select tt.id, tt.name, tt.price_paise, tt.sort, tt.qty_total,
      case when ev.status = 'cancelled' then 0 else greatest(0, coalesce(l.sold, 0) +
        coalesce(t.issued_without_line, 0) - coalesce(t.refunded, 0) - coalesce(t.voided, 0)) end as sold,
      greatest(0, tt.qty_sold - coalesce(ti.sold, 0)) as inventory_sold,
      coalesce(t.refunded, 0) as refunded_tickets, coalesce(t.checked_in, 0) as checked_in,
      coalesce(h.qty_held, 0) as qty_held, coalesce(l.money, 0) as money_paise,
      coalesce(l.share, 0) as share_paise
    from public.ticket_types tt
    left join line_totals l on l.ticket_type_id = tt.id
    left join tickets t on t.ticket_type_id = tt.id
    left join holds h on h.ticket_type_id = tt.id
    left join test_inventory ti on ti.ticket_type_id = tt.id
    where tt.event_id = p_event_id
  ), payouts as materialized (
    select p.status, p.amount_paise, p.created_at, p.settled_at, p.expected_at
    from public.payouts p where p.event_id = p_event_id and not p.is_test
  ), day_totals as (
    select (paid_at at time zone 'Asia/Kolkata')::date as date, sum(subtotal_paise) as money_paise,
      count(*) as orders from paid
    where (paid_at at time zone 'Asia/Kolkata')::date >=
      (statement_timestamp() at time zone 'Asia/Kolkata')::date - 29 group by 1
  ), day_sales as (
    select dates.date, coalesce(t.money_paise, 0) as money_paise, coalesce(t.orders, 0) as orders
    from generate_series(29, 0, -1) as offsets(days)
    cross join lateral (select (statement_timestamp() at time zone 'Asia/Kolkata')::date - offsets.days as date) dates
    left join day_totals t on t.date = dates.date
  )
  select jsonb_build_object(
    'venue', ev.venue_name,
    'capacity', ev.capacity,
    'seats_left', greatest(0, ev.capacity - coalesce((select sum(inventory_sold) from ticket_types), 0)),
    'tickets_sold', coalesce((select sum(sold) from ticket_types), 0),
    'tickets_left', coalesce((select sum(greatest(0, qty_total - inventory_sold)) from ticket_types), 0),
    'qty_held', coalesce((select sum(qty_held) from ticket_types), 0),
    'checked_in', coalesce((select sum(checked_in) from ticket_types), 0),
    'refunded_tickets', coalesce((select sum(refunded_tickets) from ticket_types), 0),
    'refunded_paise', coalesce((select sum(refunded_paise) from order_money), 0),
    'refund_count', coalesce((select sum(refund_count) from order_money), 0),
    'refund_requests_pending', coalesce((select sum(pending) from order_money), 0),
    'ticket_money_paise', coalesce((select sum(subtotal_paise) from order_money), 0),
    'buyer_paid_paise', coalesce((select sum(total_paise) from order_money), 0),
    'fee_paise', coalesce((select sum(platform_fee_paise) from order_money), 0),
    'fee_gst_paise', coalesce((select sum(platform_fee_gst_paise) from order_money), 0),
    'gateway_paise', coalesce((select sum(gateway_fee_paise) from order_money), 0),
    'organiser_refunds_paise', coalesce((select sum(reversal) from order_money), 0),
    'share_paise', coalesce((select sum(organiser_share_paise - reversal) from order_money), 0),
    'paid_out_paise', coalesce((select sum(amount_paise) from payouts where status = 'settled'), 0),
    'to_be_paid_paise', coalesce((select sum(amount_paise) from payouts where status = 'scheduled'), 0),
    'on_hold_paise', coalesce((select sum(amount_paise) from payouts where status = 'on_hold'), 0),
    'expected_at', (select min(expected_at) from payouts where status = 'scheduled'),
    'ticket_types', coalesce((select jsonb_agg(to_jsonb(t) || jsonb_build_object('left',
      greatest(0, t.qty_total - t.inventory_sold)) order by t.sort, t.name) from ticket_types t), '[]'::jsonb),
    'sales_by_day', case when p_detail then coalesce((select jsonb_agg(to_jsonb(d) order by d.date)
      from day_sales d), '[]'::jsonb) else '[]'::jsonb end
  ) into report;
  if ev.capacity is null then report := jsonb_set(report, '{seats_left}', 'null'::jsonb); end if;
  if p_detail and exists (select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.orders'::regclass and attname = 'ref_channel' and not attisdropped) then
    execute $query$
      select coalesce(jsonb_agg(to_jsonb(c) order by c.bookings desc, c.channel), '[]'::jsonb)
      from (
        select coalesce(ref_channel, 'Direct') as channel, count(*) as bookings
        from public.orders where event_id = $1 and not is_test
          and status in ('paid','partially_refunded','refunded') and paid_at is not null group by 1
      ) c
    $query$ into channels using p_event_id;
    report := report || jsonb_build_object('channels', channels);
  end if;
  return report;
end;
$$;

create or replace function public.organiser_event_sales(p_event_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare live jsonb; legacy jsonb;
begin
  if not payout_private.can_view_sales(p_event_id) then
    raise exception 'You cannot view sales for this event.' using errcode = '42501';
  end if;
  live := payout_private.live_event_sales(p_event_id, true);
  legacy := payout_private.event_payload(p_event_id, true);
  legacy := jsonb_set(legacy, '{tiers}', (select coalesce(jsonb_agg(
    tier || jsonb_build_object('qty_held', coalesce(report->'qty_held', '0'::jsonb)) order by position
  ), '[]'::jsonb)
    from jsonb_array_elements(legacy->'tiers') with ordinality t(tier, position)
    left join jsonb_array_elements(live->'ticket_types') report on report->>'id' = tier->>'id'));
  return legacy || (live - 'tickets_sold' - 'checked_in' - 'to_be_paid_paise')
    || jsonb_build_object('live', live);
end;
$$;

create or replace function public.organiser_dashboard()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or exists (
    select 1 from public.profiles where id = auth.uid() and blocked_at is not null
  ) then
    raise exception 'You cannot view sales for this event.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', organiser.id,
    'display_name', organiser.display_name,
    'events', coalesce((
      select jsonb_agg(payout_private.event_payload(event.id, false) || jsonb_build_object(
        'live', payout_private.live_event_sales(event.id, false)) order by event.starts_at desc)
      from public.events as event where event.organiser_id = organiser.id
    ), '[]'::jsonb)
  ) order by organiser.display_name), '[]'::jsonb)
  into result from public.organisers as organiser
  where organiser.kyc_status = 'approved' and public.is_org_member(organiser.id);
  return jsonb_build_object('organisers', coalesce(result, '[]'::jsonb));
end;
$$;

create function public.event_excel_rows(p_event_id uuid, p_staff boolean, p_include_orders boolean default true)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not payout_private.can_view_sales(p_event_id) then
    raise exception 'You cannot view sales for this event.' using errcode = '42501';
  end if;
  if p_staff then perform admin_private.require_staff(); end if;
  if public.is_staff() then
    perform moderation_private.audit(p_event_id, 'event_export', null, null, 'Downloaded event Excel.');
  end if;
  with paid as (
    select * from public.orders where event_id = p_event_id and not is_test
      and paid_at is not null and status in ('paid', 'partially_refunded', 'refunded')
  ), order_rows as (
    select left(o.id::text, 8) as id, o.paid_at, lines.ticket_types, lines.qty,
      o.subtotal_paise, o.platform_fee_paise, o.platform_fee_gst_paise, o.gateway_fee_paise,
      r.refund_paise, o.organiser_share_paise - r.reversal as share_paise,
      case when r.refund_paise >= o.total_paise and o.total_paise > 0 then 'Refunded'
        when r.requested then 'Refund requested'
        when r.refund_paise > 0 then 'Part refunded' else 'Paid' end as status
    from paid o
    cross join lateral (
      select coalesce(string_agg(t.name || ' × ' || i.qty, ', ' order by t.sort, t.id), '') as ticket_types,
        coalesce(sum(i.qty), 0) as qty
      from public.order_items i join public.ticket_types t on t.id = i.ticket_type_id where i.order_id = o.id
    ) lines
    cross join lateral (
      select coalesce(sum(amount_paise) filter (where status in ('approved','processed')), 0) as refund_paise,
        coalesce(sum(organiser_reversal_paise) filter (where status in ('approved','processed')), 0) as reversal,
        bool_or(status = 'requested') as requested from public.refunds where order_id = o.id
    ) r
  ), payouts as (
    select created_at, settled_at, expected_at, amount_paise, status
    from public.payouts where event_id = p_event_id and not is_test
  )
  select jsonb_build_object(
    'orders', case when p_include_orders then coalesce((select jsonb_agg(to_jsonb(o) order by o.paid_at desc, o.id) from order_rows o), '[]'::jsonb) else '[]'::jsonb end,
    'payouts', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from payouts p), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.event_excel_rows(uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.event_excel_rows(uuid, boolean, boolean) to authenticated;
