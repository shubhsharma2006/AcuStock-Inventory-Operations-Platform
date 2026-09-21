import type { Role } from "@/lib/acustock";
import { SuperAdminDashboardView, ManagerDashboardView, UserDashboardView } from "@/components/dashboard-pages";
import { AdminDashboardView } from "@/components/admin-dashboard-view";

function normalizeRole(value: string | undefined | null): Role | null {
  if (!value) return null;
  const upper = value.toUpperCase().replace(/-/g, "_");
  if (upper === "SUPER_ADMIN" || upper === "ADMIN" || upper === "MANAGER" || upper === "USER") {
    return upper as Role;
  }
  return null;
}

export default async function RoleDashboardRoute({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role: rawRole } = await params;
  const role = normalizeRole(rawRole);

  if (!role) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8 text-center text-slate-300">
        Unknown dashboard role: <code>{rawRole}</code>
      </div>
    );
  }

  if (role === "SUPER_ADMIN") return <SuperAdminDashboardView />;
  if (role === "ADMIN") return <AdminDashboardView />;
  if (role === "MANAGER") return <ManagerDashboardView />;
  return <UserDashboardView />;
}
