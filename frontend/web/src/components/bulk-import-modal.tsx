"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

type BulkImportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  entityType: "products" | "companies";
};

export function BulkImportModal({ isOpen, onClose, entityType }: BulkImportModalProps) {
  const queryClient = useQueryClient();
  const [csvText, setCsvText] = useState("");
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  function handleParseCsv() {
    if (!csvText.trim()) return;
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) {
      setResultMessage("❌ CSV must contain a header row and at least 1 data row.");
      return;
    }

    const headers = lines[0].split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
    const dataRows = lines.slice(1).map((line) => {
      const values = line.split(",").map((v) => v.trim().replace(/^["']|["']$/g, ""));
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || "";
      });
      return row;
    });

    setParsedRows(dataRows);
    setResultMessage(`✅ Successfully parsed ${dataRows.length} rows. Ready for bulk ingestion.`);
  }

  async function handleBulkSubmit() {
    if (!parsedRows.length) return;
    setIsSubmitting(true);
    setResultMessage(null);

    try {
      if (entityType === "products") {
        let count = 0;
        for (const row of parsedRows) {
          if (!row.name) continue;
          await apiFetch("/items", {
            method: "POST",
            body: JSON.stringify({
              name: row.name,
              shortName: row.shortName || undefined,
              salesPrice: Number(row.salesPrice) || 100,
              purchasePrice: Number(row.purchasePrice) || 80,
              hsn: row.hsn || undefined,
            }),
          });
          count++;
        }
        queryClient.invalidateQueries({ queryKey: ["products-list"] });
        queryClient.invalidateQueries({ queryKey: ["items"] });
        setResultMessage(`🎉 Successfully imported ${count} products!`);
      } else {
        let count = 0;
        for (const row of parsedRows) {
          if (!row.name) continue;
          await apiFetch("/companies", {
            method: "POST",
            body: JSON.stringify({
              name: row.name,
              type: row.type || "SUPPLIER",
              email: row.email || undefined,
              phone: row.phone || undefined,
            }),
          });
          count++;
        }
        queryClient.invalidateQueries({ queryKey: ["companies-list"] });
        queryClient.invalidateQueries({ queryKey: ["companies"] });
        setResultMessage(`🎉 Successfully imported ${count} companies!`);
      }
    } catch (err) {
      setResultMessage(`❌ Import error: ${err instanceof Error ? err.message : "Failed bulk commit"}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">
            📥 Bulk CSV Import — {entityType === "products" ? "Products Catalog" : "Companies Directory"}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Paste CSV rows below or upload a file. Header row is required.
        </p>

        {/* Sample Template Tip */}
        <div className="rounded-xl border border-white/10 bg-slate-950 p-3 text-xs font-mono text-slate-300">
          <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-1">
            Expected CSV Format Header:
          </div>
          {entityType === "products"
            ? "name,shortName,salesPrice,purchasePrice,hsn"
            : "name,type,email,phone"}
        </div>

        {/* Text Area */}
        <div>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={5}
            placeholder={
              entityType === "products"
                ? "name,shortName,salesPrice,purchasePrice,hsn\nDell XPS 15,XPS15,1500,1200,8471\nLogitech MX Master,MX3,100,75,8471"
                : "name,type,email,phone\nAcme Logistics,SUPPLIER,info@acme.com,+18005550199"
            }
            className="w-full rounded-xl border border-white/10 bg-slate-950 p-4 font-mono text-xs text-white outline-none focus:border-amber-300/40"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleParseCsv}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
          >
            Parse CSV Data
          </button>
        </div>

        {/* Parsed Preview Table */}
        {parsedRows.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-slate-950 p-3">
            <table className="w-full text-left text-xs text-slate-300">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 font-semibold">
                  {Object.keys(parsedRows[0]).map((h) => (
                    <th key={h} className="pb-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {parsedRows.slice(0, 5).map((row, idx) => (
                  <tr key={idx}>
                    {Object.values(row).map((val, vIdx) => (
                      <td key={vIdx} className="py-1.5">{val}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {parsedRows.length > 5 && (
              <div className="mt-2 text-[11px] text-slate-500 text-center">
                + {parsedRows.length - 5} more rows parsed...
              </div>
            )}
          </div>
        )}

        {resultMessage && (
          <div className="rounded-xl border border-white/10 bg-slate-950 p-3 text-xs text-amber-300">
            {resultMessage}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
          >
            Close
          </button>
          <button
            type="button"
            disabled={!parsedRows.length || isSubmitting}
            onClick={handleBulkSubmit}
            className="rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-6 py-2 text-sm font-bold text-slate-950 hover:from-amber-200 hover:to-orange-400 disabled:opacity-50"
          >
            {isSubmitting ? "Importing..." : `Commit Bulk Import (${parsedRows.length} rows)`}
          </button>
        </div>
      </div>
    </div>
  );
}
