"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/api";
import { getRoleHome, type AuthUser, type Role } from "@/lib/acustock";

type SessionState = {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const SessionContext = createContext<SessionState>({
  user: null,
  loading: true,
  error: null,
  refresh: () => {},
});

export function useSession() {
  return useContext(SessionContext);
}

export function SessionProvider({
  allowedRoles,
  children,
}: {
  allowedRoles: Role[];
  children: ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  function refresh() {
    setRefreshKey((k) => k + 1);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        setLoading(true);
        const currentUser = await getCurrentUser();
        if (cancelled) return;

        const routeAllowsAdminAlias =
          allowedRoles.includes("ADMIN") && currentUser.role === "SUPER_ADMIN";

        if (!allowedRoles.includes(currentUser.role) && !routeAllowsAdminAlias) {
          router.replace(getRoleHome(currentUser.role));
          return;
        }

        setUser(currentUser);
        setError(null);
      } catch (sessionError) {
        if (cancelled) return;
        setError(
          sessionError instanceof Error ? sessionError.message : "Session expired"
        );
        router.replace("/login");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSession();

    return () => {
      cancelled = true;
    };
  }, [allowedRoles, router, refreshKey]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-300 border-t-transparent" />
          <span className="text-sm text-slate-400">Loading session…</span>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="text-sm text-slate-400">Redirecting to login…</div>
      </div>
    );
  }

  return (
    <SessionContext.Provider value={{ user, loading, error, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}
