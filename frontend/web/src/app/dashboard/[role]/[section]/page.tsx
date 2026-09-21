import type { Role } from "@/lib/acustock";
import {
  ProductsView,
  StockMovementView,
  StockLedgerView,
  RemainingStockView,
  NotificationsView,
  SettingsView,
} from "@/components/feature-shells";

function normalizeRole(value: string | undefined | null): Role | null {
  if (!value) return null;
  const upper = value.toUpperCase().replace(/-/g, "_");
  if (upper === "SUPER_ADMIN" || upper === "ADMIN" || upper === "MANAGER" || upper === "USER") {
    return upper as Role;
  }
  return null;
}

export default async function RoleSectionRoute({
  params,
}: {
  params: Promise<{ role: string; section: string }>;
}) {
  const { role: rawRole, section } = await params;
  const role = normalizeRole(rawRole);

  if (!role) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8 text-center text-slate-300">
        Unknown dashboard role: <code>{rawRole}</code>
      </div>
    );
  }

  switch (section) {
    case "products":
      return <ProductsView role={role} />;
    case "stock-in":
      return <StockMovementView role={role} mode="IN" />;
    case "stock-out":
      return <StockMovementView role={role} mode="OUT" />;
    case "stock-ledger":
      return <StockLedgerView role={role} />;
    case "remaining-stock":
      return <RemainingStockView role={role} />;
    case "notifications":
      return <NotificationsView role={role} />;
    case "settings":
      return <SettingsView role={role} />;
    default:
      return (
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8 text-center text-slate-300">
          Section &quot;{section}&quot; is active under {role} role workspace.
        </div>
      );
  }
}
