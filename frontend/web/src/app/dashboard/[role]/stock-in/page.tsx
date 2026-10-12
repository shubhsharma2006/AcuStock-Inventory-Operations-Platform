"use client";

import { useState, useEffect, useMemo, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/hooks/use-session";
import { InvoiceOcrModal } from "@/components/ai/invoice-ocr-modal";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";

type ProductItem = {
  _id: string;
  name: string;
  shortName?: string;
  hsn?: string;
  sku?: string;
  currentStock?: number;
  quantity?: number;
  serialPolicy?: {
    enableSerial?: boolean;
    requireSerialOnIN?: boolean;
    requireSerialOnOUT?: boolean;
  };
};

type Company = {
  _id: string;
  name: string;
  type?: string;
  city?: string;
  gstin?: string;
  phone?: string;
  email?: string;
};

type WarehouseItem = {
  _id: string;
  name: string;
  code?: string;
  location?: string;
  isPrimary?: boolean;
};

export default function StockInPage() {
  const router = useRouter();
  const { user } = useSession();
  const queryClient = useQueryClient();

  // Form states
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [serialInputMode, setSerialInputMode] = useState<"individual" | "bulk">("individual");
  const [individualSerials, setIndividualSerials] = useState<string[]>([""]);
  const [bulkSerials, setBulkSerials] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("BANK_TRANSFER");
  const [transactionId, setTransactionId] = useState("");
  const [warrantyPeriod, setWarrantyPeriod] = useState("12 Months");
  const [condition, setCondition] = useState("New");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);
  const [ocrNotice, setOcrNotice] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<{
    valid?: boolean;
    message?: string;
    alreadyUsed?: string[];
    internalDuplicates?: string[];
  } | null>(null);

  function handleApplyOcr(prefill: {
    productId: string;
    quantity: number;
    companyName: string;
    transactionId: string;
    serialNumbers: string[];
    notes: string;
  }) {
    if (prefill.productId) setProductId(prefill.productId);
    if (prefill.quantity) setQuantity(prefill.quantity);
    if (prefill.companyName) {
      setCompanyName(prefill.companyName);
      const matched = companies.find((c: any) => (c.companyName || c.name || "").toLowerCase() === prefill.companyName.toLowerCase());
      if (matched) setSelectedCompanyId(matched._id);
    }
    if (prefill.transactionId) setTransactionId(prefill.transactionId);
    if (prefill.notes) setNotes(prefill.notes);
    if (prefill.serialNumbers && prefill.serialNumbers.length > 0) {
      setSerialInputMode("bulk");
      setBulkSerials(prefill.serialNumbers.join("\n"));
    }
    setOcrNotice(`Pre-filled from invoice ${prefill.transactionId || 'document'}. Review and confirm all fields below.`);
  }

  // Queries with auto-refetch
  const { data: productsData, refetch: refetchProducts, isFetching: loadingProducts } = useQuery<ProductItem[] | { items: ProductItem[] }>({
    queryKey: ["products-list"],
    queryFn: () => apiFetch("/items"),
  });

  const { data: companiesData, refetch: refetchCompanies, isFetching: loadingCompanies } = useQuery<Company[] | { companies: Company[] }>({
    queryKey: ["companies-list"],
    queryFn: () => apiFetch("/companies"),
  });

  const { data: warehousesData, refetch: refetchWarehouses, isFetching: loadingWarehouses } = useQuery<WarehouseItem[] | { warehouses: WarehouseItem[] }>({
    queryKey: ["warehouses"],
    queryFn: () => apiFetch("/warehouses"),
  });

  const products = useMemo(() => {
    if (Array.isArray(productsData)) return productsData;
    return (productsData as any)?.items || [];
  }, [productsData]);

  const companies = useMemo(() => {
    if (Array.isArray(companiesData)) return companiesData;
    return (companiesData as any)?.companies || [];
  }, [companiesData]);

  const warehouses = useMemo(() => {
    if (Array.isArray(warehousesData)) return warehousesData;
    return (warehousesData as any)?.warehouses || [];
  }, [warehousesData]);

  // Auto-select primary warehouse if none selected
  useEffect(() => {
    if (!warehouseId && warehouses.length > 0) {
      const primary = warehouses.find((w: WarehouseItem) => w.isPrimary || (w as any).isDefault) || warehouses[0];
      if (primary?._id) setWarehouseId(primary._id);
    }
  }, [warehouses, warehouseId]);

  // Options for Searchable Comboboxes
  const productOptions: SearchableSelectOption[] = useMemo(() => {
    return products.map((p: ProductItem) => {
      const stock = p.currentStock ?? p.quantity ?? 0;
      const isOut = stock <= 0;
      return {
        value: p._id,
        label: p.name,
        sublabel: p.sku || p.shortName || undefined,
        badge: isOut ? "0 Stock" : `${stock} in stock`,
        badgeColor: isOut ? "rose" : "emerald",
        icon: "📦",
        details: p.hsn ? `HSN: ${p.hsn}` : undefined,
      };
    });
  }, [products]);

  const companyOptions: SearchableSelectOption[] = useMemo(() => {
    return companies.map((c: any) => ({
      value: c.companyName || c.name,
      label: c.companyName || c.name,
      sublabel: c.address?.city || c.city || (c.taxId || c.gstin ? `GST: ${c.taxId || c.gstin}` : undefined),
      badge: c.type || "Supplier",
      badgeColor: "blue",
      icon: "🏢",
      details: c.email || c.phone || undefined,
    }));
  }, [companies]);

  const warehouseOptions: SearchableSelectOption[] = useMemo(() => {
    return warehouses.map((w: WarehouseItem) => ({
      value: w._id,
      label: w.name,
      sublabel: w.code || undefined,
      badge: w.isPrimary || (w as any).isDefault ? "Primary Hub" : "Active Branch",
      badgeColor: "purple",
      icon: "🏭",
      details: (w as any).address?.city || w.location || undefined,
    }));
  }, [warehouses]);

  const selectedProduct = products.find((p: ProductItem) => p._id === productId);
  const serialPolicy = selectedProduct?.serialPolicy || {};
  const requiresSerials = serialPolicy.enableSerial && serialPolicy.requireSerialOnIN;

  // Sync individual serials array length with quantity
  useEffect(() => {
    // The list is controlled by quantity while each entry remains user-editable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIndividualSerials((prev) => {
      const next = [...prev];
      if (next.length < quantity) {
        while (next.length < quantity) next.push("");
      } else if (next.length > quantity) {
        next.length = quantity;
      }
      return next;
    });
  }, [quantity]);

  function handleCompanySelect(compName: string) {
    setCompanyName(compName);
    const comp = companies.find((c: any) => c.name === compName || c.companyName === compName);
    if (comp) setSelectedCompanyId(comp._id);
  }

  // Pre-submission Serial Validation
  async function handleValidateSerials() {
    let serialsToValidate: string[] = [];
    if (serialInputMode === "bulk") {
      serialsToValidate = bulkSerials.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    } else {
      serialsToValidate = individualSerials.map((s) => s.trim()).filter(Boolean);
    }

    if (!serialsToValidate.length) {
      setValidationResult({ valid: false, message: "No serial numbers entered to validate." });
      return;
    }

    try {
      const result = await apiFetch<{ valid: boolean; alreadyUsed?: string[]; message?: string }>("/stock/validate-serials", {
        method: "POST",
        body: JSON.stringify({
          serialNumbers: serialsToValidate,
          productId,
          action: "IN",
        }),
      });
      setValidationResult(result);
    } catch (err) {
      setValidationResult({ valid: false, message: err instanceof Error ? err.message : "Validation failed" });
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!productId) {
      setFormError("Please select a product.");
      return;
    }
    if (quantity <= 0) {
      setFormError("Quantity must be greater than 0.");
      return;
    }

    // Process serials
    let finalSerials: string[] = [];
    if (serialPolicy.enableSerial) {
      if (serialInputMode === "bulk") {
        finalSerials = bulkSerials.split(/[\n,]/).map((s) => s.trim().toUpperCase()).filter(Boolean);
      } else {
        finalSerials = individualSerials.map((s) => s.trim().toUpperCase()).filter(Boolean);
      }

      if (requiresSerials && finalSerials.length !== quantity) {
        setFormError(`Serial policy requires exactly ${quantity} serial numbers (entered ${finalSerials.length}).`);
        return;
      }
    }

    setLoading(true);
    setFormError(null);

    try {
      await apiFetch("/stock/in", {
        method: "POST",
        body: JSON.stringify({
          productId,
          warehouseId: warehouseId || undefined,
          quantity: Number(quantity),
          serialNumbers: finalSerials,
          supplier: companyName.trim() || undefined,
          condition,
          transaction: {
            supplierType: "SUPPLIER",
            paymentMethod,
            transactionId: transactionId.trim() || undefined,
            warrantyPeriod,
          },
          notes: notes.trim() || undefined,
        }),
      });

      queryClient.invalidateQueries({ queryKey: ["products-list"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });

      const roleHome = `/dashboard/${
        user?.role === "SUPER_ADMIN" || user?.role === "ADMIN"
          ? "admin"
          : user?.role.toLowerCase()
      }`;
      router.push(`${roleHome}/stock-ledger`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to record Stock IN entry");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header with AI Invoice OCR Trigger */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-300">
            📥 Stock Entry Engine
          </div>
          <h1 className="mt-2 text-3xl font-bold text-white">Record Stock IN (Supplier Entry)</h1>
          <p className="text-sm text-slate-400">
            Ingest new inventory from suppliers, assign serial numbers, and sign the immutable Stock Ledger.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsOcrModalOpen(true)}
          className="inline-flex items-center gap-2.5 rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/60 to-slate-900/80 px-5 py-3 text-sm font-bold text-emerald-300 shadow-xl shadow-emerald-950/30 hover:border-emerald-400 hover:from-emerald-900/60 hover:to-slate-800/80 transition-all cursor-pointer group"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-400/20 text-emerald-300 group-hover:scale-110 transition-transform">
            ⚡
          </span>
          <span>AI Scan Invoice / Slip</span>
          <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-200 border border-emerald-400/30">
            Vision OCR
          </span>
        </button>
      </div>

      {ocrNotice && (
        <div className="flex items-center justify-between rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300 text-xs">
              ✓
            </span>
            <span>{ocrNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setOcrNotice(null)}
            className="text-xs font-bold text-emerald-400 hover:text-emerald-200"
          >
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Product & Quantity Selection */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-xl space-y-4">
          <h2 className="text-lg font-bold text-white">1. Select Product & Quantity</h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <SearchableSelect
                label="Product"
                required
                options={productOptions}
                value={productId}
                onChange={(val) => setProductId(val)}
                placeholder="Select or type product name, SKU..."
                searchPlaceholder="Type initial letter or name to search products..."
                onRefresh={() => refetchProducts()}
                isLoading={loadingProducts}
                onAddNew={() => {
                  const role = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN" ? "admin" : (user?.role || "user").toLowerCase();
                  router.push(`/dashboard/${role}/products`);
                }}
                addNewLabel="+ New Product in Catalog"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Quantity (Units) *</label>
              <input
                type="number"
                min={1}
                max={100000}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                required
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/40"
              />
            </div>
          </div>

          {/* Destination Warehouse Selector */}
          <div>
            <SearchableSelect
              label="Destination Warehouse Hub"
              required
              options={warehouseOptions}
              value={warehouseId}
              onChange={(val) => setWarehouseId(val)}
              placeholder="Select target warehouse..."
              searchPlaceholder="Type warehouse name or code..."
              onRefresh={() => refetchWarehouses()}
              isLoading={loadingWarehouses}
              onAddNew={() => {
                const role = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN" ? "admin" : (user?.role || "user").toLowerCase();
                router.push(`/dashboard/${role}/warehouses`);
              }}
              addNewLabel="+ Add New Warehouse"
            />
          </div>

          {/* Serial Policy Info Banner */}
          {selectedProduct && (
            <div className={`rounded-xl border p-4 text-xs ${
              serialPolicy.enableSerial
                ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                : "border-white/10 bg-slate-950/60 text-slate-400"
            }`}>
              {serialPolicy.enableSerial ? (
                <div className="flex items-center gap-2 font-medium">
                  <span>⚡ Enterprise Serial Policy Active:</span>
                  <span>{requiresSerials ? "Serials REQUIRED on Stock IN" : "Serials OPTIONAL on Stock IN"}</span>
                </div>
              ) : (
                <div>Batch tracking product (Serial numbers not required).</div>
              )}
            </div>
          )}
        </div>

        {/* Step 2: Serial Numbers (If Enabled) */}
        {serialPolicy.enableSerial && (
          <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">2. Serial Number Ingestion</h2>
              <div className="flex rounded-xl border border-white/10 bg-slate-950/60 p-1">
                <button
                  type="button"
                  onClick={() => setSerialInputMode("individual")}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                    serialInputMode === "individual" ? "bg-white text-slate-950" : "text-slate-400"
                  }`}
                >
                  Individual ({quantity})
                </button>
                <button
                  type="button"
                  onClick={() => setSerialInputMode("bulk")}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                    serialInputMode === "bulk" ? "bg-white text-slate-950" : "text-slate-400"
                  }`}
                >
                  Bulk Paste / Scanner
                </button>
              </div>
            </div>

            {serialInputMode === "individual" ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Enter {quantity} distinct serial numbers:</span>
                  <span className={`font-mono font-bold ${
                    individualSerials.filter(Boolean).length === quantity ? "text-emerald-400" : "text-amber-400"
                  }`}>
                    {individualSerials.filter(Boolean).length} / {quantity} entered
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-h-60 overflow-y-auto pr-1">
                  {individualSerials.map((s, idx) => (
                    <div key={idx}>
                      <label className="mb-1 block text-[11px] font-medium text-slate-400">Unit #{idx + 1} Serial</label>
                      <input
                        type="text"
                        value={s}
                        onChange={(e) => {
                          const val = e.target.value;
                          setIndividualSerials((prev) => {
                            const copy = [...prev];
                            copy[idx] = val;
                            return copy;
                          });
                        }}
                        placeholder={`e.g. SN-${1000 + idx}`}
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white uppercase outline-none focus:border-amber-300/40"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-300">
                    Paste / Scan Barcodes (One per line or comma-separated)
                  </label>
                  {(() => {
                    const count = bulkSerials.split(/[\n,]/).map(s => s.trim()).filter(Boolean).length;
                    return (
                      <span className={`text-xs font-mono font-bold ${
                        count === quantity ? "text-emerald-400" : "text-amber-400"
                      }`}>
                        {count} / {quantity} scanned
                      </span>
                    );
                  })()}
                </div>
                <textarea
                  value={bulkSerials}
                  onChange={(e) => setBulkSerials(e.target.value)}
                  rows={4}
                  placeholder={"SN-1001\nSN-1002\nSN-1003"}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 p-4 font-mono text-xs text-white uppercase outline-none focus:border-amber-300/40"
                />
              </div>
            )}

            {/* Validation button & results */}
            <div className="space-y-3 border-t border-white/10 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleValidateSerials}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition"
                >
                  🔍 Pre-Validate Serials
                </button>

                {validationResult && (
                  <span className={`text-xs font-semibold ${validationResult.valid ? "text-emerald-400" : "text-rose-400"}`}>
                    {validationResult.valid ? "✅ All Serials Valid & Ready" : validationResult.message || "Validation Error"}
                  </span>
                )}
              </div>

              {/* Tag display for problematic serials */}
              {validationResult && !validationResult.valid && (
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 space-y-2 text-xs">
                  {validationResult.alreadyUsed && validationResult.alreadyUsed.length > 0 && (
                    <div>
                      <span className="font-semibold text-rose-300">Already in stock: </span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {validationResult.alreadyUsed.map((sn) => (
                          <span key={sn} className="rounded bg-rose-950/80 px-2 py-0.5 font-mono text-[10px] text-rose-200 border border-rose-500/30">
                            {sn}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {validationResult.internalDuplicates && validationResult.internalDuplicates.length > 0 && (
                    <div>
                      <span className="font-semibold text-amber-300">Duplicate entries in form: </span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {validationResult.internalDuplicates.map((sn) => (
                          <span key={sn} className="rounded bg-amber-950/80 px-2 py-0.5 font-mono text-[10px] text-amber-200 border border-amber-500/30">
                            {sn}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Supplier & Transaction Metadata */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-xl space-y-4">
          <h2 className="text-lg font-bold text-white">3. Supplier & Receipt Details</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <SearchableSelect
                label="Supplier Company"
                options={companyOptions}
                value={companyName}
                onChange={(val) => handleCompanySelect(val)}
                placeholder="Select or type supplier..."
                searchPlaceholder="Type initial letter or company name..."
                onRefresh={() => refetchCompanies()}
                isLoading={loadingCompanies}
                onAddNew={() => {
                  const role = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN" ? "admin" : (user?.role || "user").toLowerCase();
                  router.push(`/dashboard/${role}/companies`);
                }}
                addNewLabel="+ Register New Company"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none"
              >
                <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                <option value="CREDIT">Supplier Credit (Net 30)</option>
                <option value="CASH">Cash on Delivery</option>
                <option value="UPI">UPI / Digital</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Invoice / Receipt Ref ID</label>
              <input
                type="text"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="e.g. INV-2026-8891"
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/40"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Condition</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none"
              >
                <option value="New">Brand New</option>
                <option value="Demo">Demo Unit</option>
                <option value="Repair">Repaired / Refurbished</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">Notes & Inspection Remarks</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Inspection notes or batch details..."
              className="w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-sm text-white outline-none focus:border-amber-300/40"
            />
          </div>
        </div>

        {formError && (
          <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">
            {formError}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-8 py-3.5 font-bold text-slate-950 transition hover:from-amber-200 hover:to-orange-400 disabled:opacity-50"
          >
            {loading ? "Recording Stock IN..." : "Submit Stock IN Entry"}
          </button>
        </div>
      </form>

      {/* Invoice OCR Vision Modal */}
      <InvoiceOcrModal
        isOpen={isOcrModalOpen}
        onClose={() => setIsOcrModalOpen(false)}
        onApply={handleApplyOcr}
        products={products}
      />
    </div>
  );
}
