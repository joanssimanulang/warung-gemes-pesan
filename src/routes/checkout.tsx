import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CustomerHeader } from "@/components/CustomerHeader";
import { useCart } from "@/lib/cart";
import { formatRupiah } from "@/lib/format";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/checkout")({
  component: CheckoutPage,
});

const schema = z.object({
  customer_name: z.string().trim().min(2, "Nama minimal 2 karakter").max(100),
  whatsapp: z.string().trim().regex(/^[0-9+\- ]{8,20}$/, "Nomor WhatsApp tidak valid"),
  table_number: z.string().trim().min(1, "Pilih nomor meja").max(10),
});

function CheckoutPage() {
  const navigate = useNavigate();
  const items = useCart((s) => s.items);
  const total = useCart((s) => s.total());
  const clear = useCart((s) => s.clear);
  const [form, setForm] = useState({ customer_name: "", whatsapp: "", table_number: "" });
  const [loading, setLoading] = useState(false);

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <CustomerHeader />
        <div className="mx-auto max-w-2xl px-4 pt-12 text-center text-sm text-muted-foreground">
          Tidak ada item di keranjang.
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        customer_name: parsed.data.customer_name,
        whatsapp: parsed.data.whatsapp,
        table_number: parsed.data.table_number,
        total_price: total,
      })
      .select("id")
      .single();
    if (error || !order) {
      setLoading(false);
      toast.error("Gagal membuat pesanan: " + (error?.message ?? ""));
      return;
    }
    const itemsPayload = items.map((i) => ({
      order_id: order.id,
      menu_id: i.menu_id,
      menu_name: i.name,
      unit_price: i.price,
      quantity: i.quantity,
      subtotal: i.price * i.quantity,
    }));
    const { error: itemsErr } = await supabase.from("order_items").insert(itemsPayload);
    if (itemsErr) {
      setLoading(false);
      toast.error("Gagal menyimpan item: " + itemsErr.message);
      return;
    }
    clear();
    navigate({ to: "/payment/$orderId", params: { orderId: order.id } });
  };

  return (
    <div className="min-h-screen bg-background pb-10">
      <CustomerHeader />
      <main className="mx-auto max-w-2xl px-4 pt-4">
        <h1 className="mb-4 text-xl font-bold">Checkout</h1>

        <section className="mb-4 rounded-3xl border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-bold">Ringkasan Pesanan</h2>
          <div className="space-y-1 text-sm">
            {items.map((i) => (
              <div key={i.menu_id} className="flex justify-between">
                <span className="text-muted-foreground">{i.name} × {i.quantity}</span>
                <span>{formatRupiah(i.price * i.quantity)}</span>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-bold">
              <span>Total</span><span className="text-primary">{formatRupiah(total)}</span>
            </div>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-border bg-card p-4">
          <Field label="Nama">
            <input
              required
              value={form.customer_name}
              onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
              className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary"
              placeholder="Nama kamu"
              maxLength={100}
            />
          </Field>
          <Field label="Nomor WhatsApp">
            <input
              required
              inputMode="tel"
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary"
              placeholder="08xxxxxxxxxx"
              maxLength={20}
            />
          </Field>
          <Field label="Nomor Meja">
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: 10 }, (_, i) => String(i + 1)).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setForm({ ...form, table_number: n })}
                  className={`rounded-2xl border py-3 text-sm font-semibold transition ${
                    form.table_number === n
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </Field>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-primary py-4 text-base font-bold text-primary-foreground shadow-lg shadow-primary/30 active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? "Memproses…" : `Bayar ${formatRupiah(total)}`}
          </button>
        </form>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}
