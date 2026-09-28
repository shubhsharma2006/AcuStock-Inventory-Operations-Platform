"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface SearchResultItem {
  id: string;
  title: string;
  subtitle?: string;
  url?: string;
  type?: string;
  meta?: Record<string, unknown>;
}

interface ActionItem {
  title: string;
  subtitle: string;
  url: string;
}

interface SearchCategories {
  products: SearchResultItem[];
  serials:  SearchResultItem[];
  companies: SearchResultItem[];
  orders:   SearchResultItem[];
  actions:  ActionItem[];
}

interface SearchResponse {
  query: string;
  totalMatches: number;
  categories: SearchCategories;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/* ─── Icons ──────────────────────────────────────────────────────────────── */

const SearchIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);
const SpinnerIcon = () => (
  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);
const BoxIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);
const HashIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
  </svg>
);
const BuildingIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75" />
  </svg>
);
const OrderIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162a2.25 2.25 0 00-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15" />
  </svg>
);
const ZapIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
  </svg>
);

/* ─── Category Section ───────────────────────────────────────────────────── */

interface SectionProps {
  label: string;
  icon: React.ReactNode;
  items: Array<SearchResultItem | ActionItem>;
  onSelect: (url: string) => void;
  selectedIndex: number;
  startIndex: number;
  color?: string;
}

function ResultSection({ label, icon, items, onSelect, selectedIndex, startIndex, color = "text-amber-400" }: SectionProps) {
  if (!items.length) return null;
  return (
    <div>
      <div className={`flex items-center gap-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest ${color} opacity-70`}>
        {icon}
        <span>{label}</span>
      </div>
      {items.map((item, i) => {
        const url = (item as SearchResultItem).url ?? (item as ActionItem).url ?? "/";
        const globalIdx = startIndex + i;
        const isSelected = selectedIndex === globalIdx;
        return (
          <button
            key={`${label}-${i}`}
            type="button"
            onMouseDown={() => onSelect(url)}
            className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors ${
              isSelected ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            <div className="mt-0.5 shrink-0 text-slate-500">
              {label === "Products" ? <BoxIcon /> : label === "Serials" ? <HashIcon /> : label === "Companies" ? <BuildingIcon /> : label === "Orders" ? <OrderIcon /> : <ZapIcon />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.title}</p>
              {item.subtitle && (
                <p className="truncate text-xs text-slate-500">{item.subtitle}</p>
              )}
            </div>
            {isSelected && (
              <span className="shrink-0 self-center text-[10px] text-slate-500">↵</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Main Command Menu ──────────────────────────────────────────────────── */

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchCategories | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  const debouncedQuery = useDebounce(query, 250);

  // Detect role path
  const roleMatch = pathname.match(/\/dashboard\/([^/]+)/);
  const basePath = roleMatch ? `/dashboard/${roleMatch[1]}` : "/dashboard/admin";

  // ── Open/close on ⌘+K / Ctrl+K or custom event ─────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    function onOpenCustom() {
      setOpen(true);
    }
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("open-command-menu", onOpenCustom);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("open-command-menu", onOpenCustom);
    };
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults(null);
      setSelectedIndex(0);
    }
  }, [open]);

  // ── Search ───────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setSelectedIndex(0);

    apiFetch<SearchResponse>(`/search/global?q=${encodeURIComponent(debouncedQuery)}`)
      .then(data => {
        if (!cancelled) setResults(data.categories);
      })
      .catch(() => {
        if (!cancelled) setResults(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [debouncedQuery, open]);

  // ── Flat list for keyboard nav ───────────────────────────────
  const flatItems: Array<{ url: string }> = [];
  if (results) {
    const cats = [results.products, results.serials, results.companies, results.orders, results.actions];
    for (const cat of cats) {
      for (const item of cat) {
        flatItems.push({ url: (item as SearchResultItem).url ?? (item as ActionItem).url ?? "/" });
      }
    }
  }

  const navigate = useCallback((url: string) => {
    setOpen(false);
    const fullUrl = url.startsWith("/") && !url.startsWith("/dashboard")
      ? `${basePath}${url}`
      : url;
    router.push(fullUrl);
  }, [basePath, router]);

  // ── Keyboard navigation ──────────────────────────────────────
  function onKeyDownMenu(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flatItems[selectedIndex];
      if (item) navigate(item.url);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  if (!open) return null;

  // ── Section offsets ──────────────────────────────────────────
  const secProducts  = results?.products  ?? [];
  const secSerials   = results?.serials   ?? [];
  const secCompanies = results?.companies ?? [];
  const secOrders    = results?.orders    ?? [];
  const secActions   = results?.actions   ?? [];

  const off0 = 0;
  const off1 = off0 + secProducts.length;
  const off2 = off1 + secSerials.length;
  const off3 = off2 + secCompanies.length;
  const off4 = off3 + secOrders.length;

  const hasResults = flatItems.length > 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="fixed left-1/2 top-20 z-[101] w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/60"
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
        onKeyDown={onKeyDownMenu}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <span className="text-slate-500">
            {loading ? <SpinnerIcon /> : <SearchIcon />}
          </span>
          <input
            ref={inputRef}
            type="text"
            id="command-menu-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search products, orders, serials…"
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none"
            autoComplete="off"
          />
          <kbd className="hidden rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-400 sm:block">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {!hasResults && !loading && (
            <div className="px-4 py-10 text-center">
              {query ? (
                <>
                  <p className="text-sm font-medium text-slate-400">No results for "{query}"</p>
                  <p className="mt-1 text-xs text-slate-600">Try a product name, SKU, order number, or serial</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-400">Start typing to search</p>
                  <p className="mt-1 text-xs text-slate-600">Products, orders, companies, serials & quick actions</p>
                </>
              )}
            </div>
          )}

          {hasResults && (
            <>
              <ResultSection label="Products"  icon={<BoxIcon />}      items={secProducts}  onSelect={navigate} selectedIndex={selectedIndex} startIndex={off0} color="text-emerald-400" />
              <ResultSection label="Serials"   icon={<HashIcon />}     items={secSerials}   onSelect={navigate} selectedIndex={selectedIndex} startIndex={off1} color="text-blue-400" />
              <ResultSection label="Companies" icon={<BuildingIcon />} items={secCompanies} onSelect={navigate} selectedIndex={selectedIndex} startIndex={off2} color="text-violet-400" />
              <ResultSection label="Orders"    icon={<OrderIcon />}    items={secOrders}    onSelect={navigate} selectedIndex={selectedIndex} startIndex={off3} color="text-orange-400" />
              <ResultSection label="Actions"   icon={<ZapIcon />}      items={secActions}   onSelect={navigate} selectedIndex={selectedIndex} startIndex={off4} color="text-amber-400" />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 border-t border-white/5 px-4 py-2 text-[11px] text-slate-600">
          <span className="flex items-center gap-1"><kbd className="font-sans">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="font-sans">↵</kbd> open</span>
          <span className="ml-auto flex items-center gap-1"><kbd className="font-sans">⌘K</kbd> toggle</span>
        </div>
      </div>
    </>
  );
}
