"use client";

import { AlertTriangleIcon } from "@/components/Icons";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useI18n } from "@/lib/i18n-context";

export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  pendingLabel,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  pendingLabel: string;
  pending: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { dict } = useI18n();

  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <AlertTriangleIcon className="h-5 w-5" />
        </div>
        <p className="pt-1.5 text-sm leading-6 text-stone-600">{text}</p>
      </div>
      {error ? (
        <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
          {dict.cancel}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={onConfirm}
          disabled={pending}
        >
          {pending ? <Spinner className="h-4 w-4" /> : null}
          {pending ? pendingLabel : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
