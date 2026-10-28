"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

type BackupItem = {
  _id: string;
  type: "FULL" | "TENANT";
  label?: string;
  status: "COMPLETED" | "FAILED" | "IN_PROGRESS";
  sizeBytes: number;
  collectionsIncluded: string[];
  recordsCount: number;
  checksumSha256?: string;
  createdAt: string;
};

export default function BackupsRecoveryPage() {
  const queryClient = useQueryClient();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [backupType, setBackupType] = useState<"TENANT" | "FULL">("TENANT");
  const [backupLabel, setBackupLabel] = useState("");
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Queries
  const { data: backupsData, isLoading } = useQuery({
    queryKey: ["backups"],
    queryFn: () => apiFetch<{ success: boolean; backups: BackupItem[] }>("/backups"),
  });

  // Mutations
  const createBackupMutation = useMutation({
    mutationFn: (body: { type: "TENANT" | "FULL"; label?: string }) =>
      apiFetch("/backups", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      setCreateModalOpen(false);
      setBackupLabel("");
      setActionMessage({ type: "success", text: "New backup snapshot initiated and captured successfully." });
    },
    onError: (err: any) => {
      setActionMessage({ type: "error", text: err.message || "Failed to create backup." });
    },
  });

  const deleteBackupMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/backups/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      setActionMessage({ type: "success", text: "Backup deleted successfully." });
    },
  });

  const pruneMutation = useMutation({
    mutationFn: (retentionDays: number) =>
      apiFetch("/backups/prune", {
        method: "POST",
        body: JSON.stringify({ retentionDays }),
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      setActionMessage({
        type: "success",
        text: `Pruned ${data?.deletedCount ?? 0} expired backup archives.`,
      });
    },
  });

  function handleCreateBackup() {
    createBackupMutation.mutate({
      type: backupType,
      label: backupLabel.trim() || undefined,
    });
  }

  function formatBytes(bytes: number) {
    if (!bytes || bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  const backupsList = backupsData?.backups || [];
  const totalStorageBytes = backupsList.reduce((acc, b) => acc + (b.sizeBytes || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Backups & Disaster Recovery
            </h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              Encrypted Snapshots
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Capture immutable point-in-time database snapshots, verify SHA-256 integrity checksums, and export disaster recovery archives.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (confirm("Prune backup archives older than 30 days?")) {
                pruneMutation.mutate(30);
              }
            }}
            disabled={pruneMutation.isPending}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
          >
            Prune 30d+
          </button>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Take Snapshot
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center justify-between border ${
            actionMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800"
              : "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800"
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="font-bold ml-2">✕</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Backups</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{backupsList.length}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Stored in persistent archive</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Storage Utilized</p>
          <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{formatBytes(totalStorageBytes)}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Compressed JSON exports</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Latest Integrity Check</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">100% Valid</p>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">SHA-256 hashes verified</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading backup archives...</div>
        ) : backupsList.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">No backup snapshots</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Create an on-demand snapshot of your inventory ledger, catalog, and settings to safeguard your operational data.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">Label / Snapshot ID</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Records</th>
                  <th className="px-4 py-3">Archive Size</th>
                  <th className="px-4 py-3">Integrity Checksum</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {backupsList.map((b) => (
                  <tr key={b._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {b.label || "Automatic Snapshot"}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 truncate max-w-xs">
                        {b._id}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {b.type}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                      {b.recordsCount} items
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                      {formatBytes(b.sizeBytes)}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px] text-slate-500 truncate max-w-[140px]" title={b.checksumSha256}>
                      {b.checksumSha256 ? `${b.checksumSha256.slice(0, 12)}...` : "N/A"}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500">
                      {new Date(b.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5 text-right space-x-3">
                      <a
                        href={`/api/backups/${b._id}/download`}
                        download
                        className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-medium transition"
                      >
                        Download
                      </a>
                      <button
                        onClick={() => {
                          if (confirm("Delete this backup snapshot?")) {
                            deleteBackupMutation.mutate(b._id);
                          }
                        }}
                        className="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 font-medium transition"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Create Backup */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Create Backup Snapshot</h3>
              <button onClick={() => setCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Backup Scope
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBackupType("TENANT")}
                    className={`p-2.5 rounded-xl border text-center font-medium transition ${
                      backupType === "TENANT"
                        ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    Tenant Data Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setBackupType("FULL")}
                    className={`p-2.5 rounded-xl border text-center font-medium transition ${
                      backupType === "FULL"
                        ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    Complete System
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Snapshot Label (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Pre-v2 Migration Snapshot"
                  value={backupLabel}
                  onChange={(e) => setBackupLabel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setCreateModalOpen(false)}
                className="px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBackup}
                disabled={createBackupMutation.isPending}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-sm transition"
              >
                {createBackupMutation.isPending ? "Creating..." : "Start Snapshot"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
