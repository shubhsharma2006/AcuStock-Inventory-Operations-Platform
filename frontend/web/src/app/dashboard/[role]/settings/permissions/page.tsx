"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────

interface PermissionDoc {
  role: string;
  canViewStock: boolean;
  canAddStock: boolean;
  canViewUsers: boolean;
  canCreateUsers: boolean;
  canEditUsers: boolean;
  canDeleteUsers: boolean;
  canViewReports: boolean;
  canExportReports: boolean;
  canViewCompanies: boolean;
  canCreateCompanies: boolean;
  canViewItems: boolean;
  canCreateItems: boolean;
  canEditItems: boolean;
  canDeleteItems: boolean;
  canManageNotifications: boolean;
  canViewAuditLog: boolean;
  // Hard-locked (read-only in UI)
  canEditStock: boolean;
  canDeleteStock: boolean;
  canManageAdmins: boolean;
  [key: string]: boolean | string;
}

// ── Permission categories for grouped display ──────────────────

const CATEGORIES: { label: string; icon: string; fields: { key: string; label: string; locked?: boolean }[] }[] = [
  {
    label: "Stock",
    icon: "📦",
    fields: [
      { key: "canViewStock",   label: "View stock levels" },
      { key: "canAddStock",    label: "Add stock (IN/OUT)" },
      { key: "canEditStock",   label: "Edit stock entries (locked)", locked: true },
      { key: "canDeleteStock", label: "Delete stock entries (locked)", locked: true },
    ]
  },
  {
    label: "Users",
    icon: "👥",
    fields: [
      { key: "canViewUsers",   label: "View users" },
      { key: "canCreateUsers", label: "Create users" },
      { key: "canEditUsers",   label: "Edit users" },
      { key: "canDeleteUsers", label: "Delete users" },
      { key: "canManageAdmins", label: "Manage admins (locked)", locked: true },
    ]
  },
  {
    label: "Products",
    icon: "🏷️",
    fields: [
      { key: "canViewItems",   label: "View products" },
      { key: "canCreateItems", label: "Create products" },
      { key: "canEditItems",   label: "Edit products" },
      { key: "canDeleteItems", label: "Delete products" },
    ]
  },
  {
    label: "Reports & Data",
    icon: "📊",
    fields: [
      { key: "canViewReports",    label: "View reports & analytics" },
      { key: "canExportReports",  label: "Export CSV / reports" },
      { key: "canViewAuditLog",   label: "View audit log" },
    ]
  },
  {
    label: "Other",
    icon: "⚙️",
    fields: [
      { key: "canViewCompanies",   label: "View companies" },
      { key: "canCreateCompanies", label: "Create companies" },
      { key: "canManageNotifications", label: "Manage notifications" },
    ]
  },
];

const ROLES = ["ADMIN", "MANAGER", "USER"] as const;

// ── Toggle Switch ──────────────────────────────────────────────

function Toggle({ value, locked, onChange }: { value: boolean; locked?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => !locked && onChange(!value)}
      aria-pressed={value}
      aria-disabled={locked}
      title={locked ? "This permission is hard-locked and cannot be changed" : undefined}
      style={{
        width: 40, height: 22, borderRadius: 11,
        background: locked ? "rgba(148,163,184,0.15)" : value ? "rgba(52,211,153,0.8)" : "rgba(148,163,184,0.2)",
        border: "none",
        cursor: locked ? "not-allowed" : "pointer",
        position: "relative",
        transition: "background 0.2s",
        flexShrink: 0,
        minHeight: "unset",
        minWidth: "unset",
        padding: 0,
      }}
    >
      <span style={{
        display: "block",
        width: 16, height: 16,
        borderRadius: "50%",
        background: locked ? "rgba(148,163,184,0.4)" : "white",
        position: "absolute",
        top: 3,
        left: value ? 21 : 3,
        transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)"
      }} />
    </button>
  );
}

// ── Main Component ─────────────────────────────────────────────

