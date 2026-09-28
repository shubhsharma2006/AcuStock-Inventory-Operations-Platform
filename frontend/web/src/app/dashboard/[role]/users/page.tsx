"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Role } from "@/lib/acustock";

interface WarehouseRef {
  _id: string;
  name: string;
  code: string;
}

type UserItem = {
  _id: string;
  name?: string;
  email?: string;
  phone?: string;
  role: Role;
  isActive?: boolean;
  createdAt?: string;
  assignedWarehouseId?: WarehouseRef | null;
};

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  ADMIN: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  MANAGER: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  USER: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

export default function UsersManagementPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [modalOpen, setModalOpen] = useState(false);

  // Form fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("USER");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Assign warehouse modal
  const [assignWhModal, setAssignWhModal] = useState(false);
  const [userToAssign, setUserToAssign] = useState<UserItem | null>(null);
  const [selectedWarehouseToAssign, setSelectedWarehouseToAssign] = useState("");
  const [assignWhError, setAssignWhError] = useState<string | null>(null);

  // Query users
  const { data: users = [], isLoading, error } = useQuery<UserItem[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch<UserItem[]>("/users"),
  });

  // Query warehouses for assignment dropdown
  const { data: warehouses = [] } = useQuery<WarehouseRef[]>({
    queryKey: ["warehouses"],
    queryFn: () => apiFetch("/warehouses"),
  });

  // Mutations
  const createUserMutation = useMutation({
    mutationFn: (newUser: Record<string, unknown>) =>
      apiFetch("/users", { method: "POST", body: JSON.stringify(newUser) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setModalOpen(false);
      resetForm();
    },
    onError: (err: Error) => {
      setFormError(err.message || "Failed to create user");
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      apiFetch(`/users/${userId}/status`, {
        method: "PUT",
        body: JSON.stringify({ isActive: !isActive }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/users/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const [editRoleModalOpen, setEditRoleModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<UserItem | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<Role>("USER");
  const [roleChangeError, setRoleChangeError] = useState<string | null>(null);

  const updateUserRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      apiFetch(`/users/${userId}`, {
        method: "PUT",
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      setEditRoleModalOpen(false);
      setUserToEdit(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: unknown) => {
      setRoleChangeError(err instanceof Error ? err.message : "Failed to update user role");
    },
  });

  const assignWarehouseMutation = useMutation({
    mutationFn: ({ userId, warehouseId }: { userId: string; warehouseId: string | null }) =>
      apiFetch(`/users/${userId}`, {
        method: "PUT",
        body: JSON.stringify({ assignedWarehouseId: warehouseId }),
      }),
    onSuccess: () => {
      setAssignWhModal(false);
      setUserToAssign(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: unknown) => {
      setAssignWhError(err instanceof Error ? err.message : "Failed to assign warehouse");
    },
  });

  function resetForm() {
    setName("");
    setEmail("");
    setPhone("");
    setRole("USER");
    setPassword("");
    setFormError(null);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) {
      setFormError("Name, email, and password are required.");
      return;
    }
    setFormError(null);
    createUserMutation.mutate({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      role,
      password,
    });
  }

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      !search ||
      (u.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(search.toLowerCase()) ||
      (u.phone || "").includes(search);
    const matchesRole = roleFilter === "ALL" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-amber-400">Team Management</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1">Users & Branch Access</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage roles, permissions, and warehouse branch assignments for your team.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { resetForm(); setModalOpen(true); }}
          className="flex items-center gap-2 rounded-2xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-400/20 transition hover:bg-amber-300"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add User
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4 backdrop-blur-xl">
        <div className="relative flex-1 min-w-[180px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or phone..."
            className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 pl-10 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-400"
          />
          <svg className="absolute left-3 top-3 h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400"
        >
          <option value="ALL">All Roles</option>
          <option value="SUPER_ADMIN">Super Admin</option>
          <option value="ADMIN">Admin</option>
          <option value="MANAGER">Manager</option>
          <option value="USER">User</option>
        </select>
      </div>

      {/* Loading / Error state */}
      {isLoading && <div className="p-8 text-center text-slate-400">Loading users...</div>}
      {error && (
        <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">
          {(error as Error).message}
        </div>
      )}

      {/* Table */}
      {!isLoading && !error && (
        <div className="overflow-x-auto rounded-[1.75rem] border border-white/10 bg-slate-900/40 backdrop-blur-xl">
          <table className="min-w-full divide-y divide-white/10 text-left text-sm">
            <thead className="bg-slate-950/60 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Assigned Branch</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredUsers.map((u) => (
                <tr key={u._id} className="transition hover:bg-white/[0.02]">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-white">{u.name || "Unnamed User"}</div>
                    <div className="text-xs text-slate-400">{u.email}</div>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-400">
                    {u.phone || "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[u.role] || ROLE_COLORS.USER}`}>
                      {u.role.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {u.assignedWarehouseId ? (
                      <div>
                        <div className="text-xs font-semibold text-amber-300">
                          {u.assignedWarehouseId.name}
                        </div>
                        <div className="font-mono text-xs text-slate-500">
                          {u.assignedWarehouseId.code}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 italic">Global Access</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      u.isActive !== false
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-rose-500/20 text-rose-300"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${u.isActive !== false ? "bg-emerald-400" : "bg-rose-400"}`} />
                      {u.isActive !== false ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          setUserToAssign(u);
                          setSelectedWarehouseToAssign(u.assignedWarehouseId?._id || "");
                          setAssignWhError(null);
                          setAssignWhModal(true);
                        }}
                        className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-400/20"
                      >
                        📍 Branch
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setUserToEdit(u);
                          setSelectedNewRole(u.role);
                          setRoleChangeError(null);
                          setEditRoleModalOpen(true);
                        }}
                        className="rounded-xl border border-sky-400/20 bg-sky-400/10 px-3 py-1.5 text-xs text-sky-300 transition hover:bg-sky-400/20"
                      >
                        Role
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStatusMutation.mutate({ userId: u._id, isActive: u.isActive !== false })}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
                      >
                        {u.isActive !== false ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete user ${u.name || u.email}?`)) {
                            deleteUserMutation.mutate(u._id);
                          }
                        }}
                        className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-1.5 text-xs text-rose-300 transition hover:bg-rose-400/20"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-slate-500">
                    No users match your search or filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create User Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-900 p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="text-xl font-bold text-white">Create New User</h2>
                <p className="mt-0.5 text-xs text-slate-400">Add a new team member to your organization.</p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreate} className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Full Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Email Address *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@company.com"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Phone (Optional)</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                >
                  <option value="USER">User (Operator)</option>
                  <option value="MANAGER">Manager (Facility Lead)</option>
                  <option value="ADMIN">Admin (Full Control)</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Password *</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                />
              </div>

              {formError && (
                <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs text-rose-200">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="rounded-xl bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-50"
                >
                  {createUserMutation.isPending ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Warehouse Modal */}
      {assignWhModal && userToAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-900 p-6 sm:p-8 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Assign Warehouse Branch</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Restrict this user to a specific warehouse for all stock operations.
                </p>
              </div>
              <button type="button" onClick={() => setAssignWhModal(false)} className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white">✕</button>
            </div>

            <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-200">
              <strong>📍 Branch Scoping:</strong> Once assigned, <strong>{userToAssign.name || userToAssign.email}</strong> can only perform Stock IN/OUT at their assigned branch. Set to &quot;Global Access&quot; to remove restrictions.
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Assigned Warehouse / Branch</label>
              <select
                value={selectedWarehouseToAssign}
                onChange={(e) => setSelectedWarehouseToAssign(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400"
              >
                <option value="">— Global Access (no restriction) —</option>
                {warehouses.map((wh) => (
                  <option key={wh._id} value={wh._id}>
                    {wh.name} ({wh.code})
                  </option>
                ))}
              </select>
            </div>

            {assignWhError && (
              <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs text-rose-200">{assignWhError}</div>
            )}

            <div className="flex justify-end gap-3 pt-2 border-t border-white/10">
              <button type="button" onClick={() => setAssignWhModal(false)} className="rounded-xl px-4 py-2 text-sm text-slate-400 hover:text-white">
                Cancel
              </button>
              <button
                type="button"
                disabled={assignWarehouseMutation.isPending}
                onClick={() =>
                  assignWarehouseMutation.mutate({
                    userId: userToAssign._id,
                    warehouseId: selectedWarehouseToAssign || null,
                  })
                }
                className="rounded-xl bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-50"
              >
                {assignWarehouseMutation.isPending ? "Saving..." : "Save Branch Assignment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Role Modal */}
      {editRoleModalOpen && userToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-slate-900 p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="text-lg font-bold text-white">Change User Role</h2>
              <button type="button" onClick={() => setEditRoleModalOpen(false)} className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white">✕</button>
            </div>

            <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-200">
              ⚠️ <strong>Session Invalidation:</strong> Changing a role forces the user to re-authenticate on their next action.
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400">Target User</label>
                <div className="mt-1 font-semibold text-white">{userToEdit.name || "User"} ({userToEdit.email})</div>
              </div>
              <div>
                <label className="block text-xs text-slate-400">Current Role</label>
                <div className="mt-1 inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold border-white/10 text-slate-300">
                  {userToEdit.role}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Select New Role</label>
                <select
                  value={selectedNewRole}
                  onChange={(e) => setSelectedNewRole(e.target.value as Role)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                >
                  <option value="USER">USER — Operator (Stock IN/OUT, Ledger)</option>
                  <option value="MANAGER">MANAGER — Facility Lead (Catalogs, Orders, Warehouses)</option>
                  <option value="ADMIN">ADMIN — Full Tenant Control</option>
                </select>
              </div>
              {roleChangeError && (
                <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs text-rose-200">{roleChangeError}</div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
              <button type="button" onClick={() => setEditRoleModalOpen(false)} className="rounded-xl px-4 py-2 text-sm text-slate-400 hover:text-white">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => updateUserRoleMutation.mutate({ userId: userToEdit._id, role: selectedNewRole })}
                disabled={updateUserRoleMutation.isPending || selectedNewRole === userToEdit.role}
                className="rounded-xl bg-amber-400 px-5 py-2 text-sm font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-50"
              >
                {updateUserRoleMutation.isPending ? "Updating..." : "Confirm Role Update"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
