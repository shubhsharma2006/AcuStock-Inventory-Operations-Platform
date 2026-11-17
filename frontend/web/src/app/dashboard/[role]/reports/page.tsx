"use client";

import { useState, useMemo } from "react";
import { apiFetch, downloadAuthenticatedFile } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type UserSummary = {
  _id?: string;
  userId?: string;
  name: string;
  email: string;
  role: string;
  totalIn?: number;
  totalOut?: number;
  stockIn?: number;
  stockOut?: number;
  totalTransactions: number;
  lastActive?: string;
};

type UserActivityItem = {
  _id: string;
  type: "IN" | "OUT" | "TRANSFER_IN" | "TRANSFER_OUT" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT";
  quantity: number;
  createdAt: string;
  productId?: { name?: string; sku?: string };
  productName?: string;
  notes?: string;
  companyName?: string;
};

type StockMovementItem = {
  productId: string;
  productName: string;
  sku?: string;
  category?: string;
  currentStock?: number;
  lowStockThreshold?: number;
  totalIn: number;
  totalOut: number;
  netChange: number;
  totalOps: number;
  velocityGrade?: "VERY_HIGH" | "HIGH" | "MODERATE" | "STAGNANT";
  lastMovementDate?: string | null;
};

type ScheduledReport = {
  _id: string;
  type: "daily_summary" | "weekly_low_stock" | "monthly_overview";
  period?: string;
  generatedAt: string;
  generatedBy?: string;
  triggeredBy?: string;
  emailSent?: boolean;
  itemCount?: number;
  summaryPreview?: {
    totalIn?: number;
    totalOut?: number;
    totalTxns?: number;
    totalLowStock?: number;
  };
  data?: {
    date?: string;
    week?: string;
    totalIn?: number;
    totalOut?: number;
    totalTxns?: number;
    totalLowStock?: number;
    byProduct?: Array<{
      productName: string;
      type: string;
      count: number;
      totalQty: number;
    }>;
    items?: Array<{
      productId: string;
      name: string;
      shortName?: string;
      threshold: number;
      currentStock: number;
    }>;
  };
};

type AgingBucket = {
  count: number;
  units: number;
  value: number;
  items?: Array<{
    productId: string;
    name: string;
    sku?: string;
    onHandQty: number;
    unitCost: number;
    totalValue: number;
    daysIdle: number;
  }>;
};

type AgingResponse = {
  success: boolean;
  totalItems: number;
  totalValuation?: number;
  buckets: {
    "0-30": AgingBucket;
    "31-60": AgingBucket;
    "61-90": AgingBucket;
    "91-180": AgingBucket;
    "180+": AgingBucket;
  };
};

type AbcItem = {
  productId: string;
  name: string;
  sku?: string;
  onHandQty: number;
  unitCost: number;
  totalValue: number;
  cumulativeValue?: number;
  cumulativePct?: number;
  category?: "A" | "B" | "C";
};

type AbcResponse = {
  success: boolean;
  grandTotalValue: number;
  totalItems: number;
  items: AbcItem[];
};

type ExportHistoryItem = {
  id: string;
  type: string;
  format: string;
  timestamp: string;
  fileName: string;
};

