"use client";

import { useState } from "react";
import type { DragEvent } from "react";

import { ChatIcon, FileIcon, UploadIcon } from "@/components/Icons";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n-context";

interface PackagesUploadPanelProps {
  onOpenFile: () => void;
  onSample: () => void;
  parsing: boolean;
}

export function PackagesUploadPanel({
  onOpenFile,
  onSample,
  parsing,
}: PackagesUploadPanelProps) {
  const { dict } = useI18n();
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
  }

  return (
    <div className="mx-auto w-full max-w-2xl py-2">
      <section className="card p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-sm">
            <ChatIcon className="h-6 w-6" />
          </span>
          <span className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            {dict.packagesTitle}
          </span>
        </div>

        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-stone-900">
          {dict.packagesUploadTitle}
        </h1>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          {dict.packagesUploadLede}
        </p>

        <div
          className={cn(
            "mt-6 flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition",
            dragging
              ? "border-emerald-500 bg-emerald-50/60"
              : "border-stone-300 bg-stone-50/60 hover:border-emerald-400 hover:bg-emerald-50/40",
          )}
          role="button"
          tabIndex={0}
          onClick={onOpenFile}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpenFile();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm">
            {parsing ? (
              <Spinner className="h-6 w-6" />
            ) : (
              <UploadIcon className="h-6 w-6" />
            )}
          </span>
          <strong className="mt-4 text-base font-semibold text-stone-900">
            {parsing ? dict.packagesParsing : dict.packagesDropzoneTitle}
          </strong>
          <span className="mt-1 text-sm text-stone-500">
            {dict.packagesDropzoneSub}
          </span>
          <button
            type="button"
            className="btn btn-primary mt-5"
            disabled={parsing}
            onClick={(event) => {
              event.stopPropagation();
              onOpenFile();
            }}
          >
            <FileIcon className="h-4 w-4" />
            {dict.packagesChooseFile}
          </button>
        </div>

        <div className="mt-4 flex justify-center">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onSample}
            disabled={parsing}
          >
            {dict.packagesSample}
          </button>
        </div>

        <div className="mt-6 rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-600">
          <span>{dict.packagesExampleLabel}</span>{" "}
          <code className="rounded bg-white px-2 py-0.5 font-mono text-xs text-stone-800">
            150 محمد أحمد باقة ال 30 جيجا
          </code>
        </div>

        <p className="mt-5 text-center text-xs text-stone-400">
          {dict.packagesPrivacy}
        </p>
      </section>
    </div>
  );
}
