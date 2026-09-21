"use client";

import { useState } from "react";
import { CsvExportButton } from "@/components/CsvExportButton";
import { apiFetch } from "@/lib/api";

// ── Danger Zone Component ──────────────────────────────────────

function DangerZone() {
  const [phase, setPhase] = useState<"idle" | "confirm" | "loading" | "done">("idle");
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const PHRASE = "DELETE MY ACCOUNT";

  async function handleDelete() {
    if (input !== PHRASE) {
      setError(`Please type "${PHRASE}" exactly to confirm.`);
      return;
    }
    setPhase("loading");
    setError(null);
    try {
      await apiFetch("/api/gdpr/delete-account", {
        method: "DELETE",
        body: JSON.stringify({ confirmPhrase: PHRASE }),
      });
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deletion failed");
      setPhase("confirm");
    }
  }

  if (phase === "done") {
    return (
      <div style={{
        padding: "2rem", borderRadius: 14, textAlign: "center",
        background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)"
      }}>
        <p style={{ fontSize: 32, marginBottom: 12 }}>✅</p>
        <h3 style={{ color: "#34d399", marginBottom: 8 }}>Account deleted</h3>
        <p style={{ color: "#9bb0cb", fontSize: 13 }}>Your data has been anonymized. You have been signed out.</p>
        <p style={{ color: "#9bb0cb", fontSize: 12, marginTop: 8 }}>Redirecting…</p>
      </div>
    );
  }

  return (
    <div style={{
      borderRadius: 14,
      border: "1px solid rgba(251,113,133,0.25)",
      background: "rgba(251,113,133,0.04)",
      padding: "1.5rem",
    }}>
      <h3 style={{ color: "#fb7185", fontSize: 15, fontWeight: 600, marginBottom: 8 }}>⚠️ Delete Account</h3>
      <p style={{ color: "#9bb0cb", fontSize: 13, marginBottom: 16 }}>
        Permanently deletes your account. Your name, email, and phone will be anonymized.
        Stock ledger history is preserved for audit integrity. This cannot be undone.
      </p>

      {phase === "idle" && (
        <button
          id="delete-account-btn"
          onClick={() => setPhase("confirm")}
          style={{
            padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: "transparent", border: "1px solid rgba(251,113,133,0.4)",
            color: "#fb7185", cursor: "pointer",
          }}
        >
          Delete my account
        </button>
      )}

      {phase === "confirm" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ color: "#fb7185", fontSize: 13, fontWeight: 600 }}>
            Type <code style={{ background: "rgba(251,113,133,0.1)", padding: "2px 6px", borderRadius: 4 }}>DELETE MY ACCOUNT</code> to confirm:
          </p>
          <input
            id="delete-confirm-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type here…"
            style={{
              padding: "10px 14px", borderRadius: 8, fontSize: 13,
              background: "rgba(11,20,36,0.6)", border: "1px solid rgba(251,113,133,0.3)",
              color: "#ecf3ff", outline: "none", width: "100%",
            }}
          />
          {error && <p style={{ color: "#fb7185", fontSize: 12 }}>⚠ {error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => { setPhase("idle"); setInput(""); setError(null); }}
              style={{
                padding: "10px 18px", borderRadius: 8, fontSize: 13,
                background: "rgba(148,163,184,0.1)", border: "1px solid rgba(148,163,184,0.2)",
                color: "#9bb0cb", cursor: "pointer", minHeight: "unset", minWidth: "unset",
              }}
            >
              Cancel
            </button>
            <button
              id="delete-confirm-btn"
              onClick={handleDelete}
              style={{
                padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: "rgba(251,113,133,0.8)", border: "none",
                color: "white", cursor: "pointer", minHeight: "unset", minWidth: "unset",
              }}
            >
              Confirm deletion
            </button>
          </div>
        </div>
      )}

      {phase === "loading" && (
        <p style={{ color: "#9bb0cb", fontSize: 13 }}>Deleting account…</p>
      )}
    </div>
  );
}

// ── Main Privacy Page ──────────────────────────────────────────

export default function PrivacyPage() {
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExportData() {
    setExportLoading(true);
    setExportError(null);
    try {
      function getCookie(name: string) {
        const match = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)"));
        return match ? decodeURIComponent(match[1]) : null;
      }
      const csrfToken = getCookie("csrfToken");
      const res = await fetch("/api/gdpr/export", {
        method: "GET",
        credentials: "include",
        headers: { ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}) }
      });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `acustock-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportLoading(false);
    }
  }

  const panelStyle = {
    background: "rgba(11,20,36,0.82)",
    border: "1px solid rgba(148,163,184,0.18)",
    borderRadius: 14,
    padding: "1.5rem",
    backdropFilter: "blur(18px)",
  } as const;

  return (
    <main style={{ padding: "1.5rem", maxWidth: 720 }} className="animate-fade-in">
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#ecf3ff", marginBottom: 4 }}>Privacy & Data</h1>
        <p style={{ color: "#9bb0cb", fontSize: 14 }}>Manage your personal data in compliance with GDPR.</p>
      </div>

      {/* Data Export */}
      <div style={{ ...panelStyle, marginBottom: "1rem" }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "#ecf3ff", marginBottom: 8 }}>📥 Download My Data</h2>
        <p style={{ color: "#9bb0cb", fontSize: 13, marginBottom: 16 }}>
          Download a complete JSON export of all data associated with your account:
          profile information, stock ledger entries you created, and audit log entries.
        </p>
        <button
          id="export-data-btn"
          onClick={handleExportData}
          disabled={exportLoading}
          style={{
            padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: "rgba(84,152,255,0.15)", border: "1px solid rgba(84,152,255,0.35)",
            color: "#5498ff", cursor: exportLoading ? "not-allowed" : "pointer",
          }}
        >
          {exportLoading ? "Preparing export…" : "⬇ Download my data"}
        </button>
        {exportError && <p style={{ color: "#fb7185", fontSize: 12, marginTop: 8 }}>⚠ {exportError}</p>}
      </div>

      {/* Admin CSV exports */}
      <div style={{ ...panelStyle, marginBottom: "1rem" }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "#ecf3ff", marginBottom: 8 }}>📊 Bulk Exports (Admin)</h2>
        <p style={{ color: "#9bb0cb", fontSize: 13, marginBottom: 16 }}>
          Export system-wide data as CSV files for auditing or migration purposes.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <CsvExportButton
            endpoint="/api/items/export/csv"
            filename={`items-${new Date().toISOString().slice(0, 10)}.csv`}
            label="Export Items"
          />
          <CsvExportButton
            endpoint="/api/users/export/csv"
            filename={`users-${new Date().toISOString().slice(0, 10)}.csv`}
            label="Export Users"
          />
          <CsvExportButton
            endpoint="/api/stock/export/csv"
            filename={`stock-ledger-${new Date().toISOString().slice(0, 10)}.csv`}
            label="Export Stock Ledger"
          />
        </div>
      </div>

      {/* Danger zone */}
      <DangerZone />
    </main>
  );
}
