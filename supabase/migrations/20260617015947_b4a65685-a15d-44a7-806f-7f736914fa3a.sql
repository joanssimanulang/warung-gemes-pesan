
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS midtrans_order_id text,
  ADD COLUMN IF NOT EXISTS qr_url text,
  ADD COLUMN IF NOT EXISTS payment_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS orders_midtrans_order_id_key ON public.orders(midtrans_order_id) WHERE midtrans_order_id IS NOT NULL;

DROP FUNCTION IF EXISTS public.get_public_order(uuid);

CREATE OR REPLACE FUNCTION public.get_public_order(p_order_id uuid)
RETURNS TABLE(
  id uuid, status order_status, payment_status payment_status,
  total_price numeric, table_number text, location_type location_type,
  room_name text, customer_first_name text, whatsapp_masked text,
  created_at timestamptz, qr_url text, midtrans_order_id text,
  payment_expires_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    o.id, o.status, o.payment_status, o.total_price, o.table_number, o.location_type,
    r.name AS room_name,
    split_part(o.customer_name, ' ', 1) AS customer_first_name,
    CASE WHEN length(o.whatsapp) <= 4 THEN repeat('*', length(o.whatsapp))
         ELSE repeat('*', length(o.whatsapp) - 4) || right(o.whatsapp, 4) END AS whatsapp_masked,
    o.created_at, o.qr_url, o.midtrans_order_id, o.payment_expires_at
  FROM public.orders o
  LEFT JOIN public.rooms r ON r.id = o.room_id
  WHERE o.id = p_order_id;
$$;

CREATE OR REPLACE FUNCTION public.apply_midtrans_status(
  p_order_id uuid,
  p_transaction_status text,
  p_fraud_status text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_transaction_status IN ('settlement','capture') AND COALESCE(p_fraud_status,'accept') = 'accept' THEN
    UPDATE public.orders SET payment_status = 'dibayar', updated_at = now()
      WHERE id = p_order_id AND payment_status <> 'dibayar';
  ELSIF p_transaction_status IN ('expire','cancel','deny','failure') THEN
    UPDATE public.orders SET payment_status = 'gagal', updated_at = now()
      WHERE id = p_order_id AND payment_status <> 'dibayar';
  END IF;
END;
$$;
