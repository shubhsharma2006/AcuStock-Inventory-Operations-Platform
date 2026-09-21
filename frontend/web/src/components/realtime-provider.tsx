"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import type { AuthUser } from "@/lib/acustock";

type RealtimeState = ReturnType<typeof useRealtimeSync>;

const RealtimeContext = createContext<RealtimeState | null>(null);

export function RealtimeProvider({ user, children }: { user: AuthUser; children: ReactNode }) {
  const realtime = useRealtimeSync({ role: user.role, userId: user._id });

  return <RealtimeContext.Provider value={realtime}>{children}</RealtimeContext.Provider>;
}

export function useRealtimeState() {
  const context = useContext(RealtimeContext);
  if (!context) {
    return {
      connected: false,
      refreshToken: 0,
      refresh: () => {},
      socket: null,
    } as RealtimeState;
  }
  return context;
}
