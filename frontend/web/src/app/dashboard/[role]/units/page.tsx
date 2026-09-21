"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type Unit = {
  _id: string;
  name: string;
  shortName: string;
  description?: string;
  isActive?: boolean;
};

export default function UnitsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const { data: unitsData, isLoading, error } = useQuery<{ units: Unit[] }>({
    queryKey: ["units"],
    queryFn: () => apiFetch<{ units: Unit[] }>("/units"),
  });

  const units = unitsData?.units || [];

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch("/units", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["units"] });
      closeModal();
    },
    onError: (err: Error) => setFormError(err.message || "Failed to save unit"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      apiFetch(`/units/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["units"] });
      closeModal();
    },
    onError: (err: Error) => setFormError(err.message || "Failed to save unit"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/units/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["units"] });
    },
  });

  function openCreateModal() {
    setEditingUnit(null);
    setName("");
    setShortName("");
    setDescription("");
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(u: Unit) {
    setEditingUnit(u);
    setName(u.name);
    setShortName(u.shortName);
    setDescription(u.description || "");
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingUnit(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !shortName.trim()) {
      setFormError("Name and Short Symbol are required");
      return;
    }
    const payload = {
      name: name.trim(),
      shortName: shortName.trim(),
      description: description.trim() || undefined,
    };

    if (editingUnit) {
      updateMutation.mutate({ id: editingUnit._id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const filtered = units.filter(
    (u) =>
      !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.shortName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Units of Measurement</h1>
          <p className="text-sm text-slate-400">
            Define system units (Pcs, Box, Kg, Carton, Bundle, Meter) used across product inventory.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:from-amber-200 hover:to-orange-400"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Unit
        </button>
      </div>

      {/* Search */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 backdrop-blur-xl">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by unit name or symbol (e.g. Box, Pcs, Kg)..."
          className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-300/40"
        />
      </div>

      {isLoading && <div className="p-8 text-center text-slate-400">Loading units...</div>}
      {error && (
        <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">
          {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-xl">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="border-b border-white/10 bg-slate-950/60 text-xs font-semibold uppercase text-slate-400">
              <tr>
                <th className="px-6 py-4">Unit Name</th>
                <th className="px-6 py-4">Symbol / Code</th>
                <th className="px-6 py-4">Description</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((u) => (
                <tr key={u._id} className="transition hover:bg-white/5">
                  <td className="px-6 py-4 font-semibold text-white">{u.name}</td>
                  <td className="px-6 py-4 font-mono text-xs text-amber-300">
                    <span className="rounded-lg bg-amber-400/10 px-2.5 py-1 font-bold">
                      {u.shortName}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-400">{u.description || "—"}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(u)}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete unit ${u.name}?`)) {
                            deleteMutation.mutate(u._id);
                          }
                        }}
                        className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-1.5 text-xs text-rose-300 transition hover:bg-rose-400/20"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500">
                    No units of measurement found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-white">
              {editingUnit ? "Edit Unit" : "Add Unit of Measurement"}
            </h2>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Unit Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Kilogram / Box / Piece"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-300/40"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Symbol / Abbreviation *</label>
                <input
                  type="text"
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  placeholder="e.g. Kg / BOX / PCS"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-300/40"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Description (Optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Standard unit definition..."
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-300/40"
                />
              </div>

              {formError && (
                <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs text-rose-200">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:from-amber-200 hover:to-orange-400 disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Unit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
