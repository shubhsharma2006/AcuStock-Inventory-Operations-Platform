"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/hooks/use-session";

interface ImportRecord {
  _id: string;
  importNumber: string;
  type: string;
  fileName: string;
  totalRows: number;
  successfulRows: number;
  failedRows: number;
  status: "COMPLETED" | "PARTIAL" | "FAILED" | "ROLLED_BACK";
  isRolledBack: boolean;
  createdAt: string;
  performedBy?: { name: string; email: string };
}

export default function ImportHistoryPage() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  const { data, isLoading } = useQuery<{ success: boolean; data: ImportRecord[] }>({
    queryKey: ["import-history"],
    queryFn: () => apiFetch("/api/import-history"),
  });

  const imports = data?.data || [];

  const rollbackMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/import-history/${id}/rollback`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["import-history"] }),
  });

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-400 border border-cyan-500/20">
              Data Management & Auditing
            </span>
            <span className="text-xs text-slate-400">• Bulk Upload Audit & Safe Rollback</span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">
            Bulk Import History & Rollback
          </h1>
          <p className="mt-1 text-sm text-slate-400 max-w-3xl">
            Audit trail of all catalog and ledger bulk CSV imports. View row-level validation errors and safely rollback corrupted or erroneous batches.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-slate-400">Total Bulk Imports</div>
          <div className="mt-2 text-2xl font-extrabold text-white">{imports.length}</div>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-emerald-300">Successfully Ingested Batches</div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-400">
            {imports.filter((i) => i.status === "COMPLETED").length}
          </div>
        </div>
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 backdrop-blur-xl">
          <div className="text-xs font-medium text-amber-300">Rolled Back Batches</div>
          <div className="mt-2 text-2xl font-extrabold text-amber-400">
            {imports.filter((i) => i.isRolledBack).length}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-xl shadow-xl">
        {isLoading ? (
          <div className="py-16 text-center text-xs text-slate-400">Loading Import History…</div>
        ) : imports.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <div className="text-base font-bold text-white">No Imports Logged Yet</div>
            <p className="mt-1 text-xs text-slate-500">
              Bulk CSV uploads will automatically create an immutable audit record and rollback snapshot here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3 px-4">Import #</th>
                  <th className="py-3 px-4">File Name</th>
                  <th className="py-3 px-4">Entity Type</th>
                  <th className="py-3 px-4 text-center">Success / Total</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Date</th>
                  {isAdmin && <th className="py-3 px-4 text-center">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {imports.map((imp) => (
                  <tr key={imp._id} className="hover:bg-white/5 transition">
                    <td className="py-3 px-4 font-mono font-bold text-white">{imp.importNumber}</td>
                    <td className="py-3 px-4 font-mono text-slate-300">{imp.fileName}</td>
                    <td className="py-3 px-4">
                      <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] font-mono text-cyan-300 border border-white/5">
                        {imp.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono">
                      <span className="text-emerald-400 font-bold">{imp.successfulRows}</span>
                      <span className="text-slate-500"> / {imp.totalRows}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          imp.isRolledBack
                            ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                            : imp.status === "COMPLETED"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        }`}
                      >
                        {imp.isRolledBack ? "ROLLED_BACK" : imp.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-500">
                      {new Date(imp.createdAt).toLocaleDateString()}
                    </td>
                    {isAdmin && (
                      <td className="py-3 px-4 text-center">
                        {!imp.isRolledBack && imp.status === "COMPLETED" ? (
                          <button
                            onClick={() => rollbackMutation.mutate(imp._id)}
                            className="rounded-lg bg-rose-500/20 px-2 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 transition"
                          >
                            Rollback
                          </button>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

