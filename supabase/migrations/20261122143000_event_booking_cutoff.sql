-- Event-wide booking deadline. Applied separately from checkout code deployment.
-- For existing and new events, NULL means close at the scheduled event start.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS booking_close_at timestamptz;
ALTER TABLE public.events ADD CONSTRAINT event_booking_close_before_start
  CHECK (booking_close_at IS NULL OR starts_at IS NULL OR booking_close_at <= starts_at);

COMMENT ON COLUMN public.events.booking_close_at IS
  'Optional organiser-selected booking deadline. NULL falls back to event start. Enforced during order creation.';

-- Database is the final authority, even for stale browser clients and late checkouts.
-- The regular checkout path obtains FOR UPDATE on the event before constructing an order.
CREATE OR REPLACE FUNCTION public.protect_event_booking_cutoff()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE booked public.events;
BEGIN
  SELECT * INTO booked FROM public.events WHERE id=NEW.event_id FOR UPDATE;
  IF NOT FOUND OR booked.status <> 'published' OR booked.hidden_at IS NOT NULL
    OR now() >= COALESCE(booked.booking_close_at, booked.starts_at)
    THEN RAISE EXCEPTION 'Bookings for this event are closed.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_event_booking_cutoff() FROM PUBLIC;
DROP TRIGGER IF EXISTS enforce_event_booking_cutoff ON public.orders;
CREATE TRIGGER enforce_event_booking_cutoff BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.protect_event_booking_cutoff();

-- A host can move the deadline earlier, but not reopen bookings or extend
-- a deadline once buyers have initiated purchases. Staff can use existing
-- event moderation controls to pause sales in emergencies.
CREATE OR REPLACE FUNCTION public.set_event_booking_close(p_event uuid, p_close timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE current_event public.events;
BEGIN
  SELECT * INTO current_event FROM public.events WHERE id=p_event FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.organisers
     WHERE id=current_event.organiser_id AND owner_id=(select auth.uid())
  ) THEN RAISE EXCEPTION 'You cannot update this event.' USING errcode='42501'; END IF;
  IF current_event.status IN ('cancelled','ended')
    OR current_event.starts_at IS NULL
    OR now() >= COALESCE(current_event.booking_close_at,current_event.starts_at)
    THEN RAISE EXCEPTION 'Bookings are already closed.'; END IF;
  IF p_close IS NULL OR p_close > current_event.starts_at OR p_close <= now()
    THEN RAISE EXCEPTION 'Choose a future booking deadline no later than the event start.'; END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE event_id=p_event)
    AND p_close > COALESCE(current_event.booking_close_at,current_event.starts_at)
    THEN RAISE EXCEPTION 'You cannot extend a booking deadline after purchases begin.'; END IF;
  UPDATE public.events SET booking_close_at=p_close WHERE id=p_event;
  INSERT INTO public.audit_log(actor_id,action,entity,entity_id,before,after)
    VALUES ((select auth.uid()),'event_booking_deadline_updated','events',p_event,
      jsonb_build_object('booking_close_at',current_event.booking_close_at),
      jsonb_build_object('booking_close_at',p_close));
END;
$$;
REVOKE ALL ON FUNCTION public.set_event_booking_close(uuid,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_event_booking_close(uuid,timestamptz) TO authenticated;
