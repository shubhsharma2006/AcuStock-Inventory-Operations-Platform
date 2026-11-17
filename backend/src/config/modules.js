/**
 * Centralized System Module & Section Catalog
 * Defines the canonical list of functional sections, modules, and pre-built persona presets.
 */

const SYSTEM_SECTIONS = [
  {
    id: 'INTELLIGENCE',
    label: 'Intelligence & Overview',
    description: 'Dashboards, executive analytics, reports, and mobile scanners',
    moduleIds: ['dashboard', 'analytics', 'reports', 'scan'],
  },
  {
    id: 'OPERATIONS_WMS',
    label: 'Operations & WMS',
    description: 'Warehouse master catalog, bin locations, receiving, picking, and lot FEFO',
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

const MODULE_REGISTRY = {
  // Intelligence
  dashboard: { id: 'dashboard', label: 'Dashboard', sectionId: 'INTELLIGENCE', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'FULL_ACCESS' } },
  analytics: { id: 'analytics', label: 'Executive Analytics', sectionId: 'INTELLIGENCE', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'READ_ONLY' } },
  reports: { id: 'reports', label: 'Reports Hub & Aging', sectionId: 'INTELLIGENCE', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'HIDDEN' } },
  scan: { id: 'scan', label: 'Mobile WMS Scanner', sectionId: 'INTELLIGENCE', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'FULL_ACCESS' } },

  // Operations & WMS
  products: { id: 'products', label: 'Products & Catalog', sectionId: 'OPERATIONS_WMS', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'FULL_ACCESS' } },
  warehouses: { id: 'warehouses', label: 'Warehouses & Bins', sectionId: 'OPERATIONS_WMS', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'READ_ONLY' } },
  lots: { id: 'lots', label: 'Batches, Lots & FEFO', sectionId: 'OPERATIONS_WMS', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'READ_ONLY' } },
  'stock-transfers': { id: 'stock-transfers', label: 'Stock Transfers', sectionId: 'OPERATIONS_WMS', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'FULL_ACCESS' } },
  units: { id: 'units', label: 'Units of Measure', sectionId: 'OPERATIONS_WMS', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'READ_ONLY' } },
  'stock-in': { id: 'stock-in', label: 'Stock IN (Receiving)', sectionId: 'OPERATIONS_WMS', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'FULL_ACCESS' } },
  'stock-out': { id: 'stock-out', label: 'Stock OUT (Picking)', sectionId: 'OPERATIONS_WMS', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'FULL_ACCESS' } },
  'picking-waves': { id: 'picking-waves', label: 'Waves & Put-Wall', sectionId: 'OPERATIONS_WMS', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'FULL_ACCESS' } },

  // Stock Control
  'reorder-hub': { id: 'reorder-hub', label: 'Reorder Hub', sectionId: 'STOCK_CONTROL', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'READ_ONLY' } },
  adjustments: { id: 'adjustments', label: 'Adjustments & Scrap', sectionId: 'STOCK_CONTROL', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'READ_ONLY' } },
  'cycle-counts': { id: 'cycle-counts', label: 'Cycle Counts & Audits', sectionId: 'STOCK_CONTROL', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'FULL_ACCESS' } },
  reconciliation: { id: 'reconciliation', label: 'Reconciliation Queue', sectionId: 'STOCK_CONTROL', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'READ_ONLY' } },
  reservations: { id: 'reservations', label: 'Stock Holds & Locks', sectionId: 'STOCK_CONTROL', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'READ_ONLY' } },
  'stock-ledger': { id: 'stock-ledger', label: 'Stock Ledger & Chain', sectionId: 'STOCK_CONTROL', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'READ_ONLY' } },
  'remaining-stock': { id: 'remaining-stock', label: 'Remaining Stock', sectionId: 'STOCK_CONTROL', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'FULL_ACCESS' } },
  serials: { id: 'serials', label: 'Serial Traceability', sectionId: 'STOCK_CONTROL', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'READ_ONLY' } },
  warranty: { id: 'warranty', label: 'Warranty Tracking', sectionId: 'STOCK_CONTROL', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'READ_ONLY' } },

  // CRM & Sales
  crm: { id: 'crm', label: 'Deals & Pipeline', sectionId: 'CRM_SALES', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'READ_ONLY' } },
  'sales-orders': { id: 'sales-orders', label: 'Sales Orders', sectionId: 'CRM_SALES', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'READ_ONLY' } },
  invoices: { id: 'invoices', label: 'Invoices & AR', sectionId: 'CRM_SALES', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'HIDDEN' } },
  shipments: { id: 'shipments', label: 'Shipments & Logistics', sectionId: 'CRM_SALES', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'FULL_ACCESS' } },
  rma: { id: 'rma', label: 'Returns & RMA', sectionId: 'CRM_SALES', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'READ_ONLY' } },

  // Procurement & Manufacturing
  manufacturing: { id: 'manufacturing', label: 'Manufacturing & MRP', sectionId: 'PROCUREMENT_MFG', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'READ_ONLY' } },
  kits: { id: 'kits', label: 'Kits & Assemblies (BOM)', sectionId: 'PROCUREMENT_MFG', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'READ_ONLY' } },
  suppliers: { id: 'suppliers', label: 'Supplier Scorecards', sectionId: 'PROCUREMENT_MFG', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'READ_ONLY' } },
  valuation: { id: 'valuation', label: 'Valuation & Landed Cost', sectionId: 'PROCUREMENT_MFG', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'HIDDEN' } },
  'purchase-orders': { id: 'purchase-orders', label: 'Purchase Orders', sectionId: 'PROCUREMENT_MFG', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'READ_ONLY' } },
  'vendor-bills': { id: 'vendor-bills', label: 'Vendor Bills & AP', sectionId: 'PROCUREMENT_MFG', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'HIDDEN' } },
  'general-ledger': { id: 'general-ledger', label: 'General Ledger & P&L', sectionId: 'PROCUREMENT_MFG', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'READ_ONLY', USER: 'HIDDEN' } },

  // Management
  users: { id: 'users', label: 'Users & RBAC', sectionId: 'MANAGEMENT', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'READ_ONLY', USER: 'HIDDEN' } },
  companies: { id: 'companies', label: 'Companies & Vendors', sectionId: 'MANAGEMENT', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'READ_ONLY' } },
  invites: { id: 'invites', label: 'Team Invites', sectionId: 'MANAGEMENT', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'READ_ONLY', USER: 'HIDDEN' } },
  'import-history': { id: 'import-history', label: 'Import History & Rollback', sectionId: 'MANAGEMENT', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'READ_ONLY', USER: 'HIDDEN' } },
  notifications: { id: 'notifications', label: 'Notifications', sectionId: 'MANAGEMENT', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'FULL_ACCESS', USER: 'FULL_ACCESS' } },

  // System & Governance
  developer: { id: 'developer', label: 'Developer & API', sectionId: 'SYSTEM_GOVERNANCE', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'HIDDEN', USER: 'HIDDEN' } },
  backups: { id: 'backups', label: 'Backups & Recovery', sectionId: 'SYSTEM_GOVERNANCE', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'HIDDEN', USER: 'HIDDEN' } },
  'super-control': { id: 'super-control', label: 'SuperAdmin Control', sectionId: 'SYSTEM_GOVERNANCE', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'HIDDEN', USER: 'HIDDEN' } },
  'audit-logs': { id: 'audit-logs', label: 'Audit Logs', sectionId: 'SYSTEM_GOVERNANCE', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'HIDDEN', USER: 'HIDDEN' } },
  permissions: { id: 'permissions', label: 'Permissions', sectionId: 'SYSTEM_GOVERNANCE', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'HIDDEN', USER: 'HIDDEN' } },
  privacy: { id: 'privacy', label: 'Privacy & GDPR', sectionId: 'SYSTEM_GOVERNANCE', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'HIDDEN', USER: 'HIDDEN' } },
  billing: { id: 'billing', label: 'Billing', sectionId: 'SYSTEM_GOVERNANCE', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'HIDDEN', USER: 'HIDDEN' } },
  settings: { id: 'settings', label: 'Settings', sectionId: 'SYSTEM_GOVERNANCE', defaultAccess: { ADMIN: 'FULL_ACCESS', MANAGER: 'READ_ONLY', USER: 'READ_ONLY' } },
};

const ENTERPRISE_PERSONAS = [
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

module.exports = {
  SYSTEM_SECTIONS,
  MODULE_REGISTRY,
  ENTERPRISE_PERSONAS,
};
