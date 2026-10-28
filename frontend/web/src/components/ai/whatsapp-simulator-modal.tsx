"use client";

import React, { useState, useRef, useEffect } from "react";
import { useSession } from "@/hooks/use-session";
import { apiFetch } from "@/lib/api";

interface WhatsAppMessage {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: string;
  tools?: string[];
  error?: boolean;
}

interface WhatsAppSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultPhone?: string;
}

const SAMPLE_PROMPTS = [
  "📊 What items need reordering?",
  "📦 Check current stock of all items",
  "⚠️ Which items are low on stock?",
  "📝 Draft PO for low stock items",
  "⏳ Any lots expiring soon?",
];

export function WhatsAppSimulatorModal({
  isOpen,
  onClose,
  defaultPhone = "",
}: WhatsAppSimulatorModalProps) {
  const { user } = useSession();
  const [phone, setPhone] = useState(defaultPhone || (user as any)?.phone || "");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([
    {
      id: "welcome",
      sender: "bot",
      text: `👋 *Welcome to AcuBot on WhatsApp!*\n\nI can check stock balances, report expiring lots, provide statistical reorder recommendations, or draft purchase orders directly via text.\n\nTry sending a message or tap one of the quick suggestions below.`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (defaultPhone && !phone) {
      setPhone(defaultPhone);
    } else if ((user as any)?.phone && !phone) {
      setPhone((user as any).phone);
    }
  }, [defaultPhone, user, phone]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, messages]);

  if (!isOpen) return null;

  const handleSend = async (messageText?: string) => {
    const textToSend = messageText || input.trim();
    if (!textToSend || isLoading) return;

    const userMessage: WhatsAppMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!messageText) setInput("");
    setIsLoading(true);

    try {
      const res = await apiFetch<any>("/ai/whatsapp/simulate", {
        method: "POST",
        body: JSON.stringify({
          phone: phone.trim() || undefined,
          message: textToSend,
        }),
      });

      if (res?.success) {
        setMessages((prev) => [
          ...prev,
          {
            id: `bot-${Date.now()}`,
            sender: "bot",
            text: res.output || "No response received.",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            tools: res.executedTools?.map((t: any) => typeof t === "string" ? t : t.name) || [],
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `bot-err-${Date.now()}`,
            sender: "bot",
            text: res?.message || res?.error || "Error processing WhatsApp message.",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            error: true,
          },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-err-${Date.now()}`,
          sender: "bot",
          text: err.message || "Failed to reach WhatsApp simulation endpoint.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          error: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl flex flex-col h-[650px] max-h-[92vh] rounded-3xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
        
        {/* WhatsApp Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950/90 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30 text-lg shadow-inner">
              <span>💬</span>
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-white text-sm">AcuBot • WhatsApp Assistant</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  SIMULATOR
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                AI Warehouse & Reorder Operations
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white transition"
            title="Close simulator"
          >
            ✕
          </button>
        </div>

        {/* Simulator Control Bar */}
        <div className="flex items-center gap-2 px-5 py-2.5 bg-slate-950/50 border-b border-white/5 text-xs text-slate-300">
          <span className="text-slate-400 font-medium">Sender Phone:</span>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 919876543210 (or auto-resolved)"
            className="flex-1 rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1 text-xs text-emerald-300 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
          />
          <span className="text-[10px] text-slate-500">Auto-links to role RBAC</span>
        </div>

        {/* Chat Messages Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-slate-950/60 to-slate-900/40">
          {messages.map((m) => {
            const isUser = m.sender === "user";
            return (
              <div
                key={m.id}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl p-3.5 text-xs sm:text-sm leading-relaxed shadow-md ${
                    isUser
                      ? "rounded-tr-none bg-emerald-600/80 text-white border border-emerald-400/30"
                      : m.error
                      ? "rounded-tl-none bg-rose-950/60 text-rose-200 border border-rose-500/30"
                      : "rounded-tl-none bg-slate-800/90 text-slate-100 border border-white/10"
                  }`}
                >
                  <div className="whitespace-pre-wrap font-sans">{m.text}</div>

                  {m.tools && m.tools.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-white/10 flex flex-wrap gap-1.5 items-center">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Tools:</span>
                      {m.tools.map((t, idx) => (
                        <span
                          key={idx}
                          className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-emerald-300 border border-white/10"
                        >
                          ⚡ {t}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-400/80">
                    <span>{m.timestamp}</span>
                    {isUser && <span className="text-emerald-300 font-bold">✓✓</span>}
                  </div>
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex items-start">
              <div className="rounded-2xl rounded-tl-none bg-slate-800/90 p-3 text-xs text-slate-300 border border-white/10 flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                <span>AcuBot is analyzing warehouse data & drafting response...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Pills */}
        <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto bg-slate-950/70 border-t border-white/5 scrollbar-none">
          {SAMPLE_PROMPTS.map((p, idx) => (
            <button
              key={idx}
              type="button"
              disabled={isLoading}
              onClick={() => handleSend(p)}
              className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-200 transition disabled:opacity-50"
            >
              {p}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-slate-950 border-t border-white/10 flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a WhatsApp message to AcuBot..."
            disabled={isLoading}
            className="flex-1 rounded-xl border border-white/10 bg-slate-900/90 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400/60"
          />
          <button
            type="button"
            disabled={!input.trim() || isLoading}
            onClick={() => handleSend()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 transition disabled:opacity-40 disabled:hover:bg-emerald-500"
            title="Send"
          >
            ➤
          </button>
        </div>

      </div>
    </div>
  );
}
