"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { apiFetch } from "@/lib/api";

interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: string;
  executedTools?: Array<{ name: string; args?: any; result?: any }>;
  isDraftPo?: boolean;
  draftPoData?: any;
}

export function CopilotDrawer() {
  const { user } = useSession();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "bot",
      text: `Hello ${user?.name || "there"}! 👋 I'm **AcuBot**, your autonomous inventory & operations copilot.\n\nAsk me about stock levels, expiring lots, order fulfillments, or draft a replenishment Purchase Order!`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, messages, activeTool]);

  const handleSend = async (customPrompt?: string) => {
    const promptToSend = customPrompt || input.trim();
    if (!promptToSend || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: promptToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!customPrompt) setInput("");
    setIsLoading(true);
    setActiveTool(null);

    try {
      // Build conversation history for context
      const history = messages.slice(-4).map((m) => ({
        role: m.sender === "user" ? ("user" as const) : ("model" as const),
        text: m.text,
      }));

      // Call AcuStock Copilot API
      const response = await apiFetch<{ text: string; executedTools?: any[] }>("/api/ai/copilot/chat", {
        method: "POST",
        body: JSON.stringify({
          prompt: promptToSend,
          history,
          stream: false,
        }),
      });

      // Check if response contains a DRAFT PO tool result
      const poTool = response.executedTools?.find((t: any) => t.name === "draftPurchaseOrder" && t.result?.success);

      const botMessage: Message = {
        id: `bot-${Date.now()}`,
        sender: "bot",
        text: response.text || "Operations completed.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        executedTools: response.executedTools,
        isDraftPo: Boolean(poTool),
        draftPoData: poTool?.result,
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err: any) {
      const errorMessage: Message = {
        id: `bot-err-${Date.now()}`,
        sender: "bot",
        text: `⚠️ **Connection Error**: ${err.message || "Failed to reach AI service."}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setActiveTool(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: "welcome-cleared",
        sender: "bot",
        text: "Chat cleared. What can I help you inspect or orchestrate next?",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  const quickPrompts = [
    "🔴 Which products are below safety stock?",
    "⏳ Any lots expiring in 30 days?",
    "📦 Show active backorders",
    "📄 Draft a PO for critical stock",
  ];

  const rolePrefix = user?.role?.toLowerCase() || "admin";

  return (
    <>
      {/* Floating Trigger Button */}
      {!isOpen && (
        <button
          id="acubot-copilot-trigger"
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-full border border-cyan-400/40 bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950 px-4 py-3 text-white shadow-[0_0_25px_rgba(6,182,212,0.35)] transition-all duration-300 hover:scale-105 hover:border-cyan-300 hover:shadow-[0_0_35px_rgba(6,182,212,0.5)] active:scale-95"
          title="Open AcuBot AI Copilot"
        >
          <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-500 to-amber-400 shadow-inner">
            <span className="font-mono text-sm font-black text-slate-950">AI</span>
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-cyan-500" />
            </span>
          </div>
          <div className="text-left">
            <p className="text-xs font-extrabold tracking-wide text-cyan-300">AcuBot Copilot</p>
            <p className="text-[10px] text-slate-400">Inventory AI Online</p>
          </div>
        </button>
      )}

      {/* Slide-over Cyber Chat Drawer */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[620px] max-h-[88vh] w-full max-w-[440px] flex-col rounded-2xl border border-cyan-500/30 bg-slate-950/95 shadow-[0_20px_60px_rgba(0,0,0,0.85)] backdrop-blur-2xl transition-all duration-300">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-gradient-to-r from-cyan-950/30 via-slate-900/50 to-slate-950/80">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-cyan-500 to-amber-400">
                <span className="font-mono text-xs font-black text-slate-950">AI</span>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-bold text-white">AcuBot Copilot</h3>
                  <span className="rounded-full bg-cyan-500/15 border border-cyan-500/30 px-1.5 py-0.2 text-[9px] font-mono font-bold text-cyan-300">
                    v3.0
                  </span>
                </div>
                <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Tenant Shield Active
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={clearChat}
                className="rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-slate-200"
                title="Clear conversation"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-slate-200"
                title="Close Copilot"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin scrollbar-thumb-slate-800">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[90%] rounded-xl p-3 text-xs leading-relaxed ${
                    m.sender === "user"
                      ? "bg-gradient-to-r from-cyan-600 to-cyan-700 text-white shadow-md shadow-cyan-900/30"
                      : "border border-white/10 bg-slate-900/85 text-slate-200 backdrop-blur-md shadow-md"
                  }`}
                >
                  {/* Tool execution badge */}
                  {m.executedTools && m.executedTools.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {m.executedTools.map((t, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 rounded bg-slate-950/70 border border-cyan-500/20 px-1.5 py-0.5 text-[9px] font-mono text-cyan-300"
                        >
                          <span className="text-[10px]">⚙️</span>
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Message body with Markdown formatting support */}
                  <div className="whitespace-pre-wrap space-y-1">
                    {formatMarkdownText(m.text)}
                  </div>

                  {/* Interactive Draft PO Card (Confirm-Before-Commit Pattern) */}
                  {m.isDraftPo && m.draftPoData && (
                    <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-950/20 p-2.5 text-slate-200">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono text-[10px] font-bold text-amber-300">
                          {m.draftPoData.poNumber}
                        </span>
                        <span className="rounded bg-amber-400/20 border border-amber-400/30 px-1.5 py-0.2 text-[9px] font-bold text-amber-300">
                          DRAFT
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300">
                        Supplier: <strong className="text-white">{m.draftPoData.supplier}</strong>
                      </p>
                      <p className="text-[11px] text-slate-300">
                        Total Value: <strong className="text-amber-300">${m.draftPoData.totalValue?.toLocaleString()}</strong>
                      </p>

                      <div className="mt-2.5 pt-2 border-t border-amber-500/20 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">Requires human review</span>
                        <Link
                          href={`/dashboard/${rolePrefix}/purchase-orders`}
                          className="rounded bg-amber-500 hover:bg-amber-400 px-2.5 py-1 text-[10px] font-bold text-slate-950 transition"
                        >
                          Review in Procurement →
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
                <span className="mt-1 text-[9px] text-slate-500 px-1">{m.timestamp}</span>
              </div>
            ))}

            {/* Active Tool / Thinking Indicator */}
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-cyan-400 p-2 rounded-lg bg-cyan-950/30 border border-cyan-500/20 animate-pulse">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                <span className="text-[11px]">
                  {activeTool ? `Executing ${activeTool}...` : "AcuBot analyzing inventory data..."}
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompt Pills */}
          <div className="border-t border-white/5 bg-slate-950/60 p-2 overflow-x-auto">
            <div className="flex gap-1.5 w-max">
              {quickPrompts.map((prompt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSend(prompt)}
                  disabled={isLoading}
                  className="whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-300 transition hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-200 disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Input Footer */}
          <div className="border-t border-white/10 p-3 bg-slate-950/80">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/90 px-3 py-1.5 focus-within:border-cyan-500/50 focus-within:ring-1 focus-within:ring-cyan-500/30">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask AcuBot about stock, lots, or POs..."
                disabled={isLoading}
                className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500 text-slate-950 transition hover:bg-cyan-400 disabled:opacity-30 disabled:hover:bg-cyan-500"
                title="Send message"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Basic markdown text formatter for bold, code, and bullet tags
 */
function formatMarkdownText(text: string): React.ReactNode {
  const lines = text.split("\n");
  return lines.map((line, idx) => {
    // Check if line starts with bullet
    const isBullet = line.startsWith("• ") || line.startsWith("- ");
    const content = isBullet ? line.slice(2) : line;

    // Replace bold **text** and inline `code`
    const parts = content.split(/(\*\*.*?\*\*|`.*?`)/g);

    const formatted = parts.map((part, pIdx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={pIdx} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={pIdx} className="rounded bg-black/40 border border-white/10 px-1 py-0.2 font-mono text-[10px] text-cyan-300">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });

    if (isBullet) {
      return (
        <div key={idx} className="flex items-start gap-1.5 ml-1 my-0.5">
          <span className="text-cyan-400 font-bold">•</span>
          <span>{formatted}</span>
        </div>
      );
    }

    return <div key={idx}>{formatted}</div>;
  });
}
