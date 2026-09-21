"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Role } from "@/lib/acustock";

type SystemUser = {
  _id: string;
  name?: string;
  email?: string;
  phone?: string;
  role: Role;
  isActive?: boolean;
  isSuperAdmin?: boolean;
  lastLogin?: string;
  isOnline?: boolean;
  hasCustomPermissions?: boolean;
};

type ActiveSession = {
  _id: string;
  name?: string;
  email?: string;
  role: Role;
  isSuperAdmin?: boolean;
  lastLogin?: string;
};

type AdminUser = {
  _id: string;
  name?: string;
  email?: string;
  username?: string;
  role: Role;
  isSuperAdmin?: boolean;
  isActive?: boolean;
  lastLogin?: string;
  createdAt?: string;
};

const PERMISSION_KEYS = [
  { key: "canViewProducts", label: "View Products" },
  { key: "canAddProduct", label: "Add Product" },
  { key: "canEditProduct", label: "Edit Product" },
  { key: "canDeleteProduct", label: "Delete Product" },
  { key: "canStockIn", label: "Perform Stock IN" },
  { key: "canStockOut", label: "Perform Stock OUT" },
  { key: "canViewStockLedger", label: "View Stock Ledger" },
  { key: "canViewAllReports", label: "View All System Reports" },
  { key: "canViewOwnReports", label: "View Own Reports Only" },
  { key: "canAccessSettings", label: "Access System Settings" },
  { key: "canManageUsers", label: "Manage Users" },
  { key: "canManageManagers", label: "Manage Managers" },
];

