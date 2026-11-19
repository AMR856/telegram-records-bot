"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";

import { cn } from "@/lib/cn";

export type TemplateSuggestion = {
  key: string;
  label: string;
};

type TemplateInputProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: TemplateSuggestion[];
  placeholder?: string;
  noMatchesLabel: string;
};

type PlaceholderToken = {
  start: number;
  end: number;
  query: string;
};

function findPlaceholderToken(
  value: string,
  caret: number,
): PlaceholderToken | null {
  const safeCaret = Math.max(0, caret);
  const openIndex = value.lastIndexOf("{", Math.max(0, safeCaret - 1));
  if (openIndex === -1 || openIndex >= safeCaret) return null;

  const closeIndex = value.indexOf("}", openIndex + 1);
  const fragmentEnd =
    closeIndex === -1 ? safeCaret : Math.min(safeCaret, closeIndex);
  const fragment = value.slice(openIndex + 1, fragmentEnd);
  if (!/^[A-Za-z0-9_]*$/.test(fragment)) return null;

  if (closeIndex !== -1) {
    if (closeIndex < safeCaret) {
      if (closeIndex === openIndex + 1 && safeCaret === closeIndex + 1) {
        // The user just typed "{}"; suggest a key right away.
        return { start: openIndex, end: closeIndex + 1, query: "" };
      }
      return null;
    }
    return { start: openIndex, end: closeIndex + 1, query: fragment };
  }

  return { start: openIndex, end: safeCaret, query: fragment };
}

export function TemplateInput({
  id,
  value,
  onChange,
  suggestions,
  placeholder,
  noMatchesLabel,
}: TemplateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const [token, setToken] = useState<PlaceholderToken | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  const filtered = useMemo(() => {
    const query = token?.query.trim().toLowerCase() ?? "";
    if (!query) return suggestions;
    return suggestions.filter(
      (suggestion) =>
        suggestion.key.toLowerCase().includes(query) ||
        suggestion.label.toLowerCase().includes(query),
    );
  }, [suggestions, token?.query]);

  useEffect(() => {
    setHighlighted(0);
  }, [token?.query, token?.start]);

  useEffect(() => {
    if (pendingCaret.current === null) return;
    const caret = pendingCaret.current;
    pendingCaret.current = null;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(caret, caret);
  });

  const syncToken = (nextValue: string, caret: number) => {
    setToken(findPlaceholderToken(nextValue, caret));
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    const caret = event.target.selectionStart ?? nextValue.length;
    onChange(nextValue);
    syncToken(nextValue, caret);
  };

  const applySuggestion = (suggestion: TemplateSuggestion) => {
    if (!token) return;
    const nextValue =
      value.slice(0, token.start) + `{${suggestion.key}}` + value.slice(token.end);
    pendingCaret.current = token.start + suggestion.key.length + 2;
    onChange(nextValue);
    setToken(null);
    setHighlighted(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!token) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((current) =>
        filtered.length === 0 ? 0 : (current + 1) % filtered.length,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current) =>
        filtered.length === 0
          ? 0
          : (current - 1 + filtered.length) % filtered.length,
      );
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setToken(null);
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      const suggestion = filtered[highlighted];
      if (!suggestion) return;
      event.preventDefault();
      applySuggestion(suggestion);
    }
  };

  const open = token !== null;
  const listId = `${id ?? "pattern-template"}-suggestions`;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        className="input font-mono text-sm"
        value={value}
        maxLength={1000}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={(event) =>
          syncToken(value, event.currentTarget.selectionStart ?? value.length)
        }
        onKeyUp={(event) => {
          if (
            event.key === "ArrowLeft" ||
            event.key === "ArrowRight" ||
            event.key === "Home" ||
            event.key === "End"
          ) {
            syncToken(value, event.currentTarget.selectionStart ?? value.length);
          }
        }}
        onBlur={() => setToken(null)}
        placeholder={placeholder}
        dir="auto"
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
      />
      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-stone-200 bg-white p-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-stone-400">{noMatchesLabel}</p>
          ) : (
            filtered.map((suggestion, index) => (
              <button
                key={suggestion.key}
                type="button"
                role="option"
                aria-selected={index === highlighted}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start text-xs transition",
                  index === highlighted
                    ? "bg-emerald-50 text-emerald-800"
                    : "text-stone-700 hover:bg-stone-100",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => applySuggestion(suggestion)}
              >
                <span>{suggestion.label}</span>
                <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] text-stone-500">
                  {suggestion.key}
                </code>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
