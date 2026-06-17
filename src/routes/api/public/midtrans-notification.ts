import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";

export const Route = createFileRoute("/api/public/midtrans-notification")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const serverKey = process.env.MIDTRANS_SERVER_KEY;
        if (!serverKey) return new Response("Server not configured", { status: 500 });

        let payload: any;
        try {
          payload = await request.json();
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        const { order_id, status_code, gross_amount, signature_key, transaction_status, fraud_status } = payload ?? {};
        if (!order_id || !status_code || !gross_amount || !signature_key) {
          return new Response("Missing fields", { status: 400 });
        }

        const expected = createHash("sha512")
          .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
          .digest("hex");
        if (expected !== signature_key) {
          return new Response("Invalid signature", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Find our internal order by midtrans_order_id
        const { data: order } = await supabaseAdmin
          .from("orders")
          .select("id")
          .eq("midtrans_order_id", order_id)
          .maybeSingle();

        if (!order) {
          // Acknowledge to avoid Midtrans retries forever; log for debug
          console.warn("[Midtrans webhook] unknown order", order_id);
          return new Response("ok");
        }

        const { error: rpcErr } = await supabaseAdmin.rpc("apply_midtrans_status", {
          p_order_id: order.id,
          p_transaction_status: String(transaction_status ?? ""),
          p_fraud_status: String(fraud_status ?? "accept"),
        });
        if (rpcErr) {
          console.error("[Midtrans webhook] rpc err", rpcErr);
          return new Response("DB error", { status: 500 });
        }

        return new Response("ok");
      },
    },
  },
});
