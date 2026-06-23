import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatRupiah, statusLabel } from "@/lib/format";
import { ChefHat, CheckCircle2, MessageCircle, Clock, XCircle, Ban } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/admin/")({
  component: AdminOrdersPage,
});

type OrderStatus = "menunggu" | "diproses" | "selesai" | "dibatalkan";

interface Order {
  id: string;
  customer_name: string;
  whatsapp: string;
  table_number: string | null;
  total_price: number;
  status: OrderStatus;
  payment_status: string;
  created_at: string;
  location_type: "kantin" | "ruangan";
  room_id: string | null;
  cancellation_reason: string | null;
  rooms?: { name: string; building: string | null; floor: string | null } | null;
}
interface Item {
  id: string;
  order_id: string;
  menu_name: string;
  quantity: number;
  subtotal: number;
}

const CANCEL_REASONS = [
  "Stok habis",
  "Sedang tidak berjualan",
  "Sedang tidak berada di tempat",
  "Bahan baku tidak tersedia",
  "Pesanan duplikat",
  "Lainnya",
];

function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, Item[]>>({});
  const [filter, setFilter] = useState<"all" | OrderStatus>("all");
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);

  const loadAll = async () => {
    const { data: o } = await supabase
      .from("orders")
      .select("*, rooms(name,building,floor)")
      .order("created_at", { ascending: false })
      .limit(100);
    setOrders((o ?? []) as unknown as Order[]);
    const ids = (o ?? []).map((x) => x.id);
    if (ids.length) {
      const { data: it } = await supabase.from("order_items").select("*").in("order_id", ids);
      const grouped: Record<string, Item[]> = {};
      (it ?? []).forEach((row: any) => {
        (grouped[row.order_id] ??= []).push(row);
      });
      setItems(grouped);
    }
  };

  useEffect(() => {
    loadAll();
    const ch = supabase
      .channel("admin-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const updateStatus = async (id: string, status: OrderStatus, extra: Partial<Order> = {}) => {
    // optimistic update so the UI flips instantly without page refresh
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status, ...extra } : o)));
    const payload: any = { status, ...extra };
    const { error } = await supabase.from("orders").update(payload).eq("id", id);
    if (error) {
      toast.error(error.message);
      loadAll(); // rollback to truth on failure
    } else {
      toast.success("Status diperbarui");
      loadAll();
    }
  };

  const filtered = orders.filter((o) => filter === "all" ? true : o.status === filter);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Pesanan Masuk</h1>
        <span className="text-xs text-muted-foreground">{orders.length} total</span>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {(["all", "menunggu", "diproses", "selesai", "dibatalkan"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            {f === "all" ? "Semua" : statusLabel(f)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Belum ada pesanan.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              items={items[o.id] ?? []}
              onProcess={() => updateStatus(o.id, "diproses")}
              onComplete={() => updateStatus(o.id, "selesai")}
              onCancel={() => setCancelTarget(o)}
            />
          ))}
        </div>
      )}

      <CancelDialog
        order={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={async (reason) => {
          if (cancelTarget) {
            await updateStatus(cancelTarget.id, "dibatalkan", { cancellation_reason: reason });
            setCancelTarget(null);
          }
        }}
      />
    </div>
  );
}

