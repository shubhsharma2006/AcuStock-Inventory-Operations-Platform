"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

/* ─── Types ──────────────────────────────────────────────────────────────── */

export interface Notification {
  _id: string;
  type: string;
  title: string;
  message: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  isRead: boolean;
  link?: string;
  createdAt: string;
}

interface NotifResponse {
  notifications: Notification[];
  total: number;
  unread: number;
}

/* ─── Priority styles ────────────────────────────────────────────────────── */

const priorityDot: Record<string, string> = {
  LOW:      "bg-slate-500",
  MEDIUM:   "bg-blue-400",
  HIGH:     "bg-amber-400",
  CRITICAL: "bg-red-500 animate-pulse",
};

/* ─── Time formatter ─────────────────────────────────────────────────────── */

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ─── Notification Popover ───────────────────────────────────────────────── */

interface NotificationPopoverProps {
  basePath: string;
}

export function NotificationPopover({ basePath }: NotificationPopoverProps) {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  /* Fetch notifications when opened */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);

    apiFetch<NotifResponse>("/notifications?limit=15")
      .then(data => {
        if (cancelled) return;
        setNotifs(data.notifications ?? []);
        setUnread(data.unread ?? 0);
      })
      .catch(() => { /* swallow */ })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [open]);

  /* Poll unread count every 60 s when popover is closed */
  useEffect(() => {
    let cancelled = false;

    function pollCount() {
      apiFetch<NotifResponse>("/notifications?limit=1")
        .then(data => { if (!cancelled) setUnread(data.unread ?? 0); })
        .catch(() => {});
    }

    pollCount();
    const id = setInterval(pollCount, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  /* Mark all as read */
  async function markAllRead() {
    if (marking) return;
    setMarking(true);
    try {
      await apiFetch("/notifications/mark-all-read", { method: "PUT" });
      setNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnread(0);
    } catch { /* swallow */ } finally {
      setMarking(false);
    }
  }

  /* Mark single as read */
  async function markOneRead(id: string) {
    try {
      await apiFetch(`/notifications/${id}/read`, { method: "PUT" });
      setNotifs(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
      setUnread(prev => Math.max(0, prev - 1));
    } catch { /* swallow */ }
  }

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        ref={buttonRef}
        type="button"
        id="notification-bell-btn"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(prev => !prev)}
        className="relative rounded-lg border border-white/10 p-2 text-slate-400 transition hover:bg-white/5 hover:text-white"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-slate-950">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Popover Panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-12 z-50 w-96 overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/50"
          role="dialog"
          aria-label="Notifications"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">Notifications</h3>
              {unread > 0 && (
                <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                  {unread} unread
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                disabled={marking}
                className="text-[11px] text-slate-400 hover:text-amber-400 transition disabled:opacity-40"
              >
                {marking ? "Marking…" : "Mark all read"}
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <svg className="h-6 w-6 animate-spin text-slate-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : notifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <svg className="mb-3 h-8 w-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                <p className="text-sm text-slate-500">All caught up!</p>
                <p className="text-xs text-slate-600">No notifications right now</p>
              </div>
            ) : (
              notifs.map(n => (
                <div
                  key={n._id}
                  className={`group relative border-b border-white/5 px-4 py-3 transition-colors hover:bg-white/5 ${!n.isRead ? "bg-white/[0.03]" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Priority dot */}
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${priorityDot[n.priority] ?? priorityDot.LOW}`} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm leading-snug ${n.isRead ? "text-slate-400" : "font-semibold text-white"}`}>
                          {n.title}
                        </p>
                        <span className="shrink-0 text-[11px] text-slate-600">{relativeTime(n.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{n.message}</p>
                    </div>
                  </div>

                  {/* Mark as read button */}
                  {!n.isRead && (
                    <button
                      type="button"
                      onClick={() => markOneRead(n._id)}
                      className="absolute right-2 top-2 hidden rounded p-1 text-slate-600 hover:text-amber-400 group-hover:block"
                      aria-label="Mark as read"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-white/10 px-4 py-3">
            <Link
              href={`${basePath}/notifications`}
              onClick={() => setOpen(false)}
              className="block w-full rounded-lg bg-white/5 py-2 text-center text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
