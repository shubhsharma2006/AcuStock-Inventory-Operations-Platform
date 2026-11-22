"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, type ReactNode } from "react";
import { useSession } from "@/hooks/use-session";
import { useMyModules } from "@/hooks/use-module-permission";
import { useNotificationsData } from "@/hooks/use-feature-data";
import { useRealtimeState } from "@/components/realtime-provider";
import { UserMenu } from "@/components/user-menu";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { useTheme } from "@/components/theme-provider";
import { useWorkspace } from "@/hooks/use-workspace";
import { NotificationPopover } from "@/components/notification-popover";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import dynamic from "next/dynamic";
import type { Role } from "@/lib/acustock";

const CommandMenu = dynamic(() => import("@/components/command-menu").then((m) => m.CommandMenu), { ssr: false });
const CopilotDrawer = dynamic(() => import("@/components/ai/copilot-drawer").then((m) => m.CopilotDrawer), { ssr: false });
const OfflineScannerCache = dynamic(() => import("@/components/offline-scanner-cache").then((m) => m.OfflineScannerCache), { ssr: false });
const LiveToastContainer = dynamic(() => import("@/components/live-toast-container").then((m) => m.LiveToastContainer), { ssr: false });
const GlobalBarcodeScanner = dynamic(() => import("@/components/barcode/global-barcode-scanner").then((m) => m.GlobalBarcodeScanner), { ssr: false });

/* ─── Icon SVGs ─────────────────────────────────────────────────────────────── */

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const icons = {
  dashboard:   "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  analytics:   "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  products:    "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  stockIn:     "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5",
  stockOut:    "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12M12 16.5V3",
  ledger:      "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z",
  remaining:   "M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125",
  po:          "M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3",
  so:          "M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12",
  users:       "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z",
  companies:   "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z",
  notifications: "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0",
  settings:    "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z",
  permissions: "M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z",
  privacy:     "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
  billing:     "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z",
  developer:   "M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5",
  backups:     "M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z",
  reservations:"M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
  scan:        "M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5zM6.75 6.75h.008v.008H6.75V6.75zM6.75 16.5h.008v.008H6.75V16.5zM16.5 6.75h.008v.008H16.5V6.75zM13.5 13.5h.75v.75h-.75V13.5zm3 0h.75v.75h-.75V13.5zm-3 3h.75v.75h-.75V16.5zm3 3h.75v.75h-.75V19.5z",
  adjustments: "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99",
  valuation:   "M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  kits:        "M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9",
  fleet:       "M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689A1.125 1.125 0 003 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z",
  crm:         "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
  suppliers:   "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.999-3.199a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z",
  menu:        "M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5",
  close:       "M6 18L18 6M6 6l12 12",
};

/* ─── Nav item types ────────────────────────────────────────────────────────── */

type NavItem = {
  label: string;
  href: string;
  icon: string;
  badge?: number;
  roles?: Role[];
  readOnly?: boolean;
};

type NavGroup = {
  sectionId: string;
  label: string;
  items: NavItem[];
};

