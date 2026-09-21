"use client";

import type { ReactNode } from "react";
import type { Role } from "@/lib/acustock";
import { SessionProvider } from "@/hooks/use-session";
import { WorkspaceProvider } from "@/hooks/use-workspace";
import { RealtimeProvider } from "@/components/realtime-provider";
import { DashboardShell } from "@/components/dashboard-shell";
import { useSession } from "@/hooks/use-session";

function DashboardLayoutInner({ children }: { children: ReactNode }) {
  const { user } = useSession();
  return (
    <RealtimeProvider user={user!}>
      <DashboardShell>{children}</DashboardShell>
    </RealtimeProvider>
  );
}

export default function DashboardRoleLayout({ children }: { children: ReactNode }) {
  const allowedRoles: Role[] = ["SUPER_ADMIN", "ADMIN", "MANAGER", "USER"];

  return (
    <SessionProvider allowedRoles={allowedRoles}>
      <WorkspaceProvider>
        <DashboardLayoutInner>{children}</DashboardLayoutInner>
      </WorkspaceProvider>
    </SessionProvider>
  );
}
