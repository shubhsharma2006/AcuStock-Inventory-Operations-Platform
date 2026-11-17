"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { useParams } from "next/navigation";
import { QuotationModal } from "@/components/crm/quotation-modal";
import { Customer360Drawer } from "@/components/crm/customer-360-drawer";

// Types
interface CrmItem {
  _id?: string;
  productId: {
    _id: string;
    name: string;
    sku: string;
    salesPrice?: number;
    uom?: string;
  } | string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxRatePercent?: number;
  lineTotal?: number;
  atpAvailable?: number;
}

interface ActivityItem {
  _id?: string;
  type: string;
  text: string;
  user: string;
  createdAt: string;
}

interface CrmDeal {
  _id: string;
  dealNumber: string;
  title: string;
  companyId?: {
    _id: string;
    name: string;
    email?: string;
    phone?: string;
    address?: { street?: string; city?: string; state?: string };
    creditLimit?: number;
    outstandingBalance?: number;
    isCreditBlocked?: boolean;
  } | null;
  contact: {
    name: string;
    email?: string;
    phone?: string;
    designation?: string;
  };
  stage: "LEAD" | "QUALIFIED" | "PROPOSAL" | "NEGOTIATION" | "WON" | "LOST";
  value: number;
  probability: number;
  expectedCloseDate?: string;
  assignedTo?: { _id: string; name: string; email?: string } | null;
  items: CrmItem[];
  quoteNumber?: string;
  quotationNumber?: string;
  quoteValidityDays?: number;
  quoteExpiresAt?: string;
  paymentTerms?: string;
  taxBreakdown?: {
    taxableAmount?: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
    totalTax?: number;
    grandTotal?: number;
    isInterState?: boolean;
  };
  softReservationId?: any;
  softReservationExpiresAt?: string;
  salesOrderId?: { _id: string; soNumber: string; status: string; fulfillmentStatus?: string } | null;
  notes?: string;
  lostReason?: string;
  activityLog?: ActivityItem[];
  createdAt: string;
}

interface KanbanResponse {
  success: boolean;
  kanban: Record<string, CrmDeal[]>;
  stageTotals: Record<string, number>;
  metrics: {
    totalPipelineValue: number;
    totalDealsCount: number;
    wonValue: number;
    wonCount: number;
    winRatePct: number;
  };
}

