"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MobileBarcodeScanner } from "./barcode/mobile-barcode-scanner";

interface MobileBottomNavProps {
  basePath: string;
  onOpenSidebar: () => void;
  unreadCount?: number;
}

export function MobileBottomNav({ basePath, onOpenSidebar, unreadCount = 0 }: MobileBottomNavProps) {
  const pathname = usePathname();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [movementMenuOpen, setMovementMenuOpen] = useState(false);

  function handleScannedCode(code: string) {
    // Navigate directly to serial / product search or open relevant record
    window.location.href = `${basePath}/serials?q=${encodeURIComponent(code)}`;
  }

  const isHome = pathname === basePath;
  const isAlerts = pathname.includes("/notifications");

  return (
    <>
      {/* Quick Move Bottom Sheet Popup */}
      {movementMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden animate-in fade-in duration-150"
          onClick={() => setMovementMenuOpen(false)}
        >
          <div
            className="fixed inset-x-0 bottom-16 z-50 rounded-t-3xl border-t border-slate-700 bg-slate-900 p-5 shadow-2xl animate-in slide-in-from-bottom-5 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-700" />
            <h3 className="text-sm font-bold text-white mb-3">Warehouse Stock Actions</h3>
            <div className="grid grid-cols-3 gap-2.5">
              <Link
                href={`${basePath}/stock-in`}
                onClick={() => setMovementMenuOpen(false)}
                className="flex flex-col items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-center text-emerald-300 hover:bg-emerald-500/20 active:scale-95 transition"
              >
                <span className="text-xl mb-1">📥</span>
                <span className="text-xs font-bold">Stock IN</span>
              </Link>
              <Link
                href={`${basePath}/stock-out`}
                onClick={() => setMovementMenuOpen(false)}
                className="flex flex-col items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-center text-rose-300 hover:bg-rose-500/20 active:scale-95 transition"
              >
                <span className="text-xl mb-1">📤</span>
                <span className="text-xs font-bold">Stock OUT</span>
              </Link>
              <Link
                href={`${basePath}/stock-transfers`}
                onClick={() => setMovementMenuOpen(false)}
                className="flex flex-col items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-center text-amber-300 hover:bg-amber-500/20 active:scale-95 transition"
              >
                <span className="text-xl mb-1">🔄</span>
                <span className="text-xs font-bold">Transfer</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Camera Barcode & QR Scanner Dialog */}
      <MobileBarcodeScanner
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScannedCode}
      />

      {/* Sticky Bottom Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-slate-800 bg-slate-950/98 px-2 shadow-2xl lg:hidden safe-area-pb"
      >
        {/* 1. Home */}
        <Link
          href={basePath}
          className={`flex flex-col items-center justify-center gap-1 min-w-[56px] min-h-[48px] rounded-xl transition ${
            isHome ? "text-amber-400 font-bold" : "text-slate-400 hover:text-white"
          }`}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={isHome ? 2.2 : 1.7} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span className="text-[10px]">Home</span>
        </Link>

        {/* 2. Warehouse Move (IN/OUT/Transfer) */}
        <button
          type="button"
          onClick={() => setMovementMenuOpen(!movementMenuOpen)}
          className="flex flex-col items-center justify-center gap-1 min-w-[56px] min-h-[48px] text-slate-400 hover:text-white transition cursor-pointer"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <span className="text-[10px]">Move</span>
        </button>

        {/* 3. Center Action: Camera Scanner */}
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          className="relative -top-3 flex h-13 w-13 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/40 ring-4 ring-slate-950 active:scale-95 transition cursor-pointer"
          aria-label="Scan barcode or QR code"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
        </button>

        {/* 4. Alerts / Notifications */}
        <Link
          href={`${basePath}/notifications`}
          className={`relative flex flex-col items-center justify-center gap-1 min-w-[56px] min-h-[48px] rounded-xl transition ${
            isAlerts ? "text-amber-400 font-bold" : "text-slate-400 hover:text-white"
          }`}
        >
          <div className="relative">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={isAlerts ? 2.2 : 1.7} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </div>
          <span className="text-[10px]">Alerts</span>
        </Link>

        {/* 5. Menu Drawer */}
        <button
          type="button"
          onClick={onOpenSidebar}
          className="flex flex-col items-center justify-center gap-1 min-w-[56px] min-h-[48px] text-slate-400 hover:text-white transition cursor-pointer"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span className="text-[10px]">Menu</span>
        </button>
      </nav>
    </>
  );
}
