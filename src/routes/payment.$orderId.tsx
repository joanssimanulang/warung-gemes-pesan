import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { CustomerHeader } from "@/components/CustomerHeader";
import { formatRupiah } from "@/lib/format";
import { Loader2, CheckCircle2, AlertTriangle, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { createQrisTransaction, syncMidtransStatus } from "@/lib/midtrans.functions";

export const Route = createFileRoute("/payment/$orderId")({
  component: PaymentPage,
});

function PaymentPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const createQris = useServerFn(createQrisTransaction);
  const syncStatus = useServerFn(syncMidtransStatus);

  const [order, setOrder] = useState<any>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestedRef = useRef(false);

  const isQrExpired = (expiresAt?: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt).getTime() <= Date.now();
  };

  const requestFreshQr = async () => {
    setError(null);
    setRefreshing(true);
    try {
      const res = await createQris({ data: { orderId } });
      if (res?.qr_url) setQrUrl(res.qr_url);
      const { data } = await supabase.rpc("get_public_order", { p_order_id: orderId });
      const o = Array.isArray(data) ? data[0] ?? null : data;
      if (o) setOrder(o);
    } catch (e: any) {
      setError(e?.message ?? "Gagal membuat QRIS");
    } finally {
      setRefreshing(false);
    }
  };

  const copyQrUrl = async () => {
    if (!qrUrl) return;
    await navigator.clipboard.writeText(qrUrl);
    toast.success("Link QR disalin");
  };

  // Initial load + start QR request
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("get_public_order", { p_order_id: orderId });
      const o = Array.isArray(data) ? data[0] ?? null : data;
      if (cancelled) return;
      setOrder(o);
      const expired = isQrExpired(o?.payment_expires_at);
      if (o?.qr_url && !expired) setQrUrl(o.qr_url);
      if (o?.qr_url && expired) setQrUrl(null);

      if (!requestedRef.current && o && o.payment_status !== "dibayar" && (!o.qr_url || expired)) {
        requestedRef.current = true;
        try {
          const res = await createQris({ data: { orderId } });
          if (!cancelled && res?.qr_url) setQrUrl(res.qr_url);
          const { data: freshData } = await supabase.rpc("get_public_order", { p_order_id: orderId });
          const freshOrder = Array.isArray(freshData) ? freshData[0] ?? null : freshData;
          if (!cancelled && freshOrder) setOrder(freshOrder);
        } catch (e: any) {
          if (!cancelled) setError(e?.message ?? "Gagal membuat QRIS");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, createQris]);

  // Poll payment status every 4s
  useEffect(() => {
    if (!order || order.payment_status === "dibayar") return;
    const t = setInterval(async () => {
      try { await syncStatus({ data: { orderId } }); } catch {}
      const { data } = await supabase.rpc("get_public_order", { p_order_id: orderId });
      const o = Array.isArray(data) ? data[0] ?? null : data;
      if (o) {
        setOrder(o);
        if (o.qr_url && !isQrExpired(o.payment_expires_at)) setQrUrl(o.qr_url);
        if (o.qr_url && isQrExpired(o.payment_expires_at)) setQrUrl(null);
        if (o.payment_status === "dibayar") {
          clearInterval(t);
          toast.success("Pembayaran berhasil");
          setTimeout(() => navigate({ to: "/track/$orderId", params: { orderId } }), 1200);
        }
      }
    }, 4000);
    return () => clearInterval(t);
  }, [order, orderId, qrUrl, navigate]);

  if (!order) {
    return (
      <div className="min-h-screen bg-background">
        <CustomerHeader />
        <div className="mx-auto max-w-2xl px-4 pt-20 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const paid = order.payment_status === "dibayar";
  const qrExpired = !paid && isQrExpired(order.payment_expires_at);

  return (
    <div className="min-h-screen bg-background pb-10">
      <CustomerHeader />
      <main className="mx-auto max-w-2xl px-4 pt-4">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Pesanan</div>
              <div className="font-mono text-sm font-semibold">
                #{String(order.id).slice(0, 8).toUpperCase()}
              </div>
            </div>
            <div className="rounded-full bg-warning/30 px-3 py-1 text-xs font-bold text-warning-foreground">
              QRIS · Sandbox
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-secondary p-4 text-center">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Total Pembayaran</div>
            <div className="mt-1 text-3xl font-extrabold text-primary">
              {formatRupiah(Number(order.total_price))}
            </div>
          </div>

          <div className="mt-5 flex flex-col items-center">
            {paid ? (
              <div className="flex flex-col items-center text-center">
                <CheckCircle2 className="h-20 w-20 text-success" />
                <div className="mt-2 text-lg font-bold text-success">Pembayaran Berhasil</div>
                <div className="text-sm text-muted-foreground">Mengarahkan ke pelacakan…</div>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center text-center">
                <AlertTriangle className="h-12 w-12 text-destructive" />
                <div className="mt-2 text-sm font-semibold text-destructive">{error}</div>
              </div>
            ) : qrExpired ? (
              <div className="flex flex-col items-center text-center">
                <AlertTriangle className="h-12 w-12 text-warning" />
                <div className="mt-2 text-sm font-semibold">QRIS sudah kedaluwarsa</div>
                <button
                  type="button"
                  onClick={requestFreshQr}
                  disabled={refreshing}
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Buat QRIS Baru
                </button>
              </div>
            ) : qrUrl ? (
              <>
                <div className="rounded-2xl bg-white p-3">
                  <img src={qrUrl} alt="QRIS Midtrans" className="h-56 w-56" />
                </div>
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Scan QRIS dengan aplikasi e-wallet (sandbox)
                </p>
                <div className="mt-4 flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="font-medium">Menunggu pembayaran…</span>
                </div>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={copyQrUrl}
                    className="inline-flex items-center gap-2 rounded-full border border-primary px-4 py-2 text-xs font-semibold text-primary"
                  >
                    <Copy className="h-4 w-4" />
                    Salin Link QR
                  </button>
                  <a
                    href="https://simulator.sandbox.midtrans.com/v2/qris/index"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-primary px-4 py-2 text-xs font-semibold text-primary"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Simulator QRIS
                  </a>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                Membuat QRIS…
              </div>
            )}
          </div>
        </div>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          * Midtrans Sandbox – tidak ada uang nyata yang ditarik. Status diperbarui otomatis lewat webhook.
        </p>
      </main>
    </div>
  );
}