const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  LEAD: { label: "1. Inbound Leads", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30" },
  QUALIFIED: { label: "2. Qualified", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30" },
  PROPOSAL: { label: "3. Quote Sent", color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30" },
  NEGOTIATION: { label: "4. Negotiation", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  WON: { label: "5. Won & Order Fulfill", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  LOST: { label: "Closed Lost", color: "text-slate-400", bg: "bg-slate-500/10", border: "border-slate-500/20" },
};

export default function CrmPipelinePage() {
  const queryClient = useQueryClient();
  const params = useParams();
  const role = (params?.role as string) || "admin";

  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [selectedDeal, setSelectedDeal] = useState<CrmDeal | null>(null);
  const [showNewDealModal, setShowNewDealModal] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [activeQuoteDealId, setActiveQuoteDealId] = useState<string | null>(null);
  const [activeCustomer360CompanyId, setActiveCustomer360CompanyId] = useState<string | null>(null);

  // Fetch Kanban & Pipeline Metrics
  const { data, isLoading } = useQuery<KanbanResponse>({
    queryKey: ["crm-kanban"],
    queryFn: () => apiFetch("/crm/kanban"),
    refetchInterval: 15000,
  });

  // Fetch Products for line items
  const { data: rawProducts = [] } = useQuery<any[]>({
    queryKey: ["items"],
    queryFn: () => apiFetch("/items"),
  });

  // Fetch Companies for customer selector
  const { data: companiesData } = useQuery<{ companies: any[] }>({
    queryKey: ["companies-list-dropdown"],
    queryFn: () => apiFetch("/companies?limit=100"),
  });
  const companies = companiesData?.companies || [];

  // Update Stage Mutation
  const updateStageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      apiFetch(`/crm/deals/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ stage }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-kanban"] });
      if (selectedDeal) {
        apiFetch<any>(`/crm/deals/${selectedDeal._id}`).then((res) => {
          if (res?.deal) setSelectedDeal(res.deal);
        });
      }
    },
  });

  // Reserve Stock Mutation
  const reserveStockMutation = useMutation({
    mutationFn: ({ id, days }: { id: string; days: number }) =>
      apiFetch(`/crm/deals/${id}/reserve-stock`, {
        method: "POST",
        body: JSON.stringify({ days }),
      }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["crm-kanban"] });
      if (res?.deal) setSelectedDeal(res.deal);
      alert("✅ 7-day soft inventory reservation successfully applied!");
    },
    onError: (err: any) => {
      alert(`❌ Stock hold failed: ${err.message || err}`);
    },
  });

  // Convert to Sales Order Mutation with Credit Limit Check & Manager Override
  const convertToSoMutation = useMutation<
    any,
    any,
    { id: string; allowCreditOverride?: boolean; overrideReason?: string }
  >({
    mutationFn: ({ id, allowCreditOverride, overrideReason }) =>
      apiFetch(`/crm/deals/${id}/convert-to-so`, {
        method: "POST",
        body: JSON.stringify({ allowCreditOverride, overrideReason }),
      }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["crm-kanban"] });
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      if (res?.deal) setSelectedDeal(res.deal);
      alert(`🎉 Deal Won! Successfully generated Sales Order ${res?.salesOrder?.soNumber || ""} and queued for warehouse fulfillment.`);
    },
    onError: (err: any, variables) => {
      if (err?.creditBlocked || String(err?.message || err?.error || "").toLowerCase().includes("credit limit")) {
        const proceed = confirm(
          `⚠️ CUSTOMER CREDIT LIMIT EXCEEDED!\n\n${err?.error || err?.message || err}\n\nDo you want to authorize a Manager Credit Override to proceed with fulfillment?`
        );
        if (proceed) {
          const reason = prompt("Enter authorization reason for the audit log:", "Director Commercial Approval") || "Manager Credit Override";
          convertToSoMutation.mutate({
            id: variables.id,
            allowCreditOverride: true,
            overrideReason: reason,
          });
          return;
        }
      }
      alert(`❌ Conversion failed: ${err.message || err.error || err}`);
    },
  });

  const kanban = data?.kanban || {};
  const metrics = data?.metrics || {
    totalPipelineValue: 0,
    totalDealsCount: 0,
    wonValue: 0,
    wonCount: 0,
    winRatePct: 0,
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* ── Top Header & Executive KPI Banner ─────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/20 text-amber-300 border border-amber-400/30 font-bold">
              💼
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-white">CRM & Sales Pipeline</h1>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Quote-to-Cash engine: Inbound leads, quotations with live ATP inventory verification & 1-click Sales Order dispatch.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-xl border border-white/10 bg-slate-900/80 p-1">
            <button
              onClick={() => setViewMode("kanban")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === "kanban" ? "bg-amber-400 text-slate-950 font-bold shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              📊 Kanban Board
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === "table" ? "bg-amber-400 text-slate-950 font-bold shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              📋 Deals List
            </button>
          </div>

          <button
            onClick={() => setShowNewDealModal(true)}
            className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 px-4 py-2 text-xs font-bold text-slate-950 shadow-md hover:from-amber-300 hover:to-orange-300 transition"
          >
            + Create New Deal / Lead
          </button>
        </div>
      </div>

      {/* ── Metric Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 shadow-sm backdrop-blur-md">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Active Pipeline Value</span>
          <div className="mt-1 text-xl sm:text-2xl font-bold text-white font-mono">
            ₹{metrics.totalPipelineValue.toLocaleString()}
          </div>
          <span className="text-[11px] text-amber-400 mt-1 block">{metrics.totalDealsCount} active opportunities</span>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 shadow-sm backdrop-blur-md">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Won Revenue</span>
          <div className="mt-1 text-xl sm:text-2xl font-bold text-emerald-400 font-mono">
            ₹{metrics.wonValue.toLocaleString()}
          </div>
          <span className="text-[11px] text-emerald-500 mt-1 block">{metrics.wonCount} deals fulfilled</span>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 shadow-sm backdrop-blur-md">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pipeline Win Rate</span>
          <div className="mt-1 text-xl sm:text-2xl font-bold text-sky-400 font-mono">
            {metrics.winRatePct}%
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Proposal → Won ratio</span>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 shadow-sm backdrop-blur-md">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Warehouse Bridge</span>
          <div className="mt-1 text-xl sm:text-2xl font-bold text-amber-300">
            Active ⚡
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Live ATP check & soft holds</span>
        </div>
      </div>

      {/* ── Search & Filter Bar ──────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-full max-w-xs">
          <input
            type="text"
            placeholder="Search deals, contacts, companies…"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-400/50"
          />
        </div>
        <div className="text-xs text-slate-400">
          Showing {metrics.totalDealsCount} pipeline records
        </div>
      </div>

      {/* ── VIEW 1: KANBAN BOARD ─────────────────────────────────── */}
      {viewMode === "kanban" && (
        <div className="flex items-start gap-4 overflow-x-auto pb-4 pt-1">
          {(["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const).map((stage) => {
            const conf = STAGE_CONFIG[stage];
            const dealsInStage = (kanban[stage] || []).filter((d) => {
              if (!searchFilter.trim()) return true;
              const term = searchFilter.toLowerCase();
              return (
                d.title.toLowerCase().includes(term) ||
                d.dealNumber.toLowerCase().includes(term) ||
                d.contact?.name.toLowerCase().includes(term) ||
                d.companyId?.name?.toLowerCase().includes(term)
              );
            });
            const stageTotal = data?.stageTotals?.[stage] || 0;

            return (
              <div
                key={stage}
                className="flex flex-col rounded-2xl border border-white/10 bg-slate-950/40 p-3.5 w-[280px] min-w-[280px] shrink-0 shadow-sm"
              >
                {/* Column Header */}
                <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2.5 mb-3">
                  <div className="min-w-0 flex-1">
                    <span className={`text-xs font-bold block truncate ${conf.color}`} title={conf.label}>
                      {conf.label}
                    </span>
                    <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                      ₹{stageTotal.toLocaleString()}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${conf.bg} ${conf.color} border ${conf.border}`}>
                    {dealsInStage.length}
                  </span>
                </div>

                {/* Deal Cards Container */}
                <div className="flex-1 space-y-3 overflow-y-auto max-h-[60vh] pr-1">
                  {dealsInStage.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/5 p-4 text-center text-[11px] text-slate-600">
                      No deals in this stage
                    </div>
                  ) : (
                    dealsInStage.map((deal) => (
                      <div
                        key={deal._id}
                        onClick={() => setSelectedDeal(deal)}
                        className="group relative cursor-pointer rounded-xl border border-white/10 bg-slate-900/80 p-3 shadow-md hover:border-amber-400/40 hover:bg-slate-900 transition"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 border border-white/5">
                            {deal.dealNumber}
                          </span>
                          <span className="text-xs font-bold text-amber-300 font-mono">
                            ₹{deal.value?.toLocaleString()}
                          </span>
                        </div>

                        <h4 className="mt-2 text-xs font-semibold text-white group-hover:text-amber-200 line-clamp-2">
                          {deal.title}
                        </h4>

                        <div className="mt-2 text-[11px] text-slate-400 flex items-center flex-wrap gap-1">
                          <span>👤 {deal.contact?.name}</span>
                          {deal.companyId && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveCustomer360CompanyId(deal.companyId?._id || null);
                              }}
                              className="text-amber-300 hover:underline font-medium cursor-pointer"
                              title="View Customer 360 Profile & Credit Health"
                            >
                              • {deal.companyId.name} 🏢
                            </button>
                          )}
                        </div>

                        {/* Status Badges */}
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          {deal.quoteNumber ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveQuoteDealId(deal._id);
                              }}
                              className="rounded-full border border-purple-400/30 bg-purple-500/10 hover:bg-purple-500/20 px-2 py-0.5 text-[9px] font-bold text-purple-300 transition cursor-pointer"
                              title="View Commercial Quote & GST breakdown"
                            >
                              📜 {deal.quoteNumber}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveQuoteDealId(deal._id);
                              }}
                              className="rounded-full border border-white/10 bg-white/5 hover:bg-amber-400/20 hover:text-amber-300 hover:border-amber-400/30 px-2 py-0.5 text-[9px] font-medium text-slate-400 transition cursor-pointer"
                            >
                              + Quote
                            </button>
                          )}
                          {deal.softReservationId && (
                            <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-[9px] font-bold text-sky-300">
                              🔒 7d Soft Hold
                            </span>
                          )}
                          {deal.salesOrderId && (
                            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-300">
                              ✓ {deal.salesOrderId.soNumber}
                            </span>
                          )}
                          <span className="rounded-full border border-white/5 bg-white/5 px-2 py-0.5 text-[9px] text-slate-400">
                            {deal.items?.length || 0} items
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── VIEW 2: TABLE LIST VIEW ──────────────────────────────── */}
      {viewMode === "table" && (
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 overflow-hidden shadow-lg backdrop-blur-md">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="border-b border-white/10 bg-slate-900/80 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3">Deal #</th>
                <th className="px-4 py-3">Title & Company</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Value (₹)</th>
                <th className="px-4 py-3">Quote / GST</th>
                <th className="px-4 py-3">Stock Hold / SO</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {Object.values(kanban)
                .flat()
                .filter((d) => {
                  if (!searchFilter.trim()) return true;
                  const term = searchFilter.toLowerCase();
                  return (
                    d.title.toLowerCase().includes(term) ||
                    d.dealNumber.toLowerCase().includes(term) ||
                    d.contact?.name.toLowerCase().includes(term) ||
                    d.companyId?.name?.toLowerCase().includes(term)
                  );
                })
                .map((deal) => {
                  const conf = STAGE_CONFIG[deal.stage] || STAGE_CONFIG.LEAD;
                  return (
                    <tr
                      key={deal._id}
                      className="hover:bg-white/[0.02] cursor-pointer transition"
                      onClick={() => setSelectedDeal(deal)}
                    >
                      <td className="px-4 py-3 font-mono font-medium text-amber-300">{deal.dealNumber}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">{deal.title}</div>
                        {deal.companyId && (
                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <span>{deal.companyId.name}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveCustomer360CompanyId(deal.companyId?._id || null);
                              }}
                              className="text-[10px] text-amber-400 hover:text-amber-300 hover:underline font-medium"
                              title="Customer 360 & Credit Profile"
                            >
                              [360°]
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div>{deal.contact?.name}</div>
                        <div className="text-[10px] text-slate-500">{deal.contact?.phone || deal.contact?.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${conf.bg} ${conf.color} border ${conf.border}`}>
                          {deal.stage}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-white">
                        ₹{deal.value?.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        {deal.quoteNumber ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveQuoteDealId(deal._id);
                            }}
                            className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-300 hover:bg-purple-500/20 transition cursor-pointer"
                          >
                            📜 {deal.quoteNumber}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveQuoteDealId(deal._id);
                            }}
                            className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-400 hover:text-amber-300 hover:border-amber-400/30 transition cursor-pointer"
                          >
                            + Quote
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {deal.salesOrderId ? (
                          <span className="text-emerald-400 font-mono text-[11px]">✓ {deal.salesOrderId.soNumber}</span>
                        ) : deal.softReservationId ? (
                          <span className="text-sky-400 text-[11px]">🔒 7-Day Soft Hold</span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDeal(deal);
                          }}
                          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-amber-300 hover:bg-amber-400/20"
                        >
                          Details →
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── MODAL 1: CREATE NEW DEAL / LEAD ──────────────────────── */}
      {showNewDealModal && (
        <CreateDealModal
          onClose={() => setShowNewDealModal(false)}
          onCreated={() => {
            setShowNewDealModal(false);
            queryClient.invalidateQueries({ queryKey: ["crm-kanban"] });
          }}
          companies={companies}
          products={rawProducts}
        />
      )}

      {/* ── MODAL 2: DEAL DETAIL & FULFILLMENT DRAWER ─────────────── */}
      {selectedDeal && (
        <DealDetailDrawer
          deal={selectedDeal}
          role={role}
          onClose={() => setSelectedDeal(null)}
          onStageChange={(newStage) => updateStageMutation.mutate({ id: selectedDeal._id, stage: newStage })}
          onReserveStock={(days) => reserveStockMutation.mutate({ id: selectedDeal._id, days })}
          onConvertToSo={() => convertToSoMutation.mutate({ id: selectedDeal._id })}
          onOpenQuote={(dealId) => setActiveQuoteDealId(dealId)}
          onOpenCustomer360={(companyId) => setActiveCustomer360CompanyId(companyId)}
          isReserving={reserveStockMutation.isPending}
          isConverting={convertToSoMutation.isPending}
        />
      )}

      {/* ── MODAL 3: COMMERCIAL QUOTATION / PROFORMA INVOICE ───────── */}
      {activeQuoteDealId && (
        <QuotationModal
          dealId={activeQuoteDealId}
          isOpen={!!activeQuoteDealId}
          onClose={() => setActiveQuoteDealId(null)}
          onQuoteGenerated={() => {
            queryClient.invalidateQueries({ queryKey: ["crm-kanban"] });
            if (selectedDeal && selectedDeal._id === activeQuoteDealId) {
              apiFetch<any>(`/crm/deals/${activeQuoteDealId}`).then((res) => {
                if (res?.deal) setSelectedDeal(res.deal);
              });
            }
          }}
          onConvertToSO={() => {
            const dId = activeQuoteDealId;
            setActiveQuoteDealId(null);
            convertToSoMutation.mutate({ id: dId });
          }}
        />
      )}

      {/* ── MODAL 4: CUSTOMER 360 CREDIT & TRANSACTION DRAWER ──────── */}
      {activeCustomer360CompanyId && (
        <Customer360Drawer
          companyId={activeCustomer360CompanyId}
          isOpen={!!activeCustomer360CompanyId}
          onClose={() => setActiveCustomer360CompanyId(null)}
          onUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ["crm-kanban"] });
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: CREATE NEW DEAL MODAL
// ─────────────────────────────────────────────────────────────────────────────
function CreateDealModal({
  onClose,
  onCreated,
  companies,
  products,
}: {
  onClose: () => void;
  onCreated: () => void;
  companies: any[];
  products: any[];
}) {
  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactDesignation, setContactDesignation] = useState("");
  const [stage, setStage] = useState("LEAD");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [notes, setNotes] = useState("");

  // Line items state
  const [lineItems, setLineItems] = useState<
    Array<{ productId: string; quantity: number; unitPrice: number; discountPercent: number; taxRatePercent: number; atpAvailable: number }>
  >([]);

  // When company is chosen, auto-populate contacts if blank
  const handleCompanyChange = (cId: string) => {
    setCompanyId(cId);
    if (!cId) return;
    const selected = companies.find((c) => c._id === cId);
    if (selected) {
      if (!contactName && selected.contactPerson) setContactName(selected.contactPerson);
      if (!contactEmail && selected.email) setContactEmail(selected.email);
      if (!contactPhone && selected.phone) setContactPhone(selected.phone);
    }
  };

  const addLineItem = () => {
    if (products.length === 0) return;
    const first = products[0];
    setLineItems([
      ...lineItems,
      {
        productId: first._id,
        quantity: 1,
        unitPrice: first.salesPrice || 100,
        discountPercent: 0,
        taxRatePercent: 18,
        atpAvailable: first.quantity || 0,
      },
    ]);
  };

  const updateLineItem = (index: number, field: string, val: any) => {
    const updated = [...lineItems];
    (updated[index] as any)[field] = val;

    if (field === "productId") {
      const prod = products.find((p) => p._id === val);
      if (prod) {
        updated[index].unitPrice = prod.salesPrice || 0;
        updated[index].atpAvailable = prod.quantity || 0;
      }
    }
    setLineItems(updated);
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const calculateTotal = useMemo(() => {
    return lineItems.reduce((acc, it) => {
      const discounted = it.unitPrice * (1 - (it.discountPercent || 0) / 100);
      const withTax = discounted * (1 + (it.taxRatePercent || 0) / 100);
      return acc + withTax * (it.quantity || 1);
    }, 0);
  }, [lineItems]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !contactName.trim()) {
      alert("Please fill in Deal Title and Contact Name.");
      return;
    }

    try {
      await apiFetch("/crm/deals", {
        method: "POST",
        body: JSON.stringify({
          title,
          companyId: companyId || null,
          contact: {
            name: contactName,
            email: contactEmail,
            phone: contactPhone,
            designation: contactDesignation,
          },
          stage,
          expectedCloseDate: expectedCloseDate || null,
          notes,
          items: lineItems,
        }),
      });
      onCreated();
    } catch (err: any) {
      alert(`Error creating deal: ${err.message || err}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border border-white/15 bg-slate-900/95 shadow-2xl backdrop-blur-2xl text-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 p-5 border-b border-white/10 bg-slate-900/90 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/20 text-amber-300 border border-amber-400/30 text-lg">
              ✨
            </span>
            <div>
              <h3 className="text-lg font-bold text-white">Create New Lead / Opportunity</h3>
              <p className="text-xs text-slate-400">Quote items with real-time Available-to-Promise (ATP) stock.</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-400 hover:text-white">
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Deal Title <span className="text-rose-400">*</span>
            </label>
            <input
              required
              type="text"
              placeholder="e.g. 500x Precision Sensors - Acme Corp"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2 text-xs text-white outline-none focus:border-amber-400/50"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Associated Company / Client</label>
              <select
                value={companyId}
                onChange={(e) => handleCompanyChange(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-amber-400/50"
              >
                <option value="">-- Direct Buyer / No Company --</option>
                {companies.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} {c.industry ? `(${c.industry})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Initial Pipeline Stage</label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-amber-400/50"
              >
                <option value="LEAD">1. Inbound Lead</option>
                <option value="QUALIFIED">2. Qualified Opportunity</option>
                <option value="PROPOSAL">3. Quotation Sent</option>
                <option value="NEGOTIATION">4. Negotiation</option>
              </select>
            </div>
          </div>

          {/* Contact Details */}
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3 space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-amber-300">Contact Person</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Contact Name *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Ramesh Patel"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Designation</label>
                <input
                  type="text"
                  placeholder="e.g. Head of Procurement"
                  value={contactDesignation}
                  onChange={(e) => setContactDesignation(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Email</label>
                <input
                  type="email"
                  placeholder="ramesh@acme.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Phone</label>
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none"
                />
              </div>
            </div>
          </div>

          {/* Products / Quote Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">Catalog Items & Quotation</label>
              <button
                type="button"
                onClick={addLineItem}
                className="rounded-lg bg-amber-400/20 px-2.5 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-400/30"
              >
                + Add Item
              </button>
            </div>

            {lineItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-3 text-center text-xs text-slate-500">
                No items added yet. Click &quot;+ Add Item&quot; to quote catalog products.
              </div>
            ) : (
              <div className="space-y-2">
                {lineItems.map((item, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 p-2.5 text-xs">
                    <div className="flex-1 min-w-[140px]">
                      <select
                        value={item.productId}
                        onChange={(e) => updateLineItem(idx, "productId", e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white outline-none"
                      >
                        {products.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.name} ({p.sku})
                          </option>
                        ))}
                      </select>
                      <span className="text-[10px] text-emerald-400 block mt-0.5">
                        ATP Stock: {item.atpAvailable} units available
                      </span>
                    </div>

                    <div className="w-16">
                      <label className="text-[9px] text-slate-400 block">Qty</label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(idx, "quantity", Number(e.target.value))}
                        className="w-full rounded border border-white/10 bg-slate-900 px-1.5 py-1 text-xs text-white font-mono"
                      />
                    </div>

                    <div className="w-20">
                      <label className="text-[9px] text-slate-400 block">Price (₹)</label>
                      <input
                        type="number"
                        min="0"
                        value={item.unitPrice}
                        onChange={(e) => updateLineItem(idx, "unitPrice", Number(e.target.value))}
                        className="w-full rounded border border-white/10 bg-slate-900 px-1.5 py-1 text-xs text-white font-mono"
                      />
                    </div>

                    <div className="w-14">
                      <label className="text-[9px] text-slate-400 block">GST %</label>
                      <input
                        type="number"
                        value={item.taxRatePercent}
                        onChange={(e) => updateLineItem(idx, "taxRatePercent", Number(e.target.value))}
                        className="w-full rounded border border-white/10 bg-slate-900 px-1.5 py-1 text-xs text-white font-mono"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => removeLineItem(idx)}
                      className="text-rose-400 hover:text-rose-300 p-1 text-sm mt-3"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <div className="text-right text-xs font-mono font-bold text-amber-300 pt-1">
                  Estimated Deal Total: ₹{Math.round(calculateTotal).toLocaleString()}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Expected Close Date</label>
            <input
              type="date"
              value={expectedCloseDate}
              onChange={(e) => setExpectedCloseDate(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2 text-xs text-white outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Internal Notes</label>
            <textarea
              rows={2}
              placeholder="Client requirement details, payment terms discussed, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2 text-xs text-white outline-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 px-5 py-2 text-xs font-bold text-slate-950 shadow-md hover:from-amber-300 hover:to-orange-300"
            >
              Create Opportunity
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: DEAL DETAIL & FULFILLMENT DRAWER
// ─────────────────────────────────────────────────────────────────────────────
function DealDetailDrawer({
  deal,
  role,
  onClose,
  onStageChange,
  onReserveStock,
  onConvertToSo,
  onOpenQuote,
  onOpenCustomer360,
  isReserving,
  isConverting,
}: {
  deal: CrmDeal;
  role: string;
  onClose: () => void;
  onStageChange: (stage: string) => void;
  onReserveStock: (days: number) => void;
  onConvertToSo: () => void;
  onOpenQuote?: (dealId: string) => void;
  onOpenCustomer360?: (companyId: string) => void;
  isReserving: boolean;
  isConverting: boolean;
}) {
  const conf = STAGE_CONFIG[deal.stage] || STAGE_CONFIG.LEAD;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/80 backdrop-blur-sm">
      <div className="relative h-full w-full max-w-xl flex flex-col bg-slate-900 border-l border-white/15 shadow-2xl text-slate-200">
        {/* Header */}
        <div className="flex-shrink-0 p-5 border-b border-white/10 bg-slate-950/90 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-mono font-bold text-amber-300">
                {deal.dealNumber}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${conf.bg} ${conf.color} border ${conf.border}`}>
                {deal.stage}
              </span>
            </div>
            <h2 className="mt-1 text-lg font-bold text-white">{deal.title}</h2>
          </div>
          <button onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-400 hover:text-white">
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
          {/* Executive Action Banner */}
          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Opportunity Value</span>
                <div className="text-2xl font-bold font-mono text-white">₹{deal.value?.toLocaleString()}</div>
              </div>

              {/* Stage Selector */}
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">Advance Stage</span>
                <select
                  value={deal.stage}
                  onChange={(e) => onStageChange(e.target.value)}
                  className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white outline-none"
                >
                  <option value="LEAD">1. Inbound Lead</option>
                  <option value="QUALIFIED">2. Qualified</option>
                  <option value="PROPOSAL">3. Quote Sent</option>
                  <option value="NEGOTIATION">4. Negotiation</option>
                  <option value="WON">5. Won</option>
                  <option value="LOST">Closed Lost</option>
                </select>
              </div>
            </div>

            {/* Warehouse Fulfillment Bridge Actions */}
            <div className="border-t border-white/10 pt-3 flex flex-wrap items-center gap-2">
              {deal.salesOrderId ? (
                <div className="w-full flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📦</span>
                    <div>
                      <div className="text-xs font-bold text-emerald-300">Sales Order Created</div>
                      <div className="text-[10px] text-slate-400">Order #{deal.salesOrderId.soNumber} in fulfillment</div>
                    </div>
                  </div>
                  <Link
                    href={`/dashboard/${role}/sales-orders`}
                    className="rounded-lg bg-emerald-400 px-3 py-1 text-xs font-bold text-slate-950 shadow hover:bg-emerald-300"
                  >
                    View SO →
                  </Link>
                </div>
              ) : (
                <>
                  {!deal.softReservationId ? (
                    <button
                      type="button"
                      disabled={isReserving}
                      onClick={() => onReserveStock(7)}
                      className="rounded-xl border border-sky-400/40 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 transition disabled:opacity-50"
                    >
                      {isReserving ? "Holding…" : "🔒 Soft Reserve Stock (7 Days)"}
                    </button>
                  ) : (
                    <span className="rounded-xl border border-sky-400/40 bg-sky-500/20 px-3 py-2 text-xs font-bold text-sky-200">
                      ✓ Stock Soft-Held (7 Days Active)
                    </span>
                  )}

                  <button
                    type="button"
                    disabled={isConverting}
                    onClick={onConvertToSo}
                    className="flex-1 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 px-4 py-2 text-xs font-bold text-slate-950 shadow-md hover:from-emerald-300 hover:to-teal-300 transition disabled:opacity-50"
                  >
                    {isConverting ? "Creating SO…" : "🚀 Deal Won: 1-Click Convert to Sales Order"}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Formal Commercial Quotation Engine Card */}
          <div className="rounded-2xl border border-purple-500/30 bg-purple-950/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-300 text-lg">
                  📜
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-purple-300">
                    {deal.quoteNumber ? `Quotation #${deal.quoteNumber}` : "Formal Quotation / Proforma Invoice"}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {deal.quoteExpiresAt
                      ? `Valid until ${new Date(deal.quoteExpiresAt).toLocaleDateString()} • State-aware GST applied`
                      : "Generate state-aware GST breakdown with 1-click Print/PDF export"}
                  </p>
                </div>
              </div>
              {onOpenQuote && (
                <button
                  type="button"
                  onClick={() => onOpenQuote(deal._id)}
                  className="rounded-xl bg-purple-500 hover:bg-purple-400 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition"
                >
                  {deal.quoteNumber ? "View Quote 🖨️" : "Generate Quote ⚡"}
                </button>
              )}
            </div>

            {deal.taxBreakdown && deal.taxBreakdown.grandTotal ? (
              <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-950/60 p-2.5 text-center text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block">Taxable Base</span>
                  <span className="font-mono font-semibold text-white">₹{deal.taxBreakdown.taxableAmount?.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">GST ({deal.taxBreakdown.isInterState ? "IGST" : "CGST+SGST"})</span>
                  <span className="font-mono font-semibold text-purple-300">₹{deal.taxBreakdown.totalTax?.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Grand Total</span>
                  <span className="font-mono font-bold text-emerald-400">₹{deal.taxBreakdown.grandTotal?.toLocaleString()}</span>
                </div>
              </div>
            ) : null}
          </div>

          {/* Contact & Company Details */}
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">Customer & Contact Information</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block text-[10px]">Contact Person</span>
                <span className="font-semibold text-white">{deal.contact?.name}</span>
                {deal.contact?.designation && <span className="text-slate-400 block text-[11px]">{deal.contact.designation}</span>}
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 block text-[10px]">Company / Account</span>
                  {typeof deal.companyId === "object" && deal.companyId?._id && onOpenCustomer360 && (
                    <button
                      type="button"
                      onClick={() => onOpenCustomer360((deal.companyId as any)._id)}
                      className="text-[10px] font-bold text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-0.5"
                      title="Inspect Customer 360 Credit & Orders"
                    >
                      360° View 🏢
                    </button>
                  )}
                </div>
                <span className="font-semibold text-white">{deal.companyId?.name || "Direct Customer"}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Email</span>
                <span className="text-slate-300">{deal.contact?.email || "—"}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Phone</span>
                <span className="text-slate-300">{deal.contact?.phone || "—"}</span>
              </div>
            </div>
          </div>

          {/* Quoted Line Items Table */}
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">Quotation Line Items</h3>
            {deal.items && deal.items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/10 text-[10px] uppercase text-slate-500">
                    <tr>
                      <th className="pb-1.5">Product</th>
                      <th className="pb-1.5">Qty</th>
                      <th className="pb-1.5">Price</th>
                      <th className="pb-1.5">GST</th>
                      <th className="pb-1.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {deal.items.map((line, idx) => {
                      const prodName = typeof line.productId === "object" ? line.productId?.name : "Product";
                      const prodSku = typeof line.productId === "object" ? line.productId?.sku : "";
                      return (
                        <tr key={idx} className="text-slate-300">
                          <td className="py-2">
                            <div className="font-medium text-white">{prodName}</div>
                            <div className="text-[10px] font-mono text-slate-500">{prodSku}</div>
                          </td>
                          <td className="py-2 font-mono">{line.quantity}</td>
                          <td className="py-2 font-mono">₹{line.unitPrice}</td>
                          <td className="py-2 font-mono">{line.taxRatePercent || 18}%</td>
                          <td className="py-2 font-mono font-semibold text-white text-right">₹{line.lineTotal?.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-xs text-slate-500">No line items in this deal.</div>
            )}
          </div>

          {/* Activity Log */}
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">Activity & Audit Timeline</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {deal.activityLog && deal.activityLog.length > 0 ? (
                deal.activityLog.map((act, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs border-l-2 border-amber-400/40 pl-2.5 py-1">
                    <div>
                      <div className="text-slate-200">{act.text}</div>
                      <div className="text-[10px] text-slate-500">
                        {act.user} • {new Date(act.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500">No activity recorded.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

