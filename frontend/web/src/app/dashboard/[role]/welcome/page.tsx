import { WelcomeView } from "@/components/welcome-view";
import type { Role } from "@/lib/acustock";

function normalizeRole(value: string | undefined | null): Role | null {
  if (!value) return null;
  const upper = value.toUpperCase().replace(/-/g, "_");
  if (upper === "SUPER_ADMIN" || upper === "ADMIN" || upper === "MANAGER" || upper === "USER") {
    return upper as Role;
  }
  return null;
}

export default async function WelcomeRoute({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role: rawRole } = await params;
  const role = normalizeRole(rawRole);
  if (!role) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8 text-center text-slate-300">
        Unknown role: {rawRole}
      </div>
    );
  }

  return <WelcomeView role={role} />;
}
