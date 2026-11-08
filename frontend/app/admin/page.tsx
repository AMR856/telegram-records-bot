"use client";

import { useState } from "react";

import { GlobeIcon, ShieldIcon, WalletIcon } from "@/components/Icons";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, apiFetch, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n-context";
import type { User } from "@/lib/types";

function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function AdminPage() {
  const { lang, dict, setLang } = useI18n();
  const [secret, setSecret] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [togglePendingId, setTogglePendingId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [emailTarget, setEmailTarget] = useState<User | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const expireSession = () => {
    setUnlocked(false);
    setSecret("");
    setUsers([]);
    setEmail("");
    setPassword("");
    setNotice(null);
    setActionError(null);
    setResetTarget(null);
    setResetPassword("");
    setEmailTarget(null);
    setDeleteTarget(null);
    setTogglePendingId(null);
  };

  const unlock = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const value = secret.trim();
    if (!value) {
      setError(dict.fillRequired);
      return;
    }
    setIsUnlocking(true);
    try {
      const list = await apiFetch<User[]>("/api/admin/users", {
        headers: { "X-Admin-Secret": value },
      });
      setSecret(value);
      setUsers(list);
      setUnlocked(true);
    } catch (err) {
      if (isAuthError(err)) {
        setError(dict.invalidAdminSecret);
      } else {
        setError(errorMessage(err, dict.authError));
      }
    } finally {
      setIsUnlocking(false);
    }
  };

  const createUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim() || !password) {
      setError(dict.fillRequired);
      return;
    }
    if (!isValidEmail(email.trim())) {
      setError(dict.invalidEmail);
      return;
    }
    if (password.length < 8) {
      setError(dict.passwordTooShort);
      return;
    }
    setIsCreating(true);
    try {
      const user = await apiFetch<User>("/api/admin/users", {
        method: "POST",
        headers: { "X-Admin-Secret": secret },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      setUsers((current) => [user, ...current]);
      setEmail("");
      setPassword("");
      setNotice(dict.userCreated);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(dict.emailTaken);
      } else if (isAuthError(err)) {
        expireSession();
        setError(dict.invalidAdminSecret);
      } else {
        setError(errorMessage(err, dict.authError));
      }
    } finally {
      setIsCreating(false);
    }
  };

  const toggleActive = async (user: User) => {
    setActionError(null);
    setNotice(null);
    setTogglePendingId(user.id);
    try {
      const updated = await apiFetch<User>(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "X-Admin-Secret": secret },
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(updated.is_active ? dict.userActivated : dict.userDeactivated);
    } catch (err) {
      if (isAuthError(err)) {
        expireSession();
        setError(dict.invalidAdminSecret);
      } else {
        setActionError(errorMessage(err, dict.authError));
      }
    } finally {
      setTogglePendingId(null);
    }
  };

  const openReset = (user: User) => {
    setResetTarget(user);
    setResetPassword("");
    setResetError(null);
  };

  const submitReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetTarget) return;
    setResetError(null);
    if (resetPassword.length < 8) {
      setResetError(dict.passwordTooShort);
      return;
    }
    setIsResetting(true);
    try {
      await apiFetch<void>(`/api/admin/users/${resetTarget.id}/password`, {
        method: "POST",
        headers: { "X-Admin-Secret": secret },
        body: JSON.stringify({ password: resetPassword }),
      });
      setResetTarget(null);
      setResetPassword("");
      setNotice(dict.passwordReset);
    } catch (err) {
      if (isAuthError(err)) {
        expireSession();
        setError(dict.invalidAdminSecret);
      } else {
        setResetError(errorMessage(err, dict.authError));
      }
    } finally {
      setIsResetting(false);
    }
  };

  const openEmail = (user: User) => {
    setEmailTarget(user);
    setEditEmail(user.email);
    setEmailError(null);
  };

  const submitEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!emailTarget) return;
    setEmailError(null);
    if (!isValidEmail(editEmail.trim())) {
      setEmailError(dict.invalidEmail);
      return;
    }
    setIsSavingEmail(true);
    try {
      const updated = await apiFetch<User>(`/api/admin/users/${emailTarget.id}`, {
        method: "PATCH",
        headers: { "X-Admin-Secret": secret },
        body: JSON.stringify({ email: editEmail.trim() }),
      });
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEmailTarget(null);
      setNotice(dict.emailUpdated);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setEmailError(dict.emailTaken);
      } else if (isAuthError(err)) {
        expireSession();
        setError(dict.invalidAdminSecret);
      } else {
        setEmailError(errorMessage(err, dict.authError));
      }
    } finally {
      setIsSavingEmail(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await apiFetch<void>(`/api/admin/users/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { "X-Admin-Secret": secret },
      });
      setUsers((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      setNotice(dict.userDeleted);
    } catch (err) {
      if (isAuthError(err)) {
        expireSession();
        setError(dict.invalidAdminSecret);
      } else {
        setDeleteError(errorMessage(err, dict.authError));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <main className="min-h-screen bg-stone-50">
      <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-stone-50/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-sm">
              <WalletIcon className="h-5 w-5" />
            </span>
            <span className="truncate text-base font-semibold tracking-tight text-stone-900">
              {dict.adminTitle}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              className="btn btn-ghost h-9 px-2.5 text-xs font-semibold sm:px-3"
              title={dict.language}
              aria-label={dict.language}
            >
              <GlobeIcon className="h-4 w-4" />
              <span>{lang === "ar" ? dict.english : "العربية"}</span>
            </button>

            {unlocked ? (
              <button
                type="button"
                onClick={expireSession}
                className="btn btn-secondary h-9 px-3 text-xs"
              >
                {dict.lock}
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        {!unlocked ? (
          <div className="mx-auto max-w-md">
            <div className="card p-6 shadow-soft sm:p-8">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100">
                <ShieldIcon className="h-6 w-6" />
              </span>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight text-stone-900">
                {dict.adminTitle}
              </h1>
              <p className="mt-1.5 text-sm leading-6 text-stone-500">
                {dict.adminSubtitle}
              </p>

              <form onSubmit={unlock} className="mt-7 space-y-4" noValidate>
                <div>
                  <label className="label" htmlFor="admin-secret">
                    {dict.adminSecret}
                  </label>
                  <input
                    id="admin-secret"
                    type="password"
                    autoComplete="off"
                    autoFocus
                    className="input"
                    value={secret}
                    onChange={(event) => setSecret(event.target.value)}
                    placeholder="••••••••••••"
                    disabled={isUnlocking}
                  />
                  <p className="mt-1.5 text-xs text-stone-400">{dict.adminSecretHint}</p>
                </div>

                {error ? (
                  <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  className="btn btn-primary w-full"
                  disabled={isUnlocking}
                >
                  {isUnlocking ? <Spinner className="h-4 w-4" /> : null}
                  {isUnlocking ? dict.unlocking : dict.unlock}
                </button>
              </form>
            </div>

            <p className="mt-6 text-center text-xs text-stone-400">{dict.adminNote}</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
                {dict.adminTitle}
              </h1>
              <p className="mt-1 text-sm text-stone-500">{dict.adminSubtitle}</p>
            </div>

            {notice ? (
              <p className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
                {notice}
              </p>
            ) : null}

            {actionError ? (
              <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                {actionError}
              </p>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <section className="card h-fit p-6">
                <h2 className="text-lg font-semibold text-stone-900">{dict.createUser}</h2>
                <p className="mt-1 text-sm text-stone-500">{dict.createUserSubtitle}</p>

                <form onSubmit={createUser} className="mt-5 space-y-4" noValidate>
                  <div>
                    <label className="label" htmlFor="new-email">
                      {dict.email}
                    </label>
                    <input
                      id="new-email"
                      type="email"
                      autoComplete="off"
                      className="input"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="user@example.com"
                      disabled={isCreating}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="new-password">
                      {dict.password}
                    </label>
                    <input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      className="input"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="••••••••"
                      disabled={isCreating}
                    />
                    <p className="mt-1.5 text-xs text-stone-400">{dict.passwordHint}</p>
                  </div>

                  {error ? (
                    <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                      {error}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    className="btn btn-primary w-full"
                    disabled={isCreating}
                  >
                    {isCreating ? <Spinner className="h-4 w-4" /> : null}
                    {isCreating ? dict.creatingUser : dict.createUser}
                  </button>
                </form>
              </section>

              <section className="card p-6">
                <h2 className="text-lg font-semibold text-stone-900">{dict.users}</h2>

                {users.length === 0 ? (
                  <p className="mt-4 rounded-xl border border-dashed border-stone-200 px-4 py-8 text-center text-sm text-stone-400">
                    {dict.noUsers}
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-stone-100">
                    {users.map((user) => (
                      <li key={user.id} className="py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="min-w-0 truncate text-sm font-medium text-stone-800">
                                {user.email}
                              </span>
                              <span
                                className={cn(
                                  "badge",
                                  user.is_active
                                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
                                    : "bg-stone-100 text-stone-500 ring-1 ring-inset ring-stone-500/15",
                                )}
                              >
                                <span
                                  className={cn(
                                    "h-1.5 w-1.5 rounded-full",
                                    user.is_active ? "bg-emerald-500" : "bg-stone-400",
                                  )}
                                />
                                {user.is_active ? dict.activeAccount : dict.inactiveAccount}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-stone-400">
                              {formatDate(user.created_at, lang)}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              className="btn btn-secondary h-8 px-2.5 text-xs"
                              onClick={() => openReset(user)}
                            >
                              {dict.resetPassword}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary h-8 px-2.5 text-xs"
                              onClick={() => openEmail(user)}
                            >
                              {dict.editEmail}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary h-8 px-2.5 text-xs"
                              onClick={() => void toggleActive(user)}
                              disabled={togglePendingId === user.id}
                            >
                              {togglePendingId === user.id ? (
                                <Spinner className="h-3.5 w-3.5" />
                              ) : null}
                              {user.is_active ? dict.deactivate : dict.activate}
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger h-8 px-2.5 text-xs"
                              onClick={() => {
                                setDeleteTarget(user);
                                setDeleteError(null);
                              }}
                            >
                              {dict.delete}
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <p className="text-center text-xs text-stone-400">{dict.adminNote}</p>
          </div>
        )}
      </div>

      {resetTarget ? (
        <Modal
          title={dict.resetPasswordTitle}
          description={resetTarget.email}
          onClose={() => {
            if (!isResetting) setResetTarget(null);
          }}
        >
          <form onSubmit={submitReset} className="space-y-4" noValidate>
            <div>
              <label className="label" htmlFor="reset-password">
                {dict.newPassword}
              </label>
              <input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                autoFocus
                className="input"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
                placeholder="••••••••"
                disabled={isResetting}
              />
              <p className="mt-1.5 text-xs text-stone-400">{dict.passwordHint}</p>
            </div>
            <p className="text-xs text-stone-500">{dict.resetPasswordText}</p>

            {resetError ? (
              <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                {resetError}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setResetTarget(null)}
                disabled={isResetting}
              >
                {dict.cancel}
              </button>
              <button type="submit" className="btn btn-primary" disabled={isResetting}>
                {isResetting ? <Spinner className="h-4 w-4" /> : null}
                {isResetting ? dict.resettingPassword : dict.resetPassword}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {emailTarget ? (
        <Modal
          title={dict.editEmail}
          description={emailTarget.email}
          onClose={() => {
            if (!isSavingEmail) setEmailTarget(null);
          }}
        >
          <form onSubmit={submitEmail} className="space-y-4" noValidate>
            <div>
              <label className="label" htmlFor="edit-email">
                {dict.email}
              </label>
              <input
                id="edit-email"
                type="email"
                autoComplete="off"
                autoFocus
                className="input"
                value={editEmail}
                onChange={(event) => setEditEmail(event.target.value)}
                placeholder="user@example.com"
                disabled={isSavingEmail}
              />
            </div>

            {emailError ? (
              <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                {emailError}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEmailTarget(null)}
                disabled={isSavingEmail}
              >
                {dict.cancel}
              </button>
              <button type="submit" className="btn btn-primary" disabled={isSavingEmail}>
                {isSavingEmail ? <Spinner className="h-4 w-4" /> : null}
                {isSavingEmail ? dict.savingEmail : dict.saveEmail}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title={dict.deleteUserTitle}
          text={`${deleteTarget.email} — ${dict.deleteUserText}`}
          confirmLabel={dict.deleteUser}
          pendingLabel={dict.deletingUser}
          pending={isDeleting}
          error={deleteError}
          onConfirm={() => void confirmDelete()}
          onClose={() => {
            if (!isDeleting) setDeleteTarget(null);
          }}
        />
      ) : null}
    </main>
  );
}
