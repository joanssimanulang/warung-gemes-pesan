CREATE OR REPLACE FUNCTION public.can_insert_order_item(
  p_order_id uuid,
  p_menu_id uuid,
  p_menu_name text,
  p_unit_price numeric,
  p_quantity integer,
  p_subtotal numeric
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_quantity > 0
    AND p_menu_id IS NOT NULL
    AND length(trim(COALESCE(p_menu_name, ''))) > 0
    AND p_unit_price >= 0
    AND p_subtotal = p_quantity * p_unit_price
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.menus m ON m.id = p_menu_id
      WHERE o.id = p_order_id
        AND o.payment_status = 'menunggu_pembayaran'
        AND o.created_at > now() - interval '5 minutes'
        AND m.is_available = true
        AND m.price = p_unit_price
    );
$$;

REVOKE ALL ON FUNCTION public.can_insert_order_item(uuid, uuid, text, numeric, integer, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_insert_order_item(uuid, uuid, text, numeric, integer, numeric) TO anon, authenticated;

DROP POLICY IF EXISTS "Insert items for fresh pending orders" ON public.order_items;
CREATE POLICY "Insert items for fresh pending orders"
ON public.order_items
FOR INSERT
TO anon, authenticated
WITH CHECK (
  public.can_insert_order_item(order_id, menu_id, menu_name, unit_price, quantity, subtotal)
);