import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, patch, post } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { ApiResponse, Notification } from "@/types";

function computeUnreadCount(notifications: Notification[]): number {
  return notifications.filter((n) => !n.isRead).length;
}

async function fetchNotificationsQueryFn(): Promise<Notification[]> {
  const response = await get<ApiResponse<{ notifications: Notification[] }>>("/notifications");
  const d = response?.data as Record<string, unknown> | undefined;
  const items = ((d?.notifications ?? d) as Notification[]) || [];
  return Array.isArray(items) ? items : [];
}

function isUnauthorizedError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    (error as { response?: { status?: number } }).response?.status === 401
  );
}

function signalAuthRequired() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("auth:required"));
  }
}

export function useNotificationsQuery() {
  return useQuery({
    queryKey: queryKeys.notifications.all,
    queryFn: fetchNotificationsQueryFn,
  });
}

export function useUnreadCount(): number {
  const query = useNotificationsQuery();
  return query.data ? computeUnreadCount(query.data) : 0;
}

export function useMarkAsReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => patch(`/notifications/${id}/read`),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.notifications.all,
      });
      const previous = queryClient.getQueryData<Notification[]>(
        queryKeys.notifications.all
      );
      queryClient.setQueryData<Notification[]>(
        queryKeys.notifications.all,
        (old = []) =>
          old.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      return { previous };
    },
    onError: (error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.notifications.all,
          context.previous
        );
      }
      if (isUnauthorizedError(error)) signalAuthRequired();
      console.warn("[notifications] Failed to mark notification as read:", error);
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.all,
      });
    },
  });
}

export function useMarkAllAsReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => patch("/notifications/read-all"),
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.notifications.all,
      });
      const previous = queryClient.getQueryData<Notification[]>(
        queryKeys.notifications.all
      );
      queryClient.setQueryData<Notification[]>(
        queryKeys.notifications.all,
        (old = []) => old.map((n) => ({ ...n, isRead: true }))
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.notifications.all,
          context.previous
        );
      }
      console.warn("[notifications] Failed to mark all as read:", error);
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.all,
      });
    },
  });
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [archivedNotifications, setArchivedNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const [res, archiveRes] = await Promise.allSettled([
        get("/notifications?limit=100"),
        get("/notifications/archive?limit=100"),
      ]);

      if (res.status === "fulfilled") {
        const d = (res.value as Record<string, unknown>)?.data as Record<string, unknown> ?? res.value;
        const items = ((d?.notifications ?? d) as Notification[]) || [];
        setNotifications(items);
        setUnreadCount(items.filter((n) => !n.isRead).length);
      }

      if (archiveRes.status === "fulfilled") {
        const ad = (archiveRes.value as Record<string, unknown>)?.data as Record<string, unknown> ?? archiveRes.value;
        const archiveItems = ((ad?.notifications ?? ad) as Notification[]) || [];
        setArchivedNotifications(archiveItems);
      }
    } catch (e) {
      console.warn("[notifications] Failed to fetch:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await patch(`/notifications/${id}/read`, {});
    } catch (e) {
      console.warn("[notifications] markAsRead failed:", e);
    }
  };

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await patch("/notifications/read-all", {});
    } catch (e) {
      console.warn("[notifications] markAllAsRead failed:", e);
    }
  };

  const archiveNotification = async (id: string) => {
    const target = notifications.find((n) => n.id === id);
    if (target) {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setArchivedNotifications((prev) => [{ ...target, isArchived: true }, ...prev]);
    }
    try {
      await post(`/notifications/${id}/archive`, {});
    } catch (e) {
      console.warn("[notifications] archive failed:", e);
    }
  };

  const unarchiveNotification = async (id: string) => {
    const target = archivedNotifications.find((n) => n.id === id);
    if (target) {
      setArchivedNotifications((prev) => prev.filter((n) => n.id !== id));
      setNotifications((prev) => [{ ...target, isArchived: false }, ...prev]);
    }
    try {
      await post(`/notifications/${id}/unarchive`, {});
    } catch (e) {
      console.warn("[notifications] unarchive failed:", e);
    }
  };

  const bulkArchive = async (ids: string[]) => {
    const targets = notifications.filter((n) => ids.includes(n.id));
    setNotifications((prev) => prev.filter((n) => !ids.includes(n.id)));
    setArchivedNotifications((prev) => [
      ...targets.map((n) => ({ ...n, isArchived: true })),
      ...prev,
    ]);
    try {
      await post("/notifications/bulk-archive", { ids });
    } catch (e) {
      console.warn("[notifications] bulk archive failed:", e);
    }
  };

  const bulkUnarchive = async (ids: string[]) => {
    const targets = archivedNotifications.filter((n) => ids.includes(n.id));
    setArchivedNotifications((prev) => prev.filter((n) => !ids.includes(n.id)));
    setNotifications((prev) => [
      ...targets.map((n) => ({ ...n, isArchived: false })),
      ...prev,
    ]);
    try {
      await post("/notifications/bulk-unarchive", { ids });
    } catch (e) {
      console.warn("[notifications] bulk unarchive failed:", e);
    }
  };

  return {
    notifications,
    archivedNotifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    archiveNotification,
    unarchiveNotification,
    bulkArchive,
    bulkUnarchive,
    fetchNotifications,
  };
}
