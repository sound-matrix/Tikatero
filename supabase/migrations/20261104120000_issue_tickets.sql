-- PR 12. Issue one ticket per paid seat, once. Service role only.
-- Existing ticket rows, redeem_ticket, and email claim rules are unchanged.

alter table public.orders
  add column emailed_at timestamptz;

comment on column public.orders.emailed_at is
  'When the order confirmation was accepted by the email provider. Null until then so the payments cron can retry.';

alter table public.tickets
  add column seq integer,
  add column pdf_key text,
  add constraint tickets_seq_check check (seq is null or (seq >= 1 and seq <= 99)),
  add constraint tickets_pdf_key_check check (
    pdf_key is null
    or pdf_key ~ '^tickets/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/TK-[A-Z0-9]{5}-[0-9]{2}\.pdf$'
  );

comment on column public.tickets.seq is 'Seat number within the order, starting at 1. Shown as Ticket N of M.';
comment on column public.tickets.pdf_key is 'Private R2 key for this ticket PDF. Not granted to browser roles.';
comment on column public.tickets.qr_secret is
  'Key version for tickets issued by issue_tickets (v1). Not a signing key. Older rows may still hold the per-ticket nonce used by redeem_ticket.';

create unique index tickets_order_seq_key on public.tickets (order_id, seq) where seq is not null;
create index order_outbox_unconsumed_paid_idx
  on public.order_outbox (created_at)
  where topic = 'order.paid' and consumed_at is null;
create index orders_unemailed_paid_idx
  on public.orders (paid_at)
  where status = 'paid' and emailed_at is null;

grant select (seq) on public.tickets to authenticated;

-- 5 Crockford characters. 32 is a power of two, so the low 5 bits are unbiased.
create function public.ticket_code_prefix()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  raw bytea := extensions.gen_random_bytes(5);
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  prefix text := '';
  i integer;
begin
  for i in 0..4 loop
    prefix := prefix || substr(alphabet, (get_byte(raw, i) & 31) + 1, 1);
  end loop;
  return prefix;
end;
$$;

comment on function public.ticket_code_prefix() is
  'Internal Crockford prefix for TK-XXXXX-NN. Not an API.';

create function public.issue_tickets(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ord public.orders;
  box_id uuid;
  consumed timestamptz;
  existing integer;
  seats integer;
  names jsonb;
  prefix text;
  attempt integer;
  seq integer;
  seat integer;
  item record;
  holder text;
begin
  if p_order_id is null then
    return 0;
  end if;

  select * into ord from public.orders where id = p_order_id for update;
  if not found or ord.status is distinct from 'paid' then
    return 0;
  end if;

  -- A review case is never fulfilled, even if an order.paid row also exists.
  if exists (
    select 1 from public.order_outbox
    where order_id = ord.id and topic = 'payment.review_required'
  ) then
    return 0;
  end if;

  select id, consumed_at into box_id, consumed
  from public.order_outbox
  where order_id = ord.id and topic = 'order.paid'
  for update;
  if not found then
    return 0;
  end if;

  select count(*)::integer into existing from public.tickets where order_id = ord.id;
  if existing > 0 then
    update public.order_outbox
    set consumed_at = coalesce(consumed_at, now())
    where id = box_id;
    return existing;
  end if;

  if consumed is not null then
    return 0;
  end if;

  select coalesce(sum(qty), 0)::integer into seats
  from public.order_items
  where order_id = ord.id;
  if seats < 1 or seats > 99 then
    return 0;
  end if;

  names := case
    when jsonb_typeof(ord.attendee_names) = 'array' then ord.attendee_names
    else '[]'::jsonb
  end;

  for attempt in 1..8 loop
    prefix := public.ticket_code_prefix();
    begin
      seq := 0;
      for item in
        select oi.ticket_type_id, oi.qty
        from public.order_items oi
        join public.ticket_types tt on tt.id = oi.ticket_type_id
        where oi.order_id = ord.id
        order by tt.sort, oi.ticket_type_id
      loop
        for seat in 1..item.qty loop
          seq := seq + 1;
          holder := null;
          if jsonb_typeof(names -> (seq - 1)) = 'string' then
            holder := nullif(left(btrim(names ->> (seq - 1)), 120), '');
          end if;
          insert into public.tickets (
            order_id, event_id, ticket_type_id, code, seq,
            holder_name, holder_email, qr_secret
          ) values (
            ord.id,
            ord.event_id,
            item.ticket_type_id,
            'TK-' || prefix || '-' || lpad(seq::text, 2, '0'),
            seq,
            coalesce(holder, ord.buyer_name),
            ord.buyer_email,
            'v1'
          );
        end loop;
      end loop;
      exit;
    exception
      when unique_violation then
        if attempt = 8 then
          raise exception 'Ticket codes could not be issued.' using errcode = 'P0001';
        end if;
    end;
  end loop;

  update public.order_outbox
  set consumed_at = now()
  where id = box_id and consumed_at is null;

  return (select count(*)::integer from public.tickets where order_id = ord.id);
end;
$$;

comment on function public.issue_tickets(uuid) is
  'Issues one ticket per seat for a paid order.paid outbox row. Locks the order, consumes the row, and is a no-op when tickets already exist.';

-- Explicit provider failures only. sending/unknown/sent claims stay held.
create function public.release_failed_order_email(p_entity_ref text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
  ref text := btrim(p_entity_ref);
begin
  if ref is null or ref = '' or length(ref) > 200 or ref ~ '[[:cntrl:]]' then
    return false;
  end if;
  delete from public.email_log
  where template = 'order_confirmed'
    and entity_ref = ref
    and status in ('failed_provider', 'failed_render');
  get diagnostics removed = row_count;
  return removed > 0;
end;
$$;

comment on function public.release_failed_order_email(text) is
  'Lets the payments cron retry an order confirmation after a definite render or provider failure. Does not release sending, unknown, or sent claims.';

revoke all on function public.ticket_code_prefix() from public, anon, authenticated, service_role;
revoke all on function public.issue_tickets(uuid) from public, anon, authenticated;
revoke all on function public.release_failed_order_email(text) from public, anon, authenticated;
grant execute on function public.issue_tickets(uuid) to service_role;
grant execute on function public.release_failed_order_email(text) to service_role;
