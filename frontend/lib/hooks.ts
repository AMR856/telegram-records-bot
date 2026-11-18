"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { apiFetch, buildQuery } from "@/lib/api";
import type {
  DateOrder,
  Listener,
  ListenerPayload,
  LogFilters,
  LogPage,
  ParserProfile,
  PatternProfilePayload,
  PaymentFilters,
  PaymentPage,
  User,
  WhatsAppParseResponse,
} from "@/lib/types";

export const queryKeys = {
  me: ["me"] as const,
  listeners: ["listeners"] as const,
  listener: (id: string) => ["listener", id] as const,
  logs: (id: string, filters: LogFilters) => ["logs", id, filters] as const,
  payments: (id: string, filters: PaymentFilters, page: number) =>
    ["payments", id, filters, page] as const,
  parserProfile: (listenerId: string) => ["parserProfile", listenerId] as const,
  parserProfiles: ["parserProfiles"] as const,
  whatsappProfiles: ["whatsappProfiles"] as const,
};

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiFetch<User>("/api/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
}

export function useListeners() {
  return useQuery({
    queryKey: queryKeys.listeners,
    queryFn: () => apiFetch<Listener[]>("/api/listeners"),
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}

export function useListener(id: string) {
  return useQuery({
    queryKey: queryKeys.listener(id),
    queryFn: () => apiFetch<Listener>(`/api/listeners/${id}`),
    enabled: Boolean(id),
    staleTime: 5_000,
    refetchInterval: (query) => {
      const listener = query.state.data;
      return listener?.status === "running" ? 5_000 : false;
    },
  });
}

export function useLogs(
  listenerId: string,
  filters: LogFilters,
  autoRefresh: boolean,
) {
  return useInfiniteQuery({
    queryKey: queryKeys.logs(listenerId, filters),
    queryFn: ({ pageParam }) =>
      apiFetch<LogPage>(
        `/api/listeners/${listenerId}/logs${buildQuery({
          before_id: pageParam,
          limit: 100,
          level: filters.level,
          kind: filters.kind,
        })}`,
      ),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.next_before_id ?? undefined,
    staleTime: 2_000,
    refetchInterval: autoRefresh ? 3_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function usePayments(
  listenerId: string,
  filters: PaymentFilters,
  page: number,
  running = false,
) {
  return useQuery({
    queryKey: queryKeys.payments(listenerId, filters, page),
    queryFn: () =>
      apiFetch<PaymentPage>(
        `/api/listeners/${listenerId}/payments${buildQuery({
          q: filters.q,
          month: filters.month,
          date_from: filters.dateFrom,
          date_to: filters.dateTo,
          page,
          page_size: 25,
        })}`,
      ),
    placeholderData: (previous) => previous,
    staleTime: 2_000,
    refetchInterval: running ? 3_000 : 15_000,
    refetchIntervalInBackground: false,
  });
}

export function useCreateListener() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ListenerPayload) =>
      apiFetch<Listener>("/api/listeners", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.listeners });
    },
  });
}

export function useUpdateListener(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ListenerPayload) =>
      apiFetch<Listener>(`/api/listeners/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: (listener) => {
      queryClient.setQueryData(queryKeys.listener(id), listener);
      queryClient.invalidateQueries({ queryKey: queryKeys.listeners });
    },
  });
}

export function useStartListener(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<Listener>(`/api/listeners/${id}/start`, { method: "POST" }),
    onSuccess: (listener) => {
      queryClient.setQueryData(queryKeys.listener(id), listener);
      queryClient.invalidateQueries({ queryKey: queryKeys.listeners });
      queryClient.invalidateQueries({ queryKey: ["logs", id] });
    },
  });
}

export function useStopListener(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<Listener>(`/api/listeners/${id}/stop`, { method: "POST" }),
    onSuccess: (listener) => {
      queryClient.setQueryData(queryKeys.listener(id), listener);
      queryClient.invalidateQueries({ queryKey: queryKeys.listeners });
      queryClient.invalidateQueries({ queryKey: ["logs", id] });
    },
  });
}

export function useDeleteLog(listenerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (logId: number) =>
      apiFetch<void>(`/api/listeners/${listenerId}/logs/${logId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["logs", listenerId] });
      queryClient.invalidateQueries({ queryKey: ["payments", listenerId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.listener(listenerId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.listeners });
    },
  });
}

