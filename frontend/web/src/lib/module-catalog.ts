/**
 * Centralized Frontend Module Catalog & Enterprise Persona Presets
 */

export type AccessLevel = 'HIDDEN' | 'READ_ONLY' | 'FULL_ACCESS';

export interface ModuleDefinition {
  id: string;
  label: string;
  sectionId: string;
  href: string;
  icon: string;
}

export interface SectionDefinition {
  id: string;
  label: string;
  description: string;
  moduleIds: string[];
}

export interface PersonaPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  moduleAccess: Record<string, AccessLevel>;
  disabledSections?: string[];
  maskFinancials?: boolean;
  disableExport?: boolean;
}

export const SYSTEM_SECTIONS: SectionDefinition[] = [
  {
    id: 'INTELLIGENCE',
    label: 'Intelligence & Overview',
    description: 'Dashboards, executive analytics, reports, and mobile scanners',
    moduleIds: ['dashboard', 'analytics', 'reports', 'scan'],
  },
  {
    id: 'OPERATIONS_WMS',
    label: 'Operations & WMS',
    description: 'Warehouse catalog, bins, receiving, picking, and lot FEFO',
    moduleIds: ['products', 'warehouses', 'lots', 'stock-transfers', 'units', 'stock-in', 'stock-out', 'picking-waves'],
  },
  {
    id: 'STOCK_CONTROL',
    label: 'Stock Control & Audit',
    description: 'Reorder alerts, adjustments, cycle count audits, soft reservations, and stock ledgers',
    moduleIds: ['reorder-hub', 'adjustments', 'cycle-counts', 'reconciliation', 'reservations', 'stock-ledger', 'remaining-stock', 'serials', 'warranty'],
  },
  {
    id: 'CRM_SALES',
    label: 'CRM & Sales Pipeline',
    description: 'Deals, quotations, sales orders, tax invoices, shipments, and customer returns',
    moduleIds: ['crm', 'sales-orders', 'invoices', 'shipments', 'rma'],
  },
  {
    id: 'PROCUREMENT_MFG',
    label: 'Procurement & Value',
    description: 'Manufacturing MRP, BOM kits, supplier scorecards, valuation, POs, vendor bills, and general ledger',
    moduleIds: ['manufacturing', 'kits', 'suppliers', 'valuation', 'purchase-orders', 'vendor-bills', 'general-ledger'],
  },
  {
    id: 'MANAGEMENT',
    label: 'Management & Audits',
    description: 'User access directory, companies, team invites, bulk imports, and notifications',
    moduleIds: ['users', 'companies', 'invites', 'import-history', 'notifications'],
  },
  {
    id: 'SYSTEM_GOVERNANCE',
    label: 'System & Governance',
    description: 'SuperAdmin control, developer API keys, backups, audit logs, billing, and system settings',
    moduleIds: ['developer', 'backups', 'super-control', 'audit-logs', 'permissions', 'privacy', 'billing', 'settings'],
  },
];

