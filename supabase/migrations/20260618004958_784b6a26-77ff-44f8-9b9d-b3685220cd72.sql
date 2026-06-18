
-- 1. Tighten order_items INSERT policy: only allow inserts on freshly-created orders (within 5 min) that are still awaiting payment
DROP POLICY IF EXISTS "Anyone can insert order_items" ON public.order_items;
CREATE POLICY "Insert items for fresh pending orders"
ON public.order_items
FOR INSERT
TO anon, authenticated
WITH CHECK (
  quantity > 0
  AND unit_price >= 0
  AND subtotal >= 0
  AND length(trim(menu_name)) > 0
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.payment_status = 'menunggu_pembayaran'
      AND o.created_at > now() - interval '5 minutes'
  )
);

-- 2. Revoke EXECUTE on privileged SECURITY DEFINER functions from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.mark_order_paid(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_midtrans_status(uuid, text, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_super(uuid) FROM anon, PUBLIC;
-- has_role / is_admin_or_super still need to be callable by authenticated (used inside RLS policies via SECURITY DEFINER, but also referenced as helper) — keep authenticated EXECUTE
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_super(uuid) TO authenticated;
