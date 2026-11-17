"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  SYSTEM_SECTIONS,
  ENTERPRISE_PERSONAS,
  type AccessLevel,
  type SectionDefinition,
} from "@/lib/module-catalog";

interface RolePolicyState {
  moduleAccess: Record<string, AccessLevel>;
  disabledSections: string[];
  maskFinancials: boolean;
  disableExport: boolean;
}

interface UserOverrideItem {
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  appliedPersonaId: string | null;
  moduleOverrides: Record<string, { access: AccessLevel; expiresAt?: string; reason?: string }>;
  sectionOverrides: Record<string, boolean>;
  maskFinancials?: boolean | null;
  disableExport?: boolean | null;
}

interface SystemUserItem {
  _id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "USER" | "SUPER_ADMIN";
  isActive?: boolean;
}

interface GovernanceMatrixResponse {
  success: boolean;
  sections: SectionDefinition[];
  modules: Record<string, { id: string; label: string; sectionId: string }>;
  roles: {
    ADMIN: RolePolicyState;
    MANAGER: RolePolicyState;
    USER: RolePolicyState;
  };
  userOverrides: UserOverrideItem[];
  users: SystemUserItem[];
}

interface SnapshotItem {
  _id: string;
  snapshotType: string;
  description: string;
  targetType: string;
  targetIdentifier: string;
  reason: string;
  performedByName: string;
  createdAt: string;
}

export function ModuleGovernanceView() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"roles" | "users" | "snapshots">("roles");
  const [selectedRole, setSelectedRole] = useState<"USER" | "MANAGER" | "ADMIN">("USER");
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Modal / Feedback state
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [saveReason, setSaveReason] = useState("");
  const [tempExpiryDays, setTempExpiryDays] = useState<number>(7);

  // Fetch matrix
  const { data: matrixData, isLoading: loadingMatrix } = useQuery<GovernanceMatrixResponse>({
    queryKey: ["superadmin-governance-matrix"],
    queryFn: () => apiFetch<GovernanceMatrixResponse>("/superadmin/governance/matrix"),
  });

  // Fetch snapshots
  const { data: snapshotData } = useQuery<{ success: boolean; snapshots: SnapshotItem[] }>({
    queryKey: ["superadmin-governance-snapshots"],
    queryFn: () => apiFetch<{ success: boolean; snapshots: SnapshotItem[] }>("/superadmin/governance/snapshots"),
    enabled: activeTab === "snapshots",
  });

  // 1. Role Policy Mutation
  const updateRoleMutation = useMutation({
    mutationFn: (payload: {
      role: string;
      moduleAccess?: Record<string, AccessLevel>;
      disabledSections?: string[];
      maskFinancials?: boolean;
      disableExport?: boolean;
      reason?: string;
    }) =>
      apiFetch("/superadmin/governance/role-policy", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["superadmin-governance-matrix"] });
      queryClient.invalidateQueries({ queryKey: ["my-modules-permissions"] });
      setNotification({ type: "success", message: res.message || "Role policy updated successfully!" });
      setSaveReason("");
    },
    onError: (err: Error) => {
      setNotification({ type: "error", message: err.message || "Failed to update role policy" });
    },
  });

  // 2. User Override Mutation
  const updateUserOverrideMutation = useMutation({
    mutationFn: (payload: {
      userId: string;
      moduleId?: string;
      access?: AccessLevel;
      expiresAt?: string | null;
      reason?: string;
      maskFinancials?: boolean;
      disableExport?: boolean;
    }) =>
      apiFetch("/superadmin/governance/user-override", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["superadmin-governance-matrix"] });
      queryClient.invalidateQueries({ queryKey: ["my-modules-permissions"] });
      setNotification({ type: "success", message: res.message || "User override saved successfully!" });
    },
    onError: (err: Error) => {
      setNotification({ type: "error", message: err.message || "Failed to save user override" });
    },
  });

  // 3. Apply Persona Preset Mutation
  const applyPresetMutation = useMutation({
    mutationFn: (payload: {
      personaId: string;
      targetType: "ROLE" | "USER";
      targetIdentifier: string;
      reason?: string;
    }) =>
      apiFetch("/superadmin/governance/apply-preset", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["superadmin-governance-matrix"] });
      queryClient.invalidateQueries({ queryKey: ["my-modules-permissions"] });
      setNotification({ type: "success", message: res.message || "Persona preset applied successfully!" });
    },
    onError: (err: Error) => {
      setNotification({ type: "error", message: err.message || "Failed to apply preset" });
    },
  });

  // 4. Reset User Mutation
  const resetUserMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/superadmin/governance/reset-user/${userId}`, { method: "POST" }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["superadmin-governance-matrix"] });
      queryClient.invalidateQueries({ queryKey: ["my-modules-permissions"] });
      setNotification({ type: "success", message: res.message || "User overrides reset to role defaults." });
    },
  });

  // 5. Rollback Mutation
  const rollbackMutation = useMutation({
    mutationFn: (snapshotId: string) =>
      apiFetch(`/superadmin/governance/rollback/${snapshotId}`, { method: "POST" }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["superadmin-governance-matrix"] });
      queryClient.invalidateQueries({ queryKey: ["superadmin-governance-snapshots"] });
      queryClient.invalidateQueries({ queryKey: ["my-modules-permissions"] });
      setNotification({ type: "success", message: res.message || "System rolled back successfully!" });
    },
  });

  const sections = matrixData?.sections || SYSTEM_SECTIONS;
  const modules = matrixData?.modules || {};
  const currentRolePolicy = matrixData?.roles?.[selectedRole] || {
    moduleAccess: {},
    disabledSections: [],
    maskFinancials: false,
    disableExport: false,
  };

  const users = matrixData?.users || [];
  const selectedUser = users.find((u) => u._id === selectedUserId);
  const selectedUserOverride = matrixData?.userOverrides?.find((uo) => uo.userId === selectedUserId);

  // Handlers for Role Policy
  function handleToggleSection(sectionId: string) {
    const isCurrentlyDisabled = currentRolePolicy.disabledSections.includes(sectionId);
    const newDisabled = isCurrentlyDisabled
      ? currentRolePolicy.disabledSections.filter((s) => s !== sectionId)
      : [...currentRolePolicy.disabledSections, sectionId];

    updateRoleMutation.mutate({
      role: selectedRole,
      disabledSections: newDisabled,
      reason: `Toggled section ${sectionId} ${isCurrentlyDisabled ? "ON" : "OFF"}`,
    });
  }

  function handleSetModuleAccess(moduleId: string, level: AccessLevel) {
    const updated = { ...currentRolePolicy.moduleAccess, [moduleId]: level };
    updateRoleMutation.mutate({
      role: selectedRole,
      moduleAccess: updated,
      reason: `Set module ${moduleId} to ${level}`,
    });
  }

  function handleSetUserModuleAccess(moduleId: string, level: AccessLevel, isTemporary: boolean = false) {
    if (!selectedUserId) return;
    const expiresAt = isTemporary
      ? new Date(Date.now() + tempExpiryDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    updateUserOverrideMutation.mutate({
      userId: selectedUserId,
      moduleId,
      access: level,
      expiresAt,
      reason: isTemporary
        ? `Temporary delegation for ${tempExpiryDays} days`
        : `SuperAdmin individual override`,
    });
  }

  if (loadingMatrix) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          Loading Enterprise Module Governance Matrix…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notification Toast */}
      {notification && (
        <div
          className={`flex items-center justify-between rounded-xl border p-4 text-sm font-medium ${
            notification.type === "success"
              ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-300"
              : "border-rose-500/30 bg-rose-950/40 text-rose-300"
          }`}
        >
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            ✕ Dismiss
          </button>
        </div>
      )}

      {/* ── 1. Enterprise Persona Presets Strip ───────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-amber-400/20 text-xs font-bold text-amber-300">
                ⚡
              </span>
              1-Click Enterprise Persona Presets
            </h3>
            <p className="text-xs text-slate-400">
              Apply industry-standard access profiles in a single click across roles or individual workers.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {ENTERPRISE_PERSONAS.map((preset) => (
            <div
              key={preset.id}
              className="flex flex-col justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3 transition hover:border-amber-400/30 hover:bg-white/[0.04]"
            >
              <div>
                <div className="font-medium text-xs text-white">{preset.name}</div>
                <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">
                  {preset.description}
                </p>
              </div>
              <div className="mt-3 flex items-center gap-1.5 pt-2 border-t border-white/5">
                <button
                  onClick={() =>
                    applyPresetMutation.mutate({
                      personaId: preset.id,
                      targetType: "ROLE",
                      targetIdentifier: selectedRole,
                      reason: `Applied ${preset.name} to role ${selectedRole}`,
                    })
                  }
                  disabled={applyPresetMutation.isPending}
                  className="flex-1 rounded-lg bg-amber-400/10 px-2 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-400/20 transition"
                >
                  Apply to {selectedRole}
                </button>
                {selectedUserId && (
                  <button
                    onClick={() =>
                      applyPresetMutation.mutate({
                        personaId: preset.id,
                        targetType: "USER",
                        targetIdentifier: selectedUserId,
                        reason: `Applied ${preset.name} to worker ${selectedUser?.name}`,
                      })
                    }
                    className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:bg-white/20 transition"
                  >
                    Apply to User
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 2. Top-Level Tab Switcher ────────────────────────────────────── */}
      <div className="flex border-b border-white/10">
        <button
          onClick={() => setActiveTab("roles")}
          className={`px-4 py-2.5 text-xs font-semibold tracking-wide border-b-2 transition ${
            activeTab === "roles"
              ? "border-amber-400 text-amber-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          Role-Group Policies ({selectedRole})
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2.5 text-xs font-semibold tracking-wide border-b-2 transition ${
            activeTab === "users"
              ? "border-amber-400 text-amber-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          Worker & Employee Custom Overrides {selectedUserId ? `(1 Selected)` : ""}
        </button>
        <button
          onClick={() => setActiveTab("snapshots")}
          className={`px-4 py-2.5 text-xs font-semibold tracking-wide border-b-2 transition ${
            activeTab === "snapshots"
              ? "border-amber-400 text-amber-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          Governance Audit History & 1-Click Rollback
        </button>
      </div>

      {/* ── TAB 1: Role Policies ─────────────────────────────────────────── */}
      {activeTab === "roles" && (
        <div className="space-y-6">
          {/* Role selector bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/5 bg-slate-900/40 p-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-400">Target Role:</span>
              {(["USER", "MANAGER", "ADMIN"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setSelectedRole(r)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    selectedRole === r
                      ? "bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20"
                      : "bg-white/5 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  {r === "USER" ? "WORKERS & OPERATORS (USER)" : r}
                </button>
              ))}
            </div>

            {/* DLP & Data Privacy Toggles */}
            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentRolePolicy.maskFinancials}
                  onChange={(e) =>
                    updateRoleMutation.mutate({
                      role: selectedRole,
                      maskFinancials: e.target.checked,
                    })
                  }
                  className="rounded border-slate-700 bg-slate-800 text-amber-400 focus:ring-0"
                />
                <span>Mask Cost Prices & Margins</span>
              </label>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentRolePolicy.disableExport}
                  onChange={(e) =>
                    updateRoleMutation.mutate({
                      role: selectedRole,
                      disableExport: e.target.checked,
                    })
                  }
                  className="rounded border-slate-700 bg-slate-800 text-amber-400 focus:ring-0"
                />
                <span>DLP: Block CSV / XLSX Export</span>
              </label>
            </div>
          </div>

          {/* Section & Module Matrix */}
          <div className="space-y-4">
            {sections.map((section) => {
              const isSectionDisabled = currentRolePolicy.disabledSections.includes(section.id);

              return (
                <div
                  key={section.id}
                  className={`rounded-2xl border transition-all ${
                    isSectionDisabled
                      ? "border-rose-500/20 bg-rose-950/10 opacity-75"
                      : "border-white/10 bg-slate-900/40"
                  }`}
                >
                  {/* Section Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-3.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-white">{section.label}</span>
                        {isSectionDisabled && (
                          <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                            Entire Section Disabled for {selectedRole}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{section.description}</p>
                    </div>

                    <button
                      onClick={() => handleToggleSection(section.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        isSectionDisabled
                          ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                          : "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                      }`}
                    >
                      {isSectionDisabled ? "Enable Entire Section" : "Disable Entire Section"}
                    </button>
                  </div>

                  {/* Modules in this Section */}
                  <div className="grid grid-cols-1 divide-y divide-white/5 sm:grid-cols-2 sm:divide-y-0 sm:gap-px sm:bg-white/5">
                    {section.moduleIds.map((modId) => {
                      const mod = modules[modId] || { id: modId, label: modId };
                      const currentAccess = isSectionDisabled
                        ? "HIDDEN"
                        : currentRolePolicy.moduleAccess[modId] || "FULL_ACCESS";

                      return (
                        <div
                          key={modId}
                          className="flex items-center justify-between bg-slate-900/90 px-5 py-3"
                        >
                          <div>
                            <div className="font-medium text-xs text-slate-200">{mod.label}</div>
                            <div className="text-[10px] font-mono text-slate-500">ID: {modId}</div>
                          </div>

                          <div className="flex items-center rounded-lg border border-white/10 bg-slate-950 p-0.5 text-[11px]">
                            {(
                              [
                                { key: "HIDDEN", label: "Hidden", color: "text-rose-400 bg-rose-500/10" },
                                { key: "READ_ONLY", label: "View Only", color: "text-sky-400 bg-sky-500/10" },
                                { key: "FULL_ACCESS", label: "Full Access", color: "text-emerald-400 bg-emerald-500/10" },
                              ] as const
                            ).map((opt) => (
                              <button
                                key={opt.key}
                                onClick={() => handleSetModuleAccess(modId, opt.key)}
                                disabled={isSectionDisabled}
                                className={`rounded-md px-2.5 py-1 font-medium transition ${
                                  currentAccess === opt.key
                                    ? opt.color + " font-bold shadow-sm"
                                    : "text-slate-500 hover:text-slate-300"
                                } ${isSectionDisabled ? "cursor-not-allowed opacity-40" : ""}`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB 2: User Custom Overrides ─────────────────────────────────── */}
      {activeTab === "users" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: User Search & Selection List */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 space-y-3">
            <div className="text-xs font-semibold text-white">Select Worker / Employee</div>
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search by name, email, or role…"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />

            <div className="max-h-[500px] overflow-y-auto space-y-1 divide-y divide-white/5">
              {users
                .filter(
                  (u) =>
                    u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
                    u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
                    u.role.toLowerCase().includes(userSearch.toLowerCase())
                )
                .map((u) => {
                  const isSelected = u._id === selectedUserId;
                  const hasCustom = matrixData?.userOverrides?.some((uo) => uo.userId === u._id);

                  return (
                    <button
                      key={u._id}
                      onClick={() => setSelectedUserId(u._id)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition ${
                        isSelected
                          ? "bg-amber-400/20 border border-amber-400/30 text-white"
                          : "hover:bg-white/5 text-slate-300"
                      }`}
                    >
                      <div>
                        <div className="font-medium text-xs">{u.name}</div>
                        <div className="text-[10px] text-slate-400">{u.email}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-mono text-slate-300">
                          {u.role}
                        </span>
                        {hasCustom && (
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Has custom overrides" />
                        )}
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Right: Overrides Configuration for Selected User */}
          <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-slate-900/40 p-5 space-y-5">
            {selectedUser ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
                  <div>
                    <h4 className="font-semibold text-sm text-white">{selectedUser.name}</h4>
                    <p className="text-xs text-slate-400">
                      {selectedUser.email} &bull; Base Role:{" "}
                      <span className="font-mono text-amber-300">{selectedUser.role}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => resetUserMutation.mutate(selectedUser._id)}
                      disabled={resetUserMutation.isPending}
                      className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/20 transition"
                    >
                      Reset to Role Defaults
                    </button>
                  </div>
                </div>

                {/* Temporary Delegation Box */}
                <div className="flex items-center justify-between rounded-xl border border-sky-500/20 bg-sky-950/20 p-3.5 text-xs text-sky-200">
                  <div className="flex items-center gap-2">
                    <span>⏱️ Temporary Shift Delegation Duration:</span>
                    <select
                      value={tempExpiryDays}
                      onChange={(e) => setTempExpiryDays(Number(e.target.value))}
                      className="rounded-md border border-sky-500/30 bg-slate-900 px-2 py-1 text-xs text-white"
                    >
                      <option value={1}>1 Day (Shift Coverage)</option>
                      <option value={7}>7 Days (1 Week Audit)</option>
                      <option value={14}>14 Days (2 Weeks)</option>
                      <option value={30}>30 Days (1 Month)</option>
                    </select>
                  </div>
                  <span className="text-[11px] text-sky-300/80">
                    Overrides with timer auto-revert upon expiration.
                  </span>
                </div>

                {/* Overrides Table */}
                <div className="space-y-4 max-h-[550px] overflow-y-auto pr-1">
                  {sections.map((section) => (
                    <div key={section.id} className="rounded-xl border border-white/5 bg-slate-950/50 p-3">
                      <div className="font-semibold text-xs text-slate-400 mb-2">{section.label}</div>
                      <div className="space-y-1">
                        {section.moduleIds.map((modId) => {
                          const mod = modules[modId] || { id: modId, label: modId };
                          const userOverride = selectedUserOverride?.moduleOverrides?.[modId];
                          const inheritedAccess =
                            matrixData?.roles?.[selectedUser.role as "USER" | "MANAGER" | "ADMIN"]?.moduleAccess?.[modId] ||
                            "FULL_ACCESS";
                          const effectiveAccess = userOverride?.access || inheritedAccess;

                          return (
                            <div
                              key={modId}
                              className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs hover:bg-white/5"
                            >
                              <div>
                                <span className="font-medium text-slate-200">{mod.label}</span>
                                {userOverride ? (
                                  <span className="ml-2 rounded bg-amber-400/20 px-1.5 py-0.2 text-[9px] font-bold text-amber-300">
                                    Override
                                    {userOverride.expiresAt && ` (Exp: ${new Date(userOverride.expiresAt).toLocaleDateString()})`}
                                  </span>
                                ) : (
                                  <span className="ml-2 text-[10px] text-slate-500">
                                    Inherited ({inheritedAccess})
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1">
                                {(["HIDDEN", "READ_ONLY", "FULL_ACCESS"] as const).map((lvl) => (
                                  <button
                                    key={lvl}
                                    onClick={() => handleSetUserModuleAccess(modId, lvl, false)}
                                    className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${
                                      effectiveAccess === lvl
                                        ? lvl === "HIDDEN"
                                          ? "bg-rose-500/20 text-rose-300"
                                          : lvl === "READ_ONLY"
                                          ? "bg-sky-500/20 text-sky-300"
                                          : "bg-emerald-500/20 text-emerald-300"
                                        : "text-slate-500 hover:text-slate-300"
                                    }`}
                                  >
                                    {lvl === "HIDDEN" ? "Hide" : lvl === "READ_ONLY" ? "View" : "Full"}
                                  </button>
                                ))}
                                <button
                                  onClick={() => handleSetUserModuleAccess(modId, "FULL_ACCESS", true)}
                                  className="ml-1 rounded bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-mono text-sky-400 hover:bg-sky-500/20"
                                  title={`Grant temporary access for ${tempExpiryDays} days`}
                                >
                                  +Temp {tempExpiryDays}d
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="py-20 text-center text-xs text-slate-500">
                Select a worker or employee from the left panel to configure individual overrides.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: Snapshots & Rollback ──────────────────────────────────── */}
      {activeTab === "snapshots" && (
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-sm text-white">Governance Policy Revision History</h4>
              <p className="text-xs text-slate-400">
                Every policy change and persona application is preserved in an immutable cryptographic audit ledger.
              </p>
            </div>
          </div>

          <div className="divide-y divide-white/5 max-h-[550px] overflow-y-auto">
            {snapshotData?.snapshots?.length ? (
              snapshotData.snapshots.map((snap) => (
                <div key={snap._id} className="flex items-center justify-between py-3.5 px-2 hover:bg-white/[0.02]">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-white">{snap.description}</span>
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">
                        {snap.snapshotType}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      By <span className="text-slate-300">{snap.performedByName || "SuperAdmin"}</span> on{" "}
                      {new Date(snap.createdAt).toLocaleString()} &bull; Reason:{" "}
                      <span className="italic">{snap.reason || "None provided"}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (confirm(`Are you sure you want to rollback to the snapshot from ${new Date(snap.createdAt).toLocaleString()}?`)) {
                        rollbackMutation.mutate(snap._id);
                      }
                    }}
                    disabled={rollbackMutation.isPending}
                    className="rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 transition"
                  >
                    1-Click Rollback
                  </button>
                </div>
              ))
            ) : (
              <div className="py-10 text-center text-xs text-slate-500">
                No governance snapshots recorded yet.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