export default function SuperAdminControlPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"users" | "permissions" | "sessions" | "ownership">("users");

  // User filter states
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");

  // Permission Builder states
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [permToggles, setPermToggles] = useState<Record<string, boolean>>({});
  const [permMessage, setPermMessage] = useState<string | null>(null);

  // Ownership & Transfer states
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferTargetUser, setTransferTargetUser] = useState<AdminUser | null>(null);
  const [transferPassword, setTransferPassword] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [transferError, setTransferError] = useState<string | null>(null);

  // Queries
  const { data: usersData, isLoading: loadingUsers } = useQuery<{ success: boolean; users: SystemUser[] }>({
    queryKey: ["superadmin-users"],
    queryFn: () => apiFetch<{ success: boolean; users: SystemUser[] }>("/superadmin/users"),
  });

  const { data: sessionsData, isLoading: loadingSessions } = useQuery<{ success: boolean; sessions: ActiveSession[] }>({
    queryKey: ["superadmin-sessions"],
    queryFn: () => apiFetch<{ success: boolean; sessions: ActiveSession[] }>("/superadmin/active-sessions"),
    refetchInterval: 10000, // Refresh sessions every 10 seconds
  });

  const { data: adminsData, isLoading: loadingAdmins } = useQuery<AdminUser[]>({
    queryKey: ["ownership-admins"],
    queryFn: () => apiFetch<AdminUser[]>("/ownership/admins"),
    enabled: activeTab === "ownership",
  });

  const users = usersData?.users || [];
  const sessions = sessionsData?.sessions || [];
  const adminUsers = adminsData || [];

  // Mutations
  const toggleStatusMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      apiFetch(`/superadmin/users/${userId}/status`, {
        method: "PUT",
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin-users"] });
      queryClient.invalidateQueries({ queryKey: ["superadmin-sessions"] });
    },
  });

  const savePermissionsMutation = useMutation({
    mutationFn: (payload: { userIds: string[]; permissions: Record<string, boolean> }) =>
      apiFetch<{ success: boolean; updatedUserIds?: string[] }>("/superadmin/users/permissions", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["superadmin-users"] });
      setPermMessage(`✅ Successfully updated custom permissions for ${data.updatedUserIds?.length || 0} user(s).`);
    },
    onError: (err: Error) => {
      setPermMessage(`❌ Error: ${err.message || "Failed to update permissions"}`);
    },
  });

  const revokeSessionMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/superadmin/revoke-session/${userId}`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["superadmin-users"] });
    },
  });

  const promoteMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch("/ownership/promote-admin", {
        method: "POST",
        body: JSON.stringify({ userId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ownership-admins"] });
      queryClient.invalidateQueries({ queryKey: ["superadmin-users"] });
    },
  });

  const demoteMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch("/ownership/demote-admin", {
        method: "POST",
        body: JSON.stringify({ userId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ownership-admins"] });
      queryClient.invalidateQueries({ queryKey: ["superadmin-users"] });
    },
  });

  const transferMutation = useMutation({
    mutationFn: (payload: { targetUserId: string; currentPassword: string; reason?: string }) =>
      apiFetch("/ownership/transfer", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setTransferModalOpen(false);
      setTransferPassword("");
      setTransferReason("");
      queryClient.invalidateQueries({ queryKey: ["ownership-admins"] });
      queryClient.invalidateQueries({ queryKey: ["superadmin-users"] });
      alert("Organization ownership successfully transferred. You are now an Admin.");
      window.location.reload();
    },
    onError: (err: unknown) => {
      setTransferError(err instanceof Error ? err.message : "Failed to transfer ownership");
    },
  });

  // Toggle user selection for permission builder
  function toggleUserSelection(id: string) {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }

  function handleSavePermissions() {
    if (!selectedUserIds.length) {
      setPermMessage("⚠️ Please select at least one user first.");
      return;
    }
    setPermMessage("Saving custom permissions...");
    savePermissionsMutation.mutate({
      userIds: selectedUserIds,
      permissions: permToggles,
    });
  }

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      !search ||
      (u.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "ALL" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200">
            🛡️ SuperAdmin Control Center
          </div>
          <h1 className="mt-2 text-3xl font-bold text-white">System & User Access Control</h1>
          <p className="text-sm text-slate-400">
            Manage global role activations, per-user ID permission overrides, and live logged-in sessions.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-2xl border border-white/10 bg-slate-900/60 p-1 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setActiveTab("users")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === "users" ? "bg-white text-slate-950 shadow" : "text-slate-400 hover:text-white"
            }`}
          >
            👥 All Users & Status ({users.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("permissions")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === "permissions" ? "bg-white text-slate-950 shadow" : "text-slate-400 hover:text-white"
            }`}
          >
            🔑 Per-User Permission Builder
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("sessions")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === "sessions" ? "bg-white text-slate-950 shadow" : "text-slate-400 hover:text-white"
            }`}
          >
            🌐 Active Sessions ({sessions.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ownership")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === "ownership" ? "bg-white text-slate-950 shadow" : "text-slate-400 hover:text-white"
            }`}
          >
            👑 Ownership & Governance
          </button>
        </div>
      </div>

      {/* TAB 1: ALL USERS & ACTIVATION STATUS */}
      {activeTab === "users" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search user by name or email..."
              className="flex-1 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-300/40"
            />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none"
            >
              <option value="ALL">All Roles</option>
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="ADMIN">Admin</option>
              <option value="MANAGER">Manager</option>
              <option value="USER">User</option>
            </select>
          </div>

          {loadingUsers ? (
            <div className="p-8 text-center text-slate-400">Loading system users...</div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-xl">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="border-b border-white/10 bg-slate-950/60 text-xs font-semibold uppercase text-slate-400">
                  <tr>
                    <th className="px-6 py-4">User</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Last Login</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredUsers.map((u) => (
                    <tr key={u._id} className="transition hover:bg-white/5">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-white">{u.name || "Unnamed User"}</div>
                        <div className="text-xs text-slate-400">{u.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-200">
                          {u.role.replace("_", " ")}
                        </span>
                        {u.hasCustomPermissions && (
                          <span className="ml-2 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                            Custom Permissions
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400 font-mono">
                        {u.lastLogin ? new Date(u.lastLogin).toLocaleString() : "Never"}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                            u.isActive !== false ? "bg-emerald-400/10 text-emerald-400" : "bg-rose-400/10 text-rose-400"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${u.isActive !== false ? "bg-emerald-400" : "bg-rose-400"}`} />
                          {u.isActive !== false ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          disabled={u.isSuperAdmin}
                          onClick={() =>
                            toggleStatusMutation.mutate({
                              userId: u._id,
                              isActive: u.isActive === false,
                            })
                          }
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                            u.isActive !== false
                              ? "border-rose-400/20 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20"
                              : "border-emerald-400/20 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20"
                          } disabled:opacity-40`}
                        >
                          {u.isActive !== false ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PER-USER ID-BASED PERMISSION BUILDER */}
      {activeTab === "permissions" && (
        <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
          {/* User selector column */}
          <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl">
            <h2 className="text-lg font-bold text-white">1. Select Target User(s)</h2>
            <p className="text-xs text-slate-400">
              Select one or multiple users to apply specific custom permission overrides.
            </p>

            <div className="max-h-[500px] space-y-2 overflow-y-auto pr-1">
              {users.map((u) => {
                const isSelected = selectedUserIds.includes(u._id);
                return (
                  <div
                    key={u._id}
                    onClick={() => toggleUserSelection(u._id)}
                    className={`cursor-pointer flex items-center justify-between rounded-xl border p-3.5 transition ${
                      isSelected
                        ? "border-amber-400 bg-amber-400/10 text-white"
                        : "border-white/10 bg-slate-950/60 text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-white">{u.name || u.email}</div>
                      <div className="text-xs text-slate-400">{u.email} · {u.role}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="h-4 w-4 accent-amber-400"
                    />
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-slate-400">
              Selected: <span className="font-bold text-amber-300">{selectedUserIds.length}</span> user(s)
            </div>
          </div>

          {/* Permissions toggle grid */}
          <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/40 p-5 backdrop-blur-xl">
            <h2 className="text-lg font-bold text-white">2. Customize Dashboard Permissions</h2>
            <p className="text-xs text-slate-400">
              Toggle specific features allowed or disallowed for the selected user ID(s).
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {PERMISSION_KEYS.map((item) => {
                const isChecked = permToggles[item.key] ?? true;
                return (
                  <label
                    key={item.key}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/60 p-3.5 cursor-pointer hover:bg-white/5"
                  >
                    <span className="text-sm font-medium text-slate-200">{item.label}</span>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) =>
                        setPermToggles((prev) => ({ ...prev, [item.key]: e.target.checked }))
                      }
                      className="h-4 w-4 accent-amber-400"
                    />
                  </label>
                );
              })}
            </div>

            {permMessage && (
              <div className="rounded-xl border border-white/10 bg-slate-950/80 p-3 text-xs text-slate-200">
                {permMessage}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={handleSavePermissions}
                disabled={savePermissionsMutation.isPending}
                className="rounded-xl bg-gradient-to-r from-amber-300 to-orange-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:from-amber-200 hover:to-orange-400 disabled:opacity-50"
              >
                {savePermissionsMutation.isPending ? "Saving..." : "Apply Custom Permissions"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ACTIVE SESSIONS MONITOR */}
      {activeTab === "sessions" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Active Logged-In Sessions</h2>
            <span className="text-xs text-slate-400">Auto-refreshes every 10s</span>
          </div>

          {loadingSessions ? (
            <div className="p-8 text-center text-slate-400">Monitoring sessions...</div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-xl">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="border-b border-white/10 bg-slate-950/60 text-xs font-semibold uppercase text-slate-400">
                  <tr>
                    <th className="px-6 py-4">User</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Last Active Timestamp</th>
                    <th className="px-6 py-4 text-right">Session Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {sessions.map((s) => (
                    <tr key={s._id} className="transition hover:bg-white/5">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-white">{s.name || "User"}</div>
                        <div className="text-xs text-slate-400">{s.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-200">
                          {s.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-slate-400">
                        {s.lastLogin ? new Date(s.lastLogin).toLocaleString() : "Active now"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => revokeSessionMutation.mutate(s._id)}
                          className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-1.5 text-xs text-rose-300 transition hover:bg-rose-400/20"
                        >
                          Revoke Session
                        </button>
                      </td>
                    </tr>
                  ))}
                  {sessions.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500">
                        No active sessions recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: OWNERSHIP & GOVERNANCE */}
      {activeTab === "ownership" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5 backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <span className="text-xl">👑</span>
              <div>
                <h2 className="text-sm font-bold text-amber-200 uppercase tracking-wider">
                  Tier-1 Access Governance & Ownership Delegation
                </h2>
                <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                  In compliance with ISO 27001 & SOC2 four-eyes security principles, the primary organization owner (SuperAdmin) has authority to promote/demote management personnel and delegate legal root ownership. Role transitions automatically revoke active session tokens to enforce re-authentication.
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-xl">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Administrative Staff & Key Personnel</h3>
              <span className="text-xs text-slate-400">{adminUsers.length} accounts qualified for governance</span>
            </div>

            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-white/10 bg-slate-950/60 text-xs font-semibold uppercase text-slate-400">
                <tr>
                  <th className="px-6 py-4">Account Name</th>
                  <th className="px-6 py-4">Current Tier</th>
                  <th className="px-6 py-4">Account Created</th>
                  <th className="px-6 py-4 text-right">Governance Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loadingAdmins ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400">Loading administrative personnel…</td>
                  </tr>
                ) : adminUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-500">No admin or manager accounts found.</td>
                  </tr>
                ) : (
                  adminUsers.map((u) => (
                    <tr key={u._id} className="hover:bg-white/[0.02] transition">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-white">{u.name || "Personnel"}</div>
                        <div className="text-xs text-slate-400">{u.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          u.isSuperAdmin || u.role === "SUPER_ADMIN"
                            ? "bg-amber-400/20 text-amber-300 border border-amber-400/30"
                            : u.role === "ADMIN"
                            ? "bg-sky-400/20 text-sky-300 border border-sky-400/30"
                            : "bg-emerald-400/20 text-emerald-300 border border-emerald-400/30"
                        }`}>
                          {u.isSuperAdmin || u.role === "SUPER_ADMIN" ? "👑 Super Admin (Root)" : u.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-slate-400">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {u.isSuperAdmin || u.role === "SUPER_ADMIN" ? (
                            <span className="text-xs text-amber-200/80 font-medium">Root Organization Owner</span>
                          ) : u.role === "MANAGER" ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Promote ${u.name} from Manager to Admin?`)) {
                                  promoteMutation.mutate(u._id);
                                }
                              }}
                              disabled={promoteMutation.isPending}
                              className="rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-400/20 disabled:opacity-50"
                            >
                              Promote to Admin
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`Demote ${u.name} from Admin to Manager?`)) {
                                    demoteMutation.mutate(u._id);
                                  }
                                }}
                                disabled={demoteMutation.isPending}
                                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10 disabled:opacity-50"
                              >
                                Demote to Manager
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setTransferTargetUser(u);
                                  setTransferError(null);
                                  setTransferPassword("");
                                  setTransferReason("");
                                  setTransferModalOpen(true);
                                }}
                                className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-400/20"
                              >
                                Transfer SuperAdmin…
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUPERADMIN TRANSFER MODAL */}
      {transferModalOpen && transferTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-2xl border border-amber-400/30 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2 text-amber-300">
                <span className="text-xl">⚠️</span>
                <h2 className="text-lg font-bold">Transfer Organization SuperAdmin</h2>
              </div>
              <button
                type="button"
                onClick={() => setTransferModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs text-rose-200 leading-relaxed">
              <strong>CRITICAL SECURITY WARNING:</strong> You are transferring legal root ownership of this organization to <span className="font-bold underline">{transferTargetUser.name} ({transferTargetUser.email})</span>. You will be demoted to an Admin and all active sessions will be terminated.
            </div>

            {transferError && (
              <div className="rounded-xl border border-rose-400/30 bg-rose-950/60 p-3 text-xs text-rose-300">
                ❌ {transferError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300">
                Confirm Your Current SuperAdmin Password <span className="text-rose-400">*</span>
              </label>
              <input
                type="password"
                value={transferPassword}
                onChange={(e) => setTransferPassword(e.target.value)}
                placeholder="Enter current password to authenticate transfer"
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-300/40"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">
                Audit Reason for Transfer (Optional)
              </label>
              <input
                type="text"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="e.g. Legal corporate restructuring, leadership change"
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-300/40"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setTransferModalOpen(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  transferMutation.mutate({
                    targetUserId: transferTargetUser._id,
                    currentPassword: transferPassword,
                    reason: transferReason,
                  })
                }
                disabled={transferMutation.isPending || !transferPassword}
                className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-2 text-xs font-bold text-slate-950 hover:from-amber-300 hover:to-orange-400 disabled:opacity-50"
              >
                {transferMutation.isPending ? "Executing Handover…" : "Authorize & Execute Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