export function useDeleteListener(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<void>(`/api/listeners/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.listener(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.listeners });
    },
  });
}

export function useParserProfile(listenerId: string) {
  return useQuery({
    queryKey: queryKeys.parserProfile(listenerId),
    queryFn: () =>
      apiFetch<ParserProfile | null>(`/api/listeners/${listenerId}/parser-profile`),
    enabled: Boolean(listenerId),
    staleTime: 30_000,
  });
}

export function useParserProfiles() {
  return useQuery({
    queryKey: queryKeys.parserProfiles,
    queryFn: () => apiFetch<ParserProfile[]>("/api/patterns/profiles"),
    staleTime: 30_000,
  });
}

export function useCopyParserProfile(listenerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profileId: string) =>
      apiFetch<ParserProfile>(
        `/api/listeners/${listenerId}/parser-profile/copy`,
        {
          method: "POST",
          body: JSON.stringify({ profile_id: profileId }),
        },
      ),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.parserProfile(listenerId), profile);
      queryClient.invalidateQueries({ queryKey: queryKeys.parserProfiles });
    },
  });
}

export function useSaveParserProfile(listenerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PatternProfilePayload) =>
      apiFetch<ParserProfile>(`/api/listeners/${listenerId}/parser-profile`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.parserProfile(listenerId), profile);
      queryClient.invalidateQueries({ queryKey: queryKeys.listeners });
    },
  });
}

export function useDeleteParserProfile(listenerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<void>(`/api/listeners/${listenerId}/parser-profile`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.parserProfile(listenerId), null);
    },
  });
}

export function useWhatsappProfiles() {
  return useQuery({
    queryKey: queryKeys.whatsappProfiles,
    queryFn: () => apiFetch<ParserProfile[]>("/api/whatsapp/profiles"),
    staleTime: 30_000,
  });
}

export function useCreateWhatsappProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PatternProfilePayload) =>
      apiFetch<ParserProfile>("/api/whatsapp/profiles", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.whatsappProfiles });
    },
  });
}

export function useUpdateWhatsappProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: PatternProfilePayload }) =>
      apiFetch<ParserProfile>(`/api/whatsapp/profiles/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: (profile) => {
      queryClient.setQueryData<ParserProfile[]>(queryKeys.whatsappProfiles, (current) =>
        current?.map((item) => (item.id === profile.id ? profile : item)),
      );
    },
  });
}

export function useDeleteWhatsappProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/whatsapp/profiles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.whatsappProfiles });
    },
  });
}

export function useCopyWhatsappProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      profileId,
      listenerId,
      name,
    }: {
      profileId: string;
      listenerId: string;
      name?: string;
    }) =>
      apiFetch<ParserProfile>(
        `/api/whatsapp/profiles/${profileId}/copy-from-listener/${listenerId}`,
        {
          method: "POST",
          body: JSON.stringify({ name: name ?? null }),
        },
      ),
    onSuccess: (profile) => {
      queryClient.setQueryData<ParserProfile[]>(queryKeys.whatsappProfiles, (current) =>
        current?.map((item) => (item.id === profile.id ? profile : item)),
      );
    },
  });
}

export function useParseWhatsapp() {
  return useMutation({
    mutationFn: ({
      profileId,
      file,
      dateOrder,
    }: {
      profileId: string;
      file: File;
      dateOrder?: DateOrder | null;
    }) => {
      const form = new FormData();
      form.set("profile_id", profileId);
      form.set("file", file);
      if (dateOrder) form.set("date_order", dateOrder);
      return apiFetch<WhatsAppParseResponse>("/api/whatsapp/parse", {
        method: "POST",
        body: form,
      });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>("/api/auth/logout", { method: "POST" }),
    onSettled: () => {
      queryClient.clear();
    },
  });
}
