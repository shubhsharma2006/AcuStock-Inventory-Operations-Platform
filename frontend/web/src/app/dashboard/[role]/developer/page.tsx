"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

type ApiKeyItem = {
  _id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
  revokedAt?: string;
};

type WebhookSubscriptionItem = {
  _id: string;
  targetUrl: string;
  events: string[];
  description?: string;
  isActive: boolean;
  consecutiveFailures: number;
  lastDeliveredAt?: string;
  createdAt: string;
};

type WebhookDeliveryLogItem = {
  _id: string;
  subscriptionId: string;
  event: string;
  targetUrl: string;
  payload: any;
  statusCode?: number;
  responseBody?: string;
  errorMessage?: string;
  durationMs: number;
  attempt: number;
  status: "SUCCESS" | "FAILED" | "PENDING";
  createdAt: string;
};

const AVAILABLE_SCOPES = [
  { id: "read:stock", label: "Read Stock", desc: "View current stock levels, ATP, and ledger history" },
  { id: "write:stock", label: "Write Stock", desc: "Perform stock IN, stock OUT, and internal adjustments" },
  { id: "read:orders", label: "Read Orders", desc: "Fetch purchase orders, sales orders, and shipments" },
  { id: "write:orders", label: "Write Orders", desc: "Create and update purchase and sales orders" },
  { id: "read:items", label: "Read Catalog", desc: "Query catalog items, batches, lots, and units" },
  { id: "write:items", label: "Write Catalog", desc: "Create and update items and serial policies" },
  { id: "admin:all", label: "Full Administrative Access", desc: "Unrestricted API access across all endpoints" },
];

const AVAILABLE_EVENTS = [
  { id: "stock.in", label: "Stock IN", desc: "Triggered whenever new stock is received" },
  { id: "stock.out", label: "Stock OUT", desc: "Triggered whenever inventory is dispatched or sold" },
  { id: "stock.low", label: "Low Stock Alert", desc: "Triggered when item level dips below reorder point" },
  { id: "order.created", label: "Order Created", desc: "Triggered on new purchase or sales order" },
  { id: "shipment.dispatched", label: "Shipment Dispatched", desc: "Triggered when a shipment is marked in transit" },
];

