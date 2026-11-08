"use client";

import { useState } from "react";

import { ShieldIcon } from "@/components/Icons";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, errorMessage } from "@/lib/api";
import { useCreateListener, useUpdateListener } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n-context";
import type { Listener, ListenerPayload } from "@/lib/types";

export function ListenerFormModal({
  mode,
  listener,
  onClose,
}: {
  mode: "create" | "edit";
  listener?: Listener;
  onClose: () => void;
}) {
  const { dict } = useI18n();
  const [label, setLabel] = useState(listener?.label ?? "");
  const [channel, setChannel] = useState(listener?.channel_input ?? "");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateListener();
  const updateMutation = useUpdateListener(listener?.id ?? "");
  const mutation = mode === "create" ? createMutation : updateMutation;
  const pending = mutation.isPending;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!channel.trim() || (mode === "create" && !token.trim())) {
      setError(dict.fillRequired);
      return;
    }

    const payload: ListenerPayload = {
      label: label.trim() ? label.trim() : null,
      channel_input: channel.trim(),
    };
    if (token.trim()) payload.bot_token = token.trim();

    mutation.mutate(payload, {
      onSuccess: () => onClose(),
      onError: (err) => {
        if (err instanceof ApiError && err.status === 409) {
          setError(dict.duplicateToken);
        } else {
          setError(errorMessage(err, dict.genericError));
        }
      },
    });
  };

  return (
    <Modal
      title={mode === "create" ? dict.createListener : dict.editListener}
      description={mode === "create" ? dict.setupHint : dict.tokenSecurityNote}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label className="label" htmlFor="listener-label">
            {dict.label} <span className="font-normal text-stone-400">({dict.optional})</span>
          </label>
          <input
            id="listener-label"
            className="input"
            value={label}
            maxLength={100}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={dict.labelPlaceholder}
            disabled={pending}
          />
        </div>

        <div>
          <label className="label" htmlFor="listener-channel">
            {dict.channel}
          </label>
          <input
            id="listener-channel"
            className="input"
            value={channel}
            maxLength={255}
            onChange={(event) => setChannel(event.target.value)}
            placeholder={dict.channelPlaceholder}
            disabled={pending}
            required
            dir="ltr"
          />
          <p className="mt-1.5 text-xs text-stone-400">{dict.channelHint}</p>
        </div>

        <div>
          <label className="label" htmlFor="listener-token">
            {dict.botToken}
          </label>
          <input
            id="listener-token"
            type="password"
            className="input"
            value={token}
            maxLength={255}
            onChange={(event) => setToken(event.target.value)}
            placeholder={
              mode === "edit" ? dict.tokenKeepPlaceholder : dict.botTokenPlaceholder
            }
            autoComplete="off"
            disabled={pending}
            required={mode === "create"}
            dir="ltr"
          />
        </div>

        <div className="flex gap-2.5 rounded-xl bg-stone-50 px-3.5 py-3 text-xs leading-5 text-stone-500">
          <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />
          <span>{dict.tokenSecurityNote}</span>
        </div>

        {error ? (
          <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
            {dict.cancel}
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? <Spinner className="h-4 w-4" /> : null}
            {pending
              ? mode === "create"
                ? dict.creating
                : dict.saving
              : mode === "create"
                ? dict.createListener
                : dict.save}
          </button>
        </div>
      </form>
    </Modal>
  );
}
