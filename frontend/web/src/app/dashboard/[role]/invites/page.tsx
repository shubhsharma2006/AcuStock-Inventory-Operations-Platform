"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Role } from "@/lib/acustock";

type Invite = {
  _id: string;
  email: string;
  role: Role;
  expiresAt: string;
  token: string;
  createdAt: string;
};

export default function InvitesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("MANAGER");
  const [formError, setFormError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const { data: invitesData, isLoading, error } = useQuery<{ success: boolean; invites: Invite[] }>({
    queryKey: ["invites"],
    queryFn: () => apiFetch<{ success: boolean; invites: Invite[] }>("/invites"),
  });

  const invites = invitesData?.invites || [];

  const sendInviteMutation = useMutation({
    mutationFn: (payload: { email: string; role: Role }) =>
      apiFetch("/invites", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invites"] });
      setModalOpen(false);
      setEmail("");
      setRole("MANAGER");
      setFormError(null);
    },
    onError: (err: Error) => setFormError(err.message || "Failed to send invite"),
  });

  const resendInviteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/invites/${id}/resend`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invites"] });
    },
  });

  const cancelInviteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/invites/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invites"] });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setFormError("Email address is required");
      return;
    }
    sendInviteMutation.mutate({ email: email.trim(), role });
  }

  function getTimeRemaining(expiresAt: string) {
    const diff = new Date(expiresAt).getTime() - now;
    if (diff <= 0) return "Expired";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    return `${hours}h remaining`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">📬 Team Invitations</h1>
          <p className="text-sm text-slate-400">
            Invite new team members via secure 48-hour email magic links.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:from-amber-200 hover:to-orange-400"
        >
          + Send Invite Link
        </button>
      </div>

      {isLoading && <div className="p-8 text-center text-slate-400">Loading invitations...</div>}
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
                <th className="px-6 py-4">Recipient Email</th>
                <th className="px-6 py-4">Assigned Role</th>
                <th className="px-6 py-4">Expiration</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {invites.map((inv) => {
                const timeRemaining = getTimeRemaining(inv.expiresAt);
                const isExpired = timeRemaining === "Expired";

                return (
                  <tr key={inv._id} className="transition hover:bg-white/5">
                    <td className="px-6 py-4 font-semibold text-white">{inv.email}</td>
                    <td className="px-6 py-4">
                      <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-200">
                        {inv.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono">
                      <span
                        className={`rounded-full px-2.5 py-1 font-medium ${
                          isExpired ? "bg-rose-400/10 text-rose-300" : "bg-emerald-400/10 text-emerald-300"
                        }`}
                      >
                        {timeRemaining}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => resendInviteMutation.mutate(inv._id)}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
                        >
                          Resend
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelInviteMutation.mutate(inv._id)}
                          className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-1.5 text-xs text-rose-300 transition hover:bg-rose-400/20"
                        >
                          Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {invites.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500">
                    No pending invitations. Click &quot;+ Send Invite Link&quot; to invite a user.
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
            <h2 className="text-xl font-bold text-white">Send Team Invite</h2>
            <p className="mt-1 text-xs text-slate-400">An invitation email with a secure registration link will be sent.</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Email Address *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-300/40"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Assigned Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none"
                >
                  <option value="USER">User</option>
                  <option value="MANAGER">Manager</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>

              {formError && (
                <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs text-rose-200">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendInviteMutation.isPending}
                  className="rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:from-amber-200 hover:to-orange-400 disabled:opacity-50"
                >
                  {sendInviteMutation.isPending ? "Sending..." : "Send Invite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
