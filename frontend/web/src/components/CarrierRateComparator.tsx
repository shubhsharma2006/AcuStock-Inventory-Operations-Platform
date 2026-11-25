"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface CarrierQuote {
  provider: string;
  carrierCode: string;
  carrierName: string;
  serviceType: "AIR" | "SURFACE" | "CARGO";
  billableWeightKg: number;
  rate: number;
  freightCharge: number;
  expectedDays: number;
  carrierScore: number;
  isRecommended?: boolean;
  zone: string;
}

interface RatesResponse {
  success: boolean;
  policy: string;
  quotes: CarrierQuote[];
  recommended: CarrierQuote | null;
  weightSummary: {
    actualWeightKg: number;
    volumetricWeightKg: number;
    billableWeightKg: number;
    isVolumetricDominant: boolean;
  };
  totalCarriersEvaluated: number;
}

interface Props {
  fromPincode: string;
  toPincode: string;
  weightKg?: number;
  onSelectCarrier: (carrier: CarrierQuote) => void;
}

export function CarrierRateComparator({ fromPincode, toPincode, weightKg = 2, onSelectCarrier }: Props) {
  const [policy, setPolicy] = useState<"BALANCED" | "CHEAPEST" | "FASTEST" | "BEST_RATED">("BALANCED");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery<RatesResponse>({
    queryKey: ["logistics-rates", fromPincode, toPincode, weightKg, policy],
    queryFn: () =>
      apiFetch("/logistics/rates", {
        method: "POST",
        body: JSON.stringify({
          fromPincode,
          toPincode,
          actualWeightKg: weightKg,
          policy,
        }),
      }),
    enabled: Boolean(fromPincode && toPincode),
  });

  const quotes = data?.quotes || [];

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div>
          <div className="flex items-center gap-1.5 font-bold text-white">
            <span>Estimated shipping rates</span>
            <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-mono text-sky-300">
              Bigship + Couriers
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            {fromPincode} → {toPincode} · Billable: {data?.weightSummary?.billableWeightKg ?? weightKg} kg
          </p>
        </div>

        {/* Policy Selector */}
        <div className="flex items-center gap-1 rounded-xl bg-slate-900 p-1 border border-white/10">
          {(["BALANCED", "CHEAPEST", "FASTEST", "BEST_RATED"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPolicy(p)}
              className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold transition ${
                policy === p ? "bg-amber-400 text-slate-950" : "text-slate-400 hover:text-white"
              }`}
            >
              {p === "BALANCED" ? "Recommended" : p === "CHEAPEST" ? "Lowest Cost" : p === "FASTEST" ? "Fastest" : "Top Rated"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-6 text-center text-slate-400">
          <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          <p className="mt-1 text-[11px]">Calculating rate estimates…</p>
        </div>
      ) : error ? (
        <div className="py-3 text-center text-rose-300">
          Could not calculate estimates. You can still enter tracking details manually.
        </div>
      ) : quotes.length === 0 ? (
        <div className="py-3 text-center text-slate-400">
          No automated carrier quotes found for pincodes {fromPincode} - {toPincode}.
        </div>
      ) : (
        <div className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-1">
          {quotes.map((q) => {
            const isSelected = selectedCode === q.carrierCode;
            return (
              <div
                key={q.carrierCode}
                onClick={() => {
                  setSelectedCode(q.carrierCode);
                  onSelectCarrier(q);
                }}
                className={`cursor-pointer flex items-center justify-between rounded-xl border p-2.5 transition ${
                  isSelected
                    ? "border-amber-400 bg-amber-500/10 shadow-lg"
                    : q.isRecommended
                    ? "border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/70"
                    : "border-white/5 bg-slate-900/60 hover:border-white/20"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg font-bold text-xs ${
                      q.serviceType === "AIR"
                        ? "bg-sky-500/20 text-sky-300"
                        : q.serviceType === "CARGO"
                        ? "bg-purple-500/20 text-purple-300"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    {q.serviceType === "AIR" ? "✈️" : q.serviceType === "CARGO" ? "🚛" : "🚚"}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{q.carrierName}</span>
                      {q.isRecommended && (
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.2 text-[9px] font-bold text-emerald-300 border border-emerald-500/30">
                          RECOMMENDED
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-400">
                      <span>Delivery in: <b className="text-slate-200">{q.expectedDays} days</b></span>
                      <span>•</span>
                      <span>Score: <b className="text-emerald-400">{q.carrierScore}%</b></span>
                      <span>•</span>
                      <span className="uppercase text-slate-500">{q.provider}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-mono text-sm font-bold text-amber-400">₹{q.rate}</div>
                  <button
                    type="button"
                    className={`mt-0.5 rounded-lg px-2 py-0.5 text-[10px] font-semibold transition ${
                      isSelected ? "bg-amber-400 text-slate-950" : "bg-white/10 text-slate-300 hover:bg-white/20"
                    }`}
                  >
                    {isSelected ? "Selected ✓" : "Select"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
