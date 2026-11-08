"use client";

import { useEffect } from "react";

import { XIcon } from "@/components/Icons";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n-context";

export function Modal({
  title,
  description,
  onClose,
  children,
  size = "md",
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: "md" | "lg";
}) {
  const { dict } = useI18n();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-stone-950/40 p-0 backdrop-blur-sm animate-fade-in sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "w-full animate-scale-in rounded-t-2xl bg-white shadow-soft sm:rounded-2xl",
          size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm text-stone-500">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={dict.close}
            className="rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-5 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
