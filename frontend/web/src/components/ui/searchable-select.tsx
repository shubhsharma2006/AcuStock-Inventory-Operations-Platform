"use client";

import React, { useState, useRef, useEffect, useMemo, useId } from "react";

export interface SearchableSelectOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  badgeColor?: "emerald" | "amber" | "rose" | "blue" | "purple" | "slate";
  icon?: string;
  details?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string, selectedOption?: SearchableSelectOption) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  onAddNew?: () => void;
  addNewLabel?: string;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select an option...",
  searchPlaceholder = "Type initial letter or name to search...",
  label,
  required = false,
  disabled = false,
  className = "",
  onAddNew,
  addNewLabel = "+ Add New",
  onRefresh,
  isLoading = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  // Filter & Rank options based on query
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const query = search.trim().toLowerCase();

    // Priority 1: Prefix match on label (type initial letter)
    // Priority 2: Prefix match on sublabel (SKU, code)
    // Priority 3: Substring match anywhere
    const prefixLabel: SearchableSelectOption[] = [];
    const prefixSublabel: SearchableSelectOption[] = [];
    const contains: SearchableSelectOption[] = [];

    for (const opt of options) {
      const l = opt.label.toLowerCase();
      const s = (opt.sublabel || "").toLowerCase();
      const d = (opt.details || "").toLowerCase();

      if (l.startsWith(query)) {
        prefixLabel.push(opt);
      } else if (s.startsWith(query)) {
        prefixSublabel.push(opt);
      } else if (l.includes(query) || s.includes(query) || d.includes(query)) {
        contains.push(opt);
      }
    }

    return [...prefixLabel, ...prefixSublabel, ...contains];
  }, [options, search]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus search input when opening
  useEffect(() => {
    if (isOpen) {
      setActiveIndex(-1);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearch("");
    }
  }, [isOpen]);

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === "Enter" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => {
        const next = prev + 1;
        return next >= filteredOptions.length ? 0 : next;
      });
      scrollToActive();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => {
        const next = prev - 1;
        return next < 0 ? filteredOptions.length - 1 : next;
      });
      scrollToActive();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
        selectOption(filteredOptions[activeIndex]);
      } else if (filteredOptions.length === 1) {
        selectOption(filteredOptions[0]);
      }
    }
  }

  function scrollToActive() {
    setTimeout(() => {
      if (!listRef.current) return;
      const activeEl = listRef.current.querySelector('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }, 10);
  }

  function selectOption(opt: SearchableSelectOption) {
    onChange(opt.value, opt);
    setIsOpen(false);
    setSearch("");
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("", undefined);
  }

  // Helper to highlight matching text
  function highlightMatch(text: string, query: string) {
    if (!query.trim()) return text;
    const q = query.trim().toLowerCase();
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return text;

    return (
      <>
        {text.slice(0, idx)}
        <span className="bg-amber-400/30 text-amber-200 font-bold underline decoration-amber-400">
          {text.slice(idx, idx + q.length)}
        </span>
        {text.slice(idx + q.length)}
      </>
    );
  }

  const badgeStyles = {
    emerald: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    amber: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    rose: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    blue: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    purple: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    slate: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  };

  return (
    <div ref={containerRef} className={`relative ${isOpen ? "z-40" : "z-10"} ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="mb-1.5 block text-xs font-medium text-slate-300"
        >
          {label} {required && <span className="text-rose-400">*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <div
        id={id}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className={`group flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm transition cursor-pointer outline-none focus:border-amber-300/40 focus:ring-1 focus:ring-amber-300/30 ${
          disabled ? "opacity-50 cursor-not-allowed" : "hover:border-white/20"
        } ${isOpen ? "border-amber-400/50 ring-1 ring-amber-400/20" : ""}`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {selectedOption ? (
            <>
              {selectedOption.icon && (
                <span className="text-base shrink-0">{selectedOption.icon}</span>
              )}
              <div className="truncate">
                <span className="font-medium text-white">
                  {selectedOption.label}
                </span>
                {selectedOption.sublabel && (
                  <span className="ml-2 font-mono text-xs text-slate-400">
                    ({selectedOption.sublabel})
                  </span>
                )}
              </div>
              {selectedOption.badge && (
                <span
                  className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                    badgeStyles[selectedOption.badgeColor || "slate"]
                  }`}
                >
                  {selectedOption.badge}
                </span>
              )}
            </>
          ) : (
            <span className="text-slate-400 select-none">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 text-slate-400">
          {selectedOption && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-md hover:bg-white/10 hover:text-white transition text-xs"
              title="Clear selection"
            >
              ✕
            </button>
          )}
          <span className={`text-xs transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
            ▼
          </span>
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-2xl border border-white/15 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-2xl ring-1 ring-black/50 animate-in fade-in zoom-in-95 duration-100">
          {/* Search Header */}
          <div className="flex items-center gap-2 border-b border-white/10 pb-2 px-1">
            <span className="text-slate-400 text-xs">🔍</span>
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-xs text-white outline-none placeholder:text-slate-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-xs text-slate-500 hover:text-white px-1"
              >
                ✕
              </button>
            )}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                title="Refresh options list"
                disabled={isLoading}
                className="text-xs text-slate-400 hover:text-amber-300 p-1 rounded hover:bg-white/5 transition"
              >
                {isLoading ? "⏳" : "🔄"}
              </button>
            )}
          </div>

          {/* Options List */}
          <ul
            ref={listRef}
            role="listbox"
            className="mt-1 max-h-60 overflow-y-auto space-y-1 py-1 pr-1 text-sm custom-scrollbar"
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isActive = idx === activeIndex;

                return (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    data-active={isActive}
                    onClick={() => selectOption(opt)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 cursor-pointer transition ${
                      isActive || isSelected
                        ? "bg-amber-400/15 text-white"
                        : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {opt.icon && <span className="text-base shrink-0">{opt.icon}</span>}
                      <div className="truncate">
                        <div className="font-medium text-white truncate">
                          {highlightMatch(opt.label, search)}
                        </div>
                        {opt.sublabel && (
                          <div className="font-mono text-xs text-slate-400 truncate mt-0.5">
                            {highlightMatch(opt.sublabel, search)}
                          </div>
                        )}
                        {opt.details && (
                          <div className="text-[11px] text-slate-500 truncate">
                            {opt.details}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {opt.badge && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            badgeStyles[opt.badgeColor || "slate"]
                          }`}
                        >
                          {opt.badge}
                        </span>
                      )}
                      {isSelected && (
                        <span className="text-amber-400 font-bold text-xs">✓</span>
                      )}
                    </div>
                  </li>
                );
              })
            ) : (
              <div className="p-4 text-center">
                <div className="text-xs text-slate-400">
                  {search.trim() ? (
                    <>
                      No matches found for{" "}
                      <span className="text-white font-semibold">&quot;{search}&quot;</span>
                    </>
                  ) : (
                    <span>No options available</span>
                  )}
                </div>
                {onAddNew && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onAddNew();
                    }}
                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-amber-400/10 border border-amber-400/20 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-400/20 transition"
                  >
                    {addNewLabel}
                  </button>
                )}
              </div>
            )}
          </ul>

          {/* Quick Footer if onAddNew is supplied */}
          {onAddNew && filteredOptions.length > 0 && (
            <div className="border-t border-white/10 pt-1.5 mt-1 px-1 flex justify-between items-center text-[11px] text-slate-400">
              <span>{filteredOptions.length} available</span>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onAddNew();
                }}
                className="text-amber-300 hover:text-amber-200 font-semibold transition"
              >
                {addNewLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
