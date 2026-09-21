import { RemainingStockView } from "@/components/feature-shells";
import type { Role } from "@/lib/acustock";

function normalizeRole(value: string | undefined | null): Role | null {
  if (!value) return null;
  const upper = value.toUpperCase().replace(/-/g, "_");
  if (upper === "SUPER_ADMIN" || upper === "ADMIN" || upper === "MANAGER" || upper === "USER") {
    return upper as Role;
  }
  return null;
}

export default async function RemainingStockRoute({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role: rawRole } = await params;
  const role = normalizeRole(rawRole);
  if (!role) return <div className="glass-panel rounded-[1.75rem] p-8 text-slate-300">Unknown role: {rawRole}</div>;
  return <RemainingStockView role={role} />;
}
