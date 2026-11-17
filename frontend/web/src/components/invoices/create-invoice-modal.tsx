"use client";

import React, { useState, useEffect, useMemo } from "react";
import { X, Plus, Trash2, Calculator, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvoiceCreated: () => void;
}

interface LineItemInput {
  name: string;
  sku: string;
  hsnCode: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  gstRate: number;
}

const INDIAN_STATES = [
  { name: "Maharashtra", code: "27" },
  { name: "Karnataka", code: "29" },
  { name: "Gujarat", code: "24" },
  { name: "Delhi", code: "07" },
  { name: "Tamil Nadu", code: "33" },
  { name: "Telangana", code: "36" },
  { name: "Haryana", code: "06" },
  { name: "Uttar Pradesh", code: "09" },
  { name: "West Bengal", code: "19" },
  { name: "Rajasthan", code: "08" },
  { name: "Madhya Pradesh", code: "23" },
  { name: "Punjab", code: "03" },
  { name: "Kerala", code: "32" },
  { name: "Andhra Pradesh", code: "37" },
  { name: "Goa", code: "30" },
  { name: "Bihar", code: "10" },
  { name: "Odisha", code: "21" },
  { name: "Assam", code: "18" },
  { name: "Chandigarh", code: "04" },
  { name: "Jharkhand", code: "20" },
  { name: "Uttarakhand", code: "05" },
  { name: "Himachal Pradesh", code: "02" },
];