function normalizeWaPhone(phone: string) {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

function buildWaUrl(phone: string, message: string) {
  const phoneNumber = normalizeWaPhone(phone);
  const params = new URLSearchParams({
    phone: phoneNumber,
    text: message,
    type: "phone_number",
    app_absent: "0",
  });
  return `https://api.whatsapp.com/send/?${params.toString()}`;
}

function OrderCard({
  order, items, onProcess, onComplete, onCancel,
}: {
  order: Order; items: Item[];
  onProcess: () => void; onComplete: () => void; onCancel: () => void;
}) {
  const isProcessing = order.status === "diproses";
  const isDone = order.status === "selesai";
  const isCancelled = order.status === "dibatalkan";

  const locationLabel = order.location_type === "ruangan"
    ? `Antar ke ${order.rooms?.name ?? "Ruangan"}${order.rooms?.building ? ` (${order.rooms.building}${order.rooms.floor ? ` Lt. ${order.rooms.floor}` : ""})` : ""}`
    : `Meja ${order.table_number ?? "-"}`;

  const orderCode = order.id.slice(0, 8).toUpperCase();
  const waProcessMsg =
    `Halo ${order.customer_name}, pesanan kamu (#${orderCode}) di Warung Mie Kampus sedang kami siapkan. ${order.location_type === "ruangan" ? `Akan diantar ke ${order.rooms?.name ?? "ruangan tujuan"}.` : `Akan segera diantar ke meja ${order.table_number}.`} Terima kasih!`
  ;
  const waDoneMsg =
    `Halo ${order.customer_name}, pesanan kamu (#${orderCode}) sudah selesai. ${order.location_type === "ruangan" ? `Diantar ke ${order.rooms?.name ?? "ruangan tujuan"}.` : `Silakan ambil di meja ${order.table_number}.`} Selamat menikmati!`
  ;
  const waCancelMsg =
    `Halo ${order.customer_name}, mohon maaf pesanan kamu (#${orderCode}) di Warung Mie Kampus terpaksa kami batalkan.\nAlasan: ${order.cancellation_reason ?? "-"}\nJika sudah membayar, dana akan kami kembalikan. Terima kasih atas pengertiannya.`
  ;

  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-xs text-muted-foreground">#{orderCode}</div>
          <div className="text-base font-bold">{order.customer_name}</div>
          <div className="text-xs text-muted-foreground">{locationLabel} · {order.whatsapp}</div>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="mt-3 space-y-1 rounded-2xl bg-secondary/60 p-3 text-sm">
        {items.map((i) => (
          <div key={i.id} className="flex justify-between">
            <span>{i.menu_name} × {i.quantity}</span>
            <span>{formatRupiah(Number(i.subtotal))}</span>
          </div>
        ))}
        <div className="mt-1 flex justify-between border-t border-border pt-1 text-sm font-bold">
          <span>Total</span><span className="text-primary">{formatRupiah(Number(order.total_price))}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        <span className={`rounded-full px-2 py-0.5 font-semibold ${order.payment_status === "dibayar" ? "bg-success/15 text-success" : "bg-warning/30 text-warning-foreground"}`}>
          {statusLabel(order.payment_status)}
        </span>
        <span className="text-muted-foreground">{new Date(order.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>

      {isCancelled && (
        <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-xs">
          <div className="font-bold text-destructive">Dibatalkan</div>
          <div className="mt-0.5 text-destructive/80">Alasan: {order.cancellation_reason ?? "-"}</div>
          <a
            href={buildWaUrl(order.whatsapp, waCancelMsg)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center justify-center gap-2 rounded-full bg-success py-2 text-xs font-bold text-success-foreground"
          >
            <MessageCircle className="h-4 w-4" /> Kirim WA — Pemberitahuan Pembatalan
          </a>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {order.status === "menunggu" && (
          <>
            <button
              onClick={onProcess}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-bold text-primary-foreground active:scale-[0.98]"
            >
              <ChefHat className="h-4 w-4" /> Proses Pesanan
            </button>
            <button
              onClick={onCancel}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-destructive/40 bg-destructive/10 py-2.5 text-xs font-bold text-destructive active:scale-[0.98]"
            >
              <Ban className="h-4 w-4" /> Batalkan Pesanan
            </button>
          </>
        )}

        {(isProcessing || isDone) && (
          <div className="space-y-2 rounded-2xl border border-border bg-background/60 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Kirim notifikasi WhatsApp
            </div>
            <a
              href={buildWaUrl(order.whatsapp, isDone ? waDoneMsg : waProcessMsg)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-success py-2.5 text-xs font-bold text-success-foreground"
            >
              <MessageCircle className="h-4 w-4" />
              Kirim WA — {isDone ? "Pesanan Selesai" : "Sedang Diproses"}
            </a>

            {isProcessing && (
              <>
                <button
                  onClick={onComplete}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-3 text-sm font-bold text-background active:scale-[0.98]"
                >
                  <CheckCircle2 className="h-4 w-4" /> Ubah Status ke Selesai
                </button>
                <button
                  onClick={onCancel}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-destructive/40 bg-destructive/10 py-2.5 text-xs font-bold text-destructive active:scale-[0.98]"
                >
                  <Ban className="h-4 w-4" /> Batalkan Pesanan
                </button>
              </>
            )}
            {isDone && (
              <div className="flex items-center justify-center gap-2 text-xs text-success">
                <CheckCircle2 className="h-4 w-4" /> Pesanan selesai
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, { c: string; icon: any }> = {
    menunggu: { c: "bg-warning/30 text-warning-foreground", icon: Clock },
    diproses: { c: "bg-primary/15 text-primary", icon: ChefHat },
    selesai: { c: "bg-success/15 text-success", icon: CheckCircle2 },
    dibatalkan: { c: "bg-destructive/15 text-destructive", icon: XCircle },
  };
  const m = map[status];
  const Icon = m.icon;
  return (
    <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${m.c}`}>
      <Icon className="h-3 w-3" /> {statusLabel(status)}
    </span>
  );
}

function CancelDialog({
  order, onClose, onConfirm,
}: {
  order: Order | null;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}) {
  const [preset, setPreset] = useState<string>(CANCEL_REASONS[0]);
  const [custom, setCustom] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (order) { setPreset(CANCEL_REASONS[0]); setCustom(""); }
  }, [order?.id]);

  const finalReason = preset === "Lainnya" ? custom.trim() : preset;
  const canSubmit = finalReason.length > 0 && !submitting;

  return (
    <Dialog open={!!order} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Batalkan Pesanan</DialogTitle>
          <DialogDescription>
            Pilih alasan pembatalan. Alasan ini akan dicatat dan bisa dikirim ke pelanggan via WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold">Alasan</label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CANCEL_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {preset === "Lainnya" && (
            <div>
              <label className="mb-1 block text-xs font-semibold">Tulis alasan</label>
              <Textarea
                placeholder="Misal: listrik padam, hujan deras, dll."
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="rounded-full bg-secondary px-4 py-2 text-sm font-semibold"
          >
            Batal
          </button>
          <button
            disabled={!canSubmit}
            onClick={async () => {
              setSubmitting(true);
              try { await onConfirm(finalReason); } finally { setSubmitting(false); }
            }}
            className="rounded-full bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground disabled:opacity-50"
          >
            Konfirmasi Pembatalan
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
