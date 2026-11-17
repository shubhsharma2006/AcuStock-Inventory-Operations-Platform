"use client";

import React, { useState, useEffect } from "react";
import { X, FileText, AlertCircle, CheckCircle2, Plus, Trash2, Scale } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface CreateBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBillCreated: () => void;
}

export function CreateBillModal({ isOpen, onClose, onBillCreated }: CreateBillModalProps) {
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [selectedPoId, setSelectedPoId] = useState<string>("");
  const [selectedPo, setSelectedPo] = useState<any | null>(null);

  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState<string>("");
  const [billDate, setBillDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState<string>(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [paymentTerms, setPaymentTerms] = useState<string>("NET_30");
  const [notes, setNotes] = useState<string>("");

  const [items, setItems] = useState<
    Array<{
      productId?: string;
      name: string;
      sku?: string;
      hsnCode?: string;
      quantityBilled: number;
      unitPriceBilled: number;
      gstRate: number;
    }>
  >([]);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      apiFetch<any>("/purchase-orders?limit=50")
        .then((res) => {
          if (res?.purchaseOrders) {
            setPurchaseOrders(res.purchaseOrders);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  const handlePoSelect = async (poId: string) => {
    setSelectedPoId(poId);
    if (!poId) {
      setSelectedPo(null);
      setItems([]);
      return;
    }

    try {
      const res = await apiFetch<any>(`/purchase-orders/${poId}`);
      if (res?.purchaseOrder) {
        const po = res.purchaseOrder;
        setSelectedPo(po);

        // Pre-fill items from PO
        const defaultItems = (po.items || []).map((it: any) => ({
          productId: it.productId?._id || it.productId,
          name: it.productId?.name || it.name || "Material Item",
          sku: it.productId?.sku || it.sku || "",
          hsnCode: it.productId?.hsnCode || "8471",
          quantityBilled: it.quantity || 1,
          unitPriceBilled: it.unitPrice || 0,
          gstRate: 18,
        }));
        setItems(defaultItems);
      }
    } catch (err: any) {
      setErrorMsg("Failed to load PO details");
    }
  };

  const updateItem = (index: number, field: string, val: any) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!vendorInvoiceNumber.trim()) {
      setErrorMsg("Please provide supplier invoice / bill number.");
      return;
    }
    if (!selectedPoId || !selectedPo) {
      setErrorMsg("Please select a valid Purchase Order.");
      return;
    }
    if (items.length === 0) {
      setErrorMsg("Please add at least one line item.");
      return;
    }

    try {
      setIsSubmitting(true);
      await apiFetch("/vendor-bills", {
        method: "POST",
        body: JSON.stringify({
          vendorInvoiceNumber,
          supplierId: selectedPo.supplier?.companyId || selectedPo.supplier?._id || selectedPo.supplier,
          purchaseOrderId: selectedPoId,
          billDate,
          dueDate,
          paymentTerms,
          items,
          notes,
        }),
      });
      setIsSubmitting(false);
      onBillCreated();
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMsg(err.message || "Failed to ingest vendor bill.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="w-full max-w-3xl bg-card text-card-foreground border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-base text-foreground">Ingest Vendor Commercial Bill</h2>
              <p className="text-xs text-muted-foreground">
                Matches billed lines against Purchase Order approved terms (3-Way Match)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Section 1: PO & Vendor Invoice */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Select Purchase Order *
              </label>
              <select
                value={selectedPoId}
                onChange={(e) => handlePoSelect(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                required
              >
                <option value="">-- Select PO to Match Against --</option>
                {purchaseOrders.map((po) => (
                  <option key={po._id} value={po._id}>
                    {po.poNumber} — {po.supplier?.name || "Supplier"} (₹{(po.totalValue || 0).toLocaleString("en-IN")})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Supplier Bill / Invoice Number *
              </label>
              <input
                type="text"
                placeholder="e.g. INV-VENDOR-88991"
                value={vendorInvoiceNumber}
                onChange={(e) => setVendorInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                required
              />
            </div>
          </div>

          {/* Section 2: Dates & Terms */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Bill Date *</label>
              <input
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Payment Terms</label>
              <select
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="NET_15">Net 15 Days</option>
                <option value="NET_30">Net 30 Days (Standard)</option>
                <option value="NET_45">Net 45 Days</option>
                <option value="IMMEDIATE">Due on Receipt</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Due Date *</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-primary" />
                Billed Items & Rates
              </span>
              <span className="text-[11px] text-muted-foreground">
                Rates & quantities will be matched against PO terms
              </span>
            </div>

            <div className="space-y-2 border border-border rounded-lg p-3 bg-muted/20">
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center text-xs">
                  <div className="col-span-4">
                    <input
                      type="text"
                      placeholder="Item name"
                      value={it.name}
                      onChange={(e) => updateItem(idx, "name", e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-background border border-input rounded text-xs"
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="text"
                      placeholder="SKU"
                      value={it.sku}
                      onChange={(e) => updateItem(idx, "sku", e.target.value)}
                      className="w-full px-2 py-1.5 bg-background border border-input rounded text-xs font-mono"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={it.quantityBilled}
                      onChange={(e) => updateItem(idx, "quantityBilled", parseInt(e.target.value, 10) || 1)}
                      className="w-full px-2 py-1.5 bg-background border border-input rounded text-xs font-mono text-center"
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Rate (₹)"
                      value={it.unitPriceBilled}
                      onChange={(e) => updateItem(idx, "unitPriceBilled", parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 bg-background border border-input rounded text-xs font-mono text-right"
                      required
                    />
                  </div>
                  <div className="col-span-2 text-right font-mono font-bold text-xs text-foreground">
                    ₹{(it.quantityBilled * it.unitPriceBilled).toLocaleString("en-IN")}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Internal Procurement Notes (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Received via courier, delivery challan attached"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2.5 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-input bg-background hover:bg-muted transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedPoId}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Ingesting & Running 3-Way Match...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Ingest Bill & Verify 3-Way Match</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

