"use client";

import React, { useState, useRef, useEffect, useId, useMemo } from "react";

export interface TypeaheadInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  subText?: string;
}

export function TypeaheadInput({
  label,
  value,
  onChange,
  options,
  placeholder = "Type or select…",
  required = false,
  disabled = false,
  className = "",
  subText,
}: TypeaheadInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  // Filter options based on typed input
  const filteredOptions = useMemo(() => {
    if (!value || !value.trim()) {
      return options.slice(0, 50); // Show top 50 if empty
    }
    const query = value.trim().toLowerCase();
    const starts = options.filter((opt) => opt.toLowerCase().startsWith(query));
    const contains = options.filter(
      (opt) => !opt.toLowerCase().startsWith(query) && opt.toLowerCase().includes(query)
    );
    return [...starts, ...contains].slice(0, 50);
  }, [options, value]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
      activeEl?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  const handleSelect = (selectedVal: string) => {
    onChange(selectedVal);
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
      } else {
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        );
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(filteredOptions.length - 1);
      } else {
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        );
      }
    } else if (e.key === "Enter") {
      if (isOpen && highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
        e.preventDefault();
        handleSelect(filteredOptions[highlightedIndex]);
      } else {
        setIsOpen(false);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-xs font-semibold text-slate-300 mb-1">
          {label} {required && <span className="text-rose-400">*</span>}
        </label>
      )}

      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={value}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          list={listId}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value);
            if (!isOpen) setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => {
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-3.5 py-2.5 pr-14 text-sm text-white placeholder-slate-500 outline-none transition focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 disabled:opacity-50"
        />

        {/* Native datalist fallback for browser autocomplete support */}
        <datalist id={listId}>
          {options.slice(0, 100).map((opt, idx) => (
            <option key={`dl-${idx}-${opt}`} value={opt} />
          ))}
        </datalist>

        {/* Right side action icons */}
        <div className="absolute right-2 flex items-center gap-1 text-slate-400">
          {value && !disabled && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => {
                onChange("");
                inputRef.current?.focus();
              }}
              className="rounded-md p-1 hover:bg-white/10 hover:text-white text-xs transition"
              title="Clear"
            >
              ✕
            </button>
          )}

          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => {
              setIsOpen((prev) => !prev);
              inputRef.current?.focus();
            }}
            className="rounded-md p-1 hover:bg-white/10 hover:text-white transition"
            title="Toggle suggestions list"
          >
            <span className={`inline-block text-[10px] transform transition-transform ${isOpen ? "rotate-180" : ""}`}>
              ▼
            </span>
          </button>
        </div>
      </div>

      {subText && <p className="mt-1 text-[11px] text-slate-500">{subText}</p>}

      {/* Custom styled dark glassmorphic dropdown list */}
      {isOpen && !disabled && filteredOptions.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-white/15 bg-slate-900/95 py-1.5 shadow-2xl backdrop-blur-2xl text-xs"
        >
          {filteredOptions.map((opt, idx) => {
            const isSelected = opt.toLowerCase() === value.trim().toLowerCase();
            const isHighlighted = idx === highlightedIndex;

            return (
              <li
                key={`${opt}-${idx}`}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent input blur before click
                  handleSelect(opt);
                }}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={`flex items-center justify-between px-3.5 py-2 cursor-pointer transition ${
                  isHighlighted
                    ? "bg-amber-400/20 text-amber-200"
                    : isSelected
                    ? "bg-white/10 text-white font-semibold"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span>{opt}</span>
                {isSelected && <span className="text-amber-400 font-bold text-xs">✓</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

