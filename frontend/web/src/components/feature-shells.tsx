"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/acustock";
import { apiFetch } from "@/lib/api";
import { resolveNotificationRoute } from "@/lib/acustock";
import {
  useAccountStats,
  useNotificationsData,
  useProductsData,
  useProfileData,
  useRemainingStockData,
  useRolePermissions,
  useSerialPolicy,
  useStockLedgerData,
} from "@/hooks/use-feature-data";
import { AppShell } from "@/components/app-shell";
import { SessionGate } from "@/components/session-gate";
import { useRealtimeState } from "@/components/realtime-provider";
import TwoFactorSettings from "@/components/TwoFactorSettings";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

type StockMode = "IN" | "OUT";

function parseSerialList(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function ProductsView({ role }: { role: Role }) {
  return <ProductsBody role={role} userName="User" />;
}

function ProductsBody({ role, userName }: { role: Role; userName: string }) {
  const { refreshToken, refresh } = useRealtimeState();
  const { items, loading, error } = useProductsData(refreshToken);
  const [query, setQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    shortName: "",
    sku: "",
    barcode: "",
    barcodeFormat: "CODE128",
    category: "General",
    brand: "",
    uom: "PCS",
    salesPrice: "",
    purchasePrice: "",
    mrp: "",
    taxRate: "18",
    taxType: "GST",
    lowStockThreshold: "10",
    hsn: "",
    description: "",
  });

  const canManage = role === "ADMIN" || role === "SUPER_ADMIN";

  const filteredItems = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return items;
    return items.filter((item) => {
      const haystack = [
        item.name,
        item.shortName,
        item.hsn,
        item.sku,
        item.barcode,
        item.category,
        item.brand,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [items, query]);

  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (!form.name.trim()) throw new Error("Product name is required");
      if (!form.salesPrice || Number(form.salesPrice) < 0) throw new Error("Valid selling price is required");
      if (!form.purchasePrice || Number(form.purchasePrice) < 0) throw new Error("Valid purchase price is required");

      await apiFetch("/items", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          shortName: form.shortName.trim() || undefined,
          sku: form.sku.trim() || undefined,
          barcode: form.barcode.trim() || undefined,
          barcodeFormat: form.barcodeFormat,
          category: form.category.trim() || "General",
          brand: form.brand.trim() || undefined,
          uom: form.uom,
          salesPrice: Number(form.salesPrice),
          purchasePrice: Number(form.purchasePrice),
          mrp: form.mrp ? Number(form.mrp) : undefined,
          taxRate: Number(form.taxRate || 0),
          taxType: form.taxType,
          lowStockThreshold: Number(form.lowStockThreshold || 10),
          hsn: form.hsn.trim() || undefined,
          description: form.description.trim() || undefined,
        }),
      });

      setShowAddModal(false);
      setForm({
        name: "",
        shortName: "",
        sku: "",
        barcode: "",
        barcodeFormat: "CODE128",
        category: "General",
        brand: "",
        uom: "PCS",
        salesPrice: "",
        purchasePrice: "",
        mrp: "",
        taxRate: "18",
        taxType: "GST",
        lowStockThreshold: "10",
        hsn: "",
        description: "",
      });
      refresh();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create product");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="glass-panel rounded-[1.75rem] p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.28em] text-amber-200/80">Live products</div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">Product Master Catalog</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Enterprise multi-tenant catalog with SKU codes, barcodes, tax rates, and live stock balances.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search SKU, barcode, name, model..."
            className="w-full max-w-xs rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-300/40"
          />
          {canManage ? (
            <button
              id="add-product-btn"
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-400/20 transition hover:bg-amber-300"
            >
              <span>+ Add Product</span>
            </button>
          ) : null}
        </div>
      </div>

      {loading ? <div className="mt-6 text-slate-300">Loading products…</div> : null}
      {error ? <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}

      {!loading && !error ? (
        <div className="mt-6 overflow-x-auto rounded-[1.5rem] border border-white/10">
          <table className="min-w-full divide-y divide-white/10 text-left text-sm">
            <thead className="bg-slate-950/70 text-slate-300">
              <tr>
                <th className="px-4 py-3 font-medium">Product / Category</th>
                <th className="px-4 py-3 font-medium">SKU & Barcode</th>
                <th className="px-4 py-3 font-medium">UoM</th>
                <th className="px-4 py-3 font-medium">Stock Status</th>
                <th className="px-4 py-3 font-medium">Pricing & Tax</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 bg-slate-950/50">
              {filteredItems.map((item) => {
                const stock = item.currentStock ?? item.quantity ?? 0;
                const threshold = item.lowStockThreshold ?? 10;
                const isLow = stock <= threshold && stock > 0;
                const isOut = stock <= 0;

                return (
                  <tr key={item._id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-4">
                      <div className="font-semibold text-white">{item.name}</div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        <span className="rounded bg-white/10 px-1.5 py-0.5">{item.category || "General"}</span>
                        {item.brand ? <span>· {item.brand}</span> : null}
                        {item.shortName ? <span>({item.shortName})</span> : null}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-mono text-xs font-semibold text-amber-300">
                        {item.sku || "—"}
                      </div>
                      {item.barcode ? (
                        <div className="font-mono text-xs text-slate-400 mt-0.5">
                          📟 {item.barcode}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-slate-300 font-medium">
                      {item.uom || "PCS"}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-base">
                          {formatNumber(stock)}
                        </span>
                        {isOut ? (
                          <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs font-semibold text-rose-300">Out</span>
                        ) : isLow ? (
                          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">Low</span>
                        ) : (
                          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300">Good</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">Alert at {threshold}</div>
                    </td>
                    <td className="px-4 py-4 text-slate-300">
                      <div>
                        <span className="text-white font-semibold">₹{formatNumber(item.salesPrice ?? 0)}</span>
                        <span className="text-xs text-slate-500 ml-1.5">Cost: ₹{formatNumber(item.purchasePrice ?? 0)}</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {item.taxRate ? `${item.taxType || "GST"} ${item.taxRate}%` : "No Tax"}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No products match your search.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Add Product Modal */}
      {showAddModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[2rem] border border-white/10 bg-slate-900 p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-xl font-bold text-white">Create New Product</h3>
                <p className="text-xs text-slate-400 mt-0.5">Add to enterprise catalog with SKU and barcode</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            {formError ? (
              <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">
                {formError}
              </div>
            ) : null}

            <form onSubmit={handleCreateProduct} className="mt-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Product Name *</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Dell XPS 15 9530"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Model / Short Name</label>
                  <input
                    value={form.shortName}
                    onChange={(e) => setForm({ ...form, shortName: e.target.value })}
                    placeholder="e.g. DXPS15"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">SKU (blank = auto)</label>
                  <input
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })}
                    placeholder="e.g. SKU-00124"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm font-mono text-amber-300 outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Barcode</label>
                  <input
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                    placeholder="e.g. 8901234567890"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm font-mono text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Unit (UoM)</label>
                  <select
                    value={form.uom}
                    onChange={(e) => setForm({ ...form, uom: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                  >
                    <option value="PCS">Pieces (PCS)</option>
                    <option value="BOX">Boxes (BOX)</option>
                    <option value="KG">Kilograms (KG)</option>
                    <option value="MTR">Meters (MTR)</option>
                    <option value="LTR">Liters (LTR)</option>
                    <option value="SET">Sets (SET)</option>
                    <option value="UNIT">Units (UNIT)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Category</label>
                  <input
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    placeholder="e.g. Electronics, Hardware"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Brand</label>
                  <input
                    value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })}
                    placeholder="e.g. Dell, Logitech"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Selling Price (₹) *</label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="any"
                    value={form.salesPrice}
                    onChange={(e) => setForm({ ...form, salesPrice: e.target.value })}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Cost Price (₹) *</label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="any"
                    value={form.purchasePrice}
                    onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Tax Rate (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={form.taxRate}
                    onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
                    placeholder="18"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Low Stock Alert Threshold</label>
                  <input
                    type="number"
                    min="0"
                    value={form.lowStockThreshold}
                    onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })}
                    placeholder="10"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">HSN Code</label>
                  <input
                    value={form.hsn}
                    onChange={(e) => setForm({ ...form, hsn: e.target.value })}
                    placeholder="e.g. 8471"
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-amber-400 px-6 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-50"
                >
                  {saving ? "Saving Product…" : "Save Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function RemainingStockView({ role }: { role: Role }) {
  return <RemainingStockBody role={role} userName="User" />;
}

function RemainingStockBody({ role, userName }: { role: Role; userName: string }) {
  const { refreshToken } = useRealtimeState();
  const { items, loading, error } = useRemainingStockData("", refreshToken);

  return (
    <section className="glass-panel rounded-[1.75rem] p-6 lg:p-8">
      <div className="text-xs uppercase tracking-[0.28em] text-amber-200/80">Live stock summary</div>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">Remaining stock</h2>
      <p className="mt-2 text-sm leading-6 text-slate-300">Calculated from the stock ledger by the backend, with low-stock thresholds included.</p>

      {loading ? <div className="mt-6 text-slate-300">Loading stock summary…</div> : null}
      {error ? <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}

      {!loading && !error ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const remaining = item.totalIn - item.totalOut;
            const status = remaining <= 0 ? "Out of stock" : remaining <= (item.lowStockThreshold ?? 10) ? "Low stock" : "In stock";

            return (
              <article key={item.productId} className="rounded-3xl border border-white/10 bg-slate-950/55 p-5">
                <div className="text-lg font-semibold text-white">{item.name}</div>
                <div className="mt-1 text-sm text-slate-400">{item.shortName || "Model not set"}</div>
                <div className="mt-4 text-3xl font-semibold text-white">{remaining}</div>
                <div className="mt-2 text-sm text-slate-300">{status} · IN {item.totalIn} / OUT {item.totalOut}</div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export function NotificationsView({ role }: { role: Role }) {
  return <NotificationsBody role={role} userName="User" />;
}

function NotificationsBody({ role, userName }: { role: Role; userName: string }) {
  const router = useRouter();
  const { refreshToken, refresh } = useRealtimeState();
  const { notifications, unreadCount, total, loading, error } = useNotificationsData(1, 10, refreshToken);

  async function markAsRead(notificationId: string) {
    await apiFetch(`/notifications/${notificationId}/read`, { method: "PATCH" });
    refresh();
  }

  async function markAllRead() {
    await apiFetch("/notifications/read-all", { method: "PATCH" });
    refresh();
  }

  async function deleteNotification(notificationId: string) {
    await apiFetch(`/notifications/${notificationId}`, { method: "DELETE" });
    refresh();
  }

  return (
    <section className="glass-panel rounded-[1.75rem] p-6 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-amber-200/80">Realtime inbox</div>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">Notifications</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">Live unread count and notification feed from the backend.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-slate-300">
            {unreadCount} unread · {total} total
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={markAllRead}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
          >
            Mark all read
          </button>
        </div>

        {loading ? <div className="mt-6 text-slate-300">Loading notifications…</div> : null}
        {error ? <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}

        {!loading && !error ? (
          <div className="mt-6 space-y-3">
            {notifications.map((notification) => (
              <article key={notification._id} className="rounded-3xl border border-white/10 bg-slate-950/55 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${notification.isRead ? "bg-slate-500" : "bg-amber-300"}`} />
                      <div className="font-semibold text-white">{notification.title}</div>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{notification.message}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {notification.link ? (
                        <button
                          type="button"
                          onClick={() => router.push(resolveNotificationRoute(notification, role))}
                          className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/20"
                        >
                          Open linked view
                        </button>
                      ) : null}
                      {!notification.isRead ? (
                        <button
                          type="button"
                          onClick={() => markAsRead(notification._id)}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                        >
                          Mark read
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => deleteNotification(notification._id)}
                        className="rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-400/20"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="text-right text-xs uppercase tracking-[0.22em] text-slate-400">
                    <div>{notification.category || "General"}</div>
                    <div className="mt-1 text-slate-500">{notification.priority || "MEDIUM"}</div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
  );
}

export function StockMovementView({ role, mode }: { role: Role; mode: StockMode }) {
  return <StockMovementBody role={role} mode={mode} userName="User" />;
}

function StockMovementBody({ role, mode, userName }: { role: Role; mode: StockMode; userName: string }) {
  const router = useRouter();
  const { refresh } = useRealtimeState();
  const { items, loading, error } = useProductsData();
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [serialNumbers, setSerialNumbers] = useState("");
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [transactionId, setTransactionId] = useState("");
  const [transactionDate, setTransactionDate] = useState("");
  const [condition, setCondition] = useState("new");
  const [partyType, setPartyType] = useState(mode === "IN" ? "manufacturer" : "customer");
  const [deliveredBy, setDeliveredBy] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recentActions, setRecentActions] = useState<{ id: string; label: string; status: "pending" | "success" | "error" }[]>([]);
  const [lastFailedRequest, setLastFailedRequest] = useState<unknown>(null);

  const activeProductId = productId || items[0]?._id || "";
  const selectedProduct = items.find((item) => item._id === activeProductId) || items[0] || null;

  async function postStockMovement(payload: Record<string, unknown>) {
    return apiFetch(`/stock/${mode.toLowerCase()}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function runSubmit(payload: Record<string, unknown>) {
    const actionId = `${mode}-${Date.now()}`;
    const label = `${mode} ${selectedProduct?.name || "product"}`;
    const pendingAction: { id: string; label: string; status: "pending" } = { id: actionId, label, status: "pending" };

    setRecentActions((current) => [pendingAction, ...current].slice(0, 3));
    setSaving(true);
    setMessage(`Applying ${label}…`);
    setErrorMessage(null);

    try {
      await postStockMovement(payload);
      refresh();
      setRecentActions((current) => current.map((entry) => entry.id === actionId ? { ...entry, status: "success" } : entry));
      setMessage(`Stock ${mode.toLowerCase()} saved successfully.`);
      setLastFailedRequest(null);
      setSerialNumbers("");
      setCompany("");
      setContact("");
      setPhone("");
      setEmail("");
      setAddress("");
      setTransactionId("");
      setNotes("");
    } catch (submitError) {
      setRecentActions((current) => current.map((entry) => entry.id === actionId ? { ...entry, status: "error" } : entry));
      setErrorMessage(submitError instanceof Error ? submitError.message : `Failed to save stock ${mode.toLowerCase()}`);
      setLastFailedRequest(payload);
    } finally {
      setSaving(false);
    }
  }

  async function submitForm() {
    if (!selectedProduct) {
      setErrorMessage("Select a product first.");
      return;
    }

    const body = {
      productId: selectedProduct._id,
      quantity,
      serialNumbers: parseSerialList(serialNumbers),
      condition,
      transaction: {
        paymentMethod,
        transactionId: transactionId || undefined,
        transactionDate: transactionDate ? new Date(transactionDate).toISOString() : undefined,
        notes: notes || undefined,
        deliveredBy: deliveredBy || undefined,
        receivedBy: receivedBy || undefined,
        supplierType: mode === "IN" ? partyType || undefined : undefined,
        buyerType: mode === "OUT" ? partyType || undefined : undefined,
        modelVariant: selectedProduct.shortName || selectedProduct.name,
      },
      supplier: mode === "IN"
        ? { companyName: company || undefined, customerName: contact || undefined, customerPhone: phone || undefined, customerEmail: email || undefined, customerAddress: address || undefined }
        : undefined,
      buyer: mode === "OUT"
        ? { companyName: company || undefined, customerName: contact || undefined, customerPhone: phone || undefined, customerEmail: email || undefined, customerAddress: address || undefined }
        : undefined,
      modelVariant: selectedProduct.shortName || selectedProduct.name,
    };

    await runSubmit(body);
  }

  async function retryLastFailedSubmit() {
    if (lastFailedRequest && typeof lastFailedRequest === "object") {
      await runSubmit(lastFailedRequest as Record<string, unknown>);
    }
  }

  return (
    <section className="glass-panel rounded-[1.75rem] p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-amber-200/80">Inventory movement</div>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">Stock {mode}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              This form posts directly to the backend stock ledger and triggers notification plus realtime refresh updates.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-slate-300">
            {selectedProduct ? selectedProduct.name : "Select a product"}
          </div>
        </div>

        {loading ? <div className="mt-6 text-slate-300">Loading products…</div> : null}
        {error ? <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}

        {!loading && !error ? (
          <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Product</span>
                  <select value={activeProductId} onChange={(event) => setProductId(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none">
                    {items.map((item) => (
                      <option key={item._id} value={item._id}>{item.name}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Quantity</span>
                  <input type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none" />
                </label>
                <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
                  <span>Serial numbers</span>
                  <textarea value={serialNumbers} onChange={(event) => setSerialNumbers(event.target.value)} rows={3} placeholder="Comma or newline separated serials" className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none placeholder:text-slate-500" />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>{mode === "IN" ? "Supplier type" : "Buyer type"}</span>
                  <select value={partyType} onChange={(event) => setPartyType(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none">
                    {mode === "IN" ? (
                      <>
                        <option value="manufacturer">Manufacturer</option>
                        <option value="distributor">Distributor</option>
                        <option value="retailer">Retailer</option>
                        <option value="other">Other</option>
                      </>
                    ) : (
                      <>
                        <option value="customer">Customer</option>
                        <option value="dealer">Dealer</option>
                        <option value="project">Project</option>
                        <option value="other">Other</option>
                      </>
                    )}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Condition</span>
                  <select value={condition} onChange={(event) => setCondition(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none">
                    <option value="new">New</option>
                    <option value="used">Used</option>
                    <option value="demo">Demo</option>
                    <option value="refurbished">Refurbished</option>
                    <option value="damaged">Damaged</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Payment method</span>
                  <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none">
                    <option value="cash">Cash</option>
                    <option value="bank">Bank transfer</option>
                    <option value="upi">UPI</option>
                    <option value="credit">Credit</option>
                    <option value="cheque">Cheque</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Transaction ID</span>
                  <input value={transactionId} onChange={(event) => setTransactionId(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none" />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Transaction date</span>
                  <input type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none" />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>{mode === "IN" ? "Delivered by" : "Dispatched by"}</span>
                  <input value={deliveredBy} onChange={(event) => setDeliveredBy(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none" />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>{mode === "IN" ? "Received by" : "Received by (buyer)"}</span>
                  <input value={receivedBy} onChange={(event) => setReceivedBy(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none" />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-300">
                  <span>{mode === "IN" ? "Supplier company" : "Buyer company"}</span>
                  <input value={company} onChange={(event) => setCompany(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none" />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Contact name</span>
                  <input value={contact} onChange={(event) => setContact(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none" />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Phone</span>
                  <input value={phone} onChange={(event) => setPhone(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none" />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Email</span>
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none" />
                </label>
                <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
                  <span>Address</span>
                  <input value={address} onChange={(event) => setAddress(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none" />
                </label>
                <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
                  <span>Notes</span>
                  <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none" />
                </label>
              </div>

              {message ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{message}</div> : null}
              {errorMessage ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{errorMessage}</div> : null}

              <div className="flex flex-wrap gap-3">
                <button type="button" disabled={saving} onClick={submitForm} className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
                  {saving ? "Saving…" : `Save stock ${mode.toLowerCase()}`}
                </button>
                <button type="button" onClick={() => router.back()} className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10">
                  Back
                </button>
              </div>
            </div>

            <aside className="space-y-4 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
              <div className="text-xs uppercase tracking-[0.28em] text-amber-200/80">Preview</div>
              <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-5">
                <div className="text-lg font-semibold text-white">{selectedProduct?.name || "Select a product"}</div>
                <div className="mt-1 text-sm text-slate-400">{selectedProduct?.shortName || "No model variant"}</div>
                <div className="mt-4 text-3xl font-semibold text-white">{quantity}</div>
                <div className="mt-2 text-sm text-slate-300">{mode === "IN" ? "Incoming" : "Outgoing"} stock movement</div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-5 text-sm text-slate-300">
                <div>Serials: {parseSerialList(serialNumbers).length}</div>
                <div className="mt-1">Payment: {paymentMethod}</div>
                <div className="mt-1">Condition: {condition}</div>
                <div className="mt-1">Txn ID: {transactionId || "—"}</div>
              </div>
              <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-5 text-sm text-amber-50">
                Saving will refresh stock summaries, products, and the notification badge through the realtime hook.
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-5">
                <div className="text-xs uppercase tracking-[0.28em] text-amber-200/80">Recent submissions</div>
                <div className="mt-3 space-y-2">
                  {recentActions.length ? recentActions.map((action) => (
                    <div key={action.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                      <div className="font-medium text-white">{action.label}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-400">{action.status}</div>
                    </div>
                  )) : <div className="text-sm text-slate-400">No submissions yet.</div>}
                </div>
                {lastFailedRequest ? (
                  <button type="button" onClick={retryLastFailedSubmit} disabled={saving} className="mt-4 rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-60">
                    Retry last failed submit
                  </button>
                ) : null}
              </div>
            </aside>
          </div>
        ) : null}
      </section>
  );
}

export function StockLedgerView({ role }: { role: Role }) {
  return <StockLedgerBody role={role} userName="User" />;
}

function StockLedgerBody({ role, userName }: { role: Role; userName: string }) {
  const { refreshToken } = useRealtimeState();
  const [type, setType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const { entries, pagination, loading, error } = useStockLedgerData(page, 20, type, startDate, endDate, refreshToken);

  return (
    <section className="glass-panel rounded-[1.75rem] p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-amber-200/80">Ledger history</div>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">Stock ledger</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Immutable movement history with filters for type and date ranges.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-slate-300">
            {pagination.total} total entries
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <label className="space-y-2 text-sm text-slate-300">
            <span>Type</span>
            <select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none">
              <option value="">All</option>
              <option value="IN">IN</option>
              <option value="OUT">OUT</option>
            </select>
          </label>
          <label className="space-y-2 text-sm text-slate-300">
            <span>Start date</span>
            <input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none" />
          </label>
          <label className="space-y-2 text-sm text-slate-300">
            <span>End date</span>
            <input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none" />
          </label>
          <div className="flex items-end gap-3">
            <button type="button" onClick={() => { setType(""); setStartDate(""); setEndDate(""); }} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/10">
              Reset filters
            </button>
          </div>
        </div>

        {loading ? <div className="mt-6 text-slate-300">Loading ledger…</div> : null}
        {error ? <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}

        {!loading && !error ? (
          <div className="mt-6 space-y-3">
            {entries.map((entry) => (
              <article key={entry._id} className="rounded-3xl border border-white/10 bg-slate-950/55 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${entry.type === "IN" ? "bg-emerald-400/15 text-emerald-200" : "bg-rose-400/15 text-rose-200"}`}>
                        {entry.type}
                      </span>
                      <div className="text-lg font-semibold text-white">{entry.productId?.name || "Unknown product"}</div>
                    </div>
                    <p className="mt-2 text-sm text-slate-300">
                      {entry.productId?.shortName || "No model"} · Qty {formatNumber(entry.quantity)} · {entry.condition || "No condition"}
                    </p>
                    <p className="mt-2 text-sm text-slate-400">
                      By {entry.createdBy?.name || entry.createdBy?.email || "Unknown user"} · {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right text-sm text-slate-300">
                    <div>{entry.partyDetails?.companyName || entry.partyDetails?.customerName || "No party"}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">{entry.transactionDetails?.transactionId || "No txn id"}</div>
                  </div>
                </div>
              </article>
            ))}

            {entries.length === 0 ? <div className="rounded-3xl border border-white/10 bg-slate-950/55 p-6 text-sm text-slate-300">No ledger entries match the current filters.</div> : null}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-slate-950/55 p-4 text-sm text-slate-300">
              <div>
                Page {pagination.page} of {pagination.pages}
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">
                  Previous
                </button>
                <button type="button" disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">
                  Next
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
  );
}

export function SettingsView({ role }: { role: Role }) {
  return <SettingsBody role={role} user={{ _id: "", role }} />;
}

function SettingsBody({ role, user }: { role: Role; user: { _id: string; name?: string; email?: string; role: Role } }) {
  const { refreshToken, refresh } = useRealtimeState();
  const { profile, loading: profileLoading, error: profileError } = useProfileData(refreshToken);
  const { stats, loading: statsLoading, error: statsError } = useAccountStats(refreshToken);
  const { items: products } = useProductsData(refreshToken);
  const [activeTab, setActiveTab] = useState<"profile" | "security" | "serial-policies" | "permissions">("profile");

  const canEditSerialPolicies = user.role === "ADMIN" || user.role === "SUPER_ADMIN" || user.role === "MANAGER";
  const canEditPermissions = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

  const tabs = [
    { key: "profile", label: "Profile" },
    { key: "security", label: "Security & 2FA" },
    canEditSerialPolicies ? { key: "serial-policies", label: "Serial Policies" } : null,
    canEditPermissions ? { key: "permissions", label: "Permissions" } : null,
  ].filter(Boolean) as { key: "profile" | "security" | "serial-policies" | "permissions"; label: string }[];

  return (
    <section className="glass-panel rounded-[1.75rem] p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-amber-200/80">Configuration surface</div>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">Backend-driven settings</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              Profile controls, serial policy enforcement, and role permissions are wired directly to the backend.
            </p>
          </div>
          {stats && !statsLoading ? (
            <div className="grid gap-3 rounded-3xl border border-white/10 bg-slate-950/55 p-4 text-sm text-slate-300 sm:grid-cols-2">
              <div>Users: {stats.users.active}/{stats.users.total}</div>
              <div>Managers: {stats.managers.active}/{stats.managers.total}</div>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${activeTab === tab.key ? "bg-white text-slate-950" : "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {profileLoading ? <div className="mt-6 text-slate-300">Loading profile…</div> : null}
        {profileError ? <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{profileError}</div> : null}
        {statsError ? <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{statsError}</div> : null}

        {activeTab === "profile" ? (
          <ProfileSettingsPanel
            key={profile?._id || user._id}
            profile={profile}
            profileLoading={profileLoading}
            profileError={profileError}
            user={user}
            onSaved={refresh}
          />
        ) : null}

        {activeTab === "security" ? (
          <div className="mt-6">
            <TwoFactorSettings />
          </div>
        ) : null}

        {activeTab === "serial-policies" && canEditSerialPolicies ? (
          <SerialPolicyPanel
            products={products}
            refreshToken={refreshToken}
            onSaved={refresh}
          />
        ) : null}

        {activeTab === "permissions" && canEditPermissions ? (
          <PermissionsPanel
            refreshToken={refreshToken}
            onSaved={refresh}
          />
        ) : null}

        {!canEditSerialPolicies && activeTab === "serial-policies" ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/55 p-6 text-sm text-slate-300">
            Your role cannot edit serial policies.
          </div>
        ) : null}

        {!canEditPermissions && activeTab === "permissions" ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/55 p-6 text-sm text-slate-300">
            Your role cannot edit permissions.
          </div>
        ) : null}
      </section>
  );
}

function ProfileSettingsPanel({
  profile,
  profileLoading,
  profileError,
  user,
  onSaved,
}: {
  profile: { _id: string; name?: string; email?: string; role: Role; isActive?: boolean } | null;
  profileLoading: boolean;
  profileError: string | null;
  user: { _id: string; name?: string; email?: string; role: Role };
  onSaved: () => void;
}) {
  if (profileLoading) {
    return <div className="mt-6 text-slate-300">Loading profile…</div>;
  }

  if (profileError) {
    return <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{profileError}</div>;
  }

  return <ProfileSettingsEditor key={profile?._id || user._id} profile={profile} user={user} onSaved={onSaved} />;
}

function ProfileSettingsEditor({
  profile,
  user,
  onSaved,
}: {
  profile: { _id: string; name?: string; email?: string; role: Role; isActive?: boolean } | null;
  user: { _id: string; name?: string; email?: string; role: Role };
  onSaved: () => void;
}) {
  const [profileName, setProfileName] = useState(profile?.name || user.name || "");
  const [profileEmail, setProfileEmail] = useState(profile?.email || user.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function saveProfile() {
    setSaving(true);
    setMessage(null);
    try {
      await apiFetch("/settings/profile", {
        method: "PUT",
        body: JSON.stringify({ name: profileName, email: profileEmail }),
      });

      if (currentPassword && newPassword) {
        await apiFetch("/settings/profile/password", {
          method: "PUT",
          body: JSON.stringify({ currentPassword, newPassword }),
        });
      }

      onSaved();
      setMessage("Profile updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
        <div className="text-xs uppercase tracking-[0.28em] text-amber-200/80">Profile</div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
            <span>Name</span>
            <input value={profileName} onChange={(event) => setProfileName(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none" />
          </label>
          <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
            <span>Email</span>
            <input value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none" />
          </label>
          <label className="space-y-2 text-sm text-slate-300">
            <span>Current password</span>
            <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none" />
          </label>
          <label className="space-y-2 text-sm text-slate-300">
            <span>New password</span>
            <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none" />
          </label>
        </div>

        {message ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{message}</div> : null}

        <button type="button" onClick={saveProfile} disabled={saving} className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>

      <aside className="space-y-4 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5 text-sm text-slate-300">
        <div className="text-xs uppercase tracking-[0.28em] text-amber-200/80">Account details</div>
        <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-4">Signed in as {profile?.name || profile?.email || user.name || user.email || "User"}</div>
        <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-4">Role: {profile?.role || user.role}</div>
        <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-4">Status: {profile?.isActive === false ? "Inactive" : "Active"}</div>
      </aside>
    </div>
  );
}

function SerialPolicyPanel({
  products,
  refreshToken,
  onSaved,
}: {
  products: { _id: string; name: string; shortName?: string }[];
  refreshToken: number;
  onSaved: () => void;
}) {
  const [selectedProductId, setSelectedProductId] = useState(products[0]?._id || "");
  const { policy, loading, error } = useSerialPolicy(selectedProductId, refreshToken);

  if (!selectedProductId) {
    return <div className="mt-6 text-slate-300">No products available.</div>;
  }

  if (loading) {
    return <div className="mt-6 text-slate-300">Loading serial policy…</div>;
  }

  if (error) {
    return <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div>;
  }

  return (
    <SerialPolicyEditor
      key={selectedProductId}
      products={products}
      selectedProductId={selectedProductId}
      policy={policy}
      onProductChange={setSelectedProductId}
      onSaved={onSaved}
    />
  );
}

function SerialPolicyEditor({
  products,
  selectedProductId,
  policy,
  onProductChange,
  onSaved,
}: {
  products: { _id: string; name: string; shortName?: string }[];
  selectedProductId: string;
  policy: { _id?: string; serialEnabled?: boolean; requireSerialIn?: boolean; requireSerialOut?: boolean } | null;
  onProductChange: (value: string) => void;
  onSaved: () => void;
}) {
  const [serialEnabled, setSerialEnabled] = useState(!!policy?.serialEnabled);
  const [requireSerialIn, setRequireSerialIn] = useState(!!policy?.requireSerialIn);
  const [requireSerialOut, setRequireSerialOut] = useState(!!policy?.requireSerialOut);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function saveSerialPolicy() {
    if (!selectedProductId) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiFetch("/settings/serial-policies", {
        method: "POST",
        body: JSON.stringify({
          productId: selectedProductId,
          serialEnabled,
          requireSerialIn,
          requireSerialOut,
        }),
      });

      onSaved();
      setMessage("Serial policy saved successfully.");
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Failed to save serial policy");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
        <div className="text-xs uppercase tracking-[0.28em] text-amber-200/80">Products</div>
        <select value={selectedProductId} onChange={(event) => onProductChange(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none">
          {products.map((item) => (
            <option key={item._id} value={item._id}>{item.name}</option>
          ))}
        </select>
        <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-4 text-sm text-slate-300">
          Use this form to enforce serial capture rules per product before stock movement reaches the ledger.
        </div>
      </div>

      <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
        <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
          <span>Enable serials</span>
          <input type="checkbox" checked={serialEnabled} onChange={(event) => setSerialEnabled(event.target.checked)} />
        </label>
        <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
          <span>Require serial on IN</span>
          <input type="checkbox" checked={requireSerialIn} onChange={(event) => setRequireSerialIn(event.target.checked)} />
        </label>
        <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
          <span>Require serial on OUT</span>
          <input type="checkbox" checked={requireSerialOut} onChange={(event) => setRequireSerialOut(event.target.checked)} />
        </label>

        {message ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{message}</div> : null}

        <button type="button" onClick={saveSerialPolicy} disabled={saving} className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? "Saving…" : "Save serial policy"}
        </button>
      </div>
    </div>
  );
}

function PermissionsPanel({
  refreshToken,
  onSaved,
}: {
  refreshToken: number;
  onSaved: () => void;
}) {
  const [permissionRole, setPermissionRole] = useState<"MANAGER" | "USER">("MANAGER");
  const { permission, loading, error } = useRolePermissions(permissionRole, refreshToken);

  if (loading) {
    return <div className="mt-6 text-slate-300">Loading permissions…</div>;
  }

  if (error) {
    return <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div>;
  }

  return (
    <PermissionsEditor
      key={permissionRole}
      permissionRole={permissionRole}
      permission={permission}
      onRoleChange={setPermissionRole}
      onSaved={onSaved}
    />
  );
}

function PermissionsEditor({
  permissionRole,
  permission,
  onRoleChange,
  onSaved,
}: {
  permissionRole: "MANAGER" | "USER";
  permission: {
    role: "ADMIN" | "MANAGER" | "USER";
    canManageUsers?: boolean;
    canAddProduct?: boolean;
    canEditProduct?: boolean;
    canAddCompany?: boolean;
    canEditCompany?: boolean;
    canStockIn?: boolean;
    canStockOut?: boolean;
    canViewStockLedger?: boolean;
    canViewAllReports?: boolean;
    canViewOwnReports?: boolean;
    canAddLogistics?: boolean;
    canEditLogistics?: boolean;
    canDeleteLogistics?: boolean;
    canManageCompanies?: boolean;
  } | null;
  onRoleChange: (value: "MANAGER" | "USER") => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, boolean>>({
    canManageUsers: !!permission?.canManageUsers,
    canAddProduct: !!permission?.canAddProduct,
    canEditProduct: !!permission?.canEditProduct,
    canAddCompany: !!permission?.canAddCompany,
    canEditCompany: !!permission?.canEditCompany,
    canStockIn: !!permission?.canStockIn,
    canStockOut: !!permission?.canStockOut,
    canViewStockLedger: !!permission?.canViewStockLedger,
    canViewAllReports: !!permission?.canViewAllReports,
    canViewOwnReports: !!permission?.canViewOwnReports,
    canAddLogistics: !!permission?.canAddLogistics,
    canEditLogistics: !!permission?.canEditLogistics,
    canDeleteLogistics: !!permission?.canDeleteLogistics,
    canManageCompanies: !!permission?.canManageCompanies,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function savePermissions() {
    setSaving(true);
    setMessage(null);
    try {
      await apiFetch(`/settings/permissions/${permissionRole}`, {
        method: "PUT",
        body: JSON.stringify(draft),
      });

      onSaved();
      setMessage(`${permissionRole} permissions saved successfully.`);
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
        <div className="text-xs uppercase tracking-[0.28em] text-amber-200/80">Role</div>
        <select value={permissionRole} onChange={(event) => onRoleChange(event.target.value as "MANAGER" | "USER")} className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none">
          <option value="MANAGER">MANAGER</option>
          <option value="USER">USER</option>
        </select>
        <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-4 text-sm text-slate-300">
          This editor keeps the stock ledger hard-locked while allowing per-role operational switches.
        </div>
      </div>

      <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5">
        {Object.entries(draft).map(([key, value]) => (
          <label key={key} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
            <span>{key}</span>
            <input type="checkbox" checked={value} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.checked }))} />
          </label>
        ))}

        {message ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{message}</div> : null}

        <button type="button" onClick={savePermissions} disabled={saving} className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? "Saving…" : `Save ${permissionRole} permissions`}
        </button>
      </div>
    </div>
  );
}
