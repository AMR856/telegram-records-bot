"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { AuthPanel } from "@/components/AuthPanel";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, apiFetch, errorMessage } from "@/lib/api";
import { queryKeys, useMe } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n-context";
import type { User } from "@/lib/types";

export default function LoginPage() {
  const { dict } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (me.data) router.replace("/");
  }, [me.data, router]);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<User>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      }),
    onSuccess: (user) => {
      queryClient.setQueryData(queryKeys.me, user);
      router.replace("/");
      router.refresh();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) {
        setError(dict.invalidCredentials);
      } else if (err instanceof ApiError && err.status === 403) {
        setError(dict.accountInactive);
      } else {
        setError(errorMessage(err, dict.authError));
      }
    },
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError(dict.fillRequired);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(dict.invalidEmail);
      return;
    }
    mutation.mutate();
  };

  return (
    <AuthPanel title={dict.loginTitle} subtitle={dict.loginSubtitle}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label className="label" htmlFor="email">
            {dict.email}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            className="input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            disabled={mutation.isPending}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            {dict.password}
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            disabled={mutation.isPending}
          />
        </div>

        {error ? (
          <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? <Spinner className="h-4 w-4" /> : null}
          {mutation.isPending ? dict.signingIn : dict.signIn}
        </button>
      </form>
    </AuthPanel>
  );
}
