"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const labelMap: Record<string, string> = {
  dashboard: "Dashboard",
  admin: "Admin",
  manager: "Manager",
  user: "User",
  products: "Products",
  "stock-in": "Stock IN",
  "stock-out": "Stock OUT",
  "stock-ledger": "Stock Ledger",
  "remaining-stock": "Remaining Stock",
  analytics: "Analytics",
  "purchase-orders": "Purchase Orders",
  "sales-orders": "Sales Orders",
  users: "Users",
  companies: "Companies",
  notifications: "Notifications",
  settings: "Settings",
  permissions: "Permissions",
  privacy: "Privacy & GDPR",
  billing: "Billing",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // Skip rendering if we're at root or just /dashboard
  if (segments.length <= 2) return null;

  // Skip the role segment for display
  const displaySegments = segments.filter(
    (s) => !["admin", "manager", "user", "super_admin"].includes(s.toLowerCase())
  );

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate-400">
      {displaySegments.map((segment, index) => {
        const href = "/" + segments.slice(0, segments.indexOf(segment) + 1).join("/");
        const label = labelMap[segment] || segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
        const isLast = index === displaySegments.length - 1;

        return (
          <span key={href} className="flex items-center gap-1.5">
            {index > 0 && <span className="text-slate-600">/</span>}
            {isLast ? (
              <span className="font-medium text-white">{label}</span>
            ) : (
              <Link href={href} className="transition hover:text-white">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
