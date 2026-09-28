"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface LiveToastItem {
  id: string;
  title: string;
  message: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  link?: string;
  icon?: string;
  timestamp: number;
}

const priorityStyles = {
  CRITICAL: "border-rose-500/40 bg-rose-950/80 shadow-rose-950/50 text-rose-200",
  HIGH:     "border-amber-500/40 bg-amber-950/80 shadow-amber-950/50 text-amber-200",
  MEDIUM:   "border-sky-500/40 bg-slate-900/90 shadow-sky-950/30 text-sky-200",
  LOW:      "border-white/10 bg-slate-900/90 shadow-black/50 text-slate-200",
};

const priorityDot = {
  CRITICAL: "bg-rose-500 animate-ping",
  HIGH:     "bg-amber-400 animate-pulse",
  MEDIUM:   "bg-sky-400",
  LOW:      "bg-slate-400",
};

export function LiveToastContainer() {
  const [toasts, setToasts] = useState<LiveToastItem[]>([]);
  const router = useRouter();

  useEffect(() => {
    function handleNotification(e: Event) {
      const customEvent = e as CustomEvent<any>;
      const detail = customEvent.detail;
      if (!detail || !detail.title) return;

      const newToast: LiveToastItem = {
        id: detail._id || `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: detail.title,
        message: detail.message || "",
        priority: detail.priority || "MEDIUM",
        link: detail.link,
        icon: detail.icon,
        timestamp: Date.now(),
      };

      setToasts((prev) => [newToast, ...prev.slice(0, 3)]); // Keep max 4 visible
    }

    window.addEventListener("acustock:notification", handleNotification);
    return () => window.removeEventListener("acustock:notification", handleNotification);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((t) => now - t.timestamp < 6000));
    }, 1000);
    return () => clearInterval(timer);
  }, [toasts.length]);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 p-2 sm:bottom-6 sm:right-6"
    >
      {toasts.map((toast) => {
        const priorityKey = toast.priority || "MEDIUM";
        const colorClasses = priorityStyles[priorityKey] || priorityStyles.LOW;
        const dotColor = priorityDot[priorityKey] || priorityDot.LOW;

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-xl backdrop-blur-xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-3 ${colorClasses}`}
          >
            <div className="relative mt-1 flex h-2 w-2 shrink-0 items-center justify-center">
              <span className={`absolute h-2 w-2 rounded-full ${dotColor}`} />
            </div>

            <div
              className={`min-w-0 flex-1 ${toast.link ? "cursor-pointer" : ""}`}
              onClick={() => {
                if (toast.link) {
                  router.push(toast.link);
                  removeToast(toast.id);
                }
              }}
            >
              <div className="flex items-center gap-1.5">
                {toast.icon && <span className="text-sm">{toast.icon}</span>}
                <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                  {toast.title}
                </h4>
              </div>
              <p className="mt-1 line-clamp-2 text-xs opacity-90">{toast.message}</p>
              {toast.link && (
                <span className="mt-2 inline-block text-[11px] font-semibold text-amber-300 hover:underline">
                  View details →
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Dismiss toast"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
