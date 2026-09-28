"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { ACUSTOCK_SOCKET_URL, type Role } from "@/lib/acustock";

type UseRealtimeSyncOptions = {
  role?: Role;
  userId?: string;
};

export function useRealtimeSync({ role, userId }: UseRealtimeSyncOptions) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!role || !userId) return;

    const socket = io(ACUSTOCK_SOCKET_URL, {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    const bump = () => setRefreshToken((value) => value + 1);

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("authenticate");
    });

    socket.on("authenticated", () => {
      socket.emit("join-role", role);
      socket.emit("join-user", userId);
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    ["stock-update", "product-update", "user-update", "company-update", "permission-update"].forEach((eventName) => {
      socket.on(eventName, bump);
    });

    socket.on("notification", (payload?: unknown) => {
      bump();
      if (typeof window !== "undefined" && payload) {
        window.dispatchEvent(new CustomEvent("acustock:notification", { detail: payload }));
      }
    });

    socket.on("low-stock-alert", (payload?: any) => {
      bump();
      if (typeof window !== "undefined" && payload) {
        window.dispatchEvent(
          new CustomEvent("acustock:notification", {
            detail: {
              title: "Low Stock Alert",
              message: payload?.name ? `${payload.name} has fallen below minimum threshold` : "An item is running low on stock",
              priority: "HIGH",
              type: "low_stock",
            },
          })
        );
      }
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [role, userId]);

  return {
    connected,
    refreshToken,
    refresh: () => setRefreshToken((value) => value + 1),
  };
}
