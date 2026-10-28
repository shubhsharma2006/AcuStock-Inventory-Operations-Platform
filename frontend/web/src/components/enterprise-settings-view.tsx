"use client";

import { useEffect, useState } from "react";
import type { Role } from "@/lib/acustock";
import { apiFetch } from "@/lib/api";
import {
  useAccountStats,
  useProductsData,
  useProfileData,
  useRolePermissions,
  useSerialPolicy,
} from "@/hooks/use-feature-data";
import { useRealtimeState } from "@/components/realtime-provider";
import TwoFactorSettings from "@/components/TwoFactorSettings";
import { WhatsAppSimulatorModal } from "@/components/ai/whatsapp-simulator-modal";

interface WarehouseOption {
  _id: string;
  name: string;
  code?: string;
  isDefault?: boolean;
}

interface TenantOrganizationData {
  _id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  branding?: {
    legalName?: string;
    taxId?: string;
    supportEmail?: string;
    phone?: string;
    website?: string;
    address?: {
      street?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      country?: string;
    };
    invoiceTerms?: string;
  };
  settings?: {
    timezone?: string;
    currency?: string;
    dateFormat?: string;
    valuationMethod?: "FIFO" | "WEIGHTED_AVG";
    negativeStockAllowed?: boolean;
    lowStockAlertThreshold?: number;
    invoicePrefix?: string;
    poPrefix?: string;
    transferPrefix?: string;
    grnPrefix?: string;
    defaultWarehouseId?: any;
    whatsappAlertsEnabled?: boolean;
    lowStockEmailAlerts?: boolean;
    dailyDigestEnabled?: boolean;
  };
}

