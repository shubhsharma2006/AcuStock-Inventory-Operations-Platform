"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────

interface OnboardingStatus {
  needsOnboarding: boolean;
  isComplete: boolean;
  progress: number;
  steps: { organizationSetup: boolean; firstProduct: boolean; inviteTeam: boolean };
  counts: { items: number; teamMembers: number };
}

// ── Step Components ────────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div style={{ textAlign: "center", padding: "2rem 0" }}>
      <div style={{ fontSize: 64, marginBottom: 24 }}>🚀</div>
      <h2 style={{ fontSize: 26, fontWeight: 700, color: "#ecf3ff", marginBottom: 12 }}>
        Welcome to AcuStock
      </h2>
      <p style={{ color: "#9bb0cb", fontSize: 15, maxWidth: 420, margin: "0 auto 32px" }}>
        Your enterprise inventory management system is ready. This quick setup takes about 2 minutes.
      </p>
      <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
        {["Real-time stock tracking", "Serial number management", "Role-based access", "Automated reports"].map((f) => (
          <span key={f} style={{
            padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500,
            background: "rgba(247,196,108,0.1)", border: "1px solid rgba(247,196,108,0.25)", color: "#f7c46c"
          }}>{f}</span>
        ))}
      </div>
      <button
        id="onboarding-start-btn"
        onClick={onNext}
        style={{
          marginTop: 40, padding: "14px 40px", borderRadius: 10, fontSize: 15, fontWeight: 700,
          background: "rgba(247,196,108,0.9)", border: "none", color: "#07111f", cursor: "pointer"
        }}
      >
        Get started →
      </button>
    </div>
  );
}

function StepOrganization({ onNext }: { onNext: () => void }) {
  const [orgName, setOrgName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!orgName.trim()) return;
    setSaving(true);
    try {
      // Persist to settings if available (non-blocking if route doesn't exist yet)
      await apiFetch("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ companyName: orgName.trim() }),
      }).catch(() => null);
      onNext();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{ fontSize: 48, textAlign: "center", marginBottom: 16 }}>🏢</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "#ecf3ff", textAlign: "center", marginBottom: 8 }}>
        Organization Setup
      </h2>
      <p style={{ color: "#9bb0cb", fontSize: 13, textAlign: "center", marginBottom: 28 }}>
        Tell us a bit about your organization.
      </p>
      <label style={{ display: "block", marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: "#9bb0cb", display: "block", marginBottom: 6 }}>Company / Organization Name *</span>
        <input
          id="onboarding-org-name"
          type="text"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="e.g. Acme Warehouse Ltd."
          style={inputStyle}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
        />
      </label>
      <button
        id="onboarding-org-next"
        onClick={handleSave}
        disabled={!orgName.trim() || saving}
        style={{
          ...btnPrimaryStyle,
          opacity: !orgName.trim() ? 0.5 : 1,
          cursor: !orgName.trim() ? "not-allowed" : "pointer",
          width: "100%",
        }}
      >
        {saving ? "Saving…" : "Continue →"}
      </button>
    </div>
  );
}

function StepFirstProduct({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [name, setName] = useState("");
  const [salesPrice, setSalesPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim() || !salesPrice) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/items", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), salesPrice: parseFloat(salesPrice) }),
      });
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create product");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{ fontSize: 48, textAlign: "center", marginBottom: 16 }}>📦</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "#ecf3ff", textAlign: "center", marginBottom: 8 }}>
        Add Your First Product
      </h2>
      <p style={{ color: "#9bb0cb", fontSize: 13, textAlign: "center", marginBottom: 28 }}>
        Add a product to start tracking inventory. You can add more from the Products section.
      </p>
      <label style={{ display: "block", marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: "#9bb0cb", display: "block", marginBottom: 6 }}>Product Name *</span>
        <input id="onboarding-product-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Blue Pen" style={inputStyle} />
      </label>
      <label style={{ display: "block", marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: "#9bb0cb", display: "block", marginBottom: 6 }}>Sales Price *</span>
        <input id="onboarding-product-price" type="number" value={salesPrice} onChange={(e) => setSalesPrice(e.target.value)} placeholder="0.00" min="0" step="0.01" style={inputStyle} />
      </label>
      {error && <p style={{ color: "#fb7185", fontSize: 12, marginBottom: 12 }}>⚠ {error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onSkip} style={{ ...btnSecondaryStyle, flex: 1 }}>Skip for now</button>
        <button
          id="onboarding-product-save"
          onClick={handleSave}
          disabled={!name.trim() || !salesPrice || saving}
          style={{ ...btnPrimaryStyle, flex: 2, opacity: !name.trim() || !salesPrice ? 0.5 : 1 }}
        >
          {saving ? "Saving…" : "Add Product →"}
        </button>
      </div>
    </div>
  );
}

function StepInviteTeam({ onNext, onSkip, role }: { onNext: () => void; onSkip: () => void; role: string }) {
  return (
    <div>
      <div style={{ fontSize: 48, textAlign: "center", marginBottom: 16 }}>👥</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "#ecf3ff", textAlign: "center", marginBottom: 8 }}>
        Invite Your Team
      </h2>
      <p style={{ color: "#9bb0cb", fontSize: 13, textAlign: "center", marginBottom: 28 }}>
        Add managers and warehouse staff from the Users section. They&apos;ll receive email invites.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        {[
          { icon: "🔑", title: "Admin", desc: "Full system access, billing, user management" },
          { icon: "📋", title: "Manager", desc: "Manage users and stock operations" },
          { icon: "📦", title: "Warehouse User", desc: "Stock IN/OUT operations" },
          { icon: "👁️", title: "View Only", desc: "Read-only access to reports" },
        ].map((r) => (
          <div key={r.title} style={{
            padding: "12px 14px", borderRadius: 10,
            background: "rgba(148,163,184,0.06)", border: "1px solid rgba(148,163,184,0.12)",
          }}>
            <p style={{ fontSize: 20, marginBottom: 4 }}>{r.icon}</p>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#ecf3ff", marginBottom: 2 }}>{r.title}</p>
            <p style={{ fontSize: 11, color: "#9bb0cb" }}>{r.desc}</p>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onSkip} style={{ ...btnSecondaryStyle, flex: 1 }}>Do this later</button>
        <a
          href={`/dashboard/${role}/users`}
          id="onboarding-invite-now-btn"
          onClick={onNext}
          style={{ ...btnPrimaryStyle, flex: 2, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
        >
          Go to Users →
        </a>
      </div>
    </div>
  );
}

function StepComplete({ role }: { role: string }) {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.push(`/dashboard/${role}`), 4000);
    return () => clearTimeout(t);
  }, [role, router]);

  return (
    <div style={{ textAlign: "center", padding: "2rem 0" }}>
      <div style={{ fontSize: 72, marginBottom: 20 }}>🎉</div>
      <h2 style={{ fontSize: 26, fontWeight: 700, color: "#ecf3ff", marginBottom: 12 }}>You&apos;re all set!</h2>
      <p style={{ color: "#9bb0cb", fontSize: 14, marginBottom: 32 }}>
        AcuStock is ready to use. Redirecting to your dashboard in 4 seconds…
      </p>
      <a
        href={`/dashboard/${role}`}
        style={{ ...btnPrimaryStyle, display: "inline-flex", alignItems: "center", textDecoration: "none" }}
      >
        Go to Dashboard →
      </a>
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 8, fontSize: 13,
  background: "rgba(11,20,36,0.6)", border: "1px solid rgba(148,163,184,0.2)",
  color: "#ecf3ff", outline: "none",
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: "12px 28px", borderRadius: 8, fontSize: 14, fontWeight: 700,
  background: "rgba(247,196,108,0.9)", border: "none", color: "#07111f", cursor: "pointer",
  minHeight: "unset",
};

const btnSecondaryStyle: React.CSSProperties = {
  padding: "12px 20px", borderRadius: 8, fontSize: 13,
  background: "transparent", border: "1px solid rgba(148,163,184,0.2)",
  color: "#9bb0cb", cursor: "pointer", minHeight: "unset",
};

// ── Step Progress Bar ──────────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  const steps = ["Welcome", "Organization", "First Product", "Invite Team", "Complete"];
  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 12 }}>
        {steps.slice(0, total).map((label, i) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: i < current ? "rgba(52,211,153,0.8)" : i === current ? "rgba(247,196,108,0.8)" : "rgba(148,163,184,0.15)",
              border: i === current ? "2px solid #f7c46c" : "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700,
              color: i < current ? "#07111f" : i === current ? "#07111f" : "#9bb0cb",
            }}>
              {i < current ? "✓" : i + 1}
            </div>
            {i < total - 1 && (
              <div style={{ width: 32, height: 2, background: i < current ? "rgba(52,211,153,0.4)" : "rgba(148,163,184,0.15)" }} />
            )}
          </div>
        ))}
      </div>
      <p style={{ textAlign: "center", color: "#9bb0cb", fontSize: 12 }}>
        Step {current + 1} of {total}
      </p>
    </div>
  );
}

// ── Main Onboarding Page ───────────────────────────────────────

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const TOTAL_STEPS = 5;

  // Get role from path — fallback to "admin"
  const role = typeof window !== "undefined"
    ? window.location.pathname.split("/")[2] || "admin"
    : "admin";

  // Check if onboarding is needed
  const { data: status } = useQuery<OnboardingStatus>({
    queryKey: ["onboarding-status"],
    queryFn: () => apiFetch("/api/onboarding/status"),
    staleTime: 0,
  });

  // If already complete, redirect
  useEffect(() => {
    if (status?.isComplete && step === 0) {
      window.location.href = `/dashboard/${role}`;
    }
  }, [status, step, role]);

  const panelStyle: React.CSSProperties = {
    background: "rgba(11,20,36,0.9)",
    border: "1px solid rgba(148,163,184,0.18)",
    borderRadius: 20,
    padding: "2.5rem 2rem",
    backdropFilter: "blur(24px)",
    boxShadow: "0 40px 120px rgba(0,0,0,0.4)",
    maxWidth: 520,
    width: "100%",
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "1rem",
      background: "radial-gradient(circle at 30% 20%, rgba(84,152,255,0.15), transparent 40%), radial-gradient(circle at 70% 80%, rgba(247,196,108,0.12), transparent 40%), linear-gradient(180deg, #08111f 0%, #060b15 100%)"
    }}>
      <div style={panelStyle} className="animate-fade-in">
        {step > 0 && step < TOTAL_STEPS - 1 && (
          <ProgressBar current={step} total={TOTAL_STEPS} />
        )}

        {step === 0 && <StepWelcome onNext={() => setStep(1)} />}
        {step === 1 && <StepOrganization onNext={() => setStep(2)} />}
        {step === 2 && <StepFirstProduct onNext={() => setStep(3)} onSkip={() => setStep(3)} />}
        {step === 3 && <StepInviteTeam onNext={() => setStep(4)} onSkip={() => setStep(4)} role={role} />}
        {step === 4 && <StepComplete role={role} />}
      </div>
    </div>
  );
}