export const ENTERPRISE_PERSONAS: PersonaPreset[] = [
  {
    id: 'WAREHOUSE_PICKER',
    name: 'Warehouse Picker & Runner',
    description: 'Strictly restricted to mobile scanning, picking waves, put-walls, and stock-out operations.',
    icon: 'scan',
    moduleAccess: {
      dashboard: 'READ_ONLY',
      scan: 'FULL_ACCESS',
      'picking-waves': 'FULL_ACCESS',
      'stock-out': 'FULL_ACCESS',
      'remaining-stock': 'READ_ONLY',
      notifications: 'FULL_ACCESS',
      settings: 'READ_ONLY',
    },
    disabledSections: ['CRM_SALES', 'PROCUREMENT_MFG', 'MANAGEMENT', 'SYSTEM_GOVERNANCE'],
    maskFinancials: true,
    disableExport: true,
  },
  {
    id: 'INVENTORY_AUDITOR',
    name: 'Inventory Auditor & Controller',
    description: 'Governs cycle counts, physical reconciliation, stock ledgers, scrap adjustments, and lot/serial traceability.',
    icon: 'ledger',
    moduleAccess: {
      dashboard: 'FULL_ACCESS',
      'cycle-counts': 'FULL_ACCESS',
      reconciliation: 'FULL_ACCESS',
      'stock-ledger': 'FULL_ACCESS',
      adjustments: 'FULL_ACCESS',
      lots: 'READ_ONLY',
      serials: 'READ_ONLY',
      warranty: 'READ_ONLY',
      products: 'READ_ONLY',
      warehouses: 'READ_ONLY',
      'remaining-stock': 'FULL_ACCESS',
      reports: 'FULL_ACCESS',
      notifications: 'FULL_ACCESS',
      settings: 'READ_ONLY',
    },
    disabledSections: ['CRM_SALES', 'PROCUREMENT_MFG', 'SYSTEM_GOVERNANCE'],
    maskFinancials: false,
    disableExport: false,
  },
  {
    id: 'PRODUCTION_SUPERVISOR',
    name: 'Shop Floor & Production Supervisor',
    description: 'Oversees discrete manufacturing, work centers, bill of materials (BOM), and assembly production orders.',
    icon: 'kits',
    moduleAccess: {
      dashboard: 'FULL_ACCESS',
      manufacturing: 'FULL_ACCESS',
      kits: 'FULL_ACCESS',
      products: 'READ_ONLY',
      'stock-in': 'FULL_ACCESS',
      'stock-out': 'FULL_ACCESS',
      'stock-transfers': 'FULL_ACCESS',
      'remaining-stock': 'FULL_ACCESS',
      notifications: 'FULL_ACCESS',
      settings: 'READ_ONLY',
    },
    disabledSections: ['CRM_SALES', 'MANAGEMENT', 'SYSTEM_GOVERNANCE'],
    maskFinancials: true,
    disableExport: false,
  },
  {
    id: 'BILLING_SPECIALIST',
    name: 'Billing & Accounts Receivable (AR)',
    description: 'Manages customer tax invoices, payments, credit notes, and customer account aging.',
    icon: 'billing',
    moduleAccess: {
      dashboard: 'FULL_ACCESS',
      invoices: 'FULL_ACCESS',
      'credit-notes': 'FULL_ACCESS',
      rma: 'READ_ONLY',
      'general-ledger': 'READ_ONLY',
      reports: 'READ_ONLY',
      companies: 'READ_ONLY',
      notifications: 'FULL_ACCESS',
      settings: 'READ_ONLY',
    },
    disabledSections: ['OPERATIONS_WMS', 'STOCK_CONTROL', 'SYSTEM_GOVERNANCE'],
    maskFinancials: false,
    disableExport: false,
  },
  {
    id: 'PROCUREMENT_OFFICER',
    name: 'Procurement & Purchasing Specialist',
    description: 'Purchase orders, vendor bills (AP 3-way match), supplier scorecards, and landed cost apportionment.',
    icon: 'po',
    moduleAccess: {
      dashboard: 'FULL_ACCESS',
      'purchase-orders': 'FULL_ACCESS',
      'vendor-bills': 'FULL_ACCESS',
      suppliers: 'FULL_ACCESS',
      valuation: 'FULL_ACCESS',
      'stock-in': 'READ_ONLY',
      companies: 'FULL_ACCESS',
      reports: 'READ_ONLY',
      notifications: 'FULL_ACCESS',
      settings: 'READ_ONLY',
    },
    disabledSections: ['CRM_SALES', 'SYSTEM_GOVERNANCE'],
    maskFinancials: false,
    disableExport: false,
  },
  {
    id: 'SALES_REPRESENTATIVE',
    name: 'Sales Executive & CRM Lead',
    description: 'Manages sales deals, quotations, customer sales orders, and outbound logistics shipments.',
    icon: 'crm',
    moduleAccess: {
      dashboard: 'FULL_ACCESS',
      crm: 'FULL_ACCESS',
      'sales-orders': 'FULL_ACCESS',
      products: 'READ_ONLY',
      shipments: 'READ_ONLY',
      companies: 'READ_ONLY',
      notifications: 'FULL_ACCESS',
      settings: 'READ_ONLY',
    },
    disabledSections: ['STOCK_CONTROL', 'PROCUREMENT_MFG', 'MANAGEMENT', 'SYSTEM_GOVERNANCE'],
    maskFinancials: true,
    disableExport: true,
  },
];
