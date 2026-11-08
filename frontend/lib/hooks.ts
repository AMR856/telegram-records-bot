"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { apiFetch, buildQuery } from "@/lib/api";
import type {
  Listener,
  ListenerPayload,
  LogFilters,
  LogPage,
  PaymentFilters,
  PaymentPage,
  User,
} from "@/lib/types";

export const queryKeys = {
  me: ["me"] as const,
  listeners: ["listeners"] as const,
  listener: (id: string) => ["listener", id] as const,
  logs: (id: string, filters: LogFilters) => ["logs", id, filters] as const,
  payments: (id: string, filters: PaymentFilters, page: number) =>
    ["payments", id, filters, page] as const,
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

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>("/api/auth/logout", { method: "POST" }),
    onSettled: () => {
      queryClient.clear();
    },
  });
}