function extractModuleId(href: string, basePath: string): string {
  if (href === basePath) return "dashboard";
  const sub = href.replace(basePath, "").replace(/^\//, "");
  return sub.split("/")[0] || "dashboard";
}

function buildNavGroups(
  basePath: string,
  role: Role,
  unread: number,
  moduleHelper?: ReturnType<typeof useMyModules>
): NavGroup[] {
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  const isManager = role === "MANAGER";

  const rawGroups: NavGroup[] = [
    {
      sectionId: "INTELLIGENCE",
      label: "Intelligence & Overview",
      items: [
        { label: "Dashboard", href: basePath, icon: "dashboard" },
        { label: "Executive Analytics", href: `${basePath}/analytics`, icon: "analytics" },
        ...(isAdmin || isManager ? [{ label: "Reports Hub & Aging", href: `${basePath}/reports`, icon: "analytics" }] : []),
        { label: "Mobile WMS Scanner", href: `${basePath}/scan`, icon: "scan" },
      ],
    },
    {
      sectionId: "OPERATIONS_WMS",
      label: "Operations & WMS",
      items: [
        { label: "Products & Catalog", href: `${basePath}/products`, icon: "products" },
        { label: "Warehouses & Bins", href: `${basePath}/warehouses`, icon: "companies" },
        { label: "3D Digital Twin & Routing", href: `${basePath}/warehouse-twin`, icon: "scan" },
        { label: "Batches, Lots & FEFO", href: `${basePath}/lots`, icon: "ledger" },
        { label: "Stock Transfers", href: `${basePath}/stock-transfers`, icon: "so" },
        { label: "Units of Measure", href: `${basePath}/units`, icon: "products" },
        { label: "Stock IN (Receiving)", href: `${basePath}/stock-in`, icon: "stockIn" },
        { label: "Stock OUT (Picking)", href: `${basePath}/stock-out`, icon: "stockOut" },
        { label: "Waves & Put-Wall", href: `${basePath}/picking-waves`, icon: "stockOut" },
      ],
    },
    {
      sectionId: "STOCK_CONTROL",
      label: "Stock Control & Audit",
      items: [
        { label: "Reorder Hub", href: `${basePath}/reorder-hub`, icon: "po" },
        { label: "Adjustments & Scrap", href: `${basePath}/adjustments`, icon: "adjustments" },
        { label: "Cycle Counts & Audits", href: `${basePath}/cycle-counts`, icon: "ledger" },
        { label: "Reconciliation Queue", href: `${basePath}/reconciliation`, icon: "ledger" },
        { label: "Stock Holds & Soft Locks", href: `${basePath}/reservations`, icon: "reservations" },
        { label: "Stock Ledger & Chain", href: `${basePath}/stock-ledger`, icon: "ledger" },
        { label: "Remaining Stock", href: `${basePath}/remaining-stock`, icon: "remaining" },
        { label: "Serial Traceability", href: `${basePath}/serials`, icon: "products" },
        { label: "Warranty Tracking", href: `${basePath}/warranty`, icon: "privacy" },
      ],
    },
    {
      sectionId: "CRM_SALES",
      label: "CRM & Sales Pipeline",
      items: [
        { label: "Deals & Pipeline", href: `${basePath}/crm`, icon: "crm" },
        { label: "Sales Orders", href: `${basePath}/sales-orders`, icon: "so" },
        { label: "Invoices & AR", href: `${basePath}/invoices`, icon: "billing" },
        { label: "Shipments & Logistics", href: `${basePath}/shipments`, icon: "po" },
        { label: "B2B Heavy Freight & E-Way", href: `${basePath}/heavy-freight`, icon: "po" },
        { label: "Weight Disputes", href: `${basePath}/weight-discrepancies`, icon: "adjustments" },
        { label: "COD Remittance & Early Payout", href: `${basePath}/cod-remittance`, icon: "billing" },
        { label: "Logistics Wallet & Billing", href: `${basePath}/logistics-wallet`, icon: "billing" },
        { label: "NDR Control Tower", href: `${basePath}/ndr-management`, icon: "po" },
        { label: "Fleet & Porter Tower", href: `${basePath}/fleet-tracking`, icon: "fleet" },
        { label: "Returns & RMA", href: `${basePath}/rma`, icon: "adjustments" },
      ],
    },
    {
      sectionId: "PROCUREMENT_MFG",
      label: "Procurement & Value",
      items: [
        { label: "Manufacturing & MRP", href: `${basePath}/manufacturing`, icon: "kits" },
        { label: "Kits & Assemblies (BOM)", href: `${basePath}/kits`, icon: "kits" },
        { label: "Supplier Scorecards", href: `${basePath}/suppliers`, icon: "suppliers" },
        { label: "Valuation & Landed Cost", href: `${basePath}/valuation`, icon: "valuation" },
        { label: "Purchase Orders", href: `${basePath}/purchase-orders`, icon: "po" },
        { label: "Vendor Bills & AP", href: `${basePath}/vendor-bills`, icon: "billing" },
        { label: "General Ledger & P&L", href: `${basePath}/general-ledger`, icon: "billing" },
      ],
    },
    ...(isAdmin || isManager
      ? [
          {
            sectionId: "MANAGEMENT",
            label: "Management & Audits",
            items: [
              ...(isAdmin ? [{ label: "Users & RBAC", href: `${basePath}/users`, icon: "users" }] : []),
              ...(isAdmin ? [{ label: "Companies & Vendors", href: `${basePath}/companies`, icon: "companies" }] : []),
              ...(isAdmin ? [{ label: "Team Invites", href: `${basePath}/invites`, icon: "users" }] : []),
              { label: "Import History & Rollback", href: `${basePath}/import-history`, icon: "ledger" },
              { label: "Notifications", href: `${basePath}/notifications`, icon: "notifications", badge: unread > 0 ? unread : undefined },
            ],
          },
        ]
      : [
          {
            sectionId: "MANAGEMENT",
            label: "Personal",
            items: [
              { label: "Notifications", href: `${basePath}/notifications`, icon: "notifications", badge: unread > 0 ? unread : undefined },
            ],
          },
        ]),
    ...(isAdmin
      ? [
          {
            sectionId: "SYSTEM_GOVERNANCE",
            label: "System & Governance",
            items: [
              { label: "Developer & API", href: `${basePath}/developer`, icon: "developer" },
              { label: "Backups & Recovery", href: `${basePath}/backups`, icon: "backups" },
              { label: "SuperAdmin Control", href: `${basePath}/super-control`, icon: "permissions" },
              { label: "Audit Logs", href: `${basePath}/audit-logs`, icon: "ledger" },
              { label: "Permissions", href: `${basePath}/settings/permissions`, icon: "permissions" },
              { label: "Privacy & GDPR", href: `${basePath}/settings/privacy`, icon: "privacy" },
              { label: "Billing", href: `${basePath}/billing`, icon: "billing" },
              { label: "Settings", href: `${basePath}/settings`, icon: "settings" },
            ],
          },
        ]
      : [
          {
            sectionId: "SYSTEM_GOVERNANCE",
            label: "Account",
            items: [{ label: "Settings", href: `${basePath}/settings`, icon: "settings" }],
          },
        ]),
  ];

  // If moduleHelper permissions are loaded, filter dynamically
  if (!moduleHelper || !moduleHelper.data) {
    return rawGroups;
  }

  // SuperAdmin has access to everything
  if (role === "SUPER_ADMIN") {
    return rawGroups;
  }

  return rawGroups
    .filter((group) => !moduleHelper.disabledSections.includes(group.sectionId))
    .map((group) => {
      const filteredItems = group.items
        .map((item) => {
          const modId = extractModuleId(item.href, basePath);
          const isHidden = moduleHelper.isModuleHidden(modId);
          const isReadOnly = moduleHelper.isModuleReadOnly(modId);
          return {
            ...item,
            _hidden: isHidden,
            readOnly: isReadOnly,
          };
        })
        .filter((item) => !item._hidden);

      return {
        ...group,
        items: filteredItems,
      };
    })
    .filter((group) => group.items.length > 0);
}

/* ─── Dashboard Shell ───────────────────────────────────────────────────────── */

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useSession();
  const myModules = useMyModules();
  const { refreshToken, connected } = useRealtimeState();
  const { unreadCount } = useNotificationsData(1, 1, refreshToken);
  const { theme, toggleTheme } = useTheme();
  const { workspace, subdomain } = useWorkspace();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Client-Side Route Protection Guard:
  // If user visits a bookmarked or direct URL for a disabled module, redirect home with notification.
  useEffect(() => {
    if (!user || user.role === "SUPER_ADMIN" || !myModules.data) return;

    const roleSlug =
      user.role === "ADMIN"
        ? "admin"
        : user.role.toLowerCase();
    const basePath = `/dashboard/${roleSlug}`;

    const sub = pathname.replace(basePath, "").replace(/^\//, "");
    const currentModuleId = sub.split("/")[0] || "dashboard";

    if (currentModuleId && currentModuleId !== "dashboard" && myModules.isModuleHidden(currentModuleId)) {
      router.replace(basePath);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("acustock:notification", {
            detail: {
              title: "Module Access Restricted",
              message: `The '${currentModuleId}' module is disabled for your account by organizational governance.`,
              priority: "HIGH",
            },
          })
        );
      }
    }
  }, [pathname, user, myModules, router]);

  if (!user) return null;

  const roleSlug =
    user.role === "SUPER_ADMIN" || user.role === "ADMIN"
      ? "admin"
      : user.role.toLowerCase();
  const basePath = `/dashboard/${roleSlug}`;
  const navGroups = buildNavGroups(basePath, user.role, unreadCount, myModules);

  function isActive(href: string) {
    if (href === basePath) return pathname === basePath;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const sidebarContent = (
    <>
      {/* Logo & Workspace Brand */}
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-300 to-orange-500 text-sm font-black text-slate-950 shadow-lg shadow-amber-500/20">
          {workspace?.name ? workspace.name.charAt(0).toUpperCase() : "A"}
        </div>
        <div className="min-w-0">
          <div className="truncate text-base font-semibold tracking-tight text-white">
            {workspace?.name || "AcuStock"}
          </div>
          <div className="flex items-center gap-1.5 truncate text-[11px] text-slate-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="truncate font-mono">{workspace?.slug ? `${workspace.slug}.acustock` : `${roleSlug.toUpperCase()} Panel`}</span>
          </div>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 min-h-0 space-y-6 overflow-y-auto px-3 py-2 pb-8">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                      active
                        ? "bg-white/10 font-medium text-white shadow-sm"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon d={(icons as Record<string, string>)[item.icon] || icons.dashboard} className="h-[18px] w-[18px] shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.readOnly ? (
                      <span className="rounded bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 text-[9px] font-mono font-medium text-sky-400">
                        View Only
                      </span>
                    ) : null}
                    {item.badge ? (
                      <span className="rounded-full bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Connection & Heartbeat status */}
      <div className="shrink-0 border-t border-white/10 px-4 py-3 bg-slate-950 relative z-20">
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              {connected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${connected ? "bg-emerald-400" : "bg-amber-500"}`} />
            </span>
            <span className="font-medium text-slate-400">
              {connected ? "WMS Live Connected" : "Connecting Gateway…"}
            </span>
          </div>
          <span className="font-mono text-[10px] text-slate-500">
            ⌥B Scan
          </span>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-[260px] flex-col border-r border-white/5 bg-slate-950 transition-transform duration-300 lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Mobile close button */}
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="absolute right-3 top-4 rounded-lg p-1 text-slate-400 hover:text-white lg:hidden"
        >
          <Icon d={icons.close} className="h-5 w-5" />
        </button>
        {sidebarContent}
      </aside>

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top header */}
        <header className="relative z-40 flex h-16 shrink-0 items-center justify-between border-b border-white/5 bg-slate-950/80 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg border border-white/10 p-2 text-slate-400 transition hover:bg-white/5 hover:text-white lg:hidden"
            >
              <Icon d={icons.menu} className="h-5 w-5" />
            </button>
            <Breadcrumbs />
          </div>

          <div className="flex items-center gap-3">
            {/* Active Workspace Pill */}
            {workspace && (
              <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-semibold text-white">{workspace.name}</span>
                <span className="text-[10px] text-amber-300 font-mono">({workspace.slug})</span>
              </div>
            )}

            {/* Global Search trigger (⌘K) */}
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("open-command-menu"));
                }
              }}
              className="hidden md:flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
              title="Search products, serials, orders... (⌘K)"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Search...</span>
              <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">⌘K</kbd>
            </button>

            {/* Quick Barcode Scanner Trigger (Alt+B) */}
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("open-barcode-scanner"));
                }
              }}
              className="hidden sm:flex items-center gap-1.5 rounded-xl border border-amber-400/20 bg-amber-400/5 px-2.5 py-1.5 text-xs text-amber-300 transition hover:border-amber-400/40 hover:bg-amber-400/10 cursor-pointer"
              title="Quick scan barcode or serial number (Alt+B / ⌥B)"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              <span className="font-semibold hidden lg:inline">Scan</span>
              <kbd className="rounded border border-amber-400/30 bg-amber-400/10 px-1 py-0.2 font-mono text-[9px] text-amber-200">⌥B</kbd>
            </button>

            {/* Notification Center Popover */}
            <NotificationPopover basePath={basePath} />

            {/* Theme Toggle Button */}
            <button
              id="theme-toggle-btn"
              type="button"
              onClick={toggleTheme}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition-all duration-200 hover:border-amber-400/40 hover:bg-white/10 hover:text-amber-300 active:scale-95"
            >
              {theme === "dark" ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* User menu */}
            <UserMenu />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>

      <MobileBottomNav
        basePath={basePath}
        onOpenSidebar={() => setSidebarOpen(true)}
        unreadCount={unreadCount}
      />
      <OfflineScannerCache />
      <CommandMenu />
      <LiveToastContainer />
      <CopilotDrawer />
      <GlobalBarcodeScanner role={roleSlug} />
    </div>
  );
}