export default function ReportsHubPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<
    "stock-velocity" | "aging-abc" | "export-center" | "scheduled" | "user-activity"
  >("stock-velocity");

  // Filters & State for Stock Velocity
  const [velocitySearch, setVelocitySearch] = useState("");
  const [velocityFilter, setVelocityFilter] = useState<"ALL" | "ACTIVE" | "VERY_HIGH" | "HIGH" | "MODERATE" | "STAGNANT">("ALL");
  const [velocitySort, setVelocitySort] = useState<"activity" | "name" | "inflow" | "outflow" | "net">("activity");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  // State for Operator Drilldown Modal
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [operatorSearch, setOperatorSearch] = useState("");

  // State for Scheduled Report Inspection Modal
  const [inspectingReportId, setInspectingReportId] = useState<string | null>(null);

  // State for Parametric Export Studio
  const [exportType, setExportType] = useState<"stock-ledger" | "products" | "user-activity" | "low-stock">("stock-ledger");
  const [exportFormat, setExportFormat] = useState<"csv" | "json">("csv");
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [exportUserFilter, setExportUserFilter] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [recentExports, setRecentExports] = useState<ExportHistoryItem[]>([]);

  // 1. Stock Movement / Velocity Query
  const { data: movementData, isLoading: loadingMovement, refetch: refetchMovement } = useQuery<{
    success?: boolean;
    movement?: StockMovementItem[];
    totalCatalogItems?: number;
    totalInSum?: number;
    totalOutSum?: number;
  }>({
    queryKey: ["reports-stock-movement"],
    queryFn: () => apiFetch("/reports/stock-movement"),
  });

  const movementList: StockMovementItem[] = useMemo(() => {
    return movementData?.movement || (Array.isArray(movementData) ? movementData : []);
  }, [movementData]);

  // 2. User Summary Query
  const { data: userSummaryData, isLoading: loadingSummary } = useQuery<{
    success?: boolean;
    summary?: UserSummary[];
    users?: UserSummary[];
  }>({
    queryKey: ["reports-user-summary"],
    queryFn: () => apiFetch("/reports/user-summary"),
  });

  const rawSummaryList: UserSummary[] = (userSummaryData?.summary || userSummaryData?.users || (Array.isArray(userSummaryData) ? userSummaryData : [])) as UserSummary[];

  // 3. User Drilldown Query
  const { data: userActivityData, isLoading: loadingActivity } = useQuery<{
    success?: boolean;
    activity?: UserActivityItem[];
    transactions?: UserActivityItem[];
  }>({
    queryKey: ["reports-user-drilldown", selectedUserId],
    queryFn: () =>
      selectedUserId
        ? apiFetch<{ success?: boolean; activity?: UserActivityItem[]; transactions?: UserActivityItem[] }>(`/reports/user-activity/${selectedUserId}`)
        : Promise.resolve({ activity: [] }),
    enabled: !!selectedUserId,
  });

  const activityList: UserActivityItem[] = userActivityData?.activity || userActivityData?.transactions || (Array.isArray(userActivityData) ? userActivityData : []);

  // 4. Scheduled Reports Query
  const { data: scheduledData, isLoading: loadingScheduled } = useQuery<{
    success?: boolean;
    reports?: ScheduledReport[];
  }>({
    queryKey: ["reports-scheduled"],
    queryFn: () => apiFetch("/reports/scheduled"),
  });

  const scheduledList: ScheduledReport[] = scheduledData?.reports || [];

  // Single Scheduled Report Inspection Query
  const { data: singleReportData, isLoading: loadingSingleReport } = useQuery<{
    success?: boolean;
    report?: ScheduledReport;
  }>({
    queryKey: ["reports-scheduled-detail", inspectingReportId],
    queryFn: () =>
      inspectingReportId
        ? apiFetch<{ success?: boolean; report?: ScheduledReport }>(`/reports/scheduled/${inspectingReportId}`)
        : Promise.resolve({ success: false, report: undefined }),
    enabled: Boolean(inspectingReportId),
  });

  // 5. Aging Report Query
  const { data: agingData, isLoading: loadingAging } = useQuery<AgingResponse>({
    queryKey: ["reports-aging"],
    queryFn: () => apiFetch("/reports/aging"),
  });

  // 6. ABC Analysis Query
  const { data: abcData, isLoading: loadingAbc } = useQuery<AbcResponse>({
    queryKey: ["reports-abc"],
    queryFn: () => apiFetch("/reports/abc-analysis"),
  });

  // Trigger Scheduled Report Mutation
  const triggerReportMutation = useMutation({
    mutationFn: (type: "daily_summary" | "weekly_low_stock") =>
      apiFetch("/reports/scheduled/trigger", {
        method: "POST",
        body: JSON.stringify({ type }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports-scheduled"] });
    },
  });

  // Quick Preset Date Setter
  function setDatePreset(preset: "today" | "7d" | "30d" | "month" | "ytd" | "all") {
    const today = new Date();
    const endStr = today.toISOString().slice(0, 10);
    let startStr = "";

    if (preset === "today") {
      startStr = endStr;
    } else if (preset === "7d") {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      startStr = d.toISOString().slice(0, 10);
    } else if (preset === "30d") {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      startStr = d.toISOString().slice(0, 10);
    } else if (preset === "month") {
      startStr = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    } else if (preset === "ytd") {
      startStr = new Date(today.getFullYear(), 0, 1).toISOString().slice(0, 10);
    } else if (preset === "all") {
      startStr = "";
      setExportStartDate("");
      setExportEndDate("");
      return;
    }

    setExportStartDate(startStr);
    setExportEndDate(endStr);
  }

  // Handle Parametric Export
  async function handleExportDownload() {
    setIsExporting(true);
    setExportError(null);
    setExportSuccessMsg(null);
    try {
      const params = new URLSearchParams();
      params.append("type", exportType);
      if (exportFormat === "json") params.append("format", "json");
      if (exportStartDate) params.append("startDate", exportStartDate);
      if (exportEndDate) params.append("endDate", exportEndDate);
      if (exportUserFilter) params.append("userId", exportUserFilter);

      const endpoint = `/reports/export?${params.toString()}`;
      const ext = exportFormat === "json" ? "json" : "csv";
      const fileName = `acustock-${exportType}-${new Date().toISOString().slice(0, 10)}.${ext}`;

      await downloadAuthenticatedFile(endpoint, fileName);

      setExportSuccessMsg(`Successfully generated and dispatched ${fileName}`);
      setRecentExports((prev) => [
        {
          id: `exp-${Date.now()}`,
          type: exportType,
          format: exportFormat.toUpperCase(),
          timestamp: new Date().toLocaleTimeString(),
          fileName,
        },
        ...prev.slice(0, 4),
      ]);
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : "Failed to generate export file");
    } finally {
      setIsExporting(false);
    }
  }

  // Handle Tally Prime & Zoho Books XML Export
  async function handleTallyExportDownload(exportKind: "vouchers" | "masters" | "both") {
    setIsExporting(true);
    setExportError(null);
    setExportSuccessMsg(null);
    try {
      const params = new URLSearchParams();
      params.append("exportType", exportKind);
      if (exportStartDate) params.append("startDate", exportStartDate);
      if (exportEndDate) params.append("endDate", exportEndDate);

      const endpoint = `/reports/tally-xml?${params.toString()}`;
      const fileName = `tally-prime-${exportKind}-${new Date().toISOString().slice(0, 10)}.xml`;

      await downloadAuthenticatedFile(endpoint, fileName);

      setExportSuccessMsg(`Successfully generated and dispatched Tally Prime ${exportKind} XML (${fileName})`);
      setRecentExports((prev) => [
        {
          id: `exp-${Date.now()}`,
          type: `tally-${exportKind}`,
          format: "TALLY XML",
          timestamp: new Date().toLocaleTimeString(),
          fileName,
        },
        ...prev.slice(0, 4),
      ]);
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : "Failed to generate Tally Prime XML");
    } finally {
      setIsExporting(false);
    }
  }

  // Categories list for filter
  const categories = useMemo(() => {
    const set = new Set<string>();
    movementList.forEach((m) => {
      if (m.category) set.add(m.category);
    });
    return Array.from(set);
  }, [movementList]);

  // Filtered & Sorted Stock Movement List
  const filteredMovement = useMemo(() => {
    return movementList
      .filter((m) => {
        if (velocitySearch) {
          const q = velocitySearch.toLowerCase();
          const matchName = (m.productName || "").toLowerCase().includes(q);
          const matchSku = (m.sku || "").toLowerCase().includes(q);
          if (!matchName && !matchSku) return false;
        }

        if (selectedCategory !== "ALL" && m.category !== selectedCategory) {
          return false;
        }

        if (velocityFilter === "ACTIVE") {
          return m.totalOps > 0;
        } else if (velocityFilter !== "ALL") {
          return m.velocityGrade === velocityFilter;
        }

        return true;
      })
      .sort((a, b) => {
        if (velocitySort === "activity") return b.totalOps - a.totalOps;
        if (velocitySort === "inflow") return b.totalIn - a.totalIn;
        if (velocitySort === "outflow") return b.totalOut - a.totalOut;
        if (velocitySort === "net") return b.netChange - a.netChange;
        return a.productName.localeCompare(b.productName);
      });
  }, [movementList, velocitySearch, selectedCategory, velocityFilter, velocitySort]);

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    return rawSummaryList.filter((u) => {
      if (!operatorSearch) return true;
      const term = operatorSearch.toLowerCase();
      return (u.name || "").toLowerCase().includes(term) || (u.email || "").toLowerCase().includes(term);
    });
  }, [rawSummaryList, operatorSearch]);

  const totalInSum = useMemo(() => movementList.reduce((acc, m) => acc + (m.totalIn || 0), 0), [movementList]);
  const totalOutSum = useMemo(() => movementList.reduce((acc, m) => acc + (m.totalOut || 0), 0), [movementList]);
  const netBalanceSum = totalInSum - totalOutSum;

  return (
    <div className="space-y-6 animate-fade-in text-slate-100">
      {/* ── TOP HEADER ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-200">
            <span>📊</span> Operational Intelligence & Compliance Hub
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">Reports & Intelligence Hub</h1>
          <p className="mt-1 text-sm text-slate-400">
            Enterprise inventory analytics, multi-dimensional velocity metrics, aging analysis, and parametric compliance exports.
          </p>
        </div>

        {/* Global Summary Badge Ribbon */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-1.5 text-xs backdrop-blur-xl">
            <span className="text-slate-400">Active Catalog:</span>{" "}
            <span className="font-bold text-white">{movementList.length} items</span>
          </div>
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs backdrop-blur-xl">
            <span className="text-emerald-400">Inflow:</span>{" "}
            <span className="font-bold text-emerald-300">+{totalInSum}</span>
          </div>
          <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 px-3 py-1.5 text-xs backdrop-blur-xl">
            <span className="text-sky-400">Dispatch:</span>{" "}
            <span className="font-bold text-sky-300">-{totalOutSum}</span>
          </div>
          <button
            type="button"
            onClick={() => refetchMovement()}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 hover:bg-white/10 hover:text-white transition"
            title="Refresh Intelligence Data"
          >
            🔄
          </button>
        </div>
      </div>

      {/* ── NAVIGATION TABS ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-4">
        <button
          type="button"
          onClick={() => setActiveTab("stock-velocity")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === "stock-velocity"
              ? "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/10"
              : "border border-white/10 bg-slate-900/40 text-slate-300 hover:text-white hover:bg-white/5"
          }`}
        >
          <span>📈</span> Stock Velocity & Turnover
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("aging-abc")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === "aging-abc"
              ? "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/10"
              : "border border-white/10 bg-slate-900/40 text-slate-300 hover:text-white hover:bg-white/5"
          }`}
        >
          <span>⏱️</span> Inventory Aging & ABC Analysis
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("export-center")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === "export-center"
              ? "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/10"
              : "border border-white/10 bg-slate-900/40 text-slate-300 hover:text-white hover:bg-white/5"
          }`}
        >
          <span>📥</span> Parametric Export Studio
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("scheduled")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === "scheduled"
              ? "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/10"
              : "border border-white/10 bg-slate-900/40 text-slate-300 hover:text-white hover:bg-white/5"
          }`}
        >
          <span>⏰</span> Automated Scheduled Reports
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("user-activity")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === "user-activity"
              ? "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/10"
              : "border border-white/10 bg-slate-900/40 text-slate-300 hover:text-white hover:bg-white/5"
          }`}
        >
          <span>👤</span> Operator Activity & Audits
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: STOCK VELOCITY & TRENDS                                           */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "stock-velocity" && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-slate-400">Tracked Catalog</span>
                <span className="text-lg">📦</span>
              </div>
              <div className="mt-2 text-3xl font-extrabold text-white">{movementList.length}</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                <span>Active products across all zones</span>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-emerald-400">Total Inflow Throughput</span>
                <span className="text-lg">📥</span>
              </div>
              <div className="mt-2 text-3xl font-extrabold text-emerald-300">+{totalInSum}</div>
              <div className="mt-1 text-xs text-slate-400">Accumulated inbound stock additions</div>
            </div>

            <div className="rounded-2xl border border-sky-400/20 bg-sky-400/5 p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-sky-400">Total Outflow Dispatch</span>
                <span className="text-lg">📤</span>
              </div>
              <div className="mt-2 text-3xl font-extrabold text-sky-300">-{totalOutSum}</div>
              <div className="mt-1 text-xs text-slate-400">Dispatched units across orders</div>
            </div>

            <div className={`rounded-2xl border p-5 backdrop-blur-xl ${
              netBalanceSum >= 0 ? "border-indigo-400/20 bg-indigo-400/5" : "border-rose-400/20 bg-rose-400/5"
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-indigo-300">Net Movement Balance</span>
                <span className="text-lg">⚖️</span>
              </div>
              <div className={`mt-2 text-3xl font-extrabold ${netBalanceSum >= 0 ? "text-indigo-200" : "text-rose-300"}`}>
                {netBalanceSum >= 0 ? `+${netBalanceSum}` : netBalanceSum}
              </div>
              <div className="mt-1 text-xs text-slate-400">Current delta between In and Out</div>
            </div>
          </div>

          {/* Filter & Control Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/50 p-4 backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  value={velocitySearch}
                  onChange={(e) => setVelocitySearch(e.target.value)}
                  placeholder="Search by Product Name or SKU..."
                  className="w-64 md:w-80 rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-400/50"
                />
                {velocitySearch && (
                  <button
                    onClick={() => setVelocitySearch("")}
                    className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Category Filter */}
              {categories.length > 0 && (
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-xs font-medium text-slate-200 outline-none focus:border-amber-400/50"
                >
                  <option value="ALL">All Categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}

              {/* Sort Dropdown */}
              <select
                value={velocitySort}
                onChange={(e) => setVelocitySort(e.target.value as "activity" | "name" | "inflow" | "outflow" | "net")}
                className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-xs font-medium text-slate-200 outline-none focus:border-amber-400/50"
              >
                <option value="activity">Sort: Most Active</option>
                <option value="name">Sort: Product Name (A-Z)</option>
                <option value="inflow">Sort: Highest Inflow</option>
                <option value="outflow">Sort: Highest Dispatch</option>
                <option value="net">Sort: Net Balance</option>
              </select>
            </div>

            {/* Velocity Tier Toggles */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {(["ALL", "ACTIVE", "VERY_HIGH", "MODERATE", "STAGNANT"] as const).map((grade) => (
                <button
                  key={grade}
                  type="button"
                  onClick={() => setVelocityFilter(grade)}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    velocityFilter === grade
                      ? "bg-amber-400 text-slate-950"
                      : "border border-white/10 bg-white/5 text-slate-400 hover:text-white"
                  }`}
                >
                  {grade === "ALL" && "All"}
                  {grade === "ACTIVE" && "🔥 Active Only"}
                  {grade === "VERY_HIGH" && "⚡ High Velocity"}
                  {grade === "MODERATE" && "🟢 Moderate"}
                  {grade === "STAGNANT" && "🔴 Stagnant"}
                </button>
              ))}
            </div>
          </div>

          {/* Velocity Data Table */}
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="border-b border-white/10 bg-slate-950/70 text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-6 py-4">Product Details</th>
                    <th className="px-6 py-4">SKU / Code</th>
                    <th className="px-6 py-4 text-center">On-Hand Stock</th>
                    <th className="px-6 py-4 text-center">Total Inflow</th>
                    <th className="px-6 py-4 text-center">Total Dispatch</th>
                    <th className="px-6 py-4 text-center">Net Delta</th>
                    <th className="px-6 py-4 w-60">Throughput Velocity Ratio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loadingMovement ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-slate-400">
                        <div className="flex items-center justify-center gap-3">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent"></span>
                          <span>Compiling product velocity metrics across ledgers…</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredMovement.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center">
                        <div className="text-3xl">📦</div>
                        <div className="mt-2 font-semibold text-white">No products found matching criteria</div>
                        <div className="mt-1 text-xs text-slate-500">Try adjusting your search query or velocity filters.</div>
                      </td>
                    </tr>
                  ) : (
                    filteredMovement.map((m) => {
                      const totalOps = (m.totalIn || 0) + (m.totalOut || 0);
                      const inRatio = totalOps > 0 ? Math.round(((m.totalIn || 0) / totalOps) * 100) : 50;
                      const isLowStock = (m.currentStock ?? 0) <= (m.lowStockThreshold ?? 10);
                      const isZeroStock = (m.currentStock ?? 0) === 0;

                      return (
                        <tr key={m.productId} className="hover:bg-white/[0.02] transition">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-slate-800 to-slate-900 font-bold text-amber-300">
                                {m.productName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-semibold text-white">{m.productName}</div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">
                                    {m.category || "General"}
                                  </span>
                                  {m.totalOps > 0 && (
                                    <span className="text-[10px] text-amber-300 font-medium">
                                      {m.totalOps} transactions
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <span className="font-mono text-xs text-slate-300 bg-slate-950/80 px-2 py-1 rounded-lg border border-white/5">
                              {m.sku || "—"}
                            </span>
                          </td>

                          <td className="px-6 py-4 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span className="font-mono font-bold text-white text-base">
                                {m.currentStock ?? 0}
                              </span>
                              {isZeroStock ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-400">
                                  ● Out of Stock
                                </span>
                              ) : isLowStock ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300">
                                  ⚠️ Low Stock
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                                  ✓ In Stock
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-6 py-4 text-center font-mono font-bold text-emerald-400">
                            +{m.totalIn || 0}
                          </td>

                          <td className="px-6 py-4 text-center font-mono font-bold text-sky-400">
                            -{m.totalOut || 0}
                          </td>

                          <td className="px-6 py-4 text-center font-mono font-extrabold text-white">
                            <span className={m.netChange > 0 ? "text-emerald-300" : m.netChange < 0 ? "text-rose-300" : "text-slate-400"}>
                              {m.netChange > 0 ? `+${m.netChange}` : m.netChange}
                            </span>
                          </td>

                          <td className="px-6 py-4">
                            <div className="space-y-1.5">
                              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-950 border border-white/5">
                                {totalOps > 0 ? (
                                  <>
                                    <div
                                      style={{ width: `${inRatio}%` }}
                                      className="bg-emerald-400 transition-all duration-500"
                                      title={`Inbound Receipts: ${inRatio}% (+${m.totalIn})`}
                                    />
                                    <div
                                      style={{ width: `${100 - inRatio}%` }}
                                      className="bg-sky-400 transition-all duration-500"
                                      title={`Outbound Dispatches: ${100 - inRatio}% (-${m.totalOut})`}
                                    />
                                  </>
                                ) : (
                                  <div className="w-full bg-slate-800" title="Zero Movement recorded" />
                                )}
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span>{totalOps > 0 ? `${inRatio}% In / ${100 - inRatio}% Out` : "Stagnant"}</span>
                                <span className={`font-semibold ${
                                  m.velocityGrade === "VERY_HIGH" ? "text-amber-300" :
                                  m.velocityGrade === "HIGH" ? "text-emerald-400" :
                                  m.velocityGrade === "MODERATE" ? "text-sky-300" : "text-slate-500"
                                }`}>
                                  {m.velocityGrade === "VERY_HIGH" ? "⚡ High Velocity" :
                                   m.velocityGrade === "HIGH" ? "🔥 Swift Flow" :
                                   m.velocityGrade === "MODERATE" ? "🟢 Normal" : "🔴 Stagnant"}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer */}
            <div className="flex items-center justify-between border-t border-white/10 px-6 py-3 text-xs text-slate-400">
              <div>
                Showing <span className="font-bold text-white">{filteredMovement.length}</span> of {movementList.length} catalog items
              </div>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400"></span> Inflow
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-sky-400"></span> Dispatch
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: INVENTORY AGING & ABC ANALYSIS (SAP MM / S/4HANA STANDARD)         */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "aging-abc" && (
        <div className="space-y-6">
          {/* Section Introduction */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-5 backdrop-blur-xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>⏱️</span> SAP-Standard Inventory Aging Buckets & Capital Risk Assessment
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Identifies inventory velocity across 5 discrete aging brackets, calculating tied-up capital and dead-stock liquidation targets.
            </p>
          </div>

          {/* 5 Aging Buckets Grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { key: "0-30", title: "0 - 30 Days", label: "Fresh / Fast", color: "emerald", border: "border-emerald-400/20", bg: "bg-emerald-400/5" },
              { key: "31-60", title: "31 - 60 Days", label: "Normal Flow", color: "sky", border: "border-sky-400/20", bg: "bg-sky-400/5" },
              { key: "61-90", title: "61 - 90 Days", label: "Watch List", color: "amber", border: "border-amber-400/20", bg: "bg-amber-400/5" },
              { key: "91-180", title: "91 - 180 Days", label: "Slow Moving", color: "orange", border: "border-orange-400/20", bg: "bg-orange-400/5" },
              { key: "180+", title: "180+ Days", label: "Dead Stock Risk", color: "rose", border: "border-rose-400/20", bg: "bg-rose-400/5" },
            ].map((bucket) => {
              const data = agingData?.buckets?.[bucket.key as keyof typeof agingData.buckets];
              return (
                <div key={bucket.key} className={`rounded-2xl border p-4 backdrop-blur-xl ${bucket.border} ${bucket.bg}`}>
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-white">{bucket.title}</span>
                    <span className={`text-[10px] uppercase tracking-wider text-${bucket.color}-400`}>{bucket.label}</span>
                  </div>
                  <div className="mt-2 text-2xl font-black text-white">{data?.count ?? 0} items</div>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                    <span>Units: {data?.units ?? 0}</span>
                    <span className="font-mono font-bold text-slate-200">
                      ${((data?.value ?? 0) / 1000).toFixed(1)}k
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ABC Pareto Analysis Section */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>📊</span> ABC Valuation Matrix (Pareto 80 / 15 / 5 Rule)
                </h3>
                <p className="text-xs text-slate-400">
                  Classifies catalog items by cumulative stock value to prioritize warehouse cycle counting and audits.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-300">
                  Class A: Top 80% Value
                </span>
                <span className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-xs font-bold text-amber-300">
                  Class B: Next 15%
                </span>
                <span className="rounded-lg border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-xs font-bold text-sky-300">
                  Class C: Bottom 5%
                </span>
              </div>
            </div>

            {loadingAbc ? (
              <div className="p-8 text-center text-slate-400">Calculating ABC inventory distributions…</div>
            ) : !abcData?.items || abcData.items.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No inventory valuation data available.</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/5">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="border-b border-white/10 bg-slate-950/70 uppercase text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Rank</th>
                      <th className="px-4 py-3">Product Name</th>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3 text-center">On-Hand Units</th>
                      <th className="px-4 py-3 text-right">Unit Valuation</th>
                      <th className="px-4 py-3 text-right">Total Tied Capital</th>
                      <th className="px-4 py-3 text-center">ABC Class</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {abcData.items.slice(0, 10).map((item, idx) => (
                      <tr key={item.productId || `abc-${idx}`} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 font-mono text-slate-500">#{idx + 1}</td>
                        <td className="px-4 py-2.5 font-semibold text-white">{item.name}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-400">{item.sku || "—"}</td>
                        <td className="px-4 py-2.5 text-center font-bold text-white">{item.onHandQty}</td>
                        <td className="px-4 py-2.5 text-right font-mono">${(item.unitCost || 0).toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-300">
                          ${(item.totalValue || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                            item.category === "A"
                              ? "bg-emerald-400/20 text-emerald-300 border border-emerald-400/30"
                              : item.category === "B"
                              ? "bg-amber-400/20 text-amber-300 border border-amber-400/30"
                              : "bg-sky-400/20 text-sky-300 border border-sky-400/30"
                          }`}>
                            Class {item.category || "A"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* TAB 3: PARAMETRIC EXPORT STUDIO                                          */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "export-center" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Export Configuration Console */}
          <div className="lg:col-span-2 space-y-6">
            {/* 🇮🇳 Tally Prime & Zoho Books XML Data Bridge (Prominently featured at the top!) */}
            <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-slate-900/90 to-slate-950/95 p-6 space-y-4 shadow-xl backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/20 text-2xl shadow-inner border border-amber-400/30">
                    🇮🇳
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <span>Tally Prime & Zoho Books XML Data Bridge</span>
                      <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-400/30">
                        1-Click Import
                      </span>
                    </h3>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Stream compliant Tally DTD XML directly into Tally Prime / ERP 9 or Zoho Books. Exports Stock Inward (Receipt Notes), Stock Outward (Delivery Notes), and Stock Item Masters.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleTallyExportDownload("vouchers")}
                  disabled={isExporting}
                  className="flex flex-col items-start rounded-xl border border-white/10 bg-slate-900/90 p-3.5 hover:border-amber-400/50 hover:bg-slate-800 transition text-left group"
                >
                  <span className="text-xs font-bold text-amber-300 group-hover:text-amber-200">🧾 Tally Vouchers XML</span>
                  <span className="text-[11px] text-slate-400 mt-1">Receipt & Delivery Notes with party details & batches</span>
                  <span className="mt-2 text-[10px] font-mono text-amber-400">Download Vouchers →</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTallyExportDownload("masters")}
                  disabled={isExporting}
                  className="flex flex-col items-start rounded-xl border border-white/10 bg-slate-900/90 p-3.5 hover:border-sky-400/50 hover:bg-slate-800 transition text-left group"
                >
                  <span className="text-xs font-bold text-sky-300 group-hover:text-sky-200">🏷️ Stock Item Masters XML</span>
                  <span className="text-[11px] text-slate-400 mt-1">Catalog items with HSN codes, UOM & opening balances</span>
                  <span className="mt-2 text-[10px] font-mono text-sky-400">Download Masters →</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTallyExportDownload("both")}
                  disabled={isExporting}
                  className="flex flex-col items-start rounded-xl border border-emerald-400/40 bg-emerald-950/40 p-3.5 hover:border-emerald-400 hover:bg-emerald-950/60 transition text-left group"
                >
                  <span className="text-xs font-bold text-emerald-300 group-hover:text-emerald-200">📦 Full Combined Package</span>
                  <span className="text-[11px] text-slate-400 mt-1">Both Item Masters and Transaction Vouchers in one envelope</span>
                  <span className="mt-2 text-[10px] font-mono text-emerald-400">Download Complete XML →</span>
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-xl space-y-6">
              <div>
                <div className="inline-flex rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-orange-200">
                  📥 Compliance Export Engine
                </div>
                <h2 className="mt-2 text-xl font-bold text-white">Generate Parametric Data Export</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Stream sanitized, RFC 4180-compliant CSV and JSON exports directly from live multi-tenant transaction ledgers.
                </p>
              </div>

              {exportError && (
                <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs text-rose-200 flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{exportError}</span>
                </div>
              )}

              {exportSuccessMsg && (
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-xs text-emerald-200 flex items-center gap-2">
                  <span>✅</span>
                  <span>{exportSuccessMsg}</span>
                </div>
              )}

              {/* 1. Entity Selection Cards */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  1. Select Target Ledger Dataset
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { id: "stock-ledger", title: "Stock Ledger", desc: "Detailed chronological receipts, dispatches & audit logs", icon: "📦" },
                    { id: "products", title: "Catalog Master", desc: "Active products, pricing, stock levels & threshold alert states", icon: "🏷️" },
                    { id: "user-activity", title: "Operator Audit", desc: "Inflow and outflow throughput grouped per operator", icon: "👤" },
                    { id: "low-stock", title: "Low Stock Alert", desc: "Critical deficit items below reorder threshold", icon: "⚠️" },
                  ].map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setExportType(card.id as typeof exportType)}
                      className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
                        exportType === card.id
                          ? "border-amber-400 bg-amber-400/10 shadow-lg shadow-amber-400/5"
                          : "border-white/10 bg-slate-950/60 hover:bg-white/5"
                      }`}
                    >
                      <span className="text-2xl">{card.icon}</span>
                      <div>
                        <div className={`text-sm font-bold ${exportType === card.id ? "text-amber-200" : "text-white"}`}>
                          {card.title}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">{card.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Format & Preset Controls */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    2. Date Range & Quick Presets
                  </label>
                  <div className="flex flex-wrap gap-1 text-[11px]">
                    {[
                      { id: "today", label: "Today" },
                      { id: "7d", label: "Last 7 Days" },
                      { id: "30d", label: "Last 30 Days" },
                      { id: "month", label: "This Month" },
                      { id: "ytd", label: "YTD" },
                      { id: "all", label: "All Time" },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setDatePreset(p.id as Parameters<typeof setDatePreset>[0])}
                        className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300 hover:bg-white/10 hover:text-white transition"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={exportStartDate}
                      onChange={(e) => setExportStartDate(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-amber-400/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">End Date</label>
                    <input
                      type="date"
                      value={exportEndDate}
                      onChange={(e) => setExportEndDate(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-amber-400/50"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Operator Filter & Export Format */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Specific Operator (Optional)
                  </label>
                  <select
                    value={exportUserFilter}
                    onChange={(e) => setExportUserFilter(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-amber-400/50"
                  >
                    <option value="">All Operators (Unrestricted)</option>
                    {rawSummaryList.map((u, idx) => (
                      <option key={u._id || `user-filter-${idx}`} value={u._id || u.userId}>
                        {u.name || u.email} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Export File Format</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setExportFormat("csv")}
                      className={`flex-1 rounded-xl border py-2 text-xs font-bold transition ${
                        exportFormat === "csv"
                          ? "border-amber-400 bg-amber-400/20 text-amber-200"
                          : "border-white/10 bg-slate-950/60 text-slate-400 hover:text-white"
                      }`}
                    >
                      📊 CSV (Excel / RFC 4180)
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportFormat("json")}
                      className={`flex-1 rounded-xl border py-2 text-xs font-bold transition ${
                        exportFormat === "json"
                          ? "border-amber-400 bg-amber-400/20 text-amber-200"
                          : "border-white/10 bg-slate-950/60 text-slate-400 hover:text-white"
                      }`}
                    >
                      ⚙️ JSON (Structured)
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleExportDownload}
                  disabled={isExporting}
                  className="flex items-center justify-center gap-2 w-full sm:w-auto rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-6 py-3 text-sm font-bold text-slate-950 transition hover:from-amber-300 hover:to-orange-400 disabled:opacity-50 shadow-lg shadow-amber-500/10"
                >
                  {isExporting ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent"></span>
                      <span>Compiling & Streaming Export Stream…</span>
                    </>
                  ) : (
                    <>
                      <span>⬇️</span>
                      <span>Dispatch {exportFormat.toUpperCase()} Export Now</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Rail: Export Guidelines & Recent Export History */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-xl space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>🛡️</span> Compliance & Standards
              </h3>
              <ul className="space-y-2.5 text-xs text-slate-400 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span><strong>RFC 4180 Sanitization:</strong> Fully quotes strings containing commas, quotes or delimiters to prevent formula injection.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span><strong>Excel UTF-8 BOM:</strong> Embedded Byte Order Mark ensures Microsoft Excel displays special characters and accents seamlessly.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span><strong>Tenant Isolation:</strong> Enforces fail-closed multi-tenant boundary checks across all export records.</span>
                </li>
              </ul>
            </div>

            {/* Recent Downloads in Session */}
            <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-xl space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>🕒</span> Recent Exports in Session
              </h3>
              {recentExports.length === 0 ? (
                <div className="text-xs text-slate-500 py-3">No exports downloaded yet during this session.</div>
              ) : (
                <div className="space-y-2">
                  {recentExports.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-950/60 p-2.5 text-xs">
                      <div>
                        <div className="font-semibold text-white truncate max-w-[160px]">{item.fileName}</div>
                        <div className="text-[10px] text-slate-400">{item.timestamp} · {item.format}</div>
                      </div>
                      <span className="text-emerald-400 font-bold text-[11px]">Downloaded</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* TAB 4: AUTOMATED SCHEDULED REPORTS & CRON AUDITS                         */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "scheduled" && (
        <div className="space-y-6">
          {/* Header & Manual Triggers */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/50 p-5 backdrop-blur-xl">
            <div>
              <div className="inline-flex rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sky-200">
                ⏰ Automated Daemon Snapshots
              </div>
              <h2 className="mt-2 text-base font-bold text-white">Cron-Generated Audit Snapshots</h2>
              <p className="text-xs text-slate-400">
                Daily summaries compile automatically at 06:00 UTC; Weekly Low Stock digests run Mondays at 07:00 UTC.
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => triggerReportMutation.mutate("daily_summary")}
                disabled={triggerReportMutation.isPending}
                className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-xs font-bold text-amber-200 hover:bg-amber-400/20 disabled:opacity-50 transition"
              >
                {triggerReportMutation.isPending ? "Generating…" : "⚡ Run Daily Summary Snapshot"}
              </button>

              <button
                type="button"
                onClick={() => triggerReportMutation.mutate("weekly_low_stock")}
                disabled={triggerReportMutation.isPending}
                className="flex items-center gap-2 rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-2.5 text-xs font-bold text-sky-200 hover:bg-sky-400/20 disabled:opacity-50 transition"
              >
                {triggerReportMutation.isPending ? "Generating…" : "⚡ Run Weekly Low Stock Snapshot"}
              </button>
            </div>
          </div>

          {/* Scheduled Reports Table */}
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="border-b border-white/10 bg-slate-950/70 text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-6 py-4">Report Type</th>
                    <th className="px-6 py-4">Target Period</th>
                    <th className="px-6 py-4">Generated Timestamp</th>
                    <th className="px-6 py-4 text-center">Trigger Mode</th>
                    <th className="px-6 py-4 text-center">Items / Activity</th>
                    <th className="px-6 py-4 text-right">Inspection</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loadingScheduled ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-slate-400">
                        <div className="flex items-center justify-center gap-3">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent"></span>
                          <span>Loading scheduled report logs…</span>
                        </div>
                      </td>
                    </tr>
                  ) : scheduledList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-slate-500">
                        <div className="text-3xl">⏰</div>
                        <div className="mt-2 font-semibold text-white">No automated reports generated yet</div>
                        <div className="mt-1 text-xs">Use the trigger buttons above to run an instant snapshot.</div>
                      </td>
                    </tr>
                  ) : (
                    scheduledList.map((r, idx) => (
                      <tr key={r._id || `sched-${idx}`} className="hover:bg-white/[0.02] transition">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2.5 font-bold text-white">
                            <span>{r.type === "weekly_low_stock" ? "⚠️" : "📅"}</span>
                            <span className="capitalize">{r.type.replace(/_/g, " ")}</span>
                          </div>
                        </td>

                        <td className="px-6 py-4 font-mono text-xs text-slate-300">
                          {r.period || "Current"}
                        </td>

                        <td className="px-6 py-4 text-xs text-slate-400">
                          {new Date(r.generatedAt).toLocaleString()}
                        </td>

                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            r.triggeredBy === "manual"
                              ? "bg-amber-400/10 text-amber-300 border border-amber-400/20"
                              : "bg-sky-400/10 text-sky-300 border border-sky-400/20"
                          }`}>
                            {r.triggeredBy === "manual" ? "Manual Trigger" : "Cron Scheduler"}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-center">
                          <span className="font-mono font-bold text-white bg-slate-950/80 px-2.5 py-1 rounded-lg border border-white/5">
                            {r.itemCount !== undefined && r.itemCount !== null ? (
                              r.type === "weekly_low_stock" ? `${r.itemCount} low stock` : `${r.itemCount} transactions`
                            ) : (
                              "—"
                            )}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => setInspectingReportId(r._id)}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white transition"
                          >
                            🔍 Inspect Details
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* TAB 5: OPERATOR ACTIVITY & AUDITS                                        */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "user-activity" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/50 p-4 backdrop-blur-xl">
            <input
              type="text"
              value={operatorSearch}
              onChange={(e) => setOperatorSearch(e.target.value)}
              placeholder="Filter operators by name or email..."
              className="w-full max-w-sm rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-400/50"
            />
            <div className="text-xs text-slate-400">
              Showing <span className="font-bold text-white">{filteredUsers.length}</span> operators
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="border-b border-white/10 bg-slate-950/70 text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-6 py-4">Operator</th>
                    <th className="px-6 py-4">System Role</th>
                    <th className="px-6 py-4 text-center">Stock IN Units</th>
                    <th className="px-6 py-4 text-center">Stock OUT Units</th>
                    <th className="px-6 py-4 text-center">Total Operations</th>
                    <th className="px-6 py-4 text-right">Audit Trail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loadingSummary ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-slate-400">
                        Loading operator activity summaries…
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-slate-500">
                        No operator records found.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u, idx) => {
                      const uid = u._id || u.userId || "";
                      const inQty = u.totalIn ?? u.stockIn ?? 0;
                      const outQty = u.totalOut ?? u.stockOut ?? 0;
                      return (
                        <tr key={uid || `user-${idx}`} className="hover:bg-white/[0.02] transition">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-white">{u.name || "Unknown"}</div>
                            <div className="text-xs text-slate-400">{u.email}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-slate-300">
                              {u.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center font-mono font-bold text-emerald-400">
                            +{inQty}
                          </td>
                          <td className="px-6 py-4 text-center font-mono font-bold text-sky-400">
                            -{outQty}
                          </td>
                          <td className="px-6 py-4 text-center font-mono font-black text-white text-base">
                            {u.totalTransactions || (inQty + outQty)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedUserId(uid || null)}
                              className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-400/20 transition"
                            >
                              Inspect Ledger
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── SCHEDULED REPORT INSPECTOR MODAL ─────────────────────────────────── */}
      {inspectingReportId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>📋</span> Snapshot Detail:{" "}
                  <span className="capitalize">{singleReportData?.report?.type.replace(/_/g, " ")}</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Period: {singleReportData?.report?.period || "N/A"} · Generated {singleReportData?.report?.generatedAt ? new Date(singleReportData.report.generatedAt).toLocaleString() : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingReportId(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto space-y-4">
              {loadingSingleReport ? (
                <div className="p-12 text-center text-slate-400">Loading snapshot data…</div>
              ) : !singleReportData?.report?.data ? (
                <div className="p-12 text-center text-slate-500">No snapshot payload stored for this record.</div>
              ) : (
                <>
                  {/* Daily Summary Render */}
                  {singleReportData.report.type === "daily_summary" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                          <div className="text-[10px] uppercase text-slate-400">Total Inflow</div>
                          <div className="text-lg font-bold text-emerald-400">+{singleReportData.report.data.totalIn ?? 0}</div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                          <div className="text-[10px] uppercase text-slate-400">Total Outflow</div>
                          <div className="text-lg font-bold text-sky-400">-{singleReportData.report.data.totalOut ?? 0}</div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                          <div className="text-[10px] uppercase text-slate-400">Total Ops</div>
                          <div className="text-lg font-bold text-white">{singleReportData.report.data.totalTxns ?? 0}</div>
                        </div>
                      </div>

                      {singleReportData.report.data.byProduct && singleReportData.report.data.byProduct.length > 0 ? (
                        <table className="w-full text-left text-xs text-slate-300">
                          <thead className="border-b border-white/10 text-slate-400">
                            <tr>
                              <th className="py-2">Product</th>
                              <th className="py-2">Type</th>
                              <th className="py-2 text-center">Txns</th>
                              <th className="py-2 text-right">Quantity</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {singleReportData.report.data.byProduct.map((p, idx) => (
                              <tr key={idx} className="hover:bg-white/[0.02]">
                                <td className="py-2 font-semibold text-white">{p.productName}</td>
                                <td className="py-2">
                                  <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                    p.type === "IN" ? "bg-emerald-400/10 text-emerald-300" : "bg-sky-400/10 text-sky-300"
                                  }`}>
                                    {p.type}
                                  </span>
                                </td>
                                <td className="py-2 text-center font-mono text-slate-400">{p.count}</td>
                                <td className="py-2 text-right font-mono font-bold text-white">{p.totalQty}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="p-4 text-center text-xs text-slate-500">No product transactions recorded during this period.</div>
                      )}
                    </div>
                  )}

                  {/* Weekly Low Stock Render */}
                  {singleReportData.report.type === "weekly_low_stock" && (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-200">
                        ⚠️ <strong>{singleReportData.report.data.totalLowStock ?? 0} items</strong> flagged at or below minimum threshold.
                      </div>

                      {singleReportData.report.data.items && singleReportData.report.data.items.length > 0 ? (
                        <table className="w-full text-left text-xs text-slate-300">
                          <thead className="border-b border-white/10 text-slate-400">
                            <tr>
                              <th className="py-2">Product Name</th>
                              <th className="py-2 text-center">Current Units</th>
                              <th className="py-2 text-center">Minimum Threshold</th>
                              <th className="py-2 text-right">Deficit</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {singleReportData.report.data.items.map((it, idx) => (
                              <tr key={it.productId || idx} className="hover:bg-white/[0.02]">
                                <td className="py-2 font-semibold text-white">{it.name}</td>
                                <td className="py-2 text-center font-mono font-bold text-rose-400">{it.currentStock}</td>
                                <td className="py-2 text-center font-mono text-slate-400">{it.threshold}</td>
                                <td className="py-2 text-right font-mono font-bold text-amber-300">
                                  {Math.max(0, it.threshold - it.currentStock)} units
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="p-4 text-center text-xs text-slate-500">All products currently satisfy minimum safety stock levels.</div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="mt-4 flex justify-end border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setInspectingReportId(null)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── OPERATOR DRILLDOWN MODAL ─────────────────────────────────────────── */}
      {selectedUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>👤</span> Operator Ledger Audit Trail
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Chronological transaction logs generated by this operator.</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUserId(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto">
              {loadingActivity ? (
                <div className="p-12 text-center text-slate-400">Loading ledger items…</div>
              ) : activityList.length === 0 ? (
                <div className="p-12 text-center text-slate-500">No recorded transactions for this operator.</div>
              ) : (
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="border-b border-white/10 text-slate-400">
                    <tr>
                      <th className="py-2.5">Date</th>
                      <th className="py-2.5">Type</th>
                      <th className="py-2.5">Product</th>
                      <th className="py-2.5 text-center">Quantity</th>
                      <th className="py-2.5">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {activityList.map((item, idx) => (
                      <tr key={item._id || `act-${idx}`} className="hover:bg-white/[0.02]">
                        <td className="py-2.5 text-slate-400">
                          {new Date(item.createdAt).toLocaleDateString()}{" "}
                          {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="py-2.5">
                          <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold ${
                            item.type === "IN" ? "bg-emerald-400/10 text-emerald-400" : "bg-sky-400/10 text-sky-400"
                          }`}>
                            {item.type}
                          </span>
                        </td>
                        <td className="py-2.5 font-medium text-white">
                          {item.productId?.name || item.productName || "Unknown Item"}
                        </td>
                        <td className="py-2.5 text-center font-mono font-bold text-white">
                          {item.quantity}
                        </td>
                        <td className="py-2.5 text-slate-400 truncate max-w-xs">{item.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="mt-4 flex justify-end border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setSelectedUserId(null)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition"
              >
                Close Audit View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