export function CreateInvoiceModal({
  isOpen,
  onClose,
  onInvoiceCreated,
}: CreateInvoiceModalProps) {
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [placeOfSupply, setPlaceOfSupply] = useState<string>("Maharashtra");
  const [placeOfSupplyCode, setPlaceOfSupplyCode] = useState<string>("27");
  const [paymentTerms, setPaymentTerms] = useState<string>("NET_30");
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState<string>(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );

  const [customerName, setCustomerName] = useState<string>("");
  const [customerGstin, setCustomerGstin] = useState<string>("");
  const [addressLine, setAddressLine] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [pincode, setPincode] = useState<string>("");

  const [items, setItems] = useState<LineItemInput[]>([
    {
      name: "",
      sku: "",
      hsnCode: "8471",
      quantity: 1,
      unitPrice: 0,
      discountPercent: 0,
      gstRate: 18,
    },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch companies for dropdown
  useEffect(() => {
    if (isOpen) {
      apiFetch<any>("/companies?limit=100")
        .then((res) => {
          if (res?.companies) setCompanies(res.companies);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  // Adjust due date when paymentTerms changes
  useEffect(() => {
    const base = new Date(invoiceDate);
    let days = 30;
    if (paymentTerms === "NET_15") days = 15;
    else if (paymentTerms === "NET_45") days = 45;
    else if (paymentTerms === "NET_60") days = 60;
    else if (paymentTerms === "IMMEDIATE" || paymentTerms === "ADVANCE") days = 0;
    base.setDate(base.getDate() + days);
    setDueDate(base.toISOString().split("T")[0]);
  }, [paymentTerms, invoiceDate]);

  // When company is picked, auto-populate address & GSTIN
  const handleCompanyChange = (companyId: string) => {
    setSelectedCompanyId(companyId);
    const comp = companies.find((c) => c._id === companyId);
    if (comp) {
      setCustomerName(comp.name || "");
      setCustomerGstin(comp.gstin || "");
      if (comp.billingAddress) {
        setAddressLine(comp.billingAddress.street || comp.billingAddress.addressLine1 || "");
        setCity(comp.billingAddress.city || "");
        setPincode(comp.billingAddress.zipCode || comp.billingAddress.pincode || "");
        if (comp.billingAddress.state) {
          const match = INDIAN_STATES.find(
            (s) => s.name.toLowerCase() === comp.billingAddress.state.toLowerCase()
          );
          if (match) {
            setPlaceOfSupply(match.name);
            setPlaceOfSupplyCode(match.code);
          }
        }
      }
    }
  };

  const handleStateChange = (stateName: string) => {
    setPlaceOfSupply(stateName);
    const match = INDIAN_STATES.find((s) => s.name === stateName);
    if (match) setPlaceOfSupplyCode(match.code);
  };

  const addItemRow = () => {
    setItems((prev) => [
      ...prev,
      {
        name: "",
        sku: "",
        hsnCode: "8471",
        quantity: 1,
        unitPrice: 0,
        discountPercent: 0,
        gstRate: 18,
      },
    ]);
  };

  const removeItemRow = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof LineItemInput, value: any) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  // Calculations
  const calculations = useMemo(() => {
    const isInterState = placeOfSupplyCode !== "27"; // Seller is MH (27)
    let taxableTotal = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let igstTotal = 0;

    items.forEach((item) => {
      const lineGross = item.quantity * item.unitPrice;
      const discount = lineGross * (item.discountPercent / 100);
      const taxable = lineGross - discount;
      taxableTotal += taxable;

      if (isInterState) {
        igstTotal += taxable * (item.gstRate / 100);
      } else {
        const halfRate = item.gstRate / 2;
        cgstTotal += taxable * (halfRate / 100);
        sgstTotal += taxable * (halfRate / 100);
      }
    });

    const totalTax = cgstTotal + sgstTotal + igstTotal;
    const rawGrandTotal = taxableTotal + totalTax;
    const grandTotal = Math.round(rawGrandTotal);
    const roundOff = grandTotal - rawGrandTotal;

    return {
      isInterState,
      taxableTotal,
      cgstTotal,
      sgstTotal,
      igstTotal,
      totalTax,
      roundOff,
      grandTotal,
    };
  }, [items, placeOfSupplyCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!customerName.trim()) {
      setErrorMsg("Please provide customer / company name.");
      return;
    }

    const invalidItem = items.find((it) => !it.name.trim() || it.unitPrice <= 0 || it.quantity <= 0);
    if (invalidItem) {
      setErrorMsg("Every item must have a description, positive quantity, and valid rate.");
      return;
    }

    try {
      setIsSubmitting(true);
      await apiFetch("/invoices", {
        method: "POST",
        body: JSON.stringify({
          companyId: selectedCompanyId || undefined,
          invoiceDate,
          dueDate,
          placeOfSupply,
          placeOfSupplyCode,
          paymentTerms,
          billingAddress: {
            name: customerName,
            gstin: customerGstin,
            addressLine1: addressLine,
            city,
            state: placeOfSupply,
            stateCode: placeOfSupplyCode,
            pincode,
          },
          shippingAddress: {
            name: customerName,
            addressLine1: addressLine,
            city,
            state: placeOfSupply,
            stateCode: placeOfSupplyCode,
            pincode,
          },
          items,
        }),
      });
      setIsSubmitting(false);
      onInvoiceCreated();
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMsg(err.message || "Failed to create tax invoice.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="w-full max-w-4xl bg-card text-card-foreground border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-base text-foreground">Create GST Tax Invoice</h2>
              <p className="text-xs text-muted-foreground">
                Sequential commercial invoice with state-aware GST and NIC E-Way Bill schema
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
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Section 1: Customer & Destination */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Select Existing Company (Optional)
              </label>
              <select
                value={selectedCompanyId}
                onChange={(e) => handleCompanyChange(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">-- Manual Entry / Walk-in --</option>
                {companies.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} {c.gstin ? `(${c.gstin})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Customer / Billed To Name *
              </label>
              <input
                type="text"
                placeholder="e.g. Acme Industrial Solutions Pvt Ltd"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Customer GSTIN
              </label>
              <input
                type="text"
                placeholder="e.g. 27AABCA1234F1Z5"
                value={customerGstin}
                onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono uppercase"
              />
            </div>
          </div>

          {/* Place of Supply & Address */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                Place of Supply (State) *
              </label>
              <select
                value={placeOfSupply}
                onChange={(e) => handleStateChange(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.name}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-muted-foreground mt-0.5 block">
                {calculations.isInterState ? "Inter-State (IGST)" : "Intra-State (CGST + SGST)"}
              </span>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-foreground mb-1">
                Billing Address Line
              </label>
              <input
                type="text"
                placeholder="Street address, industrial area"
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">City</label>
                <input
                  type="text"
                  placeholder="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-2 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">PIN</label>
                <input
                  type="text"
                  placeholder="PIN"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  className="w-full px-2 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Dates & Terms */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Invoice Date</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
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
                <option value="IMMEDIATE">Immediate / Due on Receipt</option>
                <option value="NET_15">Net 15 Days</option>
                <option value="NET_30">Net 30 Days (Standard)</option>
                <option value="NET_45">Net 45 Days</option>
                <option value="NET_60">Net 60 Days</option>
                <option value="ADVANCE">100% Advance Payment</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
          </div>

          {/* Section 3: Itemized Goods / Services */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Line Items & Tax Breakdown
              </span>
              <button
                type="button"
                onClick={addItemRow}
                className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Item
              </button>
            </div>

            <div className="space-y-2 border border-border rounded-lg p-3 bg-muted/20">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center text-xs">
                  <div className="col-span-3">
                    <input
                      type="text"
                      placeholder="Product / Service Description *"
                      value={item.name}
                      onChange={(e) => updateItem(idx, "name", e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-background border border-input rounded text-xs focus:ring-1 focus:ring-primary"
                      required
                    />
                  </div>
                  <div className="col-span-1">
                    <input
                      type="text"
                      placeholder="HSN"
                      value={item.hsnCode}
                      onChange={(e) => updateItem(idx, "hsnCode", e.target.value)}
                      className="w-full px-2 py-1.5 bg-background border border-input rounded text-xs font-mono text-center"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="text"
                      placeholder="SKU (optional)"
                      value={item.sku}
                      onChange={(e) => updateItem(idx, "sku", e.target.value)}
                      className="w-full px-2 py-1.5 bg-background border border-input rounded text-xs font-mono"
                    />
                  </div>
                  <div className="col-span-1">
                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 1)}
                      className="w-full px-2 py-1.5 bg-background border border-input rounded text-xs text-center font-mono"
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Rate (₹)"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 bg-background border border-input rounded text-xs font-mono text-right"
                      required
                    />
                  </div>
                  <div className="col-span-1">
                    <select
                      value={item.gstRate}
                      onChange={(e) => updateItem(idx, "gstRate", parseFloat(e.target.value) || 0)}
                      className="w-full px-1 py-1.5 bg-background border border-input rounded text-xs"
                    >
                      <option value="0">0%</option>
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                      <option value="28">28%</option>
                    </select>
                  </div>
                  <div className="col-span-1 text-right font-mono font-medium text-xs">
                    ₹{((item.quantity * item.unitPrice) * (1 - item.discountPercent / 100)).toFixed(0)}
                  </div>
                  <div className="col-span-1 text-center">
                    <button
                      type="button"
                      onClick={() => removeItemRow(idx)}
                      disabled={items.length <= 1}
                      className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Live Totals */}
          <div className="p-4 rounded-lg bg-muted/40 border border-border flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="space-y-1 text-xs text-muted-foreground">
              <div>Taxable Subtotal: <span className="font-mono font-semibold text-foreground">₹{calculations.taxableTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
              {calculations.isInterState ? (
                <div>Integrated GST (IGST): <span className="font-mono font-semibold text-foreground">₹{calculations.igstTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
              ) : (
                <div>
                  CGST: <span className="font-mono font-semibold text-foreground">₹{calculations.cgstTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span> + SGST: <span className="font-mono font-semibold text-foreground">₹{calculations.sgstTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>

            <div className="text-right">
              <span className="text-xs text-muted-foreground">Invoice Grand Total</span>
              <div className="text-xl font-bold font-mono text-primary">
                ₹{calculations.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-muted-foreground">
                (Inclusive of all taxes & round-off)
              </span>
            </div>
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
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Generating Invoice...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Issue Commercial Invoice</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

