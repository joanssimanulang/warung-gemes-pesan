ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'dibatalkan';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancellation_reason text;