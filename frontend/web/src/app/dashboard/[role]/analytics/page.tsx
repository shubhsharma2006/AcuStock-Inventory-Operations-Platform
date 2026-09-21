"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from "recharts";

// ── Types ──────────────────────────────────────────────────────

interface DashboardData {
  totalStock?: number;
  totalValue?: number;
  totalItems?: number;
  lowStockItems?: Array<{ name: string; currentStock: number; threshold: number }>;
  recentTransactions?: Array<{ date: string; in: number; out: number }>;
  topMovingItems?: Array<{ name: string; totalIn: number; totalOut: number; net: number }>;
}

// ── Custom Tooltip ─────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "rgba(11,22,40,0.96)",
      border: "1px solid rgba(148,163,184,0.2)",
      borderRadius: 10,
      padding: "10px 14px",
      backdropFilter: "blur(12px)"
    }}>
      <p style={{ color: "#9bb0cb", fontSize: 12, marginBottom: 6 }}>{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color, fontSize: 13, margin: "2px 0" }}>
          <span style={{ opacity: 0.7 }}>{entry.name}: </span>
          <strong>{entry.value.toLocaleString()}</strong>
        </p>
      ))}
    </div>
  );
}

// ── Stat Card ──────────────────────────────────────────────────

function StatCard({ label, value, sub, accent = false }: {
  label: string; value: string | number; sub?: string; accent?: boolean;
}) {
  return (
    <div style={{
      background: "rgba(11,20,36,0.82)",
      border: `1px solid ${accent ? "rgba(247,196,108,0.35)" : "rgba(148,163,184,0.18)"}`,
      borderRadius: 14,
      padding: "1.25rem 1.5rem",
      backdropFilter: "blur(18px)",
    }}>
      <p style={{ color: "#9bb0cb", fontSize: 12, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </p>
      <p style={{ fontSize: 28, fontWeight: 700, color: accent ? "#f7c46c" : "#ecf3ff", lineHeight: 1 }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && <p style={{ color: "#9bb0cb", fontSize: 12, marginTop: 6 }}>{sub}</p>}
    </div>
  );
}

// ── Low Stock Alert List ───────────────────────────────────────

function LowStockList({ items }: { items: DashboardData["lowStockItems"] }) {
  if (!items?.length) return (
    <div style={{ color: "#34d399", fontSize: 14, padding: "1rem", textAlign: "center" }}>
      ✅ All items above threshold
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.slice(0, 8).map((item) => {
        const pct = Math.min(100, Math.round((item.currentStock / Math.max(1, item.threshold)) * 100));
        const color = pct < 30 ? "#fb7185" : pct < 60 ? "#f7c46c" : "#34d399";
        return (
          <div key={item.name} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "8px 0", borderBottom: "1px solid rgba(148,163,184,0.1)"
          }}>
            <span style={{ flex: 1, fontSize: 13, color: "#ecf3ff" }}>{item.name}</span>
            <div style={{ width: 80, background: "rgba(148,163,184,0.1)", borderRadius: 4, height: 6 }}>
              <div style={{ width: `${pct}%`, background: color, height: "100%", borderRadius: 4, transition: "width 0.5s" }} />
            </div>
            <span style={{ color, fontSize: 12, fontWeight: 600, minWidth: 50, textAlign: "right" }}>
              {item.currentStock}/{item.threshold}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Analytics Page ────────────────────────────────────────

export default function AnalyticsPage() {
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["analytics-dashboard"],
    queryFn: () => apiFetch("/api/reports/dashboard"),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const chartStyle = {
    background: "rgba(11,20,36,0.82)",
    border: "1px solid rgba(148,163,184,0.18)",
    borderRadius: 14,
    padding: "1.5rem",
    backdropFilter: "blur(18px)",
  } as const;

  return (
    <main style={{ padding: "1.5rem", maxWidth: 1400 }} className="animate-fade-in">
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#ecf3ff", marginBottom: 4 }}>
          Analytics
        </h1>
        <p style={{ color: "#9bb0cb", fontSize: 14 }}>
          Real-time inventory insights and trends
        </p>
      </div>

      {/* Stat Cards */}
      {isLoading ? (
        <div className="stat-grid" style={{ marginBottom: "1.5rem" }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 100, borderRadius: 14 }} />
          ))}
        </div>
      ) : (
        <div className="stat-grid" style={{ marginBottom: "1.5rem" }}>
          <StatCard label="Total Products" value={data?.totalItems ?? 0} sub="Active SKUs" />
          <StatCard label="Total Stock Units" value={data?.totalStock ?? 0} sub="Across all products" accent />
          <StatCard label="Portfolio Value" value={`₹${(data?.totalValue ?? 0).toLocaleString()}`} sub="At purchase price" />
          <StatCard label="Low Stock Alerts" value={data?.lowStockItems?.length ?? 0} sub="Below threshold" />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", marginBottom: "1.25rem" }}>
        {/* Stock Trend Chart */}
        <div style={chartStyle}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#ecf3ff", marginBottom: 16 }}>
            Stock IN vs OUT — Last 30 Days
          </h2>
          {isLoading ? (
            <div className="skeleton chart-container" />
          ) : (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data?.recentTransactions ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                  <XAxis dataKey="date" stroke="#9bb0cb" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#9bb0cb" tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="in"  stroke="#34d399" strokeWidth={2} dot={false} name="Stock IN" />
                  <Line type="monotone" dataKey="out" stroke="#fb7185" strokeWidth={2} dot={false} name="Stock OUT" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Top Products Bar Chart */}
        <div style={chartStyle}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#ecf3ff", marginBottom: 16 }}>
            Top 10 Products by Movement
          </h2>
          {isLoading ? (
            <div className="skeleton chart-container" />
          ) : (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={(data?.topMovingItems ?? []).slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                  <XAxis type="number" stroke="#9bb0cb" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" stroke="#9bb0cb" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="totalIn"  fill="#34d399" name="IN"  radius={[0, 3, 3, 0]} />
                  <Bar dataKey="totalOut" fill="#fb7185" name="OUT" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Low Stock List */}
      <div style={chartStyle}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "#ecf3ff", marginBottom: 16 }}>
          🔴 Low Stock Items
        </h2>
        {isLoading ? (
          <div className="skeleton" style={{ height: 200, borderRadius: 8 }} />
        ) : (
          <LowStockList items={data?.lowStockItems} />
        )}
      </div>

      {error && (
        <div style={{
          marginTop: 16, padding: "1rem", borderRadius: 10,
          background: "rgba(251,113,133,0.1)", border: "1px solid rgba(251,113,133,0.3)",
          color: "#fb7185", fontSize: 13
        }}>
          Failed to load analytics: {String(error)}
        </div>
      )}
    </main>
  );
}
