import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatRupiah } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import {
  BarChart, Bar, LineChart, Line,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { TrendingUp, ShoppingBag, Trophy, Download, BarChart3, LineChart as LineIcon } from "lucide-react";

export const Route = createFileRoute("/admin/analytics")({
  component: AnalyticsPage,
});

type Period = "week" | "month" | "year";
type ChartKind = "bar" | "line";

function AnalyticsPage() {
  const { isSuperAdmin } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [period, setPeriod] = useState<Period>("week");
  const [chartKind, setChartKind] = useState<ChartKind>("bar");

  useEffect(() => {
    supabase.from("orders").select("*").eq("payment_status", "dibayar").order("created_at").then(({ data }) => setOrders(data ?? []));
    supabase.from("order_items").select("*, orders!inner(payment_status,created_at)").eq("orders.payment_status", "dibayar").then(({ data }) => setItems(data ?? []));
  }, []);

  const today = useMemo(() => {
    const t = new Date(); t.setHours(0,0,0,0);
    return orders.filter((o) => new Date(o.created_at) >= t);
  }, [orders]);

  const totalToday = today.reduce((a, o) => a + Number(o.total_price), 0);
  const totalAll = orders.reduce((a, o) => a + Number(o.total_price), 0);

  const chartData = useMemo(() => {
    const buckets: { date: string; label: string; total: number }[] = [];
    if (period === "week") {
      // last 7 days
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
        const next = new Date(d); next.setDate(d.getDate() + 1);
        const total = orders
          .filter((o) => new Date(o.created_at) >= d && new Date(o.created_at) < next)
          .reduce((a, o) => a + Number(o.total_price), 0);
        buckets.push({
          date: d.toISOString().slice(0, 10),
          label: d.toLocaleDateString("id-ID", { weekday: "short" }),
          total,
        });
      }
    } else if (period === "month") {
      // last 12 months
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const total = orders
          .filter((o) => new Date(o.created_at) >= d && new Date(o.created_at) < next)
          .reduce((a, o) => a + Number(o.total_price), 0);
        buckets.push({
          date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`,
          label: d.toLocaleDateString("id-ID", { month: "short" }),
          total,
        });
      }
    } else {
      // last 5 years
      const now = new Date();
      for (let i = 4; i >= 0; i--) {
        const y = now.getFullYear() - i;
        const d = new Date(y, 0, 1);
        const next = new Date(y + 1, 0, 1);
        const total = orders
          .filter((o) => new Date(o.created_at) >= d && new Date(o.created_at) < next)
          .reduce((a, o) => a + Number(o.total_price), 0);
        buckets.push({ date: String(y), label: String(y), total });
      }
    }
    return buckets;
  }, [orders, period]);

  const topMenus = useMemo(() => {
    const map: Record<string, { name: string; qty: number; revenue: number }> = {};
    items.forEach((i: any) => {
      const k = i.menu_name;
      map[k] ??= { name: k, qty: 0, revenue: 0 };
      map[k].qty += i.quantity;
      map[k].revenue += Number(i.subtotal);
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty);
  }, [items]);

  const periodLabel = period === "week" ? "7 Hari Terakhir" : period === "month" ? "12 Bulan Terakhir" : "5 Tahun Terakhir";

  const downloadRevenueCsv = () => {
    const rows = [["Periode", "Pendapatan (Rp)"]];
    chartData.forEach((d) => rows.push([d.date, String(Math.round(d.total))]));
    rows.push(["Total", String(Math.round(chartData.reduce((a, b) => a + b.total, 0)))]);
    triggerCsv(`pendapatan_${period}_${todayStamp()}.csv`, rows);
  };

  const downloadSalesCsv = () => {
    const rows = [["Menu", "Jumlah Terjual", "Total Pendapatan (Rp)"]];
    topMenus.forEach((m) => rows.push([m.name, String(m.qty), String(Math.round(m.revenue))]));
    rows.push(["TOTAL", String(topMenus.reduce((a, b) => a + b.qty, 0)), String(Math.round(topMenus.reduce((a, b) => a + b.revenue, 0)))]);
    triggerCsv(`penjualan_menu_${todayStamp()}.csv`, rows);
  };

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Laporan Analitik</h1>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Pendapatan Hari Ini" value={formatRupiah(totalToday)} icon={TrendingUp} accent="text-success" />
        <Stat label="Pesanan Hari Ini" value={String(today.length)} icon={ShoppingBag} accent="text-primary" />
        <Stat label="Total Pendapatan" value={formatRupiah(totalAll)} icon={Trophy} accent="text-warning-foreground" />
      </div>

      <section className="mb-4 rounded-3xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">Pendapatan {periodLabel}</h2>
          <div className="flex gap-1 rounded-full bg-secondary p-1">
            {(["week","month","year"] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`rounded-full px-3 py-1 text-[11px] font-bold ${period===p ? "bg-primary text-primary-foreground" : "text-secondary-foreground"}`}>
                {p === "week" ? "Mingguan" : p === "month" ? "Bulanan" : "Tahunan"}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-2 flex items-center justify-between">
          <div className="flex gap-1 rounded-full bg-secondary p-1">
            <button onClick={() => setChartKind("bar")}
              className={`flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold ${chartKind==="bar" ? "bg-primary text-primary-foreground" : "text-secondary-foreground"}`}>
              <BarChart3 className="h-3 w-3" /> Bar
            </button>
            <button onClick={() => setChartKind("line")}
              className={`flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold ${chartKind==="line" ? "bg-primary text-primary-foreground" : "text-secondary-foreground"}`}>
              <LineIcon className="h-3 w-3" /> Line
            </button>
          </div>
          {isSuperAdmin && (
            <button onClick={downloadRevenueCsv}
              className="flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-[11px] font-bold text-background">
              <Download className="h-3 w-3" /> CSV Pendapatan
            </button>
          )}
        </div>

        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            {chartKind === "bar" ? (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => formatRupiah(Number(v))} />
                <Bar dataKey="total" fill="var(--color-primary)" radius={[8, 8, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => formatRupiah(Number(v))} />
                <Line type="monotone" dataKey="total" stroke="var(--color-primary)" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">Menu Terlaris</h2>
          {isSuperAdmin && topMenus.length > 0 && (
            <button onClick={downloadSalesCsv}
              className="flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-[11px] font-bold text-background">
              <Download className="h-3 w-3" /> CSV Penjualan
            </button>
          )}
        </div>
        {topMenus.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada data penjualan.</p>
        ) : (
          <div className="space-y-2">
            {topMenus.slice(0, 5).map((m, i) => (
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

function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}

function triggerCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  // BOM so Excel detects UTF-8
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
