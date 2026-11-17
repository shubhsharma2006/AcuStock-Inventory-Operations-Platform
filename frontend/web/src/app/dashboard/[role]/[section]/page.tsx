import type { Role } from "@/lib/acustock";
import {
  ProductsView,
  StockMovementView,
  StockLedgerView,
  RemainingStockView,
  NotificationsView,
  SettingsView,
} from "@/components/feature-shells";

import AdjustmentsPage from "../adjustments/page";
import ReconciliationPage from "../reconciliation/page";
import KitsPage from "../kits/page";
import SuppliersPerformancePage from "../suppliers/page";
import ValuationPage from "../valuation/page";
import ImportHistoryPage from "../import-history/page";
import MobileWarehouseScanPage from "../scan/page";
import ReorderHubPage from "../reorder-hub/page";

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
    case "adjustments":
      return <AdjustmentsPage />;
    case "reconciliation":
      return <ReconciliationPage />;
    case "kits":
      return <KitsPage />;
    case "suppliers":
      return <SuppliersPerformancePage />;
    case "valuation":
      return <ValuationPage />;
    case "import-history":
      return <ImportHistoryPage />;
    case "scan":
      return <MobileWarehouseScanPage />;
    case "reorder-hub":
      return <ReorderHubPage />;
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
