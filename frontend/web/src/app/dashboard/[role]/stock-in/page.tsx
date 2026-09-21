"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/hooks/use-session";

type ProductItem = {
  _id: string;
  name: string;
  shortName?: string;
  hsn?: string;
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
};

export default function StockInPage() {
  const router = useRouter();
  const { user } = useSession();

  // Form states
  const [productId, setProductId] = useState("");
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
  const [validationResult, setValidationResult] = useState<{ valid?: boolean; message?: string; alreadyUsed?: string[] } | null>(null);

  // Queries
  const { data: productsData } = useQuery<{ items: ProductItem[] }>({
    queryKey: ["products-list"],
    queryFn: () => apiFetch<{ items: ProductItem[] }>("/items"),
  });

  const { data: companiesData } = useQuery<{ companies: Company[] }>({
    queryKey: ["companies-list"],
    queryFn: () => apiFetch<{ companies: Company[] }>("/companies"),
  });

  const products = productsData?.items || [];
  const companies = companiesData?.companies || [];

  const selectedProduct = products.find((p) => p._id === productId);
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
    const comp = companies.find((c) => c.name === compName);
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
      {/* Header */}
      <div>
        <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-300">
          📥 Stock Entry Engine
        </div>
        <h1 className="mt-2 text-3xl font-bold text-white">Record Stock IN (Supplier Entry)</h1>
        <p className="text-sm text-slate-400">
          Ingest new inventory from suppliers, assign serial numbers, and sign the immutable Stock Ledger.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Product & Quantity Selection */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-xl space-y-4">
          <h2 className="text-lg font-bold text-white">1. Select Product & Quantity</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Product *</label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                required
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/40"
              >
                <option value="">Select a product...</option>
                {products.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} {p.shortName ? `(${p.shortName})` : ""}
                  </option>
                ))}
              </select>
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
            ) : (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Paste Serial Numbers (One per line or comma-separated)</label>
                <textarea
                  value={bulkSerials}
                  onChange={(e) => setBulkSerials(e.target.value)}
                  rows={4}
                  placeholder={"SN-1001\nSN-1002\nSN-1003"}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 p-4 font-mono text-xs text-white uppercase outline-none focus:border-amber-300/40"
                />
              </div>
            )}

            {/* Validation button */}
            <div className="flex items-center justify-between border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={handleValidateSerials}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
              >
                🔍 Check Duplicates Pre-Submission
              </button>

              {validationResult && (
                <span className={`text-xs font-semibold ${validationResult.valid ? "text-emerald-400" : "text-rose-400"}`}>
                  {validationResult.valid ? "✅ All Serials Valid & Available" : validationResult.message || "Validation Error"}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Supplier & Transaction Metadata */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-xl space-y-4">
          <h2 className="text-lg font-bold text-white">3. Supplier & Receipt Details</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Supplier Company</label>
              <select
                value={companyName}
                onChange={(e) => handleCompanySelect(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none"
              >
                <option value="">Select or type supplier...</option>
                {companies.map((c) => (
                  <option key={c._id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
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
    </div>
  );
}