export function EnterpriseSettingsView({ role }: { role: Role }) {
  const { refreshToken, refresh } = useRealtimeState();
  const { profile, loading: profileLoading, error: profileError } = useProfileData(refreshToken);
  const { stats, loading: statsLoading } = useAccountStats(refreshToken);
  const { items: products } = useProductsData(refreshToken);

  const [activeTab, setActiveTab] = useState<
    "organization" | "operations" | "security" | "alerts" | "serials" | "permissions" | "compliance"
  >("organization");

  // Organization settings state
  const [orgData, setOrgData] = useState<TenantOrganizationData | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);

  // Organization Form State
  const [companyName, setCompanyName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [country, setCountry] = useState("India");
  const [currency, setCurrency] = useState("INR");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [invoiceTerms, setInvoiceTerms] = useState("");

  // Operations Form State
  const [valuationMethod, setValuationMethod] = useState<"FIFO" | "WEIGHTED_AVG">("FIFO");
  const [negativeStockAllowed, setNegativeStockAllowed] = useState(false);
  const [lowStockAlertThreshold, setLowStockAlertThreshold] = useState(10);
  const [invoicePrefix, setInvoicePrefix] = useState("INV-2026-");
  const [poPrefix, setPoPrefix] = useState("PO-2026-");
  const [transferPrefix, setTransferPrefix] = useState("TRF-");
  const [grnPrefix, setGrnPrefix] = useState("GRN-");
  const [defaultWarehouseId, setDefaultWarehouseId] = useState("");

  // Alerts Form State
  const [lowStockEmailAlerts, setLowStockEmailAlerts] = useState(true);
  const [whatsappAlertsEnabled, setWhatsappAlertsEnabled] = useState(false);
  const [dailyDigestEnabled, setDailyDigestEnabled] = useState(false);

  // Status feedback
  const [savingOrg, setSavingOrg] = useState(false);
  const [orgSuccessMsg, setOrgSuccessMsg] = useState<string | null>(null);
  const [savingOps, setSavingOps] = useState(false);
  const [opsSuccessMsg, setOpsSuccessMsg] = useState<string | null>(null);
  const [savingAlerts, setSavingAlerts] = useState(false);
  const [alertsSuccessMsg, setAlertsSuccessMsg] = useState<string | null>(null);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);

  // Export states
  const [exportingType, setExportingType] = useState<string | null>(null);

  const canEditAdminSettings = role === "ADMIN" || role === "SUPER_ADMIN";
  const canEditManagerSettings = role === "ADMIN" || role === "SUPER_ADMIN" || role === "MANAGER";

  // Load Organization Settings and Warehouses
  useEffect(() => {
    let mounted = true;
    setOrgLoading(true);

    Promise.all([
      apiFetch<any>("/settings/organization").catch(() => null),
      apiFetch<any>("/warehouses").catch(() => []),
    ])
      .then(([tenantRes, whList]) => {
        if (!mounted) return;
        if (tenantRes) {
          setOrgData(tenantRes as TenantOrganizationData);
          setCompanyName(tenantRes.name || "AcuStock Enterprise");
          setLegalName(tenantRes.branding?.legalName || "");
          setTaxId(tenantRes.branding?.taxId || "");
          setSupportEmail(tenantRes.branding?.supportEmail || "");
          setPhone(tenantRes.branding?.phone || "");
          setWebsite(tenantRes.branding?.website || "");
          setStreet(tenantRes.branding?.address?.street || "");
          setCity(tenantRes.branding?.address?.city || "");
          setStateName(tenantRes.branding?.address?.state || "");
          setZipCode(tenantRes.branding?.address?.zipCode || "");
          setCountry(tenantRes.branding?.address?.country || "India");
          setCurrency(tenantRes.settings?.currency || "INR");
          setTimezone(tenantRes.settings?.timezone || "Asia/Kolkata");
          setInvoiceTerms(tenantRes.branding?.invoiceTerms || "");

          setValuationMethod(tenantRes.settings?.valuationMethod || "FIFO");
          setNegativeStockAllowed(!!tenantRes.settings?.negativeStockAllowed);
          setLowStockAlertThreshold(tenantRes.settings?.lowStockAlertThreshold || 10);
          setInvoicePrefix(tenantRes.settings?.invoicePrefix || "INV-2026-");
          setPoPrefix(tenantRes.settings?.poPrefix || "PO-2026-");
          setTransferPrefix(tenantRes.settings?.transferPrefix || "TRF-");
          setGrnPrefix(tenantRes.settings?.grnPrefix || "GRN-");

          const defWhId = tenantRes.settings?.defaultWarehouseId?._id || tenantRes.settings?.defaultWarehouseId || "";
          setDefaultWarehouseId(defWhId);

          setLowStockEmailAlerts(tenantRes.settings?.lowStockEmailAlerts ?? true);
          setWhatsappAlertsEnabled(!!tenantRes.settings?.whatsappAlertsEnabled);
          setDailyDigestEnabled(!!tenantRes.settings?.dailyDigestEnabled);
        }

        const validWhs = Array.isArray(whList) ? whList : (whList as any)?.warehouses || [];
        setWarehouses(validWhs);
        if (!defaultWarehouseId && validWhs.length > 0) {
          const def = validWhs.find((w: WarehouseOption) => w.isDefault) || validWhs[0];
          setDefaultWarehouseId(def._id);
        }
      })
      .catch((err) => {
        if (mounted) setOrgError(err.message || "Failed to load configuration");
      })
      .finally(() => {
        if (mounted) setOrgLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [refreshToken]);

  // Save Organization Tab
  async function handleSaveOrganization(e: React.FormEvent) {
    e.preventDefault();
    setSavingOrg(true);
    setOrgSuccessMsg(null);
    setOrgError(null);

    try {
      const payload = {
        name: companyName,
        branding: {
          legalName,
          taxId,
          supportEmail,
          phone,
          website,
          address: { street, city, state: stateName, zipCode, country },
          invoiceTerms,
        },
        settings: {
          currency,
          timezone,
        },
      };

      const res = await apiFetch<any>("/settings/organization", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      setOrgSuccessMsg("Organization details and tax profiles saved successfully!");
      if (res?.tenant) setOrgData(res.tenant as TenantOrganizationData);
      refresh();
      setTimeout(() => setOrgSuccessMsg(null), 5000);
    } catch (err: any) {
      setOrgError(err.message || "Failed to save organization settings");
    } finally {
      setSavingOrg(false);
    }
  }

  // Save Operations Tab
  async function handleSaveOperations(e: React.FormEvent) {
    e.preventDefault();
    setSavingOps(true);
    setOpsSuccessMsg(null);
    setOrgError(null);

    try {
      const payload = {
        settings: {
          valuationMethod,
          negativeStockAllowed,
          lowStockAlertThreshold: Number(lowStockAlertThreshold) || 10,
          invoicePrefix,
          poPrefix,
          transferPrefix,
          grnPrefix,
          defaultWarehouseId: defaultWarehouseId || undefined,
        },
      };

      const res = await apiFetch<any>("/settings/organization", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      setOpsSuccessMsg("Inventory valuation & sequence rules updated successfully!");
      if (res?.tenant) setOrgData(res.tenant as TenantOrganizationData);
      refresh();
      setTimeout(() => setOpsSuccessMsg(null), 5000);
    } catch (err: any) {
      setOrgError(err.message || "Failed to save operational settings");
    } finally {
      setSavingOps(false);
    }
  }

  // Save Alerts Tab
  async function handleSaveAlerts(e: React.FormEvent) {
    e.preventDefault();
    setSavingAlerts(true);
    setAlertsSuccessMsg(null);
    setOrgError(null);

    try {
      const payload = {
        settings: {
          lowStockEmailAlerts,
          whatsappAlertsEnabled,
          dailyDigestEnabled,
        },
      };

      const res = await apiFetch<any>("/settings/organization", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      setAlertsSuccessMsg("Notification & WhatsApp alert rules updated successfully!");
      if (res?.tenant) setOrgData(res.tenant as TenantOrganizationData);
      refresh();
      setTimeout(() => setAlertsSuccessMsg(null), 5000);
    } catch (err: any) {
      setOrgError(err.message || "Failed to update alert rules");
    } finally {
      setSavingAlerts(false);
    }
  }

  // Compliance CSV Exporter
  async function handleExportData(type: "products" | "ledger" | "audit") {
    setExportingType(type);
    try {
      let csvContent = "";
      let filename = "";

      if (type === "products") {
        const data = await apiFetch<any>("/items");
        const list: any[] = Array.isArray(data) ? data : data?.items || [];
        const headers = ["Item Name", "SKU / Code", "Category", "Unit", "Price", "Min Stock", "Serial Enabled"];
        const rows = list.map((item: any) => [
          `"${(item.name || "").replace(/"/g, '""')}"`,
          `"${item.shortName || item.sku || ""}"`,
          `"${item.category || "General"}"`,
          `"${item.unit || "PCS"}"`,
          item.price || item.unitPrice || 0,
          item.minStock || item.reorderPoint || 0,
          item.serialPolicy?.enableSerial ? "YES" : "NO",
        ]);
        csvContent = [headers.join(","), ...rows.map((r: any) => r.join(","))].join("\n");
        filename = `AcuStock_Products_Catalog_${new Date().toISOString().slice(0, 10)}.csv`;
      } else if (type === "ledger") {
        const data = await apiFetch<any>("/stock-ledger?limit=1000");
        const list: any[] = Array.isArray(data) ? data : data?.data || [];
        const headers = ["Date", "Item Name", "Transaction Type", "Quantity", "Balance After", "Warehouse", "Reference"];
        const rows = list.map((entry: any) => [
          `"${new Date(entry.createdAt).toISOString()}"`,
          `"${(entry.item?.name || entry.itemName || "").replace(/"/g, '""')}"`,
          `"${entry.type || entry.transactionType || ""}"`,
          entry.quantity || 0,
          entry.balanceAfter || entry.currentStock || 0,
          `"${(entry.warehouse?.name || "").replace(/"/g, '""')}"`,
          `"${(entry.reference || entry.invoiceNo || "").replace(/"/g, '""')}"`,
        ]);
        csvContent = [headers.join(","), ...rows.map((r: any) => r.join(","))].join("\n");
        filename = `AcuStock_Stock_Ledger_${new Date().toISOString().slice(0, 10)}.csv`;
      } else if (type === "audit") {
        const data = await apiFetch<any>("/audit-logs?limit=1000");
        const list: any[] = Array.isArray(data) ? data : data?.logs || [];
        const headers = ["Timestamp", "Action", "Actor", "Role", "Severity", "Entity Type", "IP Address"];
        const rows = list.map((log: any) => [
          `"${new Date(log.createdAt).toISOString()}"`,
          `"${log.action || ""}"`,
          `"${(log.performedByName || log.user?.name || "").replace(/"/g, '""')}"`,
          `"${log.performedByRole || log.user?.role || ""}"`,
          `"${log.severity || "INFO"}"`,
          `"${log.entityType || ""}"`,
          `"${log.ipAddress || ""}"`,
        ]);
        csvContent = [headers.join(","), ...rows.map((r: any) => r.join(","))].join("\n");
        filename = `AcuStock_Audit_Trail_${new Date().toISOString().slice(0, 10)}.csv`;
      }

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert(`Export failed: ${err.message || "Could not retrieve data"}`);
    } finally {
      setExportingType(null);
    }
  }

  const tabs = [
    { key: "organization", label: "Organization & Profile", icon: "🏢" },
    { key: "operations", label: "Inventory Defaults", icon: "⚙️" },
    { key: "security", label: "Security & Sessions", icon: "🛡️" },
    { key: "alerts", label: "Alerts & WhatsApp", icon: "🔔" },
    canEditManagerSettings ? { key: "serials", label: "Serial Policies", icon: "🏷️" } : null,
    canEditAdminSettings ? { key: "permissions", label: "Role Permissions", icon: "👥" } : null,
    { key: "compliance", label: "Data & Compliance", icon: "💾" },
  ].filter(Boolean) as {
    key: "organization" | "operations" | "security" | "alerts" | "serials" | "permissions" | "compliance";
    label: string;
    icon: string;
  }[];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <section className="glass-panel relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-r from-slate-950/90 via-slate-900/80 to-indigo-950/40 p-6 lg:p-8 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              Enterprise Administration
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-white lg:text-4xl">
              System Settings & Configuration
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
              Configure tenant profile, inventory accounting methods, automated sequence prefixes,
              communication gateways, and role-based access control.
            </p>
          </div>

          {stats && !statsLoading ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4 backdrop-blur-md">
              <div className="border-r border-white/10 pr-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Tenant Plan</div>
                <div className="mt-0.5 text-sm font-bold text-amber-300 uppercase">{orgData?.plan || "Enterprise"}</div>
              </div>
              <div className="border-r border-white/10 pr-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Active Staff</div>
                <div className="mt-0.5 text-sm font-bold text-white">
                  {(stats.users?.active || 0) + (stats.managers?.active || 0)} / {(stats.users?.total || 0) + (stats.managers?.total || 0)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Valuation</div>
                <div className="mt-0.5 text-sm font-bold text-emerald-400">{valuationMethod}</div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Tab Strip */}
        <div className="mt-8 flex flex-wrap gap-2 border-t border-white/10 pt-6">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-white text-slate-950 shadow-lg shadow-white/10"
                    : "border border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Global Error Notice */}
      {orgError && (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          ⚠️ {orgError}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 1: ORGANIZATION & TAX PROFILE */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === "organization" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <form onSubmit={handleSaveOrganization} className="glass-panel rounded-2xl border border-white/10 bg-slate-950/60 p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">Company Identity & Registration</h3>
                  <p className="text-xs text-slate-400">Details printed on tax invoices, purchase orders, and stock manifests</p>
                </div>
                {orgSuccessMsg && (
                  <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 border border-emerald-500/30">
                    ✓ {orgSuccessMsg}
                  </span>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">Trading Name</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                    className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-400/60 focus:outline-none"
                    placeholder="e.g. AcuStock Technologies"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">Legal Registered Name</label>
                  <input
                    type="text"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-400/60 focus:outline-none"
                    placeholder="e.g. AcuStock Technologies Pvt. Ltd."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">GSTIN / VAT / Tax ID</label>
                  <input
                    type="text"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm font-mono uppercase text-amber-300 placeholder-slate-500 focus:border-amber-400/60 focus:outline-none"
                    placeholder="e.g. 27AABCU9603R1ZM"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">Official Website</label>
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-400/60 focus:outline-none"
                    placeholder="https://acustock.com"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">Support / Billing Email</label>
                  <input
                    type="email"
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-400/60 focus:outline-none"
                    placeholder="billing@acustock.com"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">Contact Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-400/60 focus:outline-none"
                    placeholder="+91 98765 43210"
                  />
                </div>
              </div>

              {/* Address */}
              <div className="border-t border-white/10 pt-4 space-y-4">
                <h4 className="text-sm font-semibold text-slate-200">Registered Office Address</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Street / Suite</label>
                    <input
                      type="text"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-400/60 focus:outline-none"
                      placeholder="Unit 402, Business Bay, Central Hub"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">City</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                      placeholder="Mumbai"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">State / Province</label>
                    <input
                      type="text"
                      value={stateName}
                      onChange={(e) => setStateName(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                      placeholder="Maharashtra"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">PIN / Postal Code</label>
                    <input
                      type="text"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm font-mono text-white focus:border-amber-400/60 focus:outline-none"
                      placeholder="400051"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Country</label>
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                      placeholder="India"
                    />
                  </div>
                </div>
              </div>

              {/* Localization & Terms */}
              <div className="border-t border-white/10 pt-4 space-y-4">
                <h4 className="text-sm font-semibold text-slate-200">Currency & Invoice Terms</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Base Currency</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                    >
                      <option value="INR">INR (₹ - Indian Rupee)</option>
                      <option value="USD">USD ($ - US Dollar)</option>
                      <option value="EUR">EUR (€ - Euro)</option>
                      <option value="GBP">GBP (£ - British Pound)</option>
                      <option value="AED">AED (د.إ - UAE Dirham)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">System Timezone</label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                    >
                      <option value="Asia/Kolkata">Asia/Kolkata (IST +05:30)</option>
                      <option value="UTC">UTC (+00:00)</option>
                      <option value="America/New_York">America/New_York (EST -05:00)</option>
                      <option value="Europe/London">Europe/London (GMT +00:00)</option>
                      <option value="Asia/Dubai">Asia/Dubai (GST +04:00)</option>
                      <option value="Asia/Singapore">Asia/Singapore (SGT +08:00)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Default Invoice Terms & Notes</label>
                    <textarea
                      rows={2}
                      value={invoiceTerms}
                      onChange={(e) => setInvoiceTerms(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-900/80 p-3 text-sm text-white placeholder-slate-500 focus:border-amber-400/60 focus:outline-none"
                      placeholder="Payment due within 30 days of invoice receipt. Standard GST rules apply."
                    />
                  </div>
                </div>
              </div>

              {canEditAdminSettings && (
                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={savingOrg}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-2.5 text-sm font-semibold text-slate-950 shadow-md transition-all hover:brightness-110 disabled:opacity-50"
                  >
                    {savingOrg ? "Saving..." : "Save Organization Profile"}
                  </button>
                </div>
              )}
            </form>
          </div>

          {/* Right Info Cards */}
          <div className="space-y-6">
            <div className="glass-panel rounded-2xl border border-white/10 bg-slate-950/60 p-6 space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Organization Summary</h4>
              <div className="divide-y divide-white/10 text-sm">
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-400">Tenant Slug</span>
                  <span className="font-mono text-white">{orgData?.slug || "acustock-enterprise"}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-400">Tier / License</span>
                  <span className="font-semibold text-amber-300 uppercase">{orgData?.plan || "Enterprise"}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-400">Subscription</span>
                  <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" /> ACTIVE
                  </span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-400">Multi-Tenancy Gate</span>
                  <span className="text-slate-200">Isolated & Enforced</span>
                </div>
              </div>
            </div>

            <div className="glass-panel rounded-2xl border border-indigo-400/20 bg-indigo-950/20 p-6 space-y-3">
              <div className="text-xl">🧾</div>
              <h4 className="text-sm font-semibold text-white">GST Compliance Ready</h4>
              <p className="text-xs leading-relaxed text-indigo-200">
                Your GSTIN and registered trade details are automatically formatted onto tax invoices,
                delivery challans, and stock manifests meeting CBIC e-invoicing standards.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 2: INVENTORY DEFAULTS & OPERATIONS */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === "operations" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <form onSubmit={handleSaveOperations} className="glass-panel rounded-2xl border border-white/10 bg-slate-950/60 p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">Inventory Valuation & Operational Policies</h3>
                  <p className="text-xs text-slate-400">Configure financial ledger cost basis, sequence codes, and warehouse routing</p>
                </div>
                {opsSuccessMsg && (
                  <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 border border-emerald-500/30">
                    ✓ {opsSuccessMsg}
                  </span>
                )}
              </div>

              {/* Valuation Method */}
              <div className="space-y-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Inventory Valuation Accounting Method
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label
                    onClick={() => setValuationMethod("FIFO")}
                    className={`cursor-pointer rounded-xl border p-4 transition-all ${
                      valuationMethod === "FIFO"
                        ? "border-amber-400 bg-amber-400/10 text-white"
                        : "border-white/10 bg-slate-900/60 text-slate-400 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">FIFO (First In, First Out)</span>
                      <input
                        type="radio"
                        name="valuation"
                        checked={valuationMethod === "FIFO"}
                        onChange={() => setValuationMethod("FIFO")}
                        className="text-amber-400"
                      />
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-300">
                      Depletes earliest acquired batches first. Ideal for items with price volatility or perishable shelf life.
                    </p>
                  </label>

                  <label
                    onClick={() => setValuationMethod("WEIGHTED_AVG")}
                    className={`cursor-pointer rounded-xl border p-4 transition-all ${
                      valuationMethod === "WEIGHTED_AVG"
                        ? "border-amber-400 bg-amber-400/10 text-white"
                        : "border-white/10 bg-slate-900/60 text-slate-400 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">Weighted Average Cost</span>
                      <input
                        type="radio"
                        name="valuation"
                        checked={valuationMethod === "WEIGHTED_AVG"}
                        onChange={() => setValuationMethod("WEIGHTED_AVG")}
                        className="text-amber-400"
                      />
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-300">
                      Calculates cost of goods sold using continuous pooled weighted unit averages across replenishment batches.
                    </p>
                  </label>
                </div>
              </div>

              {/* Operational Rules */}
              <div className="border-t border-white/10 pt-4 space-y-4">
                <h4 className="text-sm font-semibold text-slate-200">Stock Dispatch Rules</h4>
                <div className="space-y-3">
                  <label className="flex items-start justify-between rounded-xl border border-white/10 bg-slate-900/60 p-4 cursor-pointer hover:bg-slate-900/80">
                    <div className="pr-4">
                      <div className="font-semibold text-sm text-white">Allow Negative Stock Balance</div>
                      <p className="text-xs text-slate-400 mt-1">
                        When disabled, system strictly blocks stock dispatch if on-hand physical quantity is insufficient.
                        Recommended: Keep disabled for audited operations.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={negativeStockAllowed}
                      onChange={(e) => setNegativeStockAllowed(e.target.checked)}
                      className="mt-1 h-5 w-5 rounded border-white/20 bg-slate-950 text-amber-400"
                    />
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                        Default Low Stock Threshold (Units)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={lowStockAlertThreshold}
                        onChange={(e) => setLowStockAlertThreshold(Number(e.target.value))}
                        className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                      />
                      <span className="text-[11px] text-slate-400">Triggers reorder warnings when on-hand falls below this value</span>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                        Default Fulfillment Warehouse
                      </label>
                      <select
                        value={defaultWarehouseId}
                        onChange={(e) => setDefaultWarehouseId(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                      >
                        {warehouses.map((wh) => (
                          <option key={wh._id} value={wh._id}>
                            {wh.name} {wh.code ? `(${wh.code})` : ""} {wh.isDefault ? "★ Default" : ""}
                          </option>
                        ))}
                      </select>
                      <span className="text-[11px] text-slate-400">Preselected warehouse in Stock IN & Stock OUT workflows</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Document Prefixes */}
              <div className="border-t border-white/10 pt-4 space-y-4">
                <h4 className="text-sm font-semibold text-slate-200">Automated Numbering & Prefix Sequences</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">Sales Invoice Prefix</label>
                    <input
                      type="text"
                      value={invoicePrefix}
                      onChange={(e) => setInvoicePrefix(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm font-mono text-amber-300 focus:border-amber-400/60 focus:outline-none"
                    />
                    <span className="text-[11px] text-slate-400">Example: {invoicePrefix}00124</span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">Purchase Order Prefix</label>
                    <input
                      type="text"
                      value={poPrefix}
                      onChange={(e) => setPoPrefix(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm font-mono text-amber-300 focus:border-amber-400/60 focus:outline-none"
                    />
                    <span className="text-[11px] text-slate-400">Example: {poPrefix}00089</span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">Transfer Challan Prefix</label>
                    <input
                      type="text"
                      value={transferPrefix}
                      onChange={(e) => setTransferPrefix(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm font-mono text-amber-300 focus:border-amber-400/60 focus:outline-none"
                    />
                    <span className="text-[11px] text-slate-400">Example: {transferPrefix}0045</span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">Goods Receipt (GRN) Prefix</label>
                    <input
                      type="text"
                      value={grnPrefix}
                      onChange={(e) => setGrnPrefix(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm font-mono text-amber-300 focus:border-amber-400/60 focus:outline-none"
                    />
                    <span className="text-[11px] text-slate-400">Example: {grnPrefix}0078</span>
                  </div>
                </div>
              </div>

              {canEditAdminSettings && (
                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={savingOps}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-2.5 text-sm font-semibold text-slate-950 shadow-md transition-all hover:brightness-110 disabled:opacity-50"
                  >
                    {savingOps ? "Saving..." : "Save Operational Defaults"}
                  </button>
                </div>
              )}
            </form>
          </div>

          {/* Right Policy Notes */}
          <div className="space-y-6">
            <div className="glass-panel rounded-2xl border border-white/10 bg-slate-950/60 p-6 space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Ledger Immutability Guarantee</h4>
              <p className="text-xs leading-relaxed text-slate-300">
                All stock transactions registered under AcuStock append immutable records into the primary ledger.
                Neither admin nor system users can delete ledger records; adjustments must be posted as offsetting entries.
              </p>
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs text-emerald-300 flex items-center gap-2">
                <span>🛡️</span>
                <span>Full Double-Entry Ledger Protection Active</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 3: SECURITY, PROFILE & ACTIVE SESSIONS */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === "security" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {/* User Profile & Password Change */}
            <ProfileAndSecurityCard profile={profile} onSaved={refresh} />

            {/* 2FA Card */}
            <div className="glass-panel rounded-2xl border border-white/10 bg-slate-950/60 p-6">
              <TwoFactorSettings />
            </div>
          </div>

          {/* Session Overview Card */}
          <div className="space-y-6">
            <div className="glass-panel rounded-2xl border border-white/10 bg-slate-950/60 p-6 space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Active Session Security</h4>
              <div className="divide-y divide-white/10 text-sm">
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-400">Current Role</span>
                  <span className="font-semibold text-white">{profile?.role || role}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-400">Token Version</span>
                  <span className="font-mono text-amber-300">v{profile?.tokenVersion || 1}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-400">Password Age</span>
                  <span className="text-slate-300">
                    {profile?.passwordChangedAt
                      ? new Date(profile.passwordChangedAt).toLocaleDateString("en-IN")
                      : "Standard"}
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (confirm("Are you sure you want to invalidate all active login sessions? You will need to log in again.")) {
                      try {
                        await apiFetch("/auth/logout-all", { method: "POST" });
                        window.location.href = "/login";
                      } catch (err: any) {
                        alert(err.message || "Failed to logout all sessions");
                      }
                    }
                  }}
                  className="w-full rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-xs font-semibold text-rose-300 transition-all hover:bg-rose-500/20"
                >
                  🔒 Invalidate All Active Sessions
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 4: ALERTS & WHATSAPP HUB */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === "alerts" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <form onSubmit={handleSaveAlerts} className="glass-panel rounded-2xl border border-white/10 bg-slate-950/60 p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">Automated Notifications & WhatsApp Gateway</h3>
                  <p className="text-xs text-slate-400">Real-time alerts for procurement, stock reorders, and daily executive summaries</p>
                </div>
                {alertsSuccessMsg && (
                  <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 border border-emerald-500/30">
                    ✓ {alertsSuccessMsg}
                  </span>
                )}
              </div>

              <div className="space-y-4">
                <label className="flex items-start justify-between rounded-xl border border-white/10 bg-slate-900/60 p-4 cursor-pointer hover:bg-slate-900/80">
                  <div className="pr-4">
                    <div className="font-semibold text-sm text-white">Low Stock Email Alerts</div>
                    <p className="text-xs text-slate-400 mt-1">
                      Automatically dispatches email notices to inventory managers whenever an SKU dips below its reorder point.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={lowStockEmailAlerts}
                    onChange={(e) => setLowStockEmailAlerts(e.target.checked)}
                    className="mt-1 h-5 w-5 rounded border-white/20 bg-slate-950 text-amber-400"
                  />
                </label>

                <label className="flex items-start justify-between rounded-xl border border-white/10 bg-slate-900/60 p-4 cursor-pointer hover:bg-slate-900/80">
                  <div className="pr-4">
                    <div className="font-semibold text-sm text-white">Daily Operational Digest</div>
                    <p className="text-xs text-slate-400 mt-1">
                      Sends a scheduled morning digest at 09:00 IST detailing daily inbound receipts, shipments, and pending POs.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={dailyDigestEnabled}
                    onChange={(e) => setDailyDigestEnabled(e.target.checked)}
                    className="mt-1 h-5 w-5 rounded border-white/20 bg-slate-950 text-amber-400"
                  />
                </label>

                <label className="flex items-start justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 cursor-pointer hover:bg-emerald-950/30">
                  <div className="pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-base">💬</span>
                      <span className="font-semibold text-sm text-emerald-300">WhatsApp Automated Alerts</span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">
                      Integrates with the Cloud WhatsApp Business AI Agent to ping warehouse team members on PO confirmations and stock dispatch milestones.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={whatsappAlertsEnabled}
                    onChange={(e) => setWhatsappAlertsEnabled(e.target.checked)}
                    className="mt-1 h-5 w-5 rounded border-emerald-400/30 bg-slate-950 text-emerald-400"
                  />
                </label>
              </div>

              {canEditAdminSettings && (
                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={savingAlerts}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-2.5 text-sm font-semibold text-slate-950 shadow-md transition-all hover:brightness-110 disabled:opacity-50"
                  >
                    {savingAlerts ? "Saving..." : "Save Alert Settings"}
                  </button>
                </div>
              )}
            </form>
          </div>

          <div className="space-y-6">
            <div className="glass-panel rounded-2xl border border-white/10 bg-slate-950/60 p-6 space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400">WhatsApp AI Operations Hub</h4>
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-xs text-emerald-200 space-y-3">
                <div className="font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    Meta Cloud AI Agent: Online
                  </span>
                  <span className="text-[10px] uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold">
                    Dual Mode
                  </span>
                </div>
                <p className="text-slate-300 text-xs leading-relaxed">
                  AcuStock WhatsApp assistant automates stock level queries, statistical reorder recommendations, and PO generation directly via chat.
                </p>
                <div className="border-t border-emerald-500/20 pt-2 space-y-1.5 text-[11px] text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span>Safety stock breach alerts auto-dispatch</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span>Dispatched shipments trigger customer tracking</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span>Expiring FEFO lot warnings for warehouse staff</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsSimulatorOpen(true)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition-all hover:brightness-110 active:scale-[0.99]"
              >
                <span>💬</span>
                <span>Open WhatsApp Simulator Sandbox</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 5: SERIAL POLICIES */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === "serials" && canEditManagerSettings && (
        <SerialPolicyPanelWrapper products={products} refreshToken={refreshToken} onSaved={refresh} />
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 6: ROLE PERMISSIONS (RBAC) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === "permissions" && canEditAdminSettings && (
        <PermissionsPanelWrapper refreshToken={refreshToken} onSaved={refresh} />
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 7: DATA EXPORTS & STATUTORY COMPLIANCE */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === "compliance" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="glass-panel rounded-2xl border border-white/10 bg-slate-950/60 p-6 space-y-6">
              <div className="border-b border-white/10 pb-4">
                <h3 className="text-lg font-semibold text-white">Statutory Data Exports & Backup</h3>
                <p className="text-xs text-slate-400">Download point-in-time compliance snapshots for tax auditing, accounting, and ERP ingestion</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5 space-y-3">
                  <div className="text-2xl">📦</div>
                  <div className="font-semibold text-white text-sm">Product Master Catalog</div>
                  <p className="text-xs text-slate-400">All SKU definitions, prices, units, and serial policies</p>
                  <button
                    type="button"
                    disabled={exportingType === "products"}
                    onClick={() => handleExportData("products")}
                    className="w-full rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20 transition-all disabled:opacity-50"
                  >
                    {exportingType === "products" ? "Generating..." : "Download CSV"}
                  </button>
                </div>

                <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5 space-y-3">
                  <div className="text-2xl">📊</div>
                  <div className="font-semibold text-white text-sm">Stock Ledger Trail</div>
                  <p className="text-xs text-slate-400">Immutable double-entry transaction history with serial numbers</p>
                  <button
                    type="button"
                    disabled={exportingType === "ledger"}
                    onClick={() => handleExportData("ledger")}
                    className="w-full rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20 transition-all disabled:opacity-50"
                  >
                    {exportingType === "ledger" ? "Generating..." : "Download CSV"}
                  </button>
                </div>

                <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5 space-y-3">
                  <div className="text-2xl">📜</div>
                  <div className="font-semibold text-white text-sm">Business Audit Trail</div>
                  <p className="text-xs text-slate-400">Complete authentication, authorization, and configuration log</p>
                  <button
                    type="button"
                    disabled={exportingType === "audit"}
                    onClick={() => handleExportData("audit")}
                    className="w-full rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20 transition-all disabled:opacity-50"
                  >
                    {exportingType === "audit" ? "Generating..." : "Download CSV"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="glass-panel rounded-2xl border border-white/10 bg-slate-950/60 p-6 space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Compliance & Retention</h4>
              <div className="divide-y divide-white/10 text-sm">
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-400">Statutory Retention</span>
                  <span className="font-semibold text-emerald-400">8 Years (Mandatory)</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-400">Audit Trail Integrity</span>
                  <span className="font-mono text-emerald-400">HMAC-SHA256</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-400">Tax Standard</span>
                  <span className="text-slate-200">GST Rule 56(1)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <WhatsAppSimulatorModal
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        defaultPhone={phone}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components: Profile & Security Card
// ─────────────────────────────────────────────────────────────────────────────
function ProfileAndSecurityCard({
  profile,
  onSaved,
}: {
  profile: any;
  onSaved: () => void;
}) {
  const [profileName, setProfileName] = useState(profile?.name || "");
  const [profileEmail, setProfileEmail] = useState(profile?.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (profile) {
      setProfileName(profile.name || "");
      setProfileEmail(profile.email || "");
    }
  }, [profile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      await apiFetch("/settings/profile", {
        method: "PUT",
        body: JSON.stringify({ name: profileName, email: profileEmail }),
      });

      if (currentPassword && newPassword) {
        if (newPassword.length < 8) {
          throw new Error("New password must be at least 8 characters");
        }
        await apiFetch("/settings/profile/password", {
          method: "PUT",
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        setCurrentPassword("");
        setNewPassword("");
      }

      onSaved();
      setFeedback({ type: "success", text: "Profile details and credentials updated successfully!" });
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Failed to update profile" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-panel rounded-2xl border border-white/10 bg-slate-950/60 p-6 space-y-6">
      <div className="border-b border-white/10 pb-4">
        <h3 className="text-lg font-semibold text-white">Administrator Profile & Credentials</h3>
        <p className="text-xs text-slate-400">Update your name, contact email address, and account password</p>
      </div>

      {feedback && (
        <div
          className={`rounded-xl p-3 text-xs font-semibold ${
            feedback.type === "success"
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border border-rose-500/30 bg-rose-500/10 text-rose-300"
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">Full Name</label>
          <input
            type="text"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            required
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white focus:border-amber-400/60 focus:outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">Email Address</label>
          <input
            type="email"
            value={profileEmail}
            onChange={(e) => setProfileEmail(e.target.value)}
            required
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white focus:border-amber-400/60 focus:outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">Current Password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter to change password"
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-400/60 focus:outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min 8 characters"
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-400/60 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-2.5 text-sm font-semibold text-slate-950 shadow-md transition-all hover:brightness-110 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Profile & Credentials"}
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components: Serial Policies Wrapper
// ─────────────────────────────────────────────────────────────────────────────
function SerialPolicyPanelWrapper({
  products,
  refreshToken,
  onSaved,
}: {
  products: { _id: string; name: string; shortName?: string }[];
  refreshToken: number;
  onSaved: () => void;
}) {
  const [selectedProductId, setSelectedProductId] = useState(products[0]?._id || "");
  const { policy, loading, error } = useSerialPolicy(selectedProductId, refreshToken);
  const [serialEnabled, setSerialEnabled] = useState(false);
  const [requireSerialIn, setRequireSerialIn] = useState(false);
  const [requireSerialOut, setRequireSerialOut] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (products.length > 0 && !selectedProductId) {
      setSelectedProductId(products[0]._id);
    }
  }, [products]);

  useEffect(() => {
    if (policy) {
      setSerialEnabled(!!policy.serialEnabled);
      setRequireSerialIn(!!policy.requireSerialIn);
      setRequireSerialOut(!!policy.requireSerialOut);
    } else {
      setSerialEnabled(false);
      setRequireSerialIn(false);
      setRequireSerialOut(false);
    }
  }, [policy]);

  async function handleSavePolicy() {
    if (!selectedProductId) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiFetch("/settings/serial-policies", {
        method: "POST",
        body: JSON.stringify({
          productId: selectedProductId,
          serialEnabled,
          requireSerialIn,
          requireSerialOut,
        }),
      });
      setMessage("Serial policy saved successfully!");
      onSaved();
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage(err.message || "Failed to save serial policy");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass-panel rounded-2xl border border-white/10 bg-slate-950/60 p-6 space-y-6">
      <div className="border-b border-white/10 pb-4">
        <h3 className="text-lg font-semibold text-white">Item Serial Number Policy Enforcement</h3>
        <p className="text-xs text-slate-400">Control mandatory barcode and serial registration rules per product</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">Select Product Catalog SKU</label>
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white focus:border-amber-400/60 focus:outline-none"
          >
            {products.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name} {item.shortName ? `(${item.shortName})` : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-400">
            Policies defined here act as the authoritative gatekeeper for stock intake and dispatch validation.
          </p>
        </div>

        <div className="space-y-4 rounded-xl border border-white/10 bg-slate-900/40 p-4">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm font-medium text-white">Enable Serial Tracking</span>
            <input
              type="checkbox"
              checked={serialEnabled}
              onChange={(e) => setSerialEnabled(e.target.checked)}
              className="h-5 w-5 rounded border-white/20 bg-slate-950 text-amber-400"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm font-medium text-white">Require Serial on Stock IN (Receipt)</span>
            <input
              type="checkbox"
              disabled={!serialEnabled}
              checked={requireSerialIn}
              onChange={(e) => setRequireSerialIn(e.target.checked)}
              className="h-5 w-5 rounded border-white/20 bg-slate-950 text-amber-400 disabled:opacity-40"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm font-medium text-white">Require Serial on Stock OUT (Dispatch)</span>
            <input
              type="checkbox"
              disabled={!serialEnabled}
              checked={requireSerialOut}
              onChange={(e) => setRequireSerialOut(e.target.checked)}
              className="h-5 w-5 rounded border-white/20 bg-slate-950 text-amber-400 disabled:opacity-40"
            />
          </label>

          {message && (
            <div className="rounded-lg bg-emerald-500/20 p-2.5 text-xs text-emerald-300 font-semibold border border-emerald-500/30">
              {message}
            </div>
          )}

          <div className="pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={handleSavePolicy}
              className="w-full rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 py-2.5 text-xs font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Product Policy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components: RBAC Permissions Wrapper
// ─────────────────────────────────────────────────────────────────────────────
function PermissionsPanelWrapper({
  refreshToken,
  onSaved,
}: {
  refreshToken: number;
  onSaved: () => void;
}) {
  const [roleTarget, setRoleTarget] = useState<"MANAGER" | "USER">("MANAGER");
  const { permission, loading } = useRolePermissions(roleTarget, refreshToken);

  const [canManageUsers, setCanManageUsers] = useState(false);
  const [canAddProduct, setCanAddProduct] = useState(false);
  const [canEditProduct, setCanEditProduct] = useState(false);
  const [canAddCompany, setCanAddCompany] = useState(false);
  const [canEditCompany, setCanEditCompany] = useState(false);
  const [canStockIn, setCanStockIn] = useState(true);
  const [canStockOut, setCanStockOut] = useState(true);
  const [canViewStockLedger, setCanViewStockLedger] = useState(false);
  const [canViewAllReports, setCanViewAllReports] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (permission) {
      setCanManageUsers(!!permission.canManageUsers);
      setCanAddProduct(!!permission.canAddProduct);
      setCanEditProduct(!!permission.canEditProduct);
      setCanAddCompany(!!permission.canAddCompany);
      setCanEditCompany(!!permission.canEditCompany);
      setCanStockIn(permission.canStockIn ?? true);
      setCanStockOut(permission.canStockOut ?? true);
      setCanViewStockLedger(!!permission.canViewStockLedger);
      setCanViewAllReports(!!permission.canViewAllReports);
    }
  }, [permission]);

  async function handleSavePermissions() {
    setSaving(true);
    setMessage(null);
    try {
      await apiFetch(`/settings/permissions/${roleTarget}`, {
        method: "PUT",
        body: JSON.stringify({
          canManageUsers,
          canAddProduct,
          canEditProduct,
          canAddCompany,
          canEditCompany,
          canStockIn,
          canStockOut,
          canViewStockLedger,
          canViewAllReports,
        }),
      });
      setMessage(`${roleTarget} capabilities updated successfully!`);
      onSaved();
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage(err.message || "Failed to update permissions");
    } finally {
      setSaving(false);
    }
  }

  const capabilityList = [
    { label: "Manage Staff & Users", checked: canManageUsers, setter: setCanManageUsers },
    { label: "Create Catalog Products", checked: canAddProduct, setter: setCanAddProduct },
    { label: "Edit Catalog Products", checked: canEditProduct, setter: setCanEditProduct },
    { label: "Create Vendors & Clients", checked: canAddCompany, setter: setCanAddCompany },
    { label: "Edit Vendors & Clients", checked: canEditCompany, setter: setCanEditCompany },
    { label: "Perform Stock IN (Intake)", checked: canStockIn, setter: setCanStockIn },
    { label: "Perform Stock OUT (Dispatch)", checked: canStockOut, setter: setCanStockOut },
    { label: "View Detailed Stock Ledger", checked: canViewStockLedger, setter: setCanViewStockLedger },
    { label: "View Analytics & Reports", checked: canViewAllReports, setter: setCanViewAllReports },
  ];

  return (
    <div className="glass-panel rounded-2xl border border-white/10 bg-slate-950/60 p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Role-Based Access Control (RBAC) Matrix</h3>
          <p className="text-xs text-slate-400">Configure feature access privileges for operational tiers</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-slate-900 p-1 border border-white/10">
          <button
            type="button"
            onClick={() => setRoleTarget("MANAGER")}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${
              roleTarget === "MANAGER" ? "bg-amber-400 text-slate-950" : "text-slate-300 hover:text-white"
            }`}
          >
            Manager Role
          </button>
          <button
            type="button"
            onClick={() => setRoleTarget("USER")}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${
              roleTarget === "USER" ? "bg-amber-400 text-slate-950" : "text-slate-300 hover:text-white"
            }`}
          >
            Staff / User Role
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {capabilityList.map((item) => (
          <label
            key={item.label}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/60 p-3.5 cursor-pointer hover:bg-slate-900/90"
          >
            <span className="text-xs font-medium text-slate-200">{item.label}</span>
            <input
              type="checkbox"
              checked={item.checked}
              onChange={(e) => item.setter(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-slate-950 text-amber-400"
            />
          </label>
        ))}
      </div>

      {message && (
        <div className="rounded-xl bg-emerald-500/20 p-3 text-xs text-emerald-300 font-semibold border border-emerald-500/30">
          {message}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          type="button"
          disabled={saving}
          onClick={handleSavePermissions}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-2.5 text-sm font-semibold text-slate-950 shadow-md transition-all hover:brightness-110 disabled:opacity-50"
        >
          {saving ? "Saving..." : `Save ${roleTarget} Permissions`}
        </button>
      </div>
    </div>
  );
}
