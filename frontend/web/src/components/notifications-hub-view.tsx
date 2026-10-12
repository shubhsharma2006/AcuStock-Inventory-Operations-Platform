"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useRealtimeState } from "@/components/realtime-provider";
import type { Role } from "@/lib/acustock";

type NotificationItem = {
  _id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | string;
  category?: string;
  type?: string;
  link?: string;
  targetRole?: string;
};

type NotificationsResponse = {
  notifications: NotificationItem[];
  unreadCount: number;
  total: number;
  page: number;
  totalPages: number;
};

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) return "Just now";
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "Recent";
  }
}

function resolveNotificationRoute(item: NotificationItem, role: Role): string {
  const roleSlug = role.toLowerCase().replace(/_/g, "-");
  if (!item.link) return `/dashboard/${roleSlug}`;
  let path = item.link;
  if (path.startsWith("/dashboard/")) {
    const parts = path.split("/").filter(Boolean);
    if (parts.length >= 2) {
      parts[1] = roleSlug;
      return `/${parts.join("/")}`;
    }
  }
  return path;
}

const CATEGORIES = [
  { id: "ALL", label: "All Feeds", icon: "📬" },
  { id: "STOCK", label: "Stock & Inventory", icon: "📦" },
  { id: "SHIPMENT", label: "Shipments & Orders", icon: "🚚" },
  { id: "WARRANTY", label: "Warranties", icon: "🛡️" },
  { id: "SECURITY", label: "Security & Access", icon: "🔐" },
  { id: "SYSTEM", label: "System Alerts", icon: "⚙️" },
];

const PRIORITIES = [
  { id: "ALL", label: "All Priorities" },
  { id: "CRITICAL", label: "Critical Only" },
  { id: "HIGH", label: "High Priority" },
  { id: "MEDIUM", label: "Medium" },
  { id: "LOW", label: "Low" },
];

