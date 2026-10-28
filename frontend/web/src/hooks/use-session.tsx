"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/api";
import { getRoleHome, type AuthUser, type Role } from "@/lib/acustock";

type SessionState = {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const STORAGE_KEY = "acustock_session_user";

function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function setStoredUser(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  try {
    if (user) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
}

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
  const routerRef = useRef(router);
  routerRef.current = router;

  const allowedRolesRef = useRef(allowedRoles);
  allowedRolesRef.current = allowedRoles;

  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  function refresh() {
    setRefreshKey((k) => k + 1);
  }

  useEffect(() => {
    setMounted(true);
    const cached = getStoredUser();
    if (cached) {
      setUser(cached);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const stored = getStoredUser();
        // Only trigger visible blocking loader if we don't have any cached or stored user yet
        if (!stored) {
          setLoading(true);
        }

        const currentUser = await getCurrentUser();
        if (cancelled) return;

        setStoredUser(currentUser);

        const currentAllowed = allowedRolesRef.current;
        const routeAllowsAdminAlias =
          currentAllowed.includes("ADMIN") && currentUser.role === "SUPER_ADMIN";

        if (!currentAllowed.includes(currentUser.role) && !routeAllowsAdminAlias) {
          routerRef.current.replace(getRoleHome(currentUser.role));
          return;
        }

        setUser(currentUser);
        setError(null);
      } catch (sessionError) {
        if (cancelled) return;
        setStoredUser(null);
        setError(
          sessionError instanceof Error ? sessionError.message : "Session expired"
        );
        routerRef.current.replace("/login");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSession();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (!mounted || (loading && !user)) {
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
