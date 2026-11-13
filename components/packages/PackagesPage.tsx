"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ChatIcon, UploadIcon, XIcon } from "@/components/Icons";
import { Spinner } from "@/components/ui/Spinner";
import { useI18n } from "@/lib/i18n-context";
import { parseWhatsAppChat } from "@/lib/packages/parser";
import type { DateOrder, ParsedChat } from "@/lib/packages/types";

import { PackagesDashboard } from "./PackagesDashboard";
import { PackagesUploadPanel } from "./UploadPanel";

const STORAGE_KEY = "management-bot-packages:v1";

async function readFileText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buffer);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buffer);
  }
  return new TextDecoder("utf-8").decode(buffer);
}

export function PackagesPage() {
  const { dict } = useI18n();
  const [chat, setChat] = useState<ParsedChat | null>(null);
  const [ready, setReady] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as
          | (Partial<Omit<ParsedChat, "version">> & { version?: number })
          | null;
        if (
          stored &&
          (stored.version === 1 || stored.version === 2) &&
          Array.isArray(stored.sales) &&
          (stored.dateOrder === "dmy" || stored.dateOrder === "mdy")
        ) {
          setChat({
            ...(stored as ParsedChat),
            version: 2,
            messages: Array.isArray(stored.messages) ? stored.messages : [],
          });
        }
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !chat) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(chat));
    } catch {
      setError(dict.packagesErrStorage);
    }
  }, [chat, ready, dict.packagesErrStorage]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 8000);
    return () => window.clearTimeout(timer);
  }, [error]);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  const ingestFile = useCallback(
    async (file: File, displayName?: string) => {
      if (!file.name.toLowerCase().endsWith(".txt")) {
        setError(dict.packagesErrFileType);
        return;
      }
      if (file.size > 40 * 1024 * 1024) {
        setError(dict.packagesErrFileSize);
        return;
      }

      setParsing(true);
      setError(null);
      try {
        const text = await readFileText(file);
        const parsed = parseWhatsAppChat(text, displayName ?? file.name, {
          unknownCustomer: dict.packagesUnknownCustomer,
          unknownSender: dict.packagesUnknownSender,
        });
        if (parsed.sales.length === 0 && parsed.contacts.length === 0) {
          setError(dict.packagesErrNoSales);
        }
        setChat(parsed);
      } catch {
        setError(dict.packagesErrRead);
      } finally {
        setParsing(false);
      }
    },
    [
      dict.packagesErrFileType,
      dict.packagesErrFileSize,
      dict.packagesErrNoSales,
      dict.packagesErrRead,
      dict.packagesUnknownCustomer,
      dict.packagesUnknownSender,
    ],
  );

  useEffect(() => {
    let depth = 0;

    function isFileDrag(event: DragEvent) {
      return Array.from(event.dataTransfer?.types ?? []).includes("Files");
    }

    function handleDragEnter(event: DragEvent) {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      depth += 1;
      setDragActive(true);
    }

    function handleDragOver(event: DragEvent) {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }

    function handleDragLeave(event: DragEvent) {
      if (!isFileDrag(event) && depth === 0) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragActive(false);
    }

    function resetDrag() {
      depth = 0;
      setDragActive(false);
    }

    function handleDrop(event: DragEvent) {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      resetDrag();
      const file = event.dataTransfer?.files?.[0];
      if (file) void ingestFile(file);
    }

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragend", resetDrag);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragend", resetDrag);
      window.removeEventListener("drop", handleDrop);
    };
  }, [ingestFile]);

  async function handleSample() {
    setParsing(true);
    setError(null);
    try {
      const response = await fetch("/chat.txt", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("sample missing");
      }
      const text = await response.text();
      const parsed = parseWhatsAppChat(text, "chat.txt", {
        unknownCustomer: dict.packagesUnknownCustomer,
        unknownSender: dict.packagesUnknownSender,
      });
      if (parsed.sales.length === 0) {
        setError(dict.packagesErrSampleEmpty);
      }
      setChat(parsed);
    } catch {
      setError(dict.packagesErrSample);
    } finally {
      setParsing(false);
    }
  }

  function handleClear() {
    if (!window.confirm(dict.packagesClearConfirm)) {
      return;
    }
    window.localStorage.removeItem(STORAGE_KEY);
    setChat(null);
    setError(null);
  }

  function handleDateOrderChange(order: DateOrder) {
    setChat((previous) =>
      previous ? { ...previous, dateOrder: order } : previous,
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-sm text-stone-500">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-sm">
          <ChatIcon className="h-6 w-6" />
        </span>
        <Spinner className="h-5 w-5" />
        <p>{dict.packagesBoot}</p>
      </div>
    );
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,text/plain"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void ingestFile(file);
        }}
      />

      {chat ? (
        <PackagesDashboard
          chat={chat}
          onOpenFile={openFilePicker}
          onClear={handleClear}
          onDateOrderChange={handleDateOrderChange}
        />
      ) : (
        <PackagesUploadPanel
          onOpenFile={openFilePicker}
          onSample={() => void handleSample()}
          parsing={parsing}
        />
      )}

      {dragActive ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-emerald-950/40 p-6 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-emerald-300 bg-white px-10 py-8 text-center shadow-soft">
            <UploadIcon className="h-9 w-9 text-emerald-600" />
            <strong className="text-base font-semibold text-stone-900">
              {dict.packagesDropOverlayTitle}
            </strong>
            <span className="text-sm text-stone-500">
              {dict.packagesDropOverlaySub}
            </span>
          </div>
        </div>
      ) : null}

      {parsing && chat ? (
        <div className="fixed bottom-6 end-6 z-50 flex items-center gap-3 rounded-xl bg-stone-900 px-4 py-3 text-sm font-medium text-white shadow-soft">
          <Spinner className="h-4 w-4" />
          {dict.packagesParsing}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="fixed bottom-6 end-6 z-50 flex max-w-sm items-start gap-3 rounded-xl bg-rose-600 px-4 py-3 text-sm font-medium text-white shadow-soft"
        >
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label={dict.close}
            className="rounded p-0.5 text-rose-100 transition hover:text-white"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </>
  );
}
