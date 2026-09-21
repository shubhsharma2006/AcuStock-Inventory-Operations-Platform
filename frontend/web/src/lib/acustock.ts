export const ACUSTOCK_API_BASE_URL =
  process.env.NEXT_PUBLIC_ACUSTOCK_API_URL ?? "/api";

export const ACUSTOCK_SOCKET_URL =
  process.env.NEXT_PUBLIC_ACUSTOCK_SOCKET_URL ??
  (process.env.NODE_ENV === "production" ? "" : "http://127.0.0.1:5001");

export const APP_NAME = "AcuStock";

export type Role = "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "USER";

export type AuthUser = {
  _id: string;
  name?: string;
  email?: string;
  phone?: string;
  role: Role;
  isActive?: boolean;
};

export type NotificationTarget = {
  link?: string;
  type?: string;
  category?: string;
};

export function getRoleHome(role: Role) {
  if (role === "SUPER_ADMIN") return "/dashboard/super_admin";
  if (role === "ADMIN") return "/dashboard/admin";
  if (role === "MANAGER") return "/dashboard/manager";
  return "/dashboard/user";
}

export function resolveNotificationRoute(notification: NotificationTarget, role: Role) {
  const roleBase = `/dashboard/${role.toLowerCase()}`;
  const directLink = notification.link?.trim();

  if (directLink) {
    if (directLink.startsWith("/")) return directLink;
    switch (directLink) {
      case "stock":
        return `${roleBase}/remaining-stock`;
      case "users":
      case "settings":
      case "ownership-admins":
      case "ownership-transfer":
        return `${roleBase}/settings`;
      case "warranty-list":
        return `${roleBase}/notifications`;
      case "companies":
        return `${roleBase}/products`;
      default:
        break;
    }
  }

  switch (notification.type) {
    case "stock_in":
    case "stock_out":
    case "low_stock":
      return `${roleBase}/remaining-stock`;
    case "user_registered":
    case "user_deactivated":
    case "user_activated":
    case "role_changed":
    case "password_changed":
    case "password_reset":
    case "failed_login":
    case "account_locked":
      return `${roleBase}/settings`;
    default:
      return `${roleBase}/notifications`;
  }
}
