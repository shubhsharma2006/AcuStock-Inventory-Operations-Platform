"use client";

import { useState, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { ACUSTOCK_API_BASE_URL } from "@/lib/acustock";
import { useQueryClient } from "@tanstack/react-query";

type BulkImportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  entityType: "products" | "companies";
};

type DryRunResult = {
  dryRun: boolean;
  totalRows: number;
  validCount: number;
  errorCount: number;
  errors: string[];
  duplicates: string[];
  existingInDb: string[];
  planLimitRemaining?: number | null;
  sample?: Record<string, unknown>[];
};

export function BulkImportModal({ isOpen, onClose, entityType }: BulkImportModalProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<"upload" | "paste">("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  if (!isOpen) return null;

  const endpoint = entityType === "products" ? "/items/bulk-upload" : "/companies/bulk-upload";
  const templateEndpoint = entityType === "products" ? "/items/bulk-upload/template" : "/companies/bulk-upload/template";

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setDryRunResult(null);
      setStatusMessage({ type: "info", text: `Selected file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)` });
    }
  }

  function getUploadPayload(): FormData | null {
    const formData = new FormData();
    if (activeTab === "upload") {
      if (!selectedFile) {
        setStatusMessage({ type: "error", text: "Please choose a CSV or Excel (.xlsx/.xls) file to upload." });
        return null;
      }
      formData.append("file", selectedFile);
    } else {
      if (!csvText.trim()) {
        setStatusMessage({ type: "error", text: "Please enter or paste CSV text." });
        return null;
      }
      const blob = new Blob([csvText], { type: "text/csv" });
      formData.append("file", blob, `${entityType}-import.csv`);
    }
    return formData;
  }

  async function handleDryRun() {
    const formData = getUploadPayload();
    if (!formData) return;

    setIsSubmitting(true);
    setStatusMessage(null);
    setDryRunResult(null);

    try {
      const res = await apiFetch<DryRunResult & { success: boolean; message?: string }>(`${endpoint}?dryRun=true`, {
        method: "POST",
        body: formData,
      });

      if (res.dryRun) {
        setDryRunResult(res);
        if (res.errorCount === 0 && res.duplicates.length === 0 && res.existingInDb.length === 0) {
          setStatusMessage({
            type: "success",
            text: `✅ Dry-run passed! ${res.validCount} rows are valid and ready to import.`,
          });
        } else {
          setStatusMessage({
            type: "info",
            text: `⚠️ Dry-run completed with warnings: ${res.validCount} valid rows, ${res.errorCount} errors, ${res.duplicates.length} in-file duplicates, ${res.existingInDb.length} existing in database.`,
          });
        }
      }
    } catch (err: unknown) {
      const error = err as Error & { data?: { code?: string; detail?: string; error?: string } };
      const detail = error.data?.detail || error.message || "Dry-run validation failed";
      setStatusMessage({ type: "error", text: `❌ ${detail}` });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmImport() {
    const formData = getUploadPayload();
    if (!formData) return;

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await apiFetch<{ success: boolean; message: string; count: number; warnings?: string[] }>(endpoint, {
        method: "POST",
        body: formData,
      });

      setStatusMessage({
        type: "success",
        text: `🎉 ${res.message || `Successfully imported ${res.count} ${entityType}!`}`,
      });

      if (entityType === "products") {
        queryClient.invalidateQueries({ queryKey: ["products-list"] });
        queryClient.invalidateQueries({ queryKey: ["items"] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["companies-list"] });
        queryClient.invalidateQueries({ queryKey: ["companies"] });
      }

      setDryRunResult(null);
      setSelectedFile(null);
      setCsvText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: unknown) {
      const error = err as Error & { data?: { code?: string; detail?: string; error?: string; errors?: string[] } };
      const detail = error.data?.detail || error.message || "Failed bulk import";
      setStatusMessage({ type: "error", text: `❌ ${detail}` });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span>📥</span>
              <span>Bulk Import {entityType === "products" ? "Products" : "Companies"}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Supports CSV &amp; Excel (.xlsx, .xls) files with dry-run validation &amp; quota checks.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Template Downloads */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs">
          <div className="text-slate-300 font-medium">Download sample import template:</div>
          <div className="flex gap-2">
            <a
              href={`${ACUSTOCK_API_BASE_URL}${templateEndpoint}?format=csv`}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition flex items-center gap-1.5"
            >
              📄 CSV Template
            </a>
            <a
              href={`${ACUSTOCK_API_BASE_URL}${templateEndpoint}?format=xlsx`}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition flex items-center gap-1.5"
            >
              📊 Excel Template (.xlsx)
            </a>
          </div>
        </div>

        {/* Mode Tabs */}
        <div className="flex gap-2 border-b border-white/10 pb-2 text-xs">
          <button
            type="button"
            onClick={() => { setActiveTab("upload"); setStatusMessage(null); }}
            className={`px-4 py-2 font-semibold rounded-lg transition ${
              activeTab === "upload"
                ? "bg-amber-400/20 text-amber-300 border border-amber-400/30"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            📁 Upload File (Excel / CSV)
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab("paste"); setStatusMessage(null); }}
            className={`px-4 py-2 font-semibold rounded-lg transition ${
              activeTab === "paste"
                ? "bg-amber-400/20 text-amber-300 border border-amber-400/30"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            📝 Paste CSV Text
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "upload" ? (
          <div className="rounded-xl border-2 border-dashed border-white/15 bg-slate-950/60 p-6 text-center hover:border-amber-400/40 transition">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv, .xlsx, .xls, text/csv, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFileChange}
              className="hidden"
              id="bulk-file-upload"
            />
            <label htmlFor="bulk-file-upload" className="cursor-pointer space-y-2 block">
              <div className="text-3xl">📂</div>
              <div className="text-sm font-semibold text-slate-200">
                {selectedFile ? selectedFile.name : "Click to browse or drag & drop"}
              </div>
              <div className="text-xs text-slate-400">
                Supports .xlsx, .xls, or .csv files up to 5MB
              </div>
            </label>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="rounded-xl border border-white/10 bg-slate-950 p-3 text-[11px] font-mono text-slate-400">
              <span className="font-semibold text-slate-300">Expected Headers: </span>
              {entityType === "products"
                ? "productName, shortName, hsnCode, salesPrice, purchasePrice, mrp, warrantyPeriod, enableSerial, requireSerialOnIN, requireSerialOnOUT"
                : "companyName, email, phone, street, city, state, zipCode, country, industry, website, taxId"}
            </div>
            <textarea
              value={csvText}
              onChange={(e) => { setCsvText(e.target.value); setDryRunResult(null); }}
              rows={6}
              placeholder={
                entityType === "products"
                  ? "productName,shortName,hsnCode,salesPrice,purchasePrice,mrp,warrantyPeriod,enableSerial,requireSerialOnIN,requireSerialOnOUT\nDell XPS 15,DXPS15,8471,85000,75000,90000,12 months,true,true,true\nWireless Mouse,WMOUSE,8471,800,500,999,6 months,false,false,false\nUSB-C Hub,USBHUB,8471,2500,1800,2999,12 months,true,true,false"
                  : "companyName,email,phone,street,city,state,zipCode,country,industry,website,taxId\nAcme Corp,contact@acme.com,+919876543210,123 MG Road,Bengaluru,Karnataka,560001,India,Technology,https://acme.com,29ABCDE1234F1Z5"
              }
              className="w-full rounded-xl border border-white/10 bg-slate-950 p-4 font-mono text-xs text-white outline-none focus:border-amber-400/50"
            />
          </div>
        )}

        {/* Dry Run Preview Summary */}
        {dryRunResult && (
          <div className="space-y-3 rounded-xl border border-white/10 bg-slate-950 p-4 text-xs">
            <div className="flex items-center justify-between font-semibold">
              <span className="text-amber-300">🔍 Dry-Run Validation Summary</span>
              <span className="text-slate-400">
                {dryRunResult.validCount} valid / {dryRunResult.totalRows} total rows
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="rounded-lg bg-white/5 p-2">
                <div className="text-slate-400 text-[10px] uppercase">Total Rows</div>
                <div className="text-sm font-bold text-white">{dryRunResult.totalRows}</div>
              </div>
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2">
                <div className="text-emerald-400 text-[10px] uppercase">Valid</div>
                <div className="text-sm font-bold text-emerald-300">{dryRunResult.validCount}</div>
              </div>
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2">
                <div className="text-red-400 text-[10px] uppercase">Errors</div>
                <div className="text-sm font-bold text-red-300">{dryRunResult.errorCount}</div>
              </div>
              <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-2">
                <div className="text-blue-400 text-[10px] uppercase">Remaining Quota</div>
                <div className="text-sm font-bold text-blue-300">
                  {dryRunResult.planLimitRemaining !== null && dryRunResult.planLimitRemaining !== undefined
                    ? dryRunResult.planLimitRemaining
                    : "Unlimited"}
                </div>
              </div>
            </div>

            {/* In-File Duplicates */}
            {dryRunResult.duplicates && dryRunResult.duplicates.length > 0 && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2.5 text-red-300">
                <div className="font-semibold mb-1">⚠️ Duplicates within file:</div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {dryRunResult.duplicates.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Existing in DB */}
            {dryRunResult.existingInDb && dryRunResult.existingInDb.length > 0 && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-amber-300">
                <div className="font-semibold mb-1">⚠️ Already exists in your database:</div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {dryRunResult.existingInDb.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Error List */}
            {dryRunResult.errors && dryRunResult.errors.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-lg border border-red-500/20 bg-red-500/5 p-2.5 text-[11px] text-red-300 space-y-1">
                <div className="font-semibold">Row Validation Errors:</div>
                {dryRunResult.errors.map((err, i) => (
                  <div key={i}>• {err}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`rounded-xl border p-3 text-xs ${
              statusMessage.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : statusMessage.type === "error"
                ? "border-red-500/30 bg-red-500/10 text-red-300"
                : "border-blue-500/30 bg-blue-500/10 text-blue-300"
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap justify-between items-center gap-3 pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 transition"
          >
            Cancel
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={isSubmitting || (activeTab === "upload" && !selectedFile) || (activeTab === "paste" && !csvText.trim())}
              onClick={handleDryRun}
              className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-400/20 disabled:opacity-50 transition"
            >
              {isSubmitting ? "Validating..." : "🔍 Validate / Dry-Run First"}
            </button>

            <button
              type="button"
              disabled={isSubmitting || (activeTab === "upload" && !selectedFile) || (activeTab === "paste" && !csvText.trim())}
              onClick={handleConfirmImport}
              className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-2 text-xs font-bold text-slate-950 hover:from-amber-300 hover:to-orange-400 disabled:opacity-50 transition shadow-lg shadow-amber-500/20"
            >
              {isSubmitting ? "Importing..." : "🚀 Ingest & Commit Import"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
