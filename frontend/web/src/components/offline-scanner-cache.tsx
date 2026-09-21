"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type QueuedScan = {
  id: string;
  serial: string;
  productId: string;
  action: "IN" | "OUT";
  timestamp: string;
};

export function OfflineScannerCache() {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [queue, setQueue] = useState<QueuedScan[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem("acustock-offline-queue");
    if (!saved) return [];
    try {
      return JSON.parse(saved) as QueuedScan[];
    } catch {
      return [];
    }
  });
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      autoSyncQueue();
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  async function autoSyncQueue() {
    const saved = localStorage.getItem("acustock-offline-queue");
    if (!saved) return;

    let items: QueuedScan[] = [];
    try {
      items = JSON.parse(saved);
    } catch {
      return;
    }

    if (!items.length) return;

    setIsSyncing(true);
    const remaining: QueuedScan[] = [];

    for (const item of items) {
      try {
        await apiFetch(`/stock/${item.action.toLowerCase()}`, {
          method: "POST",
          body: JSON.stringify({
            productId: item.productId,
            quantity: 1,
            serialNumbers: [item.serial],
          }),
        });
      } catch {
        remaining.push(item);
      }
    }

    setQueue(remaining);
    localStorage.setItem("acustock-offline-queue", JSON.stringify(remaining));
    setIsSyncing(false);
  }

  if (isOnline && queue.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/90 p-4 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            isOnline ? "bg-emerald-400 animate-pulse" : "bg-amber-400 animate-bounce"
          }`}
        />
        <span className="font-semibold text-white">
          {isOnline ? "Online — Sync Ready" : "Offline Mode (Low Wi-Fi)"}
        </span>
      </div>

      {queue.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 font-mono text-xs font-bold text-amber-200">
            {queue.length} Queued
          </span>

          <button
            type="button"
            disabled={!isOnline || isSyncing}
            onClick={autoSyncQueue}
            className="rounded-lg bg-white px-3 py-1 text-xs font-bold text-slate-950 hover:bg-slate-200 disabled:opacity-50"
          >
            {isSyncing ? "Syncing..." : "Sync Now"}
          </button>
        </div>
      )}
    </div>
  );
}
