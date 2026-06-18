
-- 1. Tighten order_items insert: unit_price must match menus.price, subtotal must equal quantity * unit_price, menu must exist & be available
DROP POLICY IF EXISTS "Insert items for fresh pending orders" ON public.order_items;
CREATE POLICY "Insert items for fresh pending orders"
ON public.order_items
FOR INSERT
TO anon, authenticated
WITH CHECK (
  quantity > 0
  AND menu_id IS NOT NULL
  AND length(trim(menu_name)) > 0
  AND subtotal = quantity * unit_price
  AND EXISTS (
    SELECT 1 FROM public.menus m
    WHERE m.id = order_items.menu_id
      AND m.is_available = true
      AND m.price = order_items.unit_price
  )
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.payment_status = 'menunggu_pembayaran'
      AND o.created_at > now() - interval '5 minutes'
  )
);

-- 2. Recompute orders.total_price from order_items server-side, so client-supplied value cannot understate the bill.
CREATE OR REPLACE FUNCTION public.recompute_order_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders o
  SET total_price = COALESCE((
    SELECT SUM(i.subtotal) FROM public.order_items i WHERE i.order_id = o.id
  ), 0),
  updated_at = now()
  WHERE o.id = COALESCE(NEW.order_id, OLD.order_id)
    AND o.payment_status = 'menunggu_pembayaran';
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.recompute_order_total() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_recompute_order_total_ins ON public.order_items;
CREATE TRIGGER trg_recompute_order_total_ins
AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.recompute_order_total();
