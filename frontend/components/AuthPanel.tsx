"use client";

import Link from "next/link";

import {
  BotIcon,
  CheckIcon,
  DownloadIcon,
  ListIcon,
  ShieldIcon,
  WalletIcon,
} from "@/components/Icons";
import { useI18n } from "@/lib/i18n-context";

export function AuthPanel({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { dict } = useI18n();

  const features = [
    {
      icon: <BotIcon className="h-4 w-4" />,
      title: dict.featureCollectTitle,
      text: dict.featureCollectText,
    },
    {
      icon: <ListIcon className="h-4 w-4" />,
      title: dict.featureLogsTitle,
      text: dict.featureLogsText,
    },
    {
      icon: <DownloadIcon className="h-4 w-4" />,
      title: dict.featureExportTitle,
      text: dict.featureExportText,
    },
  ];

  return (
    <main className="min-h-screen bg-stone-50 lg:grid lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 15%, rgba(52,211,153,.55), transparent 28%), radial-gradient(circle at 85% 80%, rgba(20,184,166,.45), transparent 30%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
            <WalletIcon className="h-6 w-6" />
          </span>
          <span className="text-lg font-semibold tracking-tight">{dict.appName}</span>
        </div>

        <div className="relative max-w-lg">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            {dict.appTagline}
          </h1>
          <ul className="mt-10 space-y-6">
            {features.map((feature) => (
              <li key={feature.title} className="flex gap-3.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-200 ring-1 ring-inset ring-emerald-300/25">
                  {feature.icon}
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{feature.title}</p>
                  <p className="mt-1 text-sm leading-6 text-emerald-100/70">
                    {feature.text}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-2 text-sm text-emerald-100/70">
          <ShieldIcon className="h-4 w-4" />
          <span>{dict.secureNote}</span>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-center gap-2.5 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-sm">
              <WalletIcon className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight">{dict.appName}</span>
          </div>

          <div className="card p-6 shadow-soft sm:p-8">
            <h2 className="text-2xl font-semibold tracking-tight text-stone-900">
              {title}
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-stone-500">{subtitle}</p>
            <div className="mt-7">{children}</div>
          </div>

          {footer ? (
            <div className="mt-6 text-center text-sm text-stone-500">{footer}</div>
          ) : null}

          <p className="mt-8 flex items-center justify-center gap-2 text-xs text-stone-400 lg:hidden">
            <CheckIcon className="h-3.5 w-3.5" />
            {dict.secureNote}
          </p>

          <p className="mt-4 text-center text-xs text-stone-400">
            <Link href="/" className="hover:text-stone-600">
              {dict.appName}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