export default function DeveloperHubPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"keys" | "webhooks" | "logs" | "docs">("keys");

  // API Key creation modal state
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["read:stock"]);
  const [keyExpiryDays, setKeyExpiryDays] = useState("90");
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Webhook subscription modal state
  const [webhookModalOpen, setWebhookModalOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookDescription, setWebhookDescription] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["stock.in", "stock.out"]);

  // Test ping modal state
  const [testResult, setTestResult] = useState<{
    status: string;
    statusCode?: number;
    durationMs?: number;
    error?: string;
  } | null>(null);

  // Payload inspector modal state
  const [inspectedLog, setInspectedLog] = useState<WebhookDeliveryLogItem | null>(null);

  // Queries
  const { data: keysData, isLoading: keysLoading } = useQuery({
    queryKey: ["developer", "api-keys"],
    queryFn: () => apiFetch<{ success: boolean; apiKeys: ApiKeyItem[] }>("/api/api-keys"),
  });

  const { data: webhooksData, isLoading: webhooksLoading } = useQuery({
    queryKey: ["developer", "webhooks"],
    queryFn: () => apiFetch<{ success: boolean; subscriptions: WebhookSubscriptionItem[] }>("/api/webhooks"),
  });

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ["developer", "webhook-logs"],
    queryFn: () => apiFetch<{ success: boolean; logs: WebhookDeliveryLogItem[] }>("/api/webhooks/logs"),
    refetchInterval: activeTab === "logs" ? 5000 : false,
  });

  // Mutations
  const createKeyMutation = useMutation({
    mutationFn: (body: { name: string; scopes: string[]; expiresAt?: string }) =>
      apiFetch<{ success: boolean; apiKey: { keySecret: string } }>("/api/api-keys", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      setCreatedRawKey(data.apiKey.keySecret);
      queryClient.invalidateQueries({ queryKey: ["developer", "api-keys"] });
      setNewKeyName("");
      setSelectedScopes(["read:stock"]);
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["developer", "api-keys"] });
    },
  });

  const createWebhookMutation = useMutation({
    mutationFn: (body: { targetUrl: string; events: string[]; secret?: string; description?: string }) =>
      apiFetch("/api/webhooks", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["developer", "webhooks"] });
      setWebhookModalOpen(false);
      setWebhookUrl("");
      setWebhookDescription("");
      setWebhookSecret("");
      setSelectedEvents(["stock.in", "stock.out"]);
    },
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/webhooks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["developer", "webhooks"] });
    },
  });

  const testWebhookMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean; delivery: any }>(`/api/webhooks/${id}/test`, { method: "POST" }),
    onSuccess: (data) => {
      setTestResult(data.delivery);
      queryClient.invalidateQueries({ queryKey: ["developer", "webhook-logs"] });
    },
    onError: (err: any) => {
      setTestResult({
        status: "FAILED",
        error: err.message || "Failed to trigger test ping",
      });
    },
  });

  function handleCreateKey() {
    if (!newKeyName.trim()) return;
    const expiresAt =
      keyExpiryDays === "never"
        ? undefined
        : new Date(Date.now() + parseInt(keyExpiryDays) * 86400000).toISOString();
    createKeyMutation.mutate({
      name: newKeyName.trim(),
      scopes: selectedScopes,
      expiresAt,
    });
  }

  function handleCreateWebhook() {
    if (!webhookUrl.trim()) return;
    createWebhookMutation.mutate({
      targetUrl: webhookUrl.trim(),
      events: selectedEvents,
      secret: webhookSecret.trim() || undefined,
      description: webhookDescription.trim() || undefined,
    });
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Developer Hub & Integrations
            </h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              v1 Enterprise
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage machine API credentials, outbound webhooks, automated notifications, and inspect real-time delivery logs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Interactive OpenAPI 3.0
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
        {[
          { id: "keys", label: "API Keys", count: keysData?.apiKeys?.length },
          { id: "webhooks", label: "Outbound Webhooks", count: webhooksData?.subscriptions?.length },
          { id: "logs", label: "Delivery Logs", count: logsData?.logs?.length },
          { id: "docs", label: "SDK & Quickstart" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`pb-3 text-sm font-medium transition relative flex items-center gap-2 ${
              activeTab === tab.id
                ? "text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {tab.label}
            {typeof tab.count === "number" && (
              <span className="px-1.5 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab 1: API Keys */}
      {activeTab === "keys" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              API Keys authenticate programmatic requests from ERPs, e-commerce storefronts, and automated scripts via the <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs font-mono">X-API-Key</code> header.
            </p>
            <button
              onClick={() => {
                setCreatedRawKey(null);
                setKeyModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create API Key
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
            {keysLoading ? (
              <div className="p-8 text-center text-slate-500 text-sm">Loading API keys...</div>
            ) : !keysData?.apiKeys || keysData.apiKeys.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">No active API keys</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Create an API key to securely connect external systems, automate inventory synching, or query stock balances programmatically.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Key Name</th>
                      <th className="px-4 py-3">Token Prefix</th>
                      <th className="px-4 py-3">Permissions & Scopes</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">Last Used</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {keysData.apiKeys.map((k) => (
                      <tr key={k._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
                        <td className="px-4 py-3.5 font-medium text-slate-900 dark:text-slate-100">
                          {k.name}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                          {k.keyPrefix}••••••••
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1.5">
                            {k.scopes.map((s) => (
                              <span
                                key={s}
                                className={`px-2 py-0.5 rounded text-xs font-medium border ${
                                  s === "admin:all"
                                    ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800"
                                    : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                                }`}
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-500">
                          {new Date(k.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-500">
                          {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never"}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to revoke API key "${k.name}"? This action cannot be undone.`)) {
                                revokeKeyMutation.mutate(k._id);
                              }
                            }}
                            className="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 font-medium transition"
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Outbound Webhooks */}
      {activeTab === "webhooks" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Webhooks post real-time JSON payloads with cryptographic <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs font-mono">X-AcuStock-Signature: sha256=...</code> headers to your server upon inventory events.
            </p>
            <button
              onClick={() => setWebhookModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Register Webhook
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
            {webhooksLoading ? (
              <div className="p-8 text-center text-slate-500 text-sm">Loading webhooks...</div>
            ) : !webhooksData?.subscriptions || webhooksData.subscriptions.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">No webhook endpoints registered</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Subscribe to stock-in, stock-out, or low stock events to trigger automated reorders, notify ERPs, or dispatch notifications.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Endpoint URL</th>
                      <th className="px-4 py-3">Subscribed Events</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Failures</th>
                      <th className="px-4 py-3">Last Delivered</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {webhooksData.subscriptions.map((w) => (
                      <tr key={w._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
                        <td className="px-4 py-3.5">
                          <div className="font-mono text-xs text-slate-900 dark:text-slate-100 truncate max-w-xs">
                            {w.targetUrl}
                          </div>
                          {w.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{w.description}</p>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1.5">
                            {w.events.map((e) => (
                              <span
                                key={e}
                                className="px-2 py-0.5 rounded text-xs font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                              >
                                {e}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          {w.isActive ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              Disabled
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          {w.consecutiveFailures > 0 ? (
                            <span className="text-rose-600 font-semibold">{w.consecutiveFailures} / 10</span>
                          ) : (
                            <span className="text-slate-500">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-500">
                          {w.lastDeliveredAt ? new Date(w.lastDeliveredAt).toLocaleTimeString() : "Never"}
                        </td>
                        <td className="px-4 py-3.5 text-right space-x-3">
                          <button
                            onClick={() => testWebhookMutation.mutate(w._id)}
                            disabled={testWebhookMutation.isPending}
                            className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-medium transition"
                          >
                            Send Test Ping
                          </button>
                          <button
                            onClick={() => {
                              if (confirm("Delete this webhook subscription?")) {
                                deleteWebhookMutation.mutate(w._id);
                              }
                            }}
                            className="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 font-medium transition"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Delivery Logs */}
      {activeTab === "logs" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Recent webhook dispatch attempts with round-trip latency, HTTP status codes, and exact cryptographic signatures.
            </p>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ["developer", "webhook-logs"] })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh Logs
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
            {logsLoading ? (
              <div className="p-8 text-center text-slate-500 text-sm">Loading delivery logs...</div>
            ) : !logsData?.logs || logsData.logs.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-sm">
                No delivery logs recorded yet. Dispatch a test ping or trigger a stock action to see live telemetry.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Event</th>
                      <th className="px-4 py-3">Target Endpoint</th>
                      <th className="px-4 py-3">Latency</th>
                      <th className="px-4 py-3">Attempt</th>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3 text-right">Payload</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {logsData.logs.map((log) => (
                      <tr key={log._id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
                        <td className="px-4 py-3.5">
                          {log.status === "SUCCESS" ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              {log.statusCode || 200} OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                              {log.statusCode || "ERR"} {log.status}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs font-medium text-slate-900 dark:text-slate-100">
                          {log.event}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-slate-500 truncate max-w-xs">
                          {log.targetUrl}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-500">
                          {log.durationMs}ms
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-500">
                          #{log.attempt}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-500">
                          {new Date(log.createdAt).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={() => setInspectedLog(log)}
                            className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-medium transition"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Quickstart & Documentation */}
      {activeTab === "docs" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Making Authenticated Requests
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Include your active API key in either the <code className="text-indigo-600 font-mono">X-API-Key</code> or <code className="text-indigo-600 font-mono">Authorization: Bearer acu_live_...</code> header.
            </p>
            <div className="bg-slate-950 text-slate-200 p-4 rounded-lg font-mono text-xs overflow-x-auto">
              <pre>{`curl -X GET "https://api.acustock.com/api/v1/stock/remaining" \\
  -H "X-API-Key: acu_live_948f..." \\
  -H "Accept: application/json"`}</pre>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Verifying Webhook Signatures
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              All webhooks include an HMAC SHA-256 signature in the <code className="text-emerald-600 font-mono">X-AcuStock-Signature</code> header computed over the raw payload body.
            </p>
            <div className="bg-slate-950 text-slate-200 p-4 rounded-lg font-mono text-xs overflow-x-auto">
              <pre>{`const crypto = require('crypto');

function verifyWebhook(payload, signatureHeader, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return signatureHeader === \`sha256=\${hash}\`;
}`}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create API Key */}
      {keyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
            {createdRawKey ? (
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">API Key Generated!</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Copy this key immediately. For security reasons, you will not be able to view it again.
                  </p>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl flex items-center justify-between gap-2 border border-slate-800">
                  <span className="font-mono text-xs text-emerald-400 select-all truncate">
                    {createdRawKey}
                  </span>
                  <button
                    onClick={() => copyToClipboard(createdRawKey)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition flex-shrink-0"
                  >
                    {copiedKey ? "Copied!" : "Copy"}
                  </button>
                </div>
                <div className="pt-2">
                  <button
                    onClick={() => {
                      setKeyModalOpen(false);
                      setCreatedRawKey(null);
                    }}
                    className="w-full py-2.5 rounded-xl text-sm font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition"
                  >
                    Done & Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Generate New API Key</h3>
                  <button
                    onClick={() => setKeyModalOpen(false)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Key Name / Identifier *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Shopify Storefront Sync"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Expiration
                    </label>
                    <select
                      value={keyExpiryDays}
                      onChange={(e) => setKeyExpiryDays(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none"
                    >
                      <option value="30">30 Days</option>
                      <option value="90">90 Days (Recommended)</option>
                      <option value="365">1 Year</option>
                      <option value="never">No Expiration</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Permissions & Scopes
                    </label>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {AVAILABLE_SCOPES.map((scope) => (
                        <label
                          key={scope.id}
                          className="flex items-start gap-2.5 p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedScopes.includes(scope.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedScopes([...selectedScopes, scope.id]);
                              } else {
                                setSelectedScopes(selectedScopes.filter((s) => s !== scope.id));
                              }
                            }}
                            className="mt-1 rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <div>
                            <span className="text-xs font-medium text-slate-900 dark:text-slate-100 block">
                              {scope.label} <code className="text-[10px] text-slate-500 font-mono">({scope.id})</code>
                            </span>
                            <span className="text-[11px] text-slate-500 block leading-tight">
                              {scope.desc}
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <button
                    onClick={() => setKeyModalOpen(false)}
                    className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateKey}
                    disabled={!newKeyName.trim() || createKeyMutation.isPending}
                    className="px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-sm transition"
                  >
                    {createKeyMutation.isPending ? "Generating..." : "Generate Key"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Register Webhook */}
      {webhookModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Register Webhook Endpoint</h3>
              <button
                onClick={() => setWebhookModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Target Destination URL *
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/api/webhooks/acustock"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Signing Secret (Optional)
                </label>
                <input
                  type="text"
                  placeholder="whsec_... (leave blank to auto-generate)"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Description / Label
                </label>
                <input
                  type="text"
                  placeholder="e.g. Automated NetSuite Sync"
                  value={webhookDescription}
                  onChange={(e) => setWebhookDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Event Subscriptions *
                </label>
                <div className="space-y-2">
                  {AVAILABLE_EVENTS.map((event) => (
                    <label
                      key={event.id}
                      className="flex items-start gap-2.5 p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedEvents.includes(event.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedEvents([...selectedEvents, event.id]);
                          } else {
                            setSelectedEvents(selectedEvents.filter((ev) => ev !== event.id));
                          }
                        }}
                        className="mt-1 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-medium text-slate-900 dark:text-slate-100 block">
                          {event.label} <code className="text-[10px] text-slate-500 font-mono">({event.id})</code>
                        </span>
                        <span className="text-[11px] text-slate-500 block leading-tight">
                          {event.desc}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setWebhookModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateWebhook}
                disabled={!webhookUrl.trim() || selectedEvents.length === 0 || createWebhookMutation.isPending}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-sm transition"
              >
                {createWebhookMutation.isPending ? "Registering..." : "Save Subscription"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Test Ping Result */}
      {testResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Test Ping Response</h3>
              <button onClick={() => setTestResult(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span className={`font-semibold ${testResult.status === "SUCCESS" ? "text-emerald-600" : "text-rose-600"}`}>
                  {testResult.status} ({testResult.statusCode || "N/A"})
                </span>
              </div>
              {typeof testResult.durationMs === "number" && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Round-trip Latency:</span>
                  <span className="font-mono">{testResult.durationMs}ms</span>
                </div>
              )}
              {testResult.error && (
                <div className="text-rose-500 font-mono text-[11px] pt-1">
                  {testResult.error}
                </div>
              )}
            </div>
            <button
              onClick={() => setTestResult(null)}
              className="w-full py-2 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Modal: Inspect Log Payload */}
      {inspectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Webhook Event: <span className="font-mono text-indigo-600">{inspectedLog.event}</span>
                </h3>
                <p className="text-xs text-slate-500">{inspectedLog.targetUrl}</p>
              </div>
              <button onClick={() => setInspectedLog(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">Dispatched Payload (JSON)</span>
                <div className="bg-slate-950 text-emerald-400 p-3 rounded-xl font-mono text-xs max-h-56 overflow-y-auto">
                  <pre>{JSON.stringify(inspectedLog.payload, null, 2)}</pre>
                </div>
              </div>
              {inspectedLog.responseBody && (
                <div>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">Server Response</span>
                  <div className="bg-slate-950 text-slate-300 p-3 rounded-xl font-mono text-xs max-h-32 overflow-y-auto">
                    <pre>{inspectedLog.responseBody}</pre>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => setInspectedLog(null)}
              className="w-full py-2 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