export function NotificationsHubView({ role }: { role: Role }) {
  const router = useRouter();
  const { refreshToken, refresh } = useRealtimeState();

  // Filters & Pagination State
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [activePriority, setActivePriority] = useState("ALL");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  // Data State
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Fetch notifications
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const queryParams = new URLSearchParams({
          page: String(page),
          limit: String(limit),
          unreadOnly: unreadOnly ? "true" : "false",
        });
        if (activeCategory !== "ALL") queryParams.set("category", activeCategory);
        if (activePriority !== "ALL") queryParams.set("priority", activePriority);

        const res = await apiFetch<NotificationsResponse>(`/notifications?${queryParams.toString()}`);
        if (!cancelled && res) {
          setNotifications(res.notifications || []);
          setUnreadCount(res.unreadCount || 0);
          setTotal(res.total || 0);
          setTotalPages(res.totalPages || 1);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load notifications");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [page, limit, activeCategory, activePriority, unreadOnly, refreshToken]);

  // Client-side quick search filtering
  const filteredNotifications = useMemo(() => {
    if (!searchQuery.trim()) return notifications;
    const q = searchQuery.toLowerCase();
    return notifications.filter(
      (n) => n.title.toLowerCase().includes(q) || n.message.toLowerCase().includes(q)
    );
  }, [notifications, searchQuery]);

  // Bulk Selection Handlers
  const allFilteredSelected =
    filteredNotifications.length > 0 &&
    filteredNotifications.every((n) => selectedIds.includes(n._id));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredNotifications.map((n) => n._id));
    }
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  // Single Actions
  async function handleMarkRead(id: string) {
    try {
      await apiFetch(`/notifications/${id}/read`, { method: "PATCH" });
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      refresh();
    } catch {
      setStatusMessage("Failed to mark as read");
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/notifications/${id}`, { method: "DELETE" });
      setNotifications((prev) => prev.filter((n) => n._id !== id));
      setSelectedIds((prev) => prev.filter((item) => item !== id));
      refresh();
    } catch {
      setStatusMessage("Failed to delete notification");
    }
  }

  // Bulk Actions
  async function handleMarkSelectedRead() {
    if (!selectedIds.length) return;
    setActionInProgress(true);
    try {
      await Promise.all(
        selectedIds.map((id) => apiFetch(`/notifications/${id}/read`, { method: "PATCH" }))
      );
      setSelectedIds([]);
      setStatusMessage(`Marked ${selectedIds.length} notification(s) as read`);
      refresh();
    } catch {
      setStatusMessage("Error marking selected as read");
    } finally {
      setActionInProgress(false);
    }
  }

  async function handleDeleteSelected() {
    if (!selectedIds.length) return;
    if (!confirm(`Delete ${selectedIds.length} selected notification(s)?`)) return;
    setActionInProgress(true);
    try {
      await Promise.all(
        selectedIds.map((id) => apiFetch(`/notifications/${id}`, { method: "DELETE" }))
      );
      setSelectedIds([]);
      setStatusMessage(`Deleted ${selectedIds.length} notification(s)`);
      refresh();
    } catch {
      setStatusMessage("Error deleting selected notifications");
    } finally {
      setActionInProgress(false);
    }
  }

  async function handleMarkAllRead() {
    setActionInProgress(true);
    try {
      await apiFetch("/notifications/read-all", { method: "PATCH" });
      setStatusMessage("All notifications marked as read");
      refresh();
    } catch {
      setStatusMessage("Failed to mark all as read");
    } finally {
      setActionInProgress(false);
    }
  }

  async function handleClearAllRead() {
    if (!confirm("Clear all previously read notifications from your inbox?")) return;
    setActionInProgress(true);
    try {
      const res = await apiFetch<{ deleted?: number }>("/notifications/read", { method: "DELETE" });
      setStatusMessage(`Cleared ${res?.deleted ?? 0} read notification(s)`);
      refresh();
    } catch {
      setStatusMessage("Failed to clear read notifications");
    } finally {
      setActionInProgress(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200">
            <span>⚡ Realtime Operations Hub</span>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Notifications & Alerts</h1>
          <p className="text-sm text-slate-400">
            Live operational events, stock alerts, orders status, and security audit notices.
          </p>
        </div>

        {/* Global Action Badges */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-sm backdrop-blur-xl">
            <span className="flex h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="font-semibold text-white">{unreadCount}</span>
            <span className="text-slate-400">unread</span>
            <span className="text-slate-600">|</span>
            <span className="font-semibold text-slate-300">{total}</span>
            <span className="text-slate-400">total</span>
          </div>

          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={actionInProgress || unreadCount === 0}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            Mark all read
          </button>

          <button
            type="button"
            onClick={handleClearAllRead}
            disabled={actionInProgress}
            className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-2.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-400/20 disabled:opacity-40"
          >
            Clear read
          </button>
        </div>
      </div>

      {/* Category Pills Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => {
              setActiveCategory(cat.id);
              setPage(1);
            }}
            className={`flex items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
              activeCategory === cat.id
                ? "border-amber-400/40 bg-amber-400/15 text-amber-200 shadow-sm"
                : "border-white/10 bg-slate-900/40 text-slate-400 hover:border-white/20 hover:text-white"
            }`}
          >
            <span>{cat.icon}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4 backdrop-blur-xl">
        <div className="flex flex-1 items-center gap-3 min-w-[260px]">
          <span className="text-slate-500">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notifications by title, SKU, or message..."
            className="w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-xs text-slate-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Priority Filter */}
          <select
            value={activePriority}
            onChange={(e) => {
              setActivePriority(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-xs font-medium text-slate-200 outline-none focus:border-amber-400/40"
          >
            {PRIORITIES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>

          {/* Unread Only Toggle */}
          <button
            type="button"
            onClick={() => {
              setUnreadOnly((prev) => !prev);
              setPage(1);
            }}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition ${
              unreadOnly
                ? "border-amber-400/40 bg-amber-400/20 text-amber-200"
                : "border-white/10 bg-slate-950/70 text-slate-400 hover:text-white"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${unreadOnly ? "bg-amber-400" : "bg-slate-500"}`} />
            Unread only
          </button>
        </div>
      </div>

      {/* Status toast message */}
      {statusMessage && (
        <div className="flex items-center justify-between rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-2.5 text-xs text-amber-200">
          <span>{statusMessage}</span>
          <button type="button" onClick={() => setStatusMessage(null)} className="text-amber-400 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Bulk Action Sticky Bar (visible when items selected) */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 backdrop-blur-xl">
          <div className="text-xs font-semibold text-amber-200">
            {selectedIds.length} notification(s) selected
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleMarkSelectedRead}
              disabled={actionInProgress}
              className="rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20 disabled:opacity-50"
            >
              Mark as Read
            </button>
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={actionInProgress}
              className="rounded-lg border border-rose-400/20 bg-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/30 disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-xs text-slate-400 hover:text-white ml-2"
            >
              Deselect
            </button>
          </div>
        </div>
      )}

      {/* Notifications Feed */}
      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-12 text-center text-sm text-slate-400">
          <span className="inline-block animate-spin mr-2">⏳</span> Loading notification feed…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-6 text-sm text-rose-300">
          {error}
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-slate-900/30 p-12 text-center text-slate-400">
          <div className="text-3xl mb-2">🎉</div>
          <div className="font-semibold text-white">All caught up!</div>
          <div className="text-xs text-slate-500 mt-1">No notifications match your current filters.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* List Header / Bulk Checkbox */}
          <div className="flex items-center justify-between px-2 text-xs font-semibold text-slate-400">
            <label className="flex items-center gap-2 cursor-pointer hover:text-white">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded accent-amber-400"
              />
              <span>Select all on page</span>
            </label>
            <span>Showing {filteredNotifications.length} of {total} items</span>
          </div>

          {filteredNotifications.map((item) => {
            const isSelected = selectedIds.includes(item._id);
            const isCritical = item.priority === "CRITICAL";
            const isHigh = item.priority === "HIGH";

            return (
              <article
                key={item._id}
                className={`group relative flex items-start gap-3.5 rounded-2xl border p-4 transition-all duration-200 ${
                  item.isRead
                    ? "border-white/5 bg-slate-900/30 text-slate-400 hover:border-white/15 hover:bg-slate-900/50"
                    : isCritical
                    ? "border-rose-400/30 bg-rose-950/20 text-slate-200 hover:border-rose-400/40"
                    : "border-white/10 bg-slate-900/70 text-slate-200 hover:border-amber-400/30 shadow-sm"
                }`}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelectOne(item._id)}
                  className="mt-1 h-4 w-4 rounded accent-amber-400 cursor-pointer"
                />

                {/* Priority / Read Indicator Dot */}
                <div className="mt-1.5 flex flex-col items-center">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      item.isRead
                        ? "bg-slate-600"
                        : isCritical
                        ? "bg-rose-500 animate-ping"
                        : isHigh
                        ? "bg-amber-400"
                        : "bg-sky-400"
                    }`}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2
                      className={`text-sm font-semibold truncate ${
                        item.isRead ? "text-slate-300" : "text-white"
                      }`}
                    >
                      {item.title}
                    </h2>
                    <span className="text-[11px] font-mono text-slate-500 whitespace-nowrap">
                      {formatRelativeTime(item.createdAt)}
                    </span>
                  </div>

                  <p className="mt-1 text-xs leading-relaxed text-slate-300">
                    {item.message}
                  </p>

                  {/* Actions & Category Tags */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {item.category && (
                        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase font-semibold tracking-wider text-slate-400">
                          {item.category}
                        </span>
                      )}
                      {item.priority && (
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] uppercase font-semibold tracking-wider ${
                            isCritical
                              ? "border border-rose-500/30 bg-rose-500/10 text-rose-300"
                              : isHigh
                              ? "border border-amber-500/30 bg-amber-500/10 text-amber-300"
                              : "border border-slate-500/30 bg-slate-500/10 text-slate-400"
                          }`}
                        >
                          {item.priority}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {item.link && (
                        <button
                          type="button"
                          onClick={() => router.push(resolveNotificationRoute(item, role))}
                          className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-200 transition hover:bg-amber-400/20"
                        >
                          Open Linked View ↗
                        </button>
                      )}
                      {!item.isRead && (
                        <button
                          type="button"
                          onClick={() => handleMarkRead(item._id)}
                          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
                        >
                          Mark Read
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(item._id)}
                        className="rounded-lg border border-rose-400/10 bg-rose-400/5 px-2 py-1 text-xs text-rose-400 transition hover:bg-rose-400/15"
                        title="Delete notification"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/40 px-5 py-3 backdrop-blur-xl">
          <div className="text-xs text-slate-400">
            Page <span className="font-semibold text-white">{page}</span> of{" "}
            <span className="font-semibold text-white">{totalPages}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
            >
              ← Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
