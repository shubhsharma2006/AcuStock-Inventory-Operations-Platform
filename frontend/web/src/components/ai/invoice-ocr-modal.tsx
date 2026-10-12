"use client";

import React, { useState, useRef } from "react";
import { apiFetch } from "@/lib/api";

export interface ExtractedInvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  supplier: {
    rawName: string;
    taxId?: string | null;
    matchedCompanyId?: string | null;
    matchedCompanyName?: string | null;
    isCatalogMatch: boolean;
  };
  currency: string;
  totalAmount?: number | null;
  lineItems: Array<{
    rawDescription: string;
    itemCode?: string | null;
    hsnCode?: string | null;
    quantity: number;
    unitPrice?: number | null;
    totalPrice?: number | null;
    lotNumber?: string | null;
    expiryDate?: string | null;
    serialNumbers: string[];
    matchedItem?: {
      _id: string;
      name: string;
      shortName?: string;
      hsn?: string;
      trackingMode: string;
      requiresSerials: boolean;
    } | null;
    matchConfidence?: number | null;
    isCatalogMatch: boolean;
  }>;
  confidenceScore: number;
  notes?: string;
}

interface InvoiceOcrModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (prefill: {
    productId: string;
    quantity: number;
    companyName: string;
    transactionId: string;
    serialNumbers: string[];
    notes: string;
  }) => void;
  products: Array<{ _id: string; name: string }>;
}

