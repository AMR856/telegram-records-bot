"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { AlertTriangleIcon } from "@/components/Icons";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, errorMessage } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n-context";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { dict } = useI18n();
  const { data, error, isLoading, refetch } = useMe();

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      router.replace("/login");
    }
  }, [error, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <div className="flex flex-col items-center gap-3 text-stone-500">
          <Spinner className="h-7 w-7 text-emerald-600" />
          <span className="text-sm">{dict.loading}</span>
        </div>
      </div>
    );
  }

  if (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
        <div className="card w-full max-w-md p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <AlertTriangleIcon className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-lg font-semibold">{dict.loadFailed}</h1>
          <p className="mt-1.5 text-sm text-stone-500">
            {errorMessage(error, dict.genericError)}
          </p>
          <button
            type="button"
            className="btn btn-primary mt-6"
            onClick={() => void refetch()}
          >
            {dict.retry}
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;
  return <>{children}</>;
}
