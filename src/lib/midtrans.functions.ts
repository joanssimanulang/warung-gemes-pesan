import { createServerFn } from "@tanstack/react-start";

const MIDTRANS_BASE = "https://api.sandbox.midtrans.com";

export const createQrisTransaction = createServerFn({ method: "POST" })
  .inputValidator((d: { orderId: string }) => {
    if (!d?.orderId || typeof d.orderId !== "string") throw new Error("orderId required");
    return d;
  })
  .handler(async ({ data }) => {
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) throw new Error("MIDTRANS_SERVER_KEY not set");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Load the order
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id,total_price,payment_status,qr_url,midtrans_order_id,payment_expires_at")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error || !order) throw new Error("Order not found");
    if (order.payment_status === "dibayar") {
      return { qr_url: order.qr_url, midtrans_order_id: order.midtrans_order_id, already_paid: true };
    }

    // Reuse existing QR if not expired
    if (order.qr_url && order.payment_expires_at && new Date(order.payment_expires_at) > new Date()) {
      return { qr_url: order.qr_url, midtrans_order_id: order.midtrans_order_id, already_paid: false };
    }

    // New short order_id (Midtrans max ~50 chars, must be unique). Use prefix + short uuid + ts.
    const shortId = `WMK-${String(order.id).slice(0, 8)}-${Date.now().toString(36)}`;
    const grossAmount = Math.round(Number(order.total_price));

    const auth = "Basic " + Buffer.from(serverKey + ":").toString("base64");
    const resp = await fetch(`${MIDTRANS_BASE}/v2/charge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: auth,
      },
      body: JSON.stringify({
        payment_type: "qris",
        transaction_details: { order_id: shortId, gross_amount: grossAmount },
        qris: { acquirer: "gopay" },
        custom_expiry: { expiry_duration: 15, unit: "minute" },
      }),
    });

    const body = await resp.json();
    if (!resp.ok || (body.status_code && Number(body.status_code) >= 400 && Number(body.status_code) !== 201)) {
      console.error("[Midtrans] charge failed", body);
      throw new Error(body?.status_message || "Midtrans charge failed");
    }

    const qrAction = Array.isArray(body.actions)
      ? body.actions.find((a: any) => a.name === "generate-qr-code")
      : null;
    const qrUrl: string | undefined = qrAction?.url;
    const expiresAt: string | undefined = body.expiry_time
      ? new Date(body.expiry_time.replace(" ", "T") + "+07:00").toISOString()
      : new Date(Date.now() + 15 * 60 * 1000).toISOString();

    if (!qrUrl) throw new Error("No QR URL from Midtrans");

    await supabaseAdmin
      .from("orders")
      .update({
        midtrans_order_id: shortId,
        qr_url: qrUrl,
        payment_expires_at: expiresAt,
      })
      .eq("id", order.id);

    return { qr_url: qrUrl, midtrans_order_id: shortId, already_paid: false };
  });

export const syncMidtransStatus = createServerFn({ method: "POST" })
  .inputValidator((d: { orderId: string }) => {
    if (!d?.orderId || typeof d.orderId !== "string") throw new Error("orderId required");
    return d;
  })
  .handler(async ({ data }) => {
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) throw new Error("MIDTRANS_SERVER_KEY not set");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id,midtrans_order_id,payment_status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order || !order.midtrans_order_id) return { synced: false };
    if (order.payment_status === "dibayar") return { synced: true, status: "settlement" };

    const auth = "Basic " + Buffer.from(serverKey + ":").toString("base64");
    const resp = await fetch(`${MIDTRANS_BASE}/v2/${order.midtrans_order_id}/status`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: auth },
    });
    const body = await resp.json();
    const txStatus = String(body.transaction_status ?? "");
    const fraudStatus = String(body.fraud_status ?? "accept");
    if (!txStatus) return { synced: false };

    await supabaseAdmin.rpc("apply_midtrans_status", {
      p_order_id: order.id,
      p_transaction_status: txStatus,
      p_fraud_status: fraudStatus,
    });

    return { synced: true, status: txStatus };
  });
