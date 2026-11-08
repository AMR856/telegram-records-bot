"use client";

import { AuthGate } from "@/components/AuthGate";
import { Navbar } from "@/components/Navbar";
import { useI18n } from "@/lib/i18n-context";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { dict } = useI18n();

  return (
    <AuthGate>
      <div className="flex min-h-screen flex-col bg-stone-50">
        <Navbar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-8 sm:px-6 lg:px-8">
          {children}
        </main>
        <footer className="border-t border-stone-200/80 py-6">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-1 px-4 text-xs text-stone-400 sm:flex-row sm:px-6 lg:px-8">
            <span>{dict.appName}</span>
            <span>{dict.footer}</span>
          </div>
        </footer>
      </div>
    </AuthGate>
  );
}
