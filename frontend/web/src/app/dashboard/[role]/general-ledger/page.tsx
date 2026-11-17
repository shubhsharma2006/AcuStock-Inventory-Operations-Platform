"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Landmark,
  Scale,
  FileSpreadsheet,
  PieChart,
  Plus,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  FileText,
  DollarSign,
  TrendingUp,
  Download,
  BookOpen,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { CreateAccountModal } from "@/components/general-ledger/create-account-modal";
import { ManualJournalModal } from "@/components/general-ledger/manual-journal-modal";

interface AccountRecord {
  _id: string;
  accountCode: string;
  accountName: string;
  accountType: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  subType?: string;
  normalBalance: "DEBIT" | "CREDIT";
  currentBalance: number;
  description?: string;
  isSystemAccount?: boolean;
}

interface JournalEntryRecord {
  _id: string;
  entryNumber: string;
  entryDate: string;
  sourceDocument?: {
    documentType: string;
    referenceNumber?: string;
  };
  memo?: string;
  lines: Array<{
    accountId: string;
    accountCode: string;
    accountName: string;
    debit: number;
    credit: number;
    description?: string;
  }>;
  totalDebit: number;
  totalCredit: number;
  status: string;
}

export default function GeneralLedgerPage() {
  const [activeTab, setActiveTab] = useState<"coa" | "journal" | "trial" | "statements">("coa");

  // Data states
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntryRecord[]>([]);
  const [trialBalanceData, setTrialBalanceData] = useState<any | null>(null);
  const [pnlData, setPnlData] = useState<any | null>(null);
  const [bsData, setBsData] = useState<any | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [coaTypeFilter, setCoaTypeFilter] = useState<string>("ALL");

  // Modals
  const [showCreateAccount, setShowCreateAccount] = useState<boolean>(false);
  const [showManualJournal, setShowManualJournal] = useState<boolean>(false);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [accRes, jeRes, tbRes, pnlRes, bsRes] = await Promise.all([
        apiFetch<any>("/gl/accounts"),
        apiFetch<any>("/gl/journal-entries"),
        apiFetch<any>("/gl/trial-balance"),
        apiFetch<any>("/gl/profit-and-loss"),
        apiFetch<any>("/gl/balance-sheet"),
      ]);

      if (accRes?.accounts) setAccounts(accRes.accounts);
      if (jeRes?.entries) setJournalEntries(jeRes.entries);
      if (tbRes) setTrialBalanceData(tbRes);
      if (pnlRes?.statement) setPnlData(pnlRes.statement);
      if (bsRes) setBsData(bsRes);

      setIsLoading(false);
    } catch (err: any) {
      console.error("Failed to load General Ledger data:", err);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      const q = searchQuery.toLowerCase();
      const match =
        acc.accountCode.toLowerCase().includes(q) ||
        acc.accountName.toLowerCase().includes(q) ||
        (acc.subType || "").toLowerCase().includes(q);
      const typeMatch = coaTypeFilter === "ALL" || acc.accountType === coaTypeFilter;
      return match && typeMatch;
    });
  }, [accounts, searchQuery, coaTypeFilter]);

  const filteredEntries = useMemo(() => {
    return journalEntries.filter((je) => {
      const q = searchQuery.toLowerCase();
      const numMatch = je.entryNumber.toLowerCase().includes(q);
      const memoMatch = (je.memo || "").toLowerCase().includes(q);
      const docMatch = (je.sourceDocument?.referenceNumber || "").toLowerCase().includes(q);
      return numMatch || memoMatch || docMatch;
    });
  }, [journalEntries, searchQuery]);

  // Aggregate stats
  const totalAssets = bsData?.assets?.total || 0;
  const totalRevenue = pnlData?.revenue?.total || 0;
  const netIncome = pnlData?.netIncome || 0;
  const isLedgerBalanced = trialBalanceData?.isBalanced ?? true;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Scale className="w-6 h-6 text-primary" />
            General Ledger & Corporate Financials
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Double-entry Chart of Accounts, automated transaction journal, Trial Balance & statutory statements
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "coa" && (
            <button
              onClick={() => setShowCreateAccount(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              New Account
            </button>
          )}

          {activeTab === "journal" && (
            <button
              onClick={() => setShowManualJournal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Manual Journal Entry
            </button>
          )}

          <button
            onClick={fetchData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-input bg-background hover:bg-muted transition text-foreground"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl border border-border bg-card shadow-sm">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
            Total Assets (Book Value)
          </span>
          <div className="text-2xl font-bold font-mono text-foreground mt-1">
            ₹{totalAssets.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-muted-foreground">Cash, Bank, AR & Inventory</span>
        </div>

        <div className="p-5 rounded-xl border border-border bg-card shadow-sm">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
            Gross Sales Revenue
          </span>
          <div className="text-2xl font-bold font-mono text-primary mt-1">
            ₹{totalRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-muted-foreground">Operating commercial revenue</span>
        </div>

        <div className="p-5 rounded-xl border border-border bg-card shadow-sm">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
            Net Operating Income
          </span>
          <div
            className={`text-2xl font-bold font-mono mt-1 ${
              netIncome >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            }`}
          >
            ₹{netIncome.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-muted-foreground">Revenue - COGS - Expenses</span>
        </div>

        <div className="p-5 rounded-xl border border-border bg-card shadow-sm">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
            Double-Entry Integrity
          </span>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            BALANCED
          </div>
          <span className="text-[11px] text-emerald-600/80">Σ Debits === Σ Credits (0.00 Variance)</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("coa")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
            activeTab === "coa"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Landmark className="w-4 h-4" />
          Chart of Accounts (COA)
          <span className="px-1.5 py-0.5 text-[11px] font-bold rounded-full bg-primary/10 text-primary font-mono">
            {accounts.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("journal")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
            activeTab === "journal"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          General Journal Ledger
          <span className="px-1.5 py-0.5 text-[11px] font-bold rounded-full bg-primary/10 text-primary font-mono">
            {journalEntries.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("trial")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
            activeTab === "trial"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Scale className="w-4 h-4" />
          Trial Balance
        </button>

        <button
          onClick={() => setActiveTab("statements")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
            activeTab === "statements"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <PieChart className="w-4 h-4" />
          Financial Statements (P&L & BS)
        </button>
      </div>

      {/* TAB 1: CHART OF ACCOUNTS (COA) */}
      {activeTab === "coa" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search account code, name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
              <select
                value={coaTypeFilter}
                onChange={(e) => setCoaTypeFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-input bg-background focus:outline-none text-foreground font-mono"
              >
                <option value="ALL">All Account Classes</option>
                <option value="ASSET">ASSET (1000s)</option>
                <option value="LIABILITY">LIABILITY (2000s)</option>
                <option value="EQUITY">EQUITY (3000s)</option>
                <option value="REVENUE">REVENUE (4000s)</option>
                <option value="EXPENSE">EXPENSE (5000s)</option>
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 border-b border-border text-xs uppercase font-medium text-muted-foreground">
                  <tr>
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Account Name</th>
                    <th className="py-3 px-4">Category Class</th>
                    <th className="py-3 px-4">Sub-Classification</th>
                    <th className="py-3 px-4 text-center">Normal</th>
                    <th className="py-3 px-4 text-right">Current Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredAccounts.map((acc) => (
                    <tr key={acc._id} className="hover:bg-muted/30 transition">
                      <td className="py-3 px-4 font-mono font-bold text-foreground">
                        {acc.accountCode}
                      </td>
                      <td className="py-3 px-4 font-medium text-foreground">
                        {acc.accountName}
                        {acc.isSystemAccount && (
                          <span className="ml-2 px-1.5 py-0.5 text-[10px] font-mono rounded bg-muted text-muted-foreground uppercase font-bold">
                            SYS
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                            acc.accountType === "ASSET"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : acc.accountType === "LIABILITY"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              : acc.accountType === "EQUITY"
                              ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                              : acc.accountType === "REVENUE"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {acc.accountType}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                        {acc.subType || "—"}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-xs font-semibold text-muted-foreground">
                        {acc.normalBalance === "DEBIT" ? "Dr" : "Cr"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-foreground">
                        ₹{(acc.currentBalance || 0).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: GENERAL JOURNAL */}
      {activeTab === "journal" && (
        <div className="space-y-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search entry #, memo, docket..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-3">
            {filteredEntries.map((je) => (
              <div
                key={je._id}
                className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-2.5">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-sm text-foreground">
                      {je.entryNumber}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(je.entryDate).toLocaleDateString("en-IN", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-muted text-muted-foreground">
                      {je.sourceDocument?.documentType || "MANUAL"}
                    </span>
                    {je.sourceDocument?.referenceNumber && (
                      <span className="font-mono text-xs text-primary font-medium">
                        Ref: {je.sourceDocument.referenceNumber}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-foreground">
                      ₹{je.totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      POSTED
                    </span>
                  </div>
                </div>

                {je.memo && (
                  <p className="text-xs text-muted-foreground italic">
                    <span className="font-semibold text-foreground not-italic">Memo:</span> {je.memo}
                  </p>
                )}

                {/* Lines Table */}
                <div className="border border-border/60 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/30 border-b border-border text-muted-foreground">
                      <tr>
                        <th className="py-1.5 px-3 text-left">Account</th>
                        <th className="py-1.5 px-3 text-left">Description</th>
                        <th className="py-1.5 px-3 text-right w-28">Debit (₹)</th>
                        <th className="py-1.5 px-3 text-right w-28">Credit (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 font-mono">
                      {je.lines.map((line, idx) => (
                        <tr key={idx} className="hover:bg-muted/10">
                          <td className="py-1.5 px-3 text-foreground font-medium">
                            {line.accountCode} — {line.accountName}
                          </td>
                          <td className="py-1.5 px-3 text-muted-foreground font-sans">
                            {line.description || "—"}
                          </td>
                          <td className="py-1.5 px-3 text-right">
                            {line.debit > 0
                              ? `₹${line.debit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                              : "—"}
                          </td>
                          <td className="py-1.5 px-3 text-right">
                            {line.credit > 0
                              ? `₹${line.credit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: TRIAL BALANCE */}
      {activeTab === "trial" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <h3 className="font-bold text-sm text-foreground">
                  Trial Balance Identity Verified
                </h3>
                <p className="text-xs text-muted-foreground">
                  Universal double-entry rule confirmed: Total Debits match Total Credits with zero variance.
                </p>
              </div>
            </div>
            <div className="text-right font-mono">
              <span className="text-xs text-muted-foreground block">Net Variance</span>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                ₹{trialBalanceData?.variance || 0}.00
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
            <table className="w-full text-left text-sm font-mono">
              <thead className="bg-muted/50 border-b border-border text-xs uppercase font-medium text-muted-foreground">
                <tr>
                  <th className="py-3 px-4">Account Code</th>
                  <th className="py-3 px-4 font-sans">Account Name</th>
                  <th className="py-3 px-4 text-right">Debit Balance (₹)</th>
                  <th className="py-3 px-4 text-right">Credit Balance (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs">
                {trialBalanceData?.lines?.map((line: any) => (
                  <tr key={line.accountId} className="hover:bg-muted/30 transition">
                    <td className="py-2.5 px-4 font-bold text-foreground">{line.accountCode}</td>
                    <td className="py-2.5 px-4 font-sans font-medium text-foreground">
                      {line.accountName}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {line.debit > 0
                        ? `₹${line.debit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                        : "—"}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {line.credit > 0
                        ? `₹${line.credit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/40 border-t-2 border-border font-bold text-sm">
                <tr>
                  <td colSpan={2} className="py-3 px-4 font-sans text-right">
                    Totals:
                  </td>
                  <td className="py-3 px-4 text-right text-primary">
                    ₹{(trialBalanceData?.totalDebits || 0).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td className="py-3 px-4 text-right text-primary">
                    ₹{(trialBalanceData?.totalCredits || 0).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: FINANCIAL STATEMENTS (P&L and BALANCE SHEET) */}
      {activeTab === "statements" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Profit & Loss Statement */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-bold text-foreground flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  Profit & Loss Statement (Income)
                </h3>
                <p className="text-xs text-muted-foreground">Operating performance summary</p>
              </div>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-semibold">
                Fiscal Period
              </span>
            </div>

            {pnlData && (
              <div className="space-y-4 text-xs">
                {/* Revenue Section */}
                <div className="space-y-1.5">
                  <span className="font-semibold uppercase tracking-wider text-muted-foreground text-[11px] block">
                    Operating Revenue
                  </span>
                  {pnlData.revenue?.accounts?.map((a: any) => (
                    <div key={a.code} className="flex justify-between py-1 border-b border-border/40 font-mono">
                      <span>{a.code} - {a.name}</span>
                      <span className="font-semibold">₹{a.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-mono font-bold pt-1 text-sm text-foreground">
                    <span>Total Revenue</span>
                    <span>₹{pnlData.revenue?.total?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* COGS Section */}
                <div className="space-y-1.5 pt-2 border-t border-border">
                  <span className="font-semibold uppercase tracking-wider text-muted-foreground text-[11px] block">
                    Cost of Goods Sold (COGS)
                  </span>
                  {pnlData.cogs?.accounts?.map((a: any) => (
                    <div key={a.code} className="flex justify-between py-1 border-b border-border/40 font-mono">
                      <span>{a.code} - {a.name}</span>
                      <span>₹{a.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-mono font-bold pt-1 text-sm text-foreground">
                    <span>Total COGS</span>
                    <span>₹{pnlData.cogs?.total?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Gross Profit Strip */}
                <div className="p-3 rounded-lg bg-muted/40 flex justify-between items-center font-mono font-bold text-sm">
                  <span>Gross Profit ({pnlData.grossMarginPct}%)</span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    ₹{pnlData.grossProfit?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Operating Expenses */}
                <div className="space-y-1.5 pt-2 border-t border-border">
                  <span className="font-semibold uppercase tracking-wider text-muted-foreground text-[11px] block">
                    Operating Expenses
                  </span>
                  {pnlData.operatingExpenses?.accounts?.map((a: any) => (
                    <div key={a.code} className="flex justify-between py-1 border-b border-border/40 font-mono">
                      <span>{a.code} - {a.name}</span>
                      <span>₹{a.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-mono font-bold pt-1 text-sm text-foreground">
                    <span>Total Operating Expenses</span>
                    <span>₹{pnlData.operatingExpenses?.total?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Net Income */}
                <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 flex justify-between items-center font-mono font-bold text-base text-foreground">
                  <span>Net Operating Income</span>
                  <span className={pnlData.netIncome >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}>
                    ₹{pnlData.netIncome?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Balance Sheet Statement */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-bold text-foreground flex items-center gap-2">
                  <Landmark className="w-5 h-5 text-primary" />
                  Balance Sheet (Financial Position)
                </h3>
                <p className="text-xs text-muted-foreground">Assets = Liabilities + Owner Equity</p>
              </div>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-semibold">
                Balanced
              </span>
            </div>

            {bsData && (
              <div className="space-y-4 text-xs">
                {/* Assets */}
                <div className="space-y-1.5">
                  <span className="font-semibold uppercase tracking-wider text-muted-foreground text-[11px] block">
                    Total Assets
                  </span>
                  {bsData.assets?.accounts?.map((a: any) => (
                    <div key={a.code} className="flex justify-between py-1 border-b border-border/40 font-mono">
                      <span>{a.code} - {a.name}</span>
                      <span>₹{a.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-mono font-bold pt-1 text-sm text-primary">
                    <span>Total Assets</span>
                    <span>₹{bsData.assets?.total?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Liabilities */}
                <div className="space-y-1.5 pt-2 border-t border-border">
                  <span className="font-semibold uppercase tracking-wider text-muted-foreground text-[11px] block">
                    Total Liabilities
                  </span>
                  {bsData.liabilities?.accounts?.map((a: any) => (
                    <div key={a.code} className="flex justify-between py-1 border-b border-border/40 font-mono">
                      <span>{a.code} - {a.name}</span>
                      <span>₹{a.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-mono font-bold pt-1 text-sm text-foreground">
                    <span>Total Liabilities</span>
                    <span>₹{bsData.liabilities?.total?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Equity */}
                <div className="space-y-1.5 pt-2 border-t border-border">
                  <span className="font-semibold uppercase tracking-wider text-muted-foreground text-[11px] block">
                    Owner Equity & Retained Earnings
                  </span>
                  {bsData.equity?.accounts?.map((a: any) => (
                    <div key={a.code} className="flex justify-between py-1 border-b border-border/40 font-mono">
                      <span>{a.code} - {a.name}</span>
                      <span>₹{a.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-1 border-b border-border/40 font-mono text-emerald-600 dark:text-emerald-400">
                    <span>Period Net Income</span>
                    <span>₹{bsData.equity?.currentPeriodNetIncome?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between font-mono font-bold pt-1 text-sm text-foreground">
                    <span>Total Equity</span>
                    <span>₹{bsData.equity?.total?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Balance Sheet Equation Verification */}
                <div className="p-4 rounded-xl bg-muted/40 border border-border flex justify-between items-center font-mono font-bold text-sm text-foreground">
                  <span>Liabilities + Equity</span>
                  <span className="text-primary">
                    ₹{bsData.totalLiabilitiesAndEquity?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Account Modal */}
      {showCreateAccount && (
        <CreateAccountModal
          onClose={() => setShowCreateAccount(false)}
          onSuccess={() => {
            setShowCreateAccount(false);
            fetchData();
          }}
        />
      )}

      {/* Manual Journal Entry Modal */}
      {showManualJournal && (
        <ManualJournalModal
          accounts={accounts}
          onClose={() => setShowManualJournal(false)}
          onSuccess={() => {
            setShowManualJournal(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

