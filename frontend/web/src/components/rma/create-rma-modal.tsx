"use client";

import React, { useState, useEffect } from "react";
import { X, RotateCcw, AlertCircle, CheckCircle2, Truck, Package } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface CreateRmaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRmaCreated: () => void;
}

export function CreateRmaModal({ isOpen, onClose, onRmaCreated }: CreateRmaModalProps) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  const [returnType, setReturnType] = useState<string>("CUSTOMER_RETURN");
  const [reason, setReason] = useState<string>("DEFECTIVE_PRODUCT");
  const [reasonDetails, setReasonDetails] = useState<string>("");
  const [courierName, setCourierName] = useState<string>("");
  const [trackingNumber, setTrackingNumber] = useState<string>("");

  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      apiFetch<any>("/invoices?limit=50")
        .then((res) => {
          if (res?.invoices) setInvoices(res.invoices);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  const handleInvoiceSelect = async (invId: string) => {
    setSelectedInvoiceId(invId);
    if (!invId) {
      setSelectedInvoice(null);
      setReturnQuantities({});
      return;
    }

    try {
      const res = await apiFetch<any>(`/invoices/${invId}`);
      if (res?.invoice) {
        setSelectedInvoice(res.invoice);
        // Default 1 unit per item
        const initialQtys: Record<string, number> = {};
        (res.invoice.items || []).forEach((it: any) => {
          initialQtys[it._id || it.name] = it.quantity || 1;
        });
        setReturnQuantities(initialQtys);
      }
    } catch (err: any) {
      setErrorMsg("Failed to load invoice items");
    }
  };

  const handleQtyChange = (key: string, qty: number, max: number) => {
    const val = Math.max(0, Math.min(qty, max));
    setReturnQuantities((prev) => ({ ...prev, [key]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedInvoiceId || !selectedInvoice) {
      setErrorMsg("Please select an original commercial invoice.");
      return;
    }

    const itemsToReturn: any[] = [];
    (selectedInvoice.items || []).forEach((it: any) => {
      const key = it._id || it.name;
      const returnQty = returnQuantities[key] || 0;
      if (returnQty > 0) {
        itemsToReturn.push({
          productId: it.productId?._id || it.productId,
          name: it.name,
          sku: it.sku,
          hsnCode: it.hsnCode,
          quantityRequested: returnQty,
          unitPrice: it.unitPrice,
          taxRatePercent: it.gstRate || 18,
        });
      }
    });

    if (itemsToReturn.length === 0) {
      setErrorMsg("Please specify at least 1 unit to return for any item.");
      return;
    }

    try {
      setIsSubmitting(true);
      await apiFetch("/rma", {
        method: "POST",
        body: JSON.stringify({
          invoiceId: selectedInvoiceId,
          returnType,
          reason,
          reasonDetails,
          returnLogistics: {
            courierName,
            trackingNumber,
          },
          items: itemsToReturn,
        }),
      });
      setIsSubmitting(false);
      onRmaCreated();
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMsg(err.message || "Failed to initiate Return Merchandise Authorization.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="w-full max-w-2xl bg-card text-card-foreground border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-base text-foreground">Initiate Return Authorization (RMA)</h2>
              <p className="text-xs text-muted-foreground">
                Formalize customer return or courier Return-to-Origin (RTO) against invoice
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

          {/* Select Invoice */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Select Commercial Invoice *
            </label>
            <select
              value={selectedInvoiceId}
              onChange={(e) => handleInvoiceSelect(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono"
              required
            >
              <option value="">-- Select Invoice to Return Against --</option>
              {invoices.map((inv) => (
                <option key={inv._id} value={inv._id}>
                  {inv.invoiceNumber} — {inv.billingAddress?.name} (₹{(inv.financialSummary?.grandTotal || inv.grandTotal || 0).toLocaleString("en-IN")})
                </option>
              ))}
            </select>
          </div>

          {/* Return Type & Reason */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Return Type *</label>
              <select
                value={returnType}
                onChange={(e) => setReturnType(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="CUSTOMER_RETURN">Customer Initiated Return</option>
                <option value="COURIER_RTO">Courier RTO (Delivery Failed / Rejected)</option>
                <option value="DEFECT_REPLACEMENT">Defect Replacement / Warranty</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Return Reason *</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="DEFECTIVE_PRODUCT">Defective / Malfunctioning Product</option>
                <option value="TRANSIT_DAMAGE">Damaged in Transit by Courier</option>
                <option value="WRONG_ITEM_SHIPPED">Wrong Item / SKU Shipped</option>
                <option value="NOT_DELIVERED_RTO">Customer Refused / Address Unreachable</option>
                <option value="CUSTOMER_CANCELLATION">Customer Order Cancellation</option>
                <option value="EXPIRED_SHELF_LIFE">Expired Shelf Life / Quality Issue</option>
                <option value="OTHER">Other Reason</option>
              </select>
            </div>
          </div>

          {/* Logistics Tracking */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Return Courier / Carrier
              </label>
              <input
                type="text"
                placeholder="e.g. Delhivery, Bluedart, Self"
                value={courierName}
                onChange={(e) => setCourierName(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Return Tracking / Waybill #
              </label>
              <input
                type="text"
                placeholder="e.g. DEL-99881122"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono"
              />
            </div>
          </div>

          {/* Reason Details */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Customer Complaint / Return Notes
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Unit does not power on, customer requesting immediate credit note"
              value={reasonDetails}
              onChange={(e) => setReasonDetails(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Select Items & Quantities to return */}
          {selectedInvoice && (
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Specify Items & Quantities to Return
              </label>
              <div className="border border-border rounded-lg divide-y divide-border bg-muted/20">
                {(selectedInvoice.items || []).map((it: any) => {
                  const key = it._id || it.name;
                  const currentQty = returnQuantities[key] ?? it.quantity;

                  return (
                    <div key={key} className="p-3 flex items-center justify-between gap-4 text-xs">
                      <div>
                        <span className="font-semibold text-foreground">{it.name}</span>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          SKU: {it.sku || "--"} • Invoiced: {it.quantity} @ ₹{it.unitPrice.toLocaleString("en-IN")}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs">Return Qty:</span>
                        <input
                          type="number"
                          min="0"
                          max={it.quantity}
                          value={currentQty}
                          onChange={(e) => handleQtyChange(key, parseInt(e.target.value, 10) || 0, it.quantity)}
                          className="w-16 px-2 py-1 text-xs text-center bg-background border border-input rounded font-mono"
                        />
                        <span className="text-[11px] text-muted-foreground">/ {it.quantity}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
              disabled={isSubmitting || !selectedInvoiceId}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Authorizing Return...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Authorize Return (RMA)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