export function InvoiceOcrModal({ isOpen, onClose, onApply, products }: InvoiceOcrModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedInvoiceData | null>(null);
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(0);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = (file: File) => {
    setError(null);
    setSelectedFile(file);
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleUploadAndScan = async () => {
    if (!selectedFile) {
      setError("Please select an invoice or packing slip file.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("invoiceFile", selectedFile);

      const response = await apiFetch<{
        success: boolean;
        data: ExtractedInvoiceData;
      }>("/api/ai/ocr/invoice-to-stock-in", {
        method: "POST",
        body: formData,
      });

      if (response && response.data) {
        setExtractedData(response.data);
        // Pre-select first matched product if available
        const firstLine = response.data.lineItems[0];
        if (firstLine && firstLine.matchedItem) {
          setSelectedProductId(firstLine.matchedItem._id);
        } else if (products.length > 0) {
          setSelectedProductId(products[0]._id);
        }
      } else {
        throw new Error("No structured data returned from OCR engine.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scan document");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUseDemoInvoice = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      // Send mock base64 to test engine seamlessly
      const mockPayload = {
        fileBase64: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
        mimeType: "image/jpeg",
        fileName: "Apex-Industrial-INV-992.jpg",
      };

      const response = await apiFetch<{
        success: boolean;
        data: ExtractedInvoiceData;
      }>("/api/ai/ocr/invoice-to-stock-in", {
        method: "POST",
        body: JSON.stringify(mockPayload),
      });

      if (response && response.data) {
        setExtractedData(response.data);
        const firstLine = response.data.lineItems[0];
        if (firstLine && firstLine.matchedItem) {
          setSelectedProductId(firstLine.matchedItem._id);
        } else if (products.length > 0) {
          setSelectedProductId(products[0]._id);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo extraction failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyToForm = () => {
    if (!extractedData) return;

    const currentLine = extractedData.lineItems[selectedItemIndex] || extractedData.lineItems[0];
    const resolvedProductId = selectedProductId || (currentLine?.matchedItem?._id ?? "");

    const notesSummary = [
      `[AI OCR Scanned from: ${selectedFile?.name || "Invoice Document"}]`,
      `Invoice #: ${extractedData.invoiceNumber}`,
      `Date: ${extractedData.invoiceDate}`,
      currentLine?.lotNumber ? `Lot #: ${currentLine.lotNumber}` : null,
      currentLine?.expiryDate ? `Expiry: ${currentLine.expiryDate}` : null,
      extractedData.notes,
    ]
      .filter(Boolean)
      .join(" | ");

    onApply({
      productId: resolvedProductId,
      quantity: currentLine ? currentLine.quantity : 1,
      companyName:
        extractedData.supplier.matchedCompanyName ||
        extractedData.supplier.rawName ||
        "",
      transactionId: extractedData.invoiceNumber || "",
      serialNumbers: currentLine?.serialNumbers || [],
      notes: notesSummary,
    });

    onClose();
  };

  const currentItem = extractedData?.lineItems[selectedItemIndex];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-3xl border border-emerald-500/30 bg-slate-950 shadow-2xl shadow-emerald-950/40 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-gradient-to-r from-emerald-950/40 to-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-inner">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">AI Invoice & Packing Slip OCR</h2>
                <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 border border-emerald-400/30">
                  Gemini Vision
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Instantly extract line items, quantities, suppliers, lots & serials
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {!extractedData ? (
            /* Upload & Dropzone View */
            <div className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
                  isDragOver
                    ? "border-emerald-400 bg-emerald-500/10 scale-[0.99]"
                    : "border-white/15 bg-white/[0.02] hover:border-emerald-500/40 hover:bg-emerald-500/5"
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="hidden"
                />

                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>

                <div>
                  <p className="text-sm font-semibold text-white">
                    {selectedFile ? selectedFile.name : "Drop vendor invoice or packing slip here"}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Supports PNG, JPG, WEBP or PDF documents up to 10MB
                  </p>
                </div>

                {selectedFile && (
                  <span className="inline-flex rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-medium text-emerald-300">
                    {(selectedFile.size / 1024).toFixed(1)} KB ready for scan
                  </span>
                )}
              </div>

              {previewUrl && (
                <div className="flex justify-center rounded-2xl border border-white/10 bg-black/40 p-2 overflow-hidden max-h-48">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="Invoice preview" className="object-contain max-h-44 rounded-lg" />
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleUseDemoInvoice}
                  disabled={isProcessing}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
                >
                  ⚡ Try Sample Invoice
                </button>

                <button
                  type="button"
                  onClick={handleUploadAndScan}
                  disabled={!selectedFile || isProcessing}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-2.5 text-xs font-bold text-slate-950 hover:from-emerald-400 hover:to-teal-400 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                      Analyzing with Gemini Vision...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Scan Document
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Structured Review & Confirmation View */
            <div className="space-y-6">
              {/* Extraction Summary Header */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-2xl border border-emerald-500/20 bg-emerald-950/20">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">Invoice Number</span>
                  <p className="text-sm font-semibold text-white">{extractedData.invoiceNumber || "N/A"}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">Invoice Date</span>
                  <p className="text-sm font-semibold text-white">{extractedData.invoiceDate || "N/A"}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">Vendor / Supplier</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-sm font-semibold text-white truncate">
                      {extractedData.supplier.matchedCompanyName || extractedData.supplier.rawName}
                    </p>
                    {extractedData.supplier.isCatalogMatch && (
                      <span className="shrink-0 text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.2 rounded border border-emerald-400/20">
                        ✓ Match
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">Total Amount</span>
                  <p className="text-sm font-semibold text-emerald-300">
                    {extractedData.currency} {extractedData.totalAmount?.toLocaleString() || "—"}
                  </p>
                </div>
              </div>

              {/* Line Items Tabs */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Detected Line Items ({extractedData.lineItems.length})
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Select an item to prefill into Stock IN form
                  </span>
                </div>

                <div className="space-y-2">
                  {extractedData.lineItems.map((item, index) => {
                    const isSelected = selectedItemIndex === index;
                    return (
                      <div
                        key={index}
                        onClick={() => {
                          setSelectedItemIndex(index);
                          if (item.matchedItem) {
                            setSelectedProductId(item.matchedItem._id);
                          }
                        }}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                          isSelected
                            ? "border-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-400/30"
                            : "border-white/10 bg-slate-900/40 hover:border-white/20"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-white">
                                {item.rawDescription}
                              </span>
                              {item.isCatalogMatch ? (
                                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                                  Catalog: {item.matchedItem?.name}
                                </span>
                              ) : (
                                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/30">
                                  Unmatched in Catalog
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                              <span>Qty: <strong className="text-white">{item.quantity}</strong></span>
                              {item.unitPrice && <span>Rate: {extractedData.currency} {item.unitPrice}</span>}
                              {item.lotNumber && <span>Lot: <strong className="text-teal-300">{item.lotNumber}</strong></span>}
                              {item.expiryDate && <span>Expiry: {item.expiryDate}</span>}
                              {item.serialNumbers?.length > 0 && (
                                <span className="text-emerald-400">
                                  {item.serialNumbers.length} Serial Numbers detected
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <span className="text-xs font-bold text-white">
                              {isSelected ? "Selected" : "Select"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Product Catalog Matcher Selection */}
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Target Inventory Product in AcuStock:
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-emerald-400 focus:outline-none"
                >
                  <option value="">-- Choose Catalog Product --</option>
                  {products.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400">
                  The stock entry will be recorded under this inventory product in the ledger.
                </p>
              </div>

              {/* Serials Preview if detected */}
              {currentItem?.serialNumbers && currentItem.serialNumbers.length > 0 && (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-300">
                      Detected Serial Numbers ({currentItem.serialNumbers.length})
                    </span>
                    <span className="text-[10px] text-slate-400">Auto-transferred to form</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {currentItem.serialNumbers.map((sn, idx) => (
                      <span
                        key={idx}
                        className="rounded-lg border border-emerald-500/30 bg-emerald-900/30 px-2 py-0.5 text-xs font-mono text-emerald-200"
                      >
                        {sn}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Modal Footer Controls */}
              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setExtractedData(null)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/10 transition-colors"
                >
                  ← Scan Another File
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyToForm}
                    disabled={!selectedProductId}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-2.5 text-xs font-bold text-slate-950 hover:from-emerald-400 hover:to-teal-400 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ✓ Auto-Fill Stock IN Form
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
