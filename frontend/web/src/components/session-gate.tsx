"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/api";
import { getRoleHome, type AuthUser, type Role } from "@/lib/acustock";

type SessionGateProps = {
  allowedRoles: Role[];
  children: (user: AuthUser) => ReactNode;
};

export function SessionGate({ allowedRoles, children }: SessionGateProps) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const currentUser = await getCurrentUser();
        if (cancelled) return;

        const routeAllowsAdminAlias = allowedRoles.includes("ADMIN") && currentUser.role === "SUPER_ADMIN";

        if (!allowedRoles.includes(currentUser.role) && !routeAllowsAdminAlias) {
          router.replace(getRoleHome(currentUser.role));
          return;
        }

        setUser(currentUser);
      } catch (sessionError) {
        if (cancelled) return;
        setError(sessionError instanceof Error ? sessionError.message : "Session expired");
        router.replace("/login");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSession();

    return () => {
      cancelled = true;
    };
  }, [allowedRoles, router]);

  if (loading) {
    return (
      <div className="glass-panel flex min-h-[40vh] items-center justify-center rounded-[1.75rem] p-8 text-center text-slate-300">
        Loading secure session…
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="glass-panel flex min-h-[40vh] items-center justify-center rounded-[1.75rem] p-8 text-center text-slate-300">
        Redirecting to login…
      </div>
    );
  }

  return <>{children(user)}</>;
}
