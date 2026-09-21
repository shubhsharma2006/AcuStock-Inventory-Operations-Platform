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

    ["stock-update", "product-update", "notification", "low-stock-alert", "user-update", "company-update", "permission-update"].forEach((eventName) => {
      socket.on(eventName, bump);
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
