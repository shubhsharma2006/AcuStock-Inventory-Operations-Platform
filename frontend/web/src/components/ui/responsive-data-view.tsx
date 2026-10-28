"use client";

import type { ReactNode } from "react";

export interface ResponsiveColumn<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
  hideOnMobile?: boolean;
}

interface ResponsiveDataViewProps<T> {
  columns: ResponsiveColumn<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  renderMobileCard?: (item: T) => ReactNode;
  emptyMessage?: string;
  emptyIcon?: string;
  isLoading?: boolean;
}

export function ResponsiveDataView<T>({
  columns,
  data,
  keyExtractor,
  renderMobileCard,
  emptyMessage = "No records found.",
  emptyIcon = "📦",
  isLoading = false
}: ResponsiveDataViewProps<T>) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8 text-center text-slate-400">
        <div className="text-3xl mb-2">{emptyIcon}</div>
        <p className="text-sm font-medium">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      {/* ── Mobile Card View (< 768px) ── */}
      <div className="space-y-3 md:hidden">
        {data.map((item) => (
          <div
            key={keyExtractor(item)}
            className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-sm"
          >
            {renderMobileCard ? (
              renderMobileCard(item)
            ) : (
              <div className="space-y-2">
                {columns.map((col) => (
                  <div key={col.key} className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium text-slate-400">{col.header}</span>
                    <span className="font-semibold text-slate-200 text-right">{col.render(item)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Desktop Tabular View (≥ 768px) ── */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3.5 ${
                      col.align === "right"
                        ? "text-right"
                        : col.align === "center"
                        ? "text-center"
                        : "text-left"
                    } ${col.className || ""}`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data.map((item) => (
                <tr
                  key={keyExtractor(item)}
                  className="transition hover:bg-white/[0.03] group"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3.5 text-slate-300 ${
                        col.align === "right"
                          ? "text-right"
                          : col.align === "center"
                          ? "text-center"
                          : "text-left"
                      } ${col.className || ""}`}
                    >
                      {col.render(item)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
