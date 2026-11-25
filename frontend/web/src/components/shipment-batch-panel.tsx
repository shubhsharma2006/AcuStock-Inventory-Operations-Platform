"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

const steps = ["ORDER", "AWB", "LABEL", "PICKUP"] as const;
type Stage = typeof steps[number] | "COMPLETE";
const stageLabels: Record<Stage, string> = {
  ORDER: "Ready to book", AWB: "Awaiting AWB", LABEL: "Awaiting label",
  PICKUP: "Ready for pickup request", COMPLETE: "Pickup scheduled"
};
type Parcel = {
  _id: string; reference: string; customerName: string; city?: string; awb?: string;
  carrierBooking?: { stage?: Stage; processing?: boolean };
};
const button = "rounded-lg border border-white/20 px-3 py-2 text-sm disabled:opacity-40";

export function ShipmentBatchPanel({ accountId, onBusy }: { accountId: string; onBusy: (busy: boolean) => void }) {
  const [warehouse, setWarehouse] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const client = useQueryClient();
  const origins = useQuery({
    queryKey: ["shipments", "batch-origins", accountId],
    queryFn: () => apiFetch<{ warehouses: string[] }>("/logistics/dispatch-warehouses"),
  });
  const parcels = useQuery({
    queryKey: ["shipments", "dispatch-batch", accountId, warehouse, page],
    enabled: Boolean(warehouse),
    queryFn: () => apiFetch<{ shipments: Parcel[]; pagination: { pages: number } }>(
      "/shipments?" + new URLSearchParams({ originWarehouse: warehouse, queue: "dispatch", page: String(page), limit: "50" })
    ),
  });
  const rows = parcels.data?.shipments ?? [];
  const selection = rows.filter(row => selected.includes(row._id));
  const dispatch = useMutation({
    onMutate: () => onBusy(true),
    mutationFn: async (batch: Parcel[]) => {
      for (const row of batch) {
        let stage: Stage = row.carrierBooking?.stage ?? "ORDER";
        try {
          for (const step of steps.slice(steps.indexOf(stage as typeof steps[number]))) {
            setMessages(old => ({ ...old, [row._id]: stageLabels[step] }));
            const result: { next: Stage } = await apiFetch("/logistics/book", {
              method: "POST", body: JSON.stringify({ provider: "SHIPROCKET", shipmentId: row._id, step })
            });
            stage = result.next;
          }
          setMessages(old => ({ ...old, [row._id]: stageLabels[stage] }));
        } catch (error) {
          setMessages(old => ({ ...old, [row._id]: error instanceof Error ? error.message : "Check carrier confirmation." }));
        }
      }
    },
    onSettled: async () => {
      try { await client.invalidateQueries({ queryKey: ["shipments"] }); }
      finally { onBusy(false); }
    },
  });
  const documents = useMutation({
    mutationFn: (document: "labels" | "manifest") => apiFetch<{ url: string }>("/logistics/batch-documents", {
      method: "POST", body: JSON.stringify({ document, warehouse, shipmentIds: selection.map(s => s._id) })
    }),
  });
  const busy = dispatch.isPending || documents.isPending;
  const eligible = selection.filter(row => !row.carrierBooking?.processing && row.carrierBooking?.stage !== "COMPLETE" &&
    (!row.awb || row.carrierBooking?.stage));
  const labelsReady = selection.length > 0 && selection.every(row => !row.carrierBooking?.processing &&
    row.awb && ["PICKUP", "COMPLETE"].includes(row.carrierBooking?.stage ?? ""));
  function changeSelection(ids: string[]) {
    setSelected(ids);
    documents.reset();
  }

  return <section className="space-y-4 rounded-xl border border-white/10 bg-slate-900/50 p-4 text-slate-200">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <label className="text-sm">Pickup warehouse
        <select disabled={busy} value={warehouse} onChange={e => {
          setWarehouse(e.target.value); setPage(1); changeSelection([]); setMessages({});
        }} className="mt-1 block max-w-full rounded-lg border border-white/20 bg-slate-950 px-3 py-2">
          <option value="">Select warehouse</option>
          {origins.data?.warehouses.map(name => <option key={name}>{name}</option>)}
        </select>
      </label>
      {warehouse && <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">{selection.length} selected</span>
        <button type="button" disabled={busy || !eligible.length} className={button}
          onClick={() => { documents.reset(); dispatch.mutate(eligible); }}>Book and schedule pickup ({eligible.length})</button>
        <button type="button" disabled={busy || !labelsReady} className={button} onClick={() => documents.mutate("labels")}>Generate batch labels</button>
        <button type="button" disabled={busy || !labelsReady || selection.some(s => s.carrierBooking?.stage !== "COMPLETE")}
          className={button} onClick={() => documents.mutate("manifest")}>Generate pickup manifest</button>
      </div>}
    </div>
    {origins.isLoading && <p role="status">Loading pickup warehouses…</p>}
    {origins.data && !origins.data.warehouses.length && <p>No warehouses have outgoing Shiprocket shipments awaiting dispatch.</p>}
    {(origins.error || parcels.error) && <p role="alert">Could not load shipments. <button type="button" className="underline" onClick={() => origins.error ? origins.refetch() : parcels.refetch()}>Retry</button></p>}
    {documents.error && <p role="alert">{documents.error.message}</p>}
    {documents.data && <a className="text-sky-300 underline" href={documents.data.url} target="_blank" rel="noreferrer">
      {documents.variables === "manifest" ? "Open printable pickup manifest" : "Open printable batch labels"}
    </a>}
    {warehouse && parcels.isLoading && <p role="status">Loading shipments…</p>}
    {parcels.data && <>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr className="border-b border-white/15 text-slate-400">
          <th className="p-2"><input type="checkbox" aria-label="Select all shipments on this page" disabled={busy || !rows.length}
            checked={rows.length > 0 && selection.length === rows.length} onChange={e => changeSelection(e.target.checked ? rows.map(s => s._id) : [])}/></th>
          {["Shipment", "Recipient", "AWB", "Booking status"].map(title => <th className="p-2" key={title}>{title}</th>)}
        </tr></thead><tbody>{rows.map(row => <tr key={row._id} className="border-b border-white/10">
          <td className="p-2"><input type="checkbox" aria-label={`Select ${row.reference}`} disabled={busy} checked={selected.includes(row._id)}
            onChange={e => changeSelection(e.target.checked ? [...selected, row._id] : selected.filter(id => id !== row._id))}/></td>
          <td className="p-2 font-mono">{row.reference}</td><td className="p-2">{[row.customerName, row.city].filter(Boolean).join(" · ")}</td>
          <td className="p-2">{row.awb || "Unassigned"}</td>
          <td className="p-2" aria-live="polite">{messages[row._id] || (row.carrierBooking?.processing ? "Awaiting carrier confirmation" :
            row.awb && !row.carrierBooking?.stage ? "Manually assigned AWB" : stageLabels[row.carrierBooking?.stage ?? "ORDER"])}</td>
        </tr>)}</tbody></table></div>
      {!rows.length && <p>No shipments on this page.</p>}
      <nav aria-label="Bulk dispatch pages" className="flex items-center gap-3 text-sm">
        <button className={button} disabled={busy || page === 1} onClick={() => { setPage(page - 1); changeSelection([]); }}>Previous</button>
        <span>Page {page}</span>
        <button className={button} disabled={busy || page >= parcels.data.pagination.pages} onClick={() => { setPage(page + 1); changeSelection([]); }}>Next</button>
      </nav>
    </>}
  </section>;
}
