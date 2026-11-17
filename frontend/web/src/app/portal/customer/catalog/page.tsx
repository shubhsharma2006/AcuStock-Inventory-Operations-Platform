"use client";

import React, { useState, useEffect } from "react";
import {
  ShoppingCart,
  Package,
  Plus,
  Minus,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Search,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

interface CatalogProduct {
  _id: string;
  name: string;
  sku: string;
  barcode?: string;
  unitPrice: number;
  availableUnits: number;
  inStock: boolean;
  category?: string;
}

export default function CustomerCatalogPage() {
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [statement, setStatement] = useState<any | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOrdering, setIsOrdering] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [catRes, stateRes] = await Promise.all([
        apiFetch<any>("/portal/customer/catalog"),
        apiFetch<any>("/portal/customer/statement"),
      ]);

      if (catRes?.catalog) setCatalog(catRes.catalog);
      if (stateRes?.statement) setStatement(stateRes.statement);
      setIsLoading(false);
    } catch (err: any) {
      console.error("Failed to load customer portal data:", err);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const updateCart = (productId: string, delta: number, max: number) => {
    setCart((prev) => {
      const current = prev[productId] || 0;
      const nextVal = Math.max(0, Math.min(current + delta, max));
      if (nextVal === 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: nextVal };
    });
  };

  const cartItems = Object.entries(cart).map(([pId, qty]) => {
    const prod = catalog.find((p) => p._id === pId);
    return {
      productId: pId,
      name: prod?.name || "Item",
      unitPrice: prod?.unitPrice || 0,
      quantity: qty,
      lineTotal: (prod?.unitPrice || 0) * qty,
    };
  });

  const cartTotal = cartItems.reduce((acc, curr) => acc + curr.lineTotal, 0);

  const handlePlaceOrder = async () => {
    if (cartItems.length === 0) return;
    try {
      setIsOrdering(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await apiFetch<any>("/portal/customer/orders", {
        method: "POST",
        body: JSON.stringify({
          items: cartItems,
        }),
      });

      setIsOrdering(false);
      setCart({});
      setSuccessMsg(res.message || "Order submitted successfully! Our dispatch team is processing your order.");
      fetchData();
    } catch (err: any) {
      setIsOrdering(false);
      setErrorMsg(err.message || "Failed to submit wholesale order.");
    }
  };

  const filteredCatalog = catalog.filter((p) => {
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner / Customer Identity */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-zinc-900 to-zinc-800 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="text-[11px] uppercase tracking-widest font-bold text-zinc-400">
            B2B Client Self-Service Portal
          </span>
          <h1 className="text-2xl font-black tracking-tight mt-0.5">
            {statement?.company?.name || "Wholesale Ordering Portal"}
          </h1>
          <p className="text-xs text-zinc-300 mt-1">
            Browse live warehouse catalog, verified stock levels, and pre-negotiated tier pricing
          </p>
        </div>

        {statement && (
          <div className="flex gap-4 p-3 bg-white/10 backdrop-blur rounded-xl border border-white/10 text-xs">
            <div>
              <span className="text-[10px] uppercase text-zinc-400 block font-medium">Credit Limit</span>
              <span className="font-mono font-bold text-sm">₹{statement.creditLimit.toLocaleString("en-IN")}</span>
            </div>
            <div className="border-l border-white/20 pl-4">
              <span className="text-[10px] uppercase text-zinc-400 block font-medium">Available Credit</span>
              <span className="font-mono font-bold text-sm text-emerald-400">
                ₹{statement.availableCredit.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="border-l border-white/20 pl-4">
              <span className="text-[10px] uppercase text-zinc-400 block font-medium">Credit Days</span>
              <span className="font-mono font-bold text-sm">{statement.creditDays}d</span>
            </div>
          </div>
        )}
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Grid: Catalog on left, Cart on right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Product Catalog */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search products by SKU or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              onClick={fetchData}
              disabled={isLoading}
              className="p-2 border border-input rounded-lg bg-background hover:bg-muted text-foreground transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {filteredCatalog.map((prod) => {
              const inCartQty = cart[prod._id] || 0;

              return (
                <div
                  key={prod._id}
                  className="p-4 rounded-xl border border-border bg-card shadow-sm flex flex-col justify-between hover:border-primary/40 transition"
                >
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-xs text-foreground line-clamp-1">{prod.name}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          prod.inStock
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {prod.inStock ? `${prod.availableUnits} in stock` : "Out of Stock"}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-muted-foreground block mt-0.5">
                      SKU: {prod.sku || "--"}
                    </span>
                  </div>

                  <div className="pt-4 mt-2 border-t border-border/60 flex justify-between items-center">
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Wholesale Rate</span>
                      <span className="font-mono font-bold text-sm text-foreground">
                        ₹{prod.unitPrice.toLocaleString("en-IN")}
                      </span>
                    </div>

                    {prod.inStock ? (
                      <div className="flex items-center gap-1.5 bg-muted rounded-lg p-1">
                        <button
                          onClick={() => updateCart(prod._id, -1, prod.availableUnits)}
                          disabled={inCartQty === 0}
                          className="p-1 rounded bg-background hover:bg-muted-foreground/10 disabled:opacity-30"
                        >
                          <Minus className="w-3 h-3 text-foreground" />
                        </button>
                        <span className="font-mono text-xs font-bold px-2 min-w-[20px] text-center">
                          {inCartQty}
                        </span>
                        <button
                          onClick={() => updateCart(prod._id, 1, prod.availableUnits)}
                          disabled={inCartQty >= prod.availableUnits}
                          className="p-1 rounded bg-background hover:bg-muted-foreground/10 disabled:opacity-30"
                        >
                          <Plus className="w-3 h-3 text-foreground" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic">Unavailable</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Order Summary / Cart */}
        <div className="space-y-4">
          <div className="p-5 rounded-2xl border border-border bg-card shadow-sm sticky top-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-primary" />
                <h3 className="font-bold text-sm text-foreground">Wholesale Order Cart</h3>
              </div>
              <span className="text-xs font-mono font-semibold text-muted-foreground">
                {cartItems.length} items
              </span>
            </div>

            {cartItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <span>Your wholesale cart is empty. Select products from the catalog to submit an order.</span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="divide-y divide-border max-h-60 overflow-y-auto">
                  {cartItems.map((it) => (
                    <div key={it.productId} className="py-2.5 flex justify-between items-center text-xs">
                      <div>
                        <span className="font-medium text-foreground block">{it.name}</span>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {it.quantity} × ₹{it.unitPrice.toLocaleString("en-IN")}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-foreground">
                        ₹{it.lineTotal.toLocaleString("en-IN")}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-border pt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Order Subtotal:</span>
                    <span className="font-mono font-medium">₹{cartTotal.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Estimated GST (18%):</span>
                    <span className="font-mono font-medium">₹{Math.round(cartTotal * 0.18).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 text-sm font-bold text-foreground">
                    <span>Grand Total:</span>
                    <span className="font-mono text-base font-black text-primary">
                      ₹{Math.round(cartTotal * 1.18).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handlePlaceOrder}
                  disabled={isOrdering || cartItems.length === 0}
                  className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                >
                  {isOrdering ? (
                    <span>Submitting Order...</span>
                  ) : (
                    <>
                      <span>Place Wholesale Order</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

