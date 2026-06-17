DROP POLICY IF EXISTS "Anyone can read orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;

CREATE POLICY "Admin can read orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (public.is_admin_or_super(auth.uid()));

CREATE POLICY "Anyone can create orders"
  ON public.orders FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(trim(customer_name)) BETWEEN 2 AND 100
    AND length(trim(whatsapp)) BETWEEN 8 AND 20
    AND total_price >= 0
    AND (
      (location_type = 'kantin' AND table_number IS NOT NULL AND room_id IS NULL)
      OR (location_type = 'ruangan' AND room_id IS NOT NULL)
    )
  );

DROP POLICY IF EXISTS "Anyone can read order_items" ON public.order_items;
DROP POLICY IF EXISTS "Anyone can insert order_items" ON public.order_items;

CREATE POLICY "Admin can read order_items"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (public.is_admin_or_super(auth.uid()));

CREATE POLICY "Anyone can insert order_items"
  ON public.order_items FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    quantity > 0
    AND unit_price >= 0
    AND subtotal >= 0
    AND length(trim(menu_name)) > 0
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id)
  );

CREATE OR REPLACE FUNCTION public.get_public_order(p_order_id uuid)
RETURNS TABLE (
  id uuid,
  status order_status,
  payment_status payment_status,
  total_price numeric,
  table_number text,
  location_type location_type,
  room_name text,
  customer_first_name text,
  whatsapp_masked text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id,
    o.status,
    o.payment_status,
    o.total_price,
    o.table_number,
    o.location_type,
    r.name AS room_name,
    split_part(o.customer_name, ' ', 1) AS customer_first_name,
    CASE
      WHEN length(o.whatsapp) <= 4 THEN repeat('*', length(o.whatsapp))
      ELSE repeat('*', length(o.whatsapp) - 4) || right(o.whatsapp, 4)
    END AS whatsapp_masked,
    o.created_at
  FROM public.orders o
  LEFT JOIN public.rooms r ON r.id = o.room_id
  WHERE o.id = p_order_id;
$$;

CREATE OR REPLACE FUNCTION public.get_public_order_items(p_order_id uuid)
RETURNS TABLE (
  id uuid,
  menu_name text,
  quantity integer,
  unit_price numeric,
  subtotal numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.menu_name, i.quantity, i.unit_price, i.subtotal
  FROM public.order_items i
  WHERE i.order_id = p_order_id;
$$;

CREATE OR REPLACE FUNCTION public.mark_order_paid(p_order_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.orders
  SET payment_status = 'dibayar', updated_at = now()
  WHERE id = p_order_id AND payment_status = 'menunggu_pembayaran';
$$;

REVOKE ALL ON FUNCTION public.get_public_order(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_order_items(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_order_paid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_order(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_order_items(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_paid(uuid) TO anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.orders';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'order_items'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.order_items';
  END IF;
END $$;

DROP POLICY IF EXISTS "Authenticated can list menu images" ON storage.objects;