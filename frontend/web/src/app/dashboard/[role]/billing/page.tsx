"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, downloadAuthenticatedPdf } from "@/lib/api";

type Plan = {
  id: string;
  name: string;
  description: string;
  price: {
    INR: number;
    USD: number;
  };
  priceMinor: {
    INR: number;
    USD: number;
  };
  limits: {
    maxUsers: number;
    maxItems: number;
    maxStorage: number;
  };
  features: string[];
};

type BillingStatus = {
  success: boolean;
  tenant: {
    id: string;
    name: string;
    plan: string;
    planName: string;
    subscriptionStatus: string;
    status: string;
    planExpiresAt?: string;
    limits: {
      maxUsers: number;
      maxItems: number;
      maxStorage: number;
    };
    usage?: {
      users?: number;
      items?: number;
      companies?: number;
    };
  } | null;
  paymentMode: string;
};

type PaymentTransaction = {
  _id: string;
  transactionId: string;
  planId: string;
  gateway: "RAZORPAY" | "STRIPE" | "DEMO";
  amountMinor: number;
  currency: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";
  createdAt: string;
  paidAt?: string;
  errorMessage?: string;
};

type CheckoutResponse = {
  success: boolean;
  transactionId: string;
  gateway: "RAZORPAY" | "STRIPE" | "DEMO";
  orderId?: string;
  checkoutUrl?: string;
  isSimulation?: boolean;
  keyId?: string;
  amountMinor?: number;
  currency?: string;
  plan?: {
    id: string;
    name: string;
  };
};

export default function BillingPage() {
  const queryClient = useQueryClient();
  const [currency, setCurrency] = useState<"INR" | "USD">("INR");
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutData, setCheckoutData] = useState<CheckoutResponse | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentTab, setPaymentTab] = useState<"upi" | "card" | "netbanking">("upi");
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);

  // Load Razorpay Standard Checkout SDK dynamically
  useEffect(() => {
    if (typeof window !== "undefined" && !document.getElementById("razorpay-script")) {
      const script = document.createElement("script");
      script.id = "razorpay-script";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  // 1. Fetch Plans Catalog
  const { data: plansData, isLoading: loadingPlans } = useQuery<{ success: boolean; plans: Plan[] }>({
    queryKey: ["billing-plans"],
    queryFn: () => apiFetch<{ success: boolean; plans: Plan[] }>("/billing/plans"),
  });

  const plans = plansData?.plans || [];

  // 2. Fetch Subscription Status
  const { data: statusData, isLoading: loadingStatus } = useQuery<BillingStatus>({
    queryKey: ["billing-status"],
    queryFn: () => apiFetch<BillingStatus>("/billing/status"),
  });

  const tenant = statusData?.tenant;
  const paymentMode = statusData?.paymentMode || "demo";

  // 3. Fetch Transaction History Ledger
  const { data: transactionsData, isLoading: loadingTransactions } = useQuery<{ success: boolean; transactions: PaymentTransaction[] }>({
    queryKey: ["billing-transactions"],
    queryFn: () => apiFetch<{ success: boolean; transactions: PaymentTransaction[] }>("/billing/transactions"),
  });

  const transactions = transactionsData?.transactions || [];

  // Mutation: Initiate Checkout
  const checkoutMutation = useMutation({
    mutationFn: (planId: string) =>
      apiFetch<CheckoutResponse>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({
          planId,
          currency,
        }),
      }),
    onSuccess: (data) => {
      setCheckoutData(data);
      // If Live/Test Razorpay and key is present, open Razorpay popup
      if (!data.isSimulation && data.gateway === "RAZORPAY" && data.keyId && typeof window !== "undefined" && (window as any).Razorpay) {
        const rzp = new (window as any).Razorpay({
          key: data.keyId,
          amount: data.amountMinor,
          currency: data.currency,
          name: "AcuStock ERP",
          description: `${data.plan?.name || "Subscription"} Upgrade`,
          order_id: data.orderId,
          handler: async function (response: any) {
            try {
              await apiFetch("/billing/verify", {
                method: "POST",
                body: JSON.stringify({
                  transactionId: data.transactionId,
                  orderId: response.razorpay_order_id,
                  paymentId: response.razorpay_payment_id,
                  signature: response.razorpay_signature,
                  gateway: "RAZORPAY",
                }),
              });
              setFeedbackMessage({ text: "🎉 Payment verified via Razorpay! Your plan is active.", type: "success" });
              queryClient.invalidateQueries({ queryKey: ["billing-status"] });
              queryClient.invalidateQueries({ queryKey: ["billing-transactions"] });
            } catch (err: any) {
              setFeedbackMessage({ text: err.message || "Payment verification failed", type: "error" });
            }
          },
          theme: { color: "#f59e0b" },
        });
        rzp.open();
        return;
      }

      // If Stripe Checkout session URL
      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }

      // Otherwise open interactive simulation modal
      setCheckoutModalOpen(true);
    },
    onError: (err: Error) => {
      setFeedbackMessage({ text: err.message || "Failed to initiate checkout", type: "error" });
    },
  });

  // Verify payment callback for Simulation Modal
  async function handleSimulatePayment(action: "success" | "failure", methodUsed: string = "UPI") {
    if (!checkoutData) return;
    setIsProcessing(true);
    setFeedbackMessage(null);

    try {
      const paymentId =
        action === "success"
          ? `pay_${methodUsed.toLowerCase()}_${Date.now()}`
          : `err_${Date.now()}`;

      const res = await apiFetch<{ success: boolean; message?: string }>("/billing/verify", {
        method: "POST",
        body: JSON.stringify({
          transactionId: checkoutData.transactionId,
          orderId: checkoutData.orderId,
          paymentId,
          signature: action === "success" ? "demo_sandbox_signature" : "INVALID_DECLINED",
          gateway: "DEMO",
        }),
      });

      if (res.success) {
        setFeedbackMessage({
          text: `🎉 Payment of ${checkoutData.currency === "INR" ? "₹" : "$"}${(
            (checkoutData.amountMinor || 0) / 100
          ).toLocaleString()} verified via ${methodUsed}! Subscription is active.`,
          type: "success",
        });
        queryClient.invalidateQueries({ queryKey: ["billing-status"] });
        queryClient.invalidateQueries({ queryKey: ["billing-transactions"] });
        setCheckoutModalOpen(false);
      }
    } catch (err: any) {
      setFeedbackMessage({ text: err.message || "Payment was declined or cancelled as requested.", type: "error" });
      queryClient.invalidateQueries({ queryKey: ["billing-transactions"] });
      setCheckoutModalOpen(false);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-200">
            <span>💳 Multi-Provider Gateway Architecture</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-white">Billing & Subscription Management</h1>
          <p className="text-sm text-slate-400">
            Gateway-agnostic billing engine integrating Razorpay (UPI/Domestic) and Stripe (Global Cards) behind unified strategy adapters.
          </p>
        </div>

        {/* Currency Switcher */}
        <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-slate-900/60 p-1.5 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setCurrency("INR")}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
              currency === "INR"
                ? "bg-gradient-to-r from-amber-300 to-orange-500 text-slate-950 shadow-md"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <span>🇮🇳</span> INR (₹)
          </button>
          <button
            type="button"
            onClick={() => setCurrency("USD")}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
              currency === "USD"
                ? "bg-gradient-to-r from-amber-300 to-orange-500 text-slate-950 shadow-md"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <span>🌎</span> USD ($)
          </button>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedbackMessage && (
        <div
          className={`rounded-2xl border p-4 text-sm font-medium flex items-center justify-between gap-4 ${
            feedbackMessage.type === "success"
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
              : "border-rose-400/30 bg-rose-400/10 text-rose-200"
          }`}
        >
          <span>{feedbackMessage.text}</span>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Current Subscription & Quota Card */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 backdrop-blur-xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <span className="text-xs uppercase tracking-wider text-amber-300 font-semibold">Active Organization Plan</span>
            <div className="mt-1 flex items-center gap-3">
              <h2 className="text-2xl font-black text-white">{tenant?.planName || "Free Tier"}</h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-semibold capitalize ${
                  tenant?.subscriptionStatus === "ACTIVE"
                    ? "bg-emerald-400/15 text-emerald-300 border border-emerald-400/30"
                    : "bg-amber-400/15 text-amber-300 border border-amber-400/30"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {tenant?.subscriptionStatus || "Trialing"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {tenant?.planExpiresAt
                ? `Valid until ${new Date(tenant.planExpiresAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}`
                : "Standard evaluation / unexpiring quota tier"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-2 text-right">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Gateway Mode</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400">
                {paymentMode === "demo" ? "🧪 Sandbox Simulation" : "⚡ Live / Test API Mode"}
              </span>
            </div>
          </div>
        </div>

        {/* Quota Progress Indicators */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Team Seats</span>
              <span className="font-semibold text-white">
                {tenant?.usage?.users || 1} / {tenant?.limits?.maxUsers || 5} seats
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full"
                style={{
                  width: `${Math.min(
                    100,
                    (((tenant?.usage?.users || 1) / (tenant?.limits?.maxUsers || 5)) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Catalog SKUs</span>
              <span className="font-semibold text-white">
                {tenant?.usage?.items || 0} / {(tenant?.limits?.maxItems || 100).toLocaleString()} items
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full"
                style={{
                  width: `${Math.min(
                    100,
                    (((tenant?.usage?.items || 0) / (tenant?.limits?.maxItems || 100)) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Encrypted Storage</span>
              <span className="font-semibold text-white">
                {(tenant?.limits?.maxStorage || 1024).toLocaleString()} MB provisioned
              </span>
            </div>
            <p className="mt-2 text-[11px] text-slate-500 truncate">Document vault & audit records</p>
          </div>
        </div>
      </div>

      {/* Available Plans Grid */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white">Available Organization Tiers</h2>
          <p className="text-xs text-slate-400">Select an operational tier to scale capacity and compliance policies.</p>
        </div>

        {loadingPlans ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-96 rounded-3xl border border-white/10 bg-slate-900/40 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3 items-stretch">
            {plans.map((plan) => {
              const isPopular = plan.id === "starter";
              const isFree = plan.id === "free";
              const isCurrent = tenant?.plan === plan.id;
              const price =
                currency === "INR"
                  ? `₹${plan.price.INR.toLocaleString()}`
                  : `$${plan.price.USD}`;

              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col justify-between rounded-3xl border p-6 backdrop-blur-xl transition ${
                    isPopular
                      ? "border-amber-400/40 bg-gradient-to-b from-slate-900/90 to-slate-950/90 shadow-xl shadow-amber-500/10"
                      : "border-white/10 bg-slate-900/40 hover:border-white/20"
                  }`}
                >
                  {isPopular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-300 to-orange-500 px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950 shadow-md">
                      Recommended
                    </span>
                  )}

                  <div>
                    <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                    <p className="mt-1 text-xs text-slate-400 leading-relaxed">{plan.description}</p>

                    <div className="mt-5 flex items-baseline gap-1.5 border-b border-white/10 pb-5">
                      <span className="text-3xl font-black text-white">{price}</span>
                      <span className="text-xs text-slate-400">/ month</span>
                    </div>

                    <ul className="mt-5 space-y-2.5 text-xs text-slate-300">
                      {(plan.features || []).map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-amber-400 text-sm leading-none">✓</span>
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    type="button"
                    disabled={isCurrent || isFree || checkoutMutation.isPending}
                    onClick={() => checkoutMutation.mutate(plan.id)}
                    className={`mt-8 w-full rounded-2xl py-3 text-xs font-bold uppercase tracking-wider transition ${
                      isCurrent
                        ? "border border-white/10 bg-white/5 text-slate-400 cursor-default"
                        : isFree
                        ? "border border-white/10 bg-white/5 text-slate-500 cursor-not-allowed"
                        : isPopular
                        ? "bg-gradient-to-r from-amber-300 to-orange-500 text-slate-950 hover:from-amber-200 hover:to-orange-400 shadow-lg shadow-amber-500/20"
                        : "border border-white/15 bg-white/10 text-white hover:bg-white/20"
                    }`}
                  >
                    {isCurrent
                      ? "Current Active Plan"
                      : isFree
                      ? "Free Tier Included"
                      : checkoutMutation.isPending
                      ? "Initiating…"
                      : `Subscribe (${price})`}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Transaction History Ledger */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white">Payment & Billing History</h2>
          <p className="text-xs text-slate-400">Immutable ledger of normalized transaction receipts across all gateway adapters.</p>
        </div>

        <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/40 backdrop-blur-xl">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="border-b border-white/10 bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-6 py-4">Transaction ID</th>
                <th className="px-6 py-4">Gateway</th>
                <th className="px-6 py-4">Plan</th>
                <th className="px-6 py-4 text-right">Amount</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-right">Date</th>
                <th className="px-6 py-4 text-center">Tax Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loadingTransactions ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">Loading transaction history…</td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">No payment transactions recorded yet.</td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const displayAmount =
                    tx.currency === "INR"
                      ? `₹${(tx.amountMinor / 100).toLocaleString()}`
                      : `$${(tx.amountMinor / 100).toFixed(2)}`;

                  return (
                    <tr key={tx._id || tx.transactionId} className="hover:bg-white/[0.02] transition">
                      <td className="px-6 py-4 font-mono text-slate-300">{tx.transactionId}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-bold text-slate-200">
                          {tx.gateway === "RAZORPAY" ? "🇮🇳 Razorpay" : tx.gateway === "STRIPE" ? "🌎 Stripe" : "🧪 Demo Adapter"}
                        </span>
                      </td>
                      <td className="px-6 py-4 uppercase font-semibold text-white">{tx.planId}</td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-white">{displayAmount}</td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            tx.status === "SUCCESS"
                              ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
                              : tx.status === "PENDING"
                              ? "bg-amber-400/10 text-amber-300 border border-amber-400/20"
                              : "bg-rose-400/10 text-rose-300 border border-rose-400/20"
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-slate-400">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {tx.status === "SUCCESS" || tx.status === "REFUNDED" ? (
                          <button
                            type="button"
                            disabled={downloadingInvoiceId === tx.transactionId}
                            onClick={async () => {
                              try {
                                setDownloadingInvoiceId(tx.transactionId);
                                await downloadAuthenticatedPdf(
                                  `/billing/transactions/${tx.transactionId}/invoice`,
                                  `Invoice-${tx.transactionId}.pdf`
                                );
                              } catch (err) {
                                setFeedbackMessage({
                                  type: "error",
                                  text: err instanceof Error ? err.message : "Failed to download invoice"
                                });
                              } finally {
                                setDownloadingInvoiceId(null);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-400/20 hover:border-amber-400/50 transition disabled:opacity-50"
                            title="Download Official Tax Invoice (PDF)"
                          >
                            <span>📄</span>
                            {downloadingInvoiceId === tx.transactionId ? "Generating…" : "Tax Invoice"}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-Method Payment Gateway Sandbox Modal */}
      {checkoutModalOpen && checkoutData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl border border-white/20 bg-slate-900 p-6 shadow-2xl space-y-5 animate-scale-up">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">🛡️</span>
                  <div>
                    <h3 className="text-base font-bold text-white">Payment Checkout Gateway</h3>
                    <p className="text-[11px] text-emerald-400 font-medium">Provider-independent payment simulation UI for offline demonstrations and testing</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Order ID: <span className="font-mono text-amber-300">{checkoutData.orderId}</span>
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Due</span>
                <div className="text-xl font-black text-emerald-400">
                  {checkoutData.currency === "INR" ? "₹" : "$"}{" "}
                  {((checkoutData.amountMinor || 0) / 100).toLocaleString()}
                </div>
                <button
                  type="button"
                  onClick={() => setCheckoutModalOpen(false)}
                  className="mt-1 rounded-lg p-1 text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Payment Method Selector Tabs */}
            <div className="grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-slate-950 p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setPaymentTab("upi")}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 transition ${
                  paymentTab === "upi"
                    ? "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span>📱</span> UPI QR / App
              </button>
              <button
                type="button"
                onClick={() => setPaymentTab("card")}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 transition ${
                  paymentTab === "card"
                    ? "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span>💳</span> Cards / CVV
              </button>
              <button
                type="button"
                onClick={() => setPaymentTab("netbanking")}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 transition ${
                  paymentTab === "netbanking"
                    ? "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span>🏦</span> NetBanking
              </button>
            </div>

            {/* TAB 1: UPI QR CODE & INTENT */}
            {paymentTab === "upi" && (
              <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/60 p-5 text-center">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                  Instant UPI QR Auto-Generated
                </div>

                <div className="flex flex-col items-center justify-center">
                  <div className="rounded-2xl border-2 border-amber-400/40 bg-white p-3 shadow-xl">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                        `upi://pay?pa=acustock@icici&pn=AcuStock%20ERP&am=${(
                          (checkoutData.amountMinor || 0) / 100
                        ).toFixed(2)}&cu=${checkoutData.currency}&tn=${checkoutData.transactionId}`
                      )}`}
                      alt="UPI QR Code"
                      className="h-36 w-36"
                    />
                  </div>
                  <span className="mt-2 text-[11px] font-mono text-slate-400">UPI ID: acustock@icici</span>
                </div>

                <div className="flex items-center justify-center gap-3 text-xs font-semibold text-slate-400">
                  <span className="rounded-lg bg-white/5 px-2 py-1">GPay</span>
                  <span className="rounded-lg bg-white/5 px-2 py-1">PhonePe</span>
                  <span className="rounded-lg bg-white/5 px-2 py-1">Paytm</span>
                  <span className="rounded-lg bg-white/5 px-2 py-1">BHIM</span>
                  <span className="rounded-lg bg-white/5 px-2 py-1">CRED</span>
                </div>

                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleSimulatePayment("success", "UPI QR")}
                  className="w-full rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 py-3 text-xs font-bold uppercase tracking-wider text-slate-950 hover:from-emerald-300 hover:to-teal-400 disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                >
                  {isProcessing ? "Verifying UPI Transaction…" : "⚡ Approve UPI Payment on Mobile"}
                </button>
              </div>
            )}

            {/* TAB 2: CREDIT / DEBIT CARDS & CVV */}
            {paymentTab === "card" && (
              <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/60 p-5">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-white">Enter Card Details</span>
                  <div className="flex gap-2">
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">VISA</span>
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-orange-400">Mastercard</span>
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-teal-300">RuPay</span>
                  </div>
                </div>

                <div className="space-y-3 font-mono text-xs">
                  <div>
                    <label className="block text-[10px] uppercase text-slate-500 font-sans">Card Number</label>
                    <input
                      type="text"
                      readOnly
                      value="4532  ••••  ••••  8901"
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none cursor-default"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] uppercase text-slate-500 font-sans">Valid Thru</label>
                      <input
                        type="text"
                        readOnly
                        value="12/28"
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none cursor-default"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase text-slate-500 font-sans">CVV / CVC</label>
                      <input
                        type="password"
                        readOnly
                        value="•••"
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none cursor-default"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-slate-500 font-sans">Cardholder Name</label>
                    <input
                      type="text"
                      readOnly
                      value="Rajesh Kumar"
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none cursor-default font-sans"
                    />
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 bg-white/[0.02] p-2.5 rounded-xl border border-white/5 leading-relaxed">
                  🔒 <strong className="text-slate-300">Delegated Checkout Architecture:</strong> AcuStock delegates sensitive payment-data collection to Razorpay/Stripe-hosted or provider-controlled checkout, so AcuStock does not directly collect or store raw card credentials.
                </div>

                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleSimulatePayment("success", "Credit/Debit Card")}
                  className="w-full rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 py-3 text-xs font-bold uppercase tracking-wider text-slate-950 hover:from-emerald-300 hover:to-teal-400 disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                >
                  {isProcessing ? "Authenticating 3D-Secure OTP…" : "⚡ Pay with Card (Authorize 3DS)"}
                </button>
              </div>
            )}

            {/* TAB 3: NETBANKING */}
            {paymentTab === "netbanking" && (
              <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/60 p-5">
                <span className="block text-xs font-semibold text-white">Popular Indian Banks</span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {["HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank", "Kotak Mahindra"].map((bank, idx) => (
                    <div
                      key={bank}
                      className={`flex items-center gap-2 rounded-xl border p-2.5 cursor-pointer transition ${
                        idx === 0
                          ? "border-amber-400/50 bg-amber-400/10 text-amber-200"
                          : "border-white/10 bg-slate-900 text-slate-300 hover:border-white/20"
                      }`}
                    >
                      <span className="text-base">🏛️</span>
                      <span className="font-semibold">{bank}</span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleSimulatePayment("success", "NetBanking")}
                  className="w-full rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 py-3 text-xs font-bold uppercase tracking-wider text-slate-950 hover:from-emerald-300 hover:to-teal-400 disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                >
                  {isProcessing ? "Redirecting to Bank Gateway…" : "⚡ Authorize NetBanking Payment"}
                </button>
              </div>
            )}

            {/* Rejection / Failure Simulation */}
            <div className="border-t border-white/10 pt-3 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Test negative validation flows:</span>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleSimulatePayment("failure", "Card")}
                className="text-xs font-semibold text-rose-400 hover:text-rose-300 transition"
              >
                ✕ Simulate Bank Decline / Card Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
