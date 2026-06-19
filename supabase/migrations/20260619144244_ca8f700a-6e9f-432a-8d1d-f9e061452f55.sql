GRANT USAGE ON SCHEMA private TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.can_insert_order_item(uuid, uuid, text, numeric, integer, numeric) TO anon, authenticated;