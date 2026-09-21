"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number | null;
  currency?: string;
  interval?: string;
  limits: { maxUsers: number; maxItems: number; maxStorage: number };
  stripePriceId: string | null;
}

interface BillingStatus {
  stripeEnabled: boolean;
  plan: string;
  planExpiresAt?: string;
  limits?: { maxUsers: number; maxItems: number; maxStorage: number };
  message?: string;
}

const PLAN_COLORS: Record<string, string> = {
  free:         "#9bb0cb",
  starter:      "#5498ff",
  professional: "#a78bfa",
  enterprise:   "#f7c46c",
};

function formatLimit(n: number) {
  return n === -1 ? "Unlimited" : n.toLocaleString();
}

export default function BillingPage() {
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: statusData } = useQuery<BillingStatus>({
    queryKey: ["billing-status"],
    queryFn: () => apiFetch("/api/billing/status"),
  });

  const { data: plansData } = useQuery<{ plans: Plan[]; stripeEnabled: boolean }>({
    queryKey: ["billing-plans"],
    queryFn: () => apiFetch("/api/billing/plans"),
  });

  const checkoutMutation = useMutation({
    mutationFn: (planId: string) =>
      apiFetch<{ checkoutUrl: string }>("/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ planId }),
      }),
    onSuccess: (data) => { window.location.href = data.checkoutUrl; },
    onError: (err) => setError(err instanceof Error ? err.message : "Checkout failed"),
  });

  async function handlePortal() {
    setPortalLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ portalUrl: string }>("/api/billing/portal");
      window.location.href = data.portalUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  }

  const currentPlan = statusData?.plan || "free";
  const stripeEnabled = plansData?.stripeEnabled ?? false;

  const panelStyle: React.CSSProperties = {
    background: "rgba(11,20,36,0.82)", border: "1px solid rgba(148,163,184,0.18)",
    borderRadius: 14, padding: "1.5rem", backdropFilter: "blur(18px)",
  };

  return (
    <main style={{ padding: "1.5rem", maxWidth: 1100 }} className="animate-fade-in">
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#ecf3ff", marginBottom: 4 }}>Billing & Plans</h1>
        <p style={{ color: "#9bb0cb", fontSize: 14 }}>Manage your subscription and usage limits.</p>
      </div>

      {/* Current Plan Banner */}
      <div style={{ ...panelStyle, marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, borderColor: `${PLAN_COLORS[currentPlan]}40` }}>
        <div>
          <p style={{ color: "#9bb0cb", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Current Plan</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: PLAN_COLORS[currentPlan] || "#ecf3ff" }}>
            {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
          </p>
          {statusData?.limits && (
            <p style={{ color: "#9bb0cb", fontSize: 12, marginTop: 4 }}>
              {formatLimit(statusData.limits.maxUsers)} users · {formatLimit(statusData.limits.maxItems)} products · {formatLimit(statusData.limits.maxStorage)} MB storage
            </p>
          )}
        </div>
        {currentPlan !== "free" && stripeEnabled && (
          <button
            id="manage-billing-btn"
            onClick={handlePortal}
            disabled={portalLoading}
            style={{ padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "rgba(148,163,184,0.1)", border: "1px solid rgba(148,163,184,0.2)", color: "#ecf3ff", cursor: "pointer" }}
          >
            {portalLoading ? "Opening…" : "⚙ Manage Subscription"}
          </button>
        )}
      </div>

      {!stripeEnabled && (
        <div style={{ ...panelStyle, marginBottom: "1.5rem", borderColor: "rgba(247,196,108,0.2)", background: "rgba(247,196,108,0.04)" }}>
          <p style={{ color: "#f7c46c", fontSize: 13 }}>
            ⚡ <strong>Stripe billing not configured.</strong> Add <code style={{ background: "rgba(247,196,108,0.1)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>STRIPE_SECRET_KEY</code> to your environment to enable subscription management.
          </p>
        </div>
      )}

      {/* Plan Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
        {(plansData?.plans ?? []).map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const color = PLAN_COLORS[plan.id] || "#9bb0cb";

          return (
            <div key={plan.id} style={{
              ...panelStyle,
              border: isCurrent ? `2px solid ${color}60` : "1px solid rgba(148,163,184,0.18)",
              position: "relative",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
              onMouseEnter={(e) => {
                if (!isCurrent) {
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = `0 12px 40px ${color}20`;
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "";
              }}
            >
              {isCurrent && (
                <span style={{
                  position: "absolute", top: -10, right: 16,
                  background: color, color: "#07111f", fontSize: 10, fontWeight: 700,
                  padding: "3px 10px", borderRadius: 20,
                }}>
                  CURRENT
                </span>
              )}

              <h3 style={{ fontSize: 18, fontWeight: 700, color, marginBottom: 4 }}>{plan.name}</h3>
              <p style={{ color: "#9bb0cb", fontSize: 12, marginBottom: 16 }}>{plan.description}</p>

              <p style={{ fontSize: 26, fontWeight: 700, color: "#ecf3ff", marginBottom: 16 }}>
                {plan.price === null ? "Contact us" : plan.price === 0 ? "Free" : `$${plan.price}/${plan.interval}`}
              </p>

              <ul style={{ padding: 0, listStyle: "none", marginBottom: 20, display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  `${formatLimit(plan.limits.maxUsers)} users`,
                  `${formatLimit(plan.limits.maxItems)} products`,
                  `${formatLimit(plan.limits.maxStorage)} MB storage`,
                ].map((feature) => (
                  <li key={feature} style={{ fontSize: 12, color: "#9bb0cb" }}>
                    <span style={{ color, marginRight: 6 }}>✓</span>{feature}
                  </li>
                ))}
              </ul>

              {!isCurrent && plan.price !== null && (
                plan.stripePriceId && stripeEnabled ? (
                  <button
                    id={`upgrade-to-${plan.id}`}
                    onClick={() => {
                      setCheckoutLoading(plan.id);
                      setError(null);
                      checkoutMutation.mutate(plan.id);
                    }}
                    disabled={checkoutLoading === plan.id}
                    style={{
                      width: "100%", padding: "10px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                      background: `${color}CC`, border: "none", color: "#07111f", cursor: "pointer",
                      minHeight: "unset",
                    }}
                  >
                    {checkoutLoading === plan.id ? "Redirecting…" : plan.price === 0 ? "Use Free Plan" : "Upgrade →"}
                  </button>
                ) : (
                  <button
                    disabled
                    style={{ width: "100%", padding: "10px", borderRadius: 8, fontSize: 12, background: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.15)", color: "#9bb0cb", cursor: "not-allowed", minHeight: "unset" }}
                  >
                    {plan.price === 0 ? "Downgrade" : "Configure Stripe to enable"}
                  </button>
                )
              )}

              {isCurrent && (
                <div style={{ padding: "10px", borderRadius: 8, background: `${color}10`, textAlign: "center", fontSize: 12, color }}>
                  Active plan
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div style={{ marginTop: 16, padding: "1rem", borderRadius: 10, background: "rgba(251,113,133,0.06)", border: "1px solid rgba(251,113,133,0.2)", color: "#fb7185", fontSize: 13 }}>
          ⚠ {error}
        </div>
      )}
    </main>
  );
}