export default function PermissionsPage() {
  const queryClient = useQueryClient();
  const [selectedRole, setSelectedRole] = useState<string>("MANAGER");
  const [localChanges, setLocalChanges] = useState<Record<string, boolean>>({});
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { data, isLoading } = useQuery<{ permission: PermissionDoc }>({
    queryKey: ["permissions", selectedRole],
    queryFn: () => apiFetch(`/api/permissions/${selectedRole}`),
  });

  const mutation = useMutation({
    mutationFn: (updates: Record<string, boolean>) =>
      apiFetch(`/api/permissions/${selectedRole}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permissions"] });
      setLocalChanges({});
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  const permission = data?.permission;
  const effective = { ...permission, ...localChanges } as PermissionDoc;
  const hasChanges = Object.keys(localChanges).length > 0;

  function handleToggle(key: string, val: boolean) {
    setLocalChanges((prev) => ({ ...prev, [key]: val }));
  }

  const panelStyle = {
    background: "rgba(11,20,36,0.82)",
    border: "1px solid rgba(148,163,184,0.18)",
    borderRadius: 14,
    padding: "1.25rem 1.5rem",
    backdropFilter: "blur(18px)",
  } as const;

  return (
    <main style={{ padding: "1.5rem", maxWidth: 900 }} className="animate-fade-in">
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#ecf3ff", marginBottom: 4 }}>Permission Builder</h1>
        <p style={{ color: "#9bb0cb", fontSize: 14 }}>Configure what each role can access. Hard-locked permissions cannot be changed.</p>
      </div>

      {/* Role Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: "1.25rem" }}>
        {ROLES.map((role) => (
          <button
            key={role}
            id={`role-tab-${role.toLowerCase()}`}
            onClick={() => { setSelectedRole(role); setLocalChanges({}); }}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: selectedRole === role ? "1px solid rgba(247,196,108,0.5)" : "1px solid rgba(148,163,184,0.18)",
              background: selectedRole === role ? "rgba(247,196,108,0.12)" : "rgba(11,20,36,0.5)",
              color: selectedRole === role ? "#f7c46c" : "#9bb0cb",
              fontWeight: selectedRole === role ? 700 : 400,
              fontSize: 13,
              cursor: "pointer",
              transition: "all 0.2s",
              minHeight: 44, minWidth: "unset",
            }}
          >
            {role}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 120, borderRadius: 14 }} />
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {CATEGORIES.map((cat) => (
            <div key={cat.label} style={panelStyle}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: "#ecf3ff", marginBottom: 14 }}>
                {cat.icon} {cat.label}
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px" }}>
                {cat.fields.map(({ key, label, locked }) => (
                  <label
                    key={key}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      gap: 12, cursor: locked ? "not-allowed" : "pointer", userSelect: "none",
                      padding: "4px 0",
                    }}
                  >
                    <span style={{ fontSize: 13, color: locked ? "#9bb0cb" : "#ecf3ff", opacity: locked ? 0.6 : 1 }}>
                      {label}
                      {locked && (
                        <span style={{ marginLeft: 6, fontSize: 10, background: "rgba(148,163,184,0.15)", borderRadius: 4, padding: "1px 5px", color: "#9bb0cb" }}>
                          LOCKED
                        </span>
                      )}
                    </span>
                    <Toggle
                      value={Boolean(effective[key])}
                      locked={locked}
                      onChange={(v) => handleToggle(key, v)}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}

          {/* Save Bar */}
          {(hasChanges || saveSuccess) && (
            <div style={{
              ...panelStyle,
              border: saveSuccess ? "1px solid rgba(52,211,153,0.4)" : "1px solid rgba(247,196,108,0.35)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 13, color: saveSuccess ? "#34d399" : "#f7c46c" }}>
                {saveSuccess
                  ? "✅ Permissions saved successfully"
                  : `${Object.keys(localChanges).length} unsaved change${Object.keys(localChanges).length !== 1 ? "s" : ""}`}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setLocalChanges({})}
                  style={{
                    padding: "8px 16px", borderRadius: 8, fontSize: 13,
                    background: "transparent", border: "1px solid rgba(148,163,184,0.2)",
                    color: "#9bb0cb", cursor: "pointer", minHeight: "unset", minWidth: "unset",
                  }}
                >
                  Discard
                </button>
                <button
                  id="save-permissions-btn"
                  onClick={() => mutation.mutate(localChanges)}
                  disabled={mutation.isPending}
                  style={{
                    padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                    background: "rgba(247,196,108,0.8)", border: "none",
                    color: "#07111f", cursor: "pointer", minHeight: "unset", minWidth: "unset",
                  }}
                >
                  {mutation.isPending ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          )}

          {mutation.isError && (
            <p style={{ color: "#fb7185", fontSize: 13 }}>
              ⚠ {(mutation.error as Error).message}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
