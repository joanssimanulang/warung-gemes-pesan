import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatRupiah } from "@/lib/format";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { TrendingUp, ShoppingBag, Trophy } from "lucide-react";

export const Route = createFileRoute("/admin/analytics")({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("orders").select("*").eq("payment_status", "dibayar").order("created_at").then(({ data }) => setOrders(data ?? []));
    supabase.from("order_items").select("*, orders!inner(payment_status)").eq("orders.payment_status", "dibayar").then(({ data }) => setItems(data ?? []));
  }, []);

  const today = useMemo(() => {
    const t = new Date(); t.setHours(0,0,0,0);
    return orders.filter((o) => new Date(o.created_at) >= t);
  }, [orders]);

  const totalToday = today.reduce((a, o) => a + Number(o.total_price), 0);
  const totalAll = orders.reduce((a, o) => a + Number(o.total_price), 0);

  // last 7 days
  const dailyData = useMemo(() => {
    const days: { date: string; label: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      const total = orders
        .filter((o) => new Date(o.created_at) >= d && new Date(o.created_at) < next)
        .reduce((a, o) => a + Number(o.total_price), 0);
      days.push({
        date: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString("id-ID", { weekday: "short" }),
        total,
      });
    }
    return days;
  }, [orders]);

  const topMenus = useMemo(() => {
    const map: Record<string, { name: string; qty: number; revenue: number }> = {};
    items.forEach((i: any) => {
      const k = i.menu_name;
      map[k] ??= { name: k, qty: 0, revenue: 0 };
      map[k].qty += i.quantity;
      map[k].revenue += Number(i.subtotal);
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [items]);

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Laporan Analitik</h1>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Pendapatan Hari Ini" value={formatRupiah(totalToday)} icon={TrendingUp} accent="text-success" />
        <Stat label="Pesanan Hari Ini" value={String(today.length)} icon={ShoppingBag} accent="text-primary" />
        <Stat label="Total Pendapatan" value={formatRupiah(totalAll)} icon={Trophy} accent="text-warning-foreground" />
      </div>

      <section className="mb-4 rounded-3xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-bold">Pendapatan 7 Hari Terakhir</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => formatRupiah(Number(v))} />
              <Bar dataKey="total" fill="var(--color-primary)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-bold">Menu Terlaris</h2>
        {topMenus.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada data penjualan.</p>
        ) : (
          <div className="space-y-2">
            {topMenus.map((m, i) => (
              <div key={m.name} className="flex items-center gap-3 rounded-2xl bg-secondary/50 p-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{m.name}</div>
                  <div className="text-xs text-muted-foreground">{m.qty} terjual · {formatRupiah(m.revenue)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, icon: Icon, accent }: { label: string; value: string; icon: any; accent: string }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${accent}`} />
      </div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}
