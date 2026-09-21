"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/hooks/use-session";

export function UserMenu() {
  const { user } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;

  const initials = (user.name || user.email || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const roleBadgeColor: Record<string, string> = {
    SUPER_ADMIN: "bg-amber-400/20 text-amber-200",
    ADMIN: "bg-sky-400/20 text-sky-200",
    MANAGER: "bg-emerald-400/20 text-emerald-200",
    USER: "bg-purple-400/20 text-purple-200",
  };

  async function handleLogout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // Logout even if API fails
    }
    router.replace("/login");
  }

  const roleBase = `/dashboard/${
    user.role === "SUPER_ADMIN" || user.role === "ADMIN"
      ? "admin"
      : user.role.toLowerCase()
  }`;

  return (
    <div ref={menuRef} className="relative z-50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 rounded-full border border-white/10 bg-slate-900/60 py-1.5 pl-1.5 pr-3 transition hover:border-white/20 hover:bg-slate-900/80"
      >
        <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-orange-500 text-xs font-bold text-slate-950">
          {initials}
        </div>
        <span className="hidden text-sm font-medium text-white sm:block">
          {user.name || user.email || "User"}
        </span>
        <svg
          className={`h-4 w-4 text-slate-400 transition ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-white/15 bg-slate-900 shadow-2xl backdrop-blur-2xl">
          <div className="border-b border-white/10 p-4">
            <div className="text-sm font-semibold text-white">
              {user.name || "User"}
            </div>
            <div className="mt-0.5 text-xs text-slate-400">{user.email}</div>
            <span
              className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                roleBadgeColor[user.role] || "bg-slate-400/20 text-slate-200"
              }`}
            >
              {user.role.replace("_", " ")}
            </span>
          </div>

          <div className="py-1">
            <button
              type="button"
              onClick={() => { setOpen(false); router.push(`${roleBase}/settings`); }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              Profile & Settings
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); router.push(`${roleBase}/settings/privacy`); }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              Privacy & Data
            </button>
          </div>

          <div className="border-t border-white/10 py-1">
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-rose-300 transition hover:bg-rose-400/10"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
