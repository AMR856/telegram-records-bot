"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  GlobeIcon,
  LogoutIcon,
  WalletIcon,
} from "@/components/Icons";
import { Spinner } from "@/components/ui/Spinner";
import { useLogout, useMe } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n-context";

export function Navbar() {
  const { lang, dict, setLang } = useI18n();
  const { data: user } = useMe();
  const logout = useLogout();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
    } catch {
      // Clear local state and send the user back to the login screen regardless.
    } finally {
      router.replace("/login");
      router.refresh();
    }
  };

  const nextLanguageLabel = lang === "ar" ? dict.english : "العربية";

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-stone-50/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-sm">
            <WalletIcon className="h-5 w-5" />
          </span>
          <span className="truncate text-base font-semibold tracking-tight text-stone-900">
            {dict.appName}
          </span>
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {user ? (
            <span
              className="me-1 hidden max-w-[240px] truncate text-sm text-stone-500 md:block"
              title={`${dict.signedInAs} ${user.email}`}
            >
              {user.email}
            </span>
          ) : null}

          <button
            type="button"
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
            className="btn btn-ghost h-9 px-2.5 text-xs font-semibold sm:px-3"
            title={dict.language}
            aria-label={dict.language}
          >
            <GlobeIcon className="h-4 w-4" />
            <span>{nextLanguageLabel}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={logout.isPending}
            className="btn btn-secondary h-9 px-2.5 sm:px-3"
            title={dict.logout}
          >
            {logout.isPending ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <LogoutIcon className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">{dict.logout}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
