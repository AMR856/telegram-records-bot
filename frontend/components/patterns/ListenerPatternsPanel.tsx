"use client";

import { useMemo, useState } from "react";

import { AlertTriangleIcon, CopyIcon } from "@/components/Icons";
import { PatternProfileEditor } from "@/components/patterns/PatternProfileEditor";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import { errorMessage } from "@/lib/api";
import {
  useCopyParserProfile,
  useDeleteParserProfile,
  useListeners,
  useParserProfile,
  useParserProfiles,
  useSaveParserProfile,
} from "@/lib/hooks";
import { useI18n } from "@/lib/i18n-context";
import { nextNumberedName } from "@/lib/patterns";

export function ListenerPatternsPanel({ listenerId }: { listenerId: string }) {
  const { dict } = useI18n();
  const profileQuery = useParserProfile(listenerId);
  const profilesQuery = useParserProfiles();
  const listenersQuery = useListeners();
  const saveProfile = useSaveParserProfile(listenerId);
  const deleteProfile = useDeleteParserProfile(listenerId);
  const copyProfile = useCopyParserProfile(listenerId);

  const [sourceId, setSourceId] = useState("");
  const [confirmCopy, setConfirmCopy] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);

  const profile = profileQuery.data ?? null;
  const allProfiles = profilesQuery.data ?? [];
  const listeners = listenersQuery.data ?? [];

  const sourceProfiles = useMemo(
    () =>
      allProfiles.filter(
        (item) => item.kind === "telegram" && item.id !== profile?.id,
      ),
    [allProfiles, profile?.id],
  );

  const defaultName = nextNumberedName(
    dict.profilesDefaultName,
    allProfiles
      .filter((item) => item.kind === "telegram")
      .map((item) => item.name),
  );

  if (profileQuery.isLoading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-28 w-full" />
        <div className="skeleton h-64 w-full" />
      </div>
    );
  }

  if (profileQuery.isError) {
    return (
      <div className="card flex gap-3 p-5 text-sm text-rose-700">
        <AlertTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
        <p>{errorMessage(profileQuery.error, dict.genericError)}</p>
      </div>
    );
  }

  const copy = async () => {
    if (!sourceId) return;
    setCopyError(null);
    setCopySuccess(false);
    try {
      await copyProfile.mutateAsync(sourceId);
      setConfirmCopy(false);
      setSourceId("");
      setEditorVersion((value) => value + 1);
      setCopySuccess(true);
    } catch (error) {
      setCopyError(errorMessage(error, dict.genericError));
    }
  };

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-stone-900">
              {dict.patternsCopyFromProfile}
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              {dict.patternsCopyFromProfileHint}
            </p>
          </div>
        </div>

        {profilesQuery.isError ? (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errorMessage(profilesQuery.error, dict.genericError)}
          </p>
        ) : null}

        {profilesQuery.isLoading ? (
          <div className="skeleton mt-4 h-9 w-full" />
        ) : sourceProfiles.length === 0 ? (
          <p className="mt-3 text-xs text-stone-400">
            {dict.whatsappNoListenerProfiles}
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              className="input sm:max-w-sm"
              value={sourceId}
              onChange={(event) => {
                setSourceId(event.target.value);
                setCopyError(null);
                setCopySuccess(false);
              }}
            >
              <option value="">{dict.patternsCopySelect}</option>
              {sourceProfiles.map((item) => {
                const listener = listeners.find(
                  (candidate) => candidate.id === item.listener_id,
                );
                const listenerName =
                  listener?.label ||
                  listener?.chat_title ||
                  listener?.channel_input ||
                  item.listener_id;
                return (
                  <option key={item.id} value={item.id}>
                    {item.name} — {listenerName}
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setCopyError(null);
                setConfirmCopy(true);
              }}
              disabled={!sourceId || copyProfile.isPending}
            >
              {copyProfile.isPending ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <CopyIcon className="h-4 w-4" />
              )}
              {copyProfile.isPending ? dict.saving : dict.patternsCopy}
            </button>
          </div>
        )}

        {copyError ? (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {copyError}
          </p>
        ) : null}
        {copySuccess ? (
          <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {dict.patternsCopySuccess}
          </p>
        ) : null}
      </div>

      <PatternProfileEditor
        key={`${profile?.id ?? "new"}-${editorVersion}`}
        initial={profile}
        kind="telegram"
        defaultName={defaultName}
        onSave={(payload) => saveProfile.mutateAsync(payload)}
        onDelete={profile ? () => deleteProfile.mutateAsync() : undefined}
      />

      {confirmCopy ? (
        <ConfirmDialog
          title={dict.patternsCopyFromProfile}
          text={dict.patternsCopyFromProfileHint}
          confirmLabel={dict.patternsCopy}
          pendingLabel={dict.saving}
          pending={copyProfile.isPending}
          error={copyError}
          onClose={() => setConfirmCopy(false)}
          onConfirm={() => void copy()}
        />
      ) : null}
    </div>
  );
}
