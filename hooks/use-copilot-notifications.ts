"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { CopilotNotification, NotificationListResponse } from "@/lib/copilot-notifications/notification-types";

type NotificationsState = {
  notifications: CopilotNotification[];
  unreadCount: number;
  loading: boolean;
};

const POLL_INTERVAL_MS = 60_000;

export function useCopilotNotifications() {
  const [state, setState] = useState<NotificationsState>({
    notifications: [],
    unreadCount: 0,
    loading: false,
  });
  const inFlight = useRef(false);

  const doFetch = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await copilotApiFetch("/api/copilot/notifications?limit=50");
      if (!res.ok) return;
      const data = (await res.json()) as NotificationListResponse;
      setState({
        notifications: data.notifications ?? [],
        unreadCount: data.unreadCount ?? 0,
        loading: false,
      });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    } finally {
      inFlight.current = false;
    }
  }, []);

  const markAsRead = useCallback((id: string) => {
    setState((s) => {
      const wasUnread = s.notifications.some((n) => n.id === id && !n.read_at);
      return {
        ...s,
        notifications: s.notifications.map((n) =>
          n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n
        ),
        unreadCount: wasUnread ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
      };
    });
    void copilotApiFetch(`/api/copilot/notifications/${id}/read`, { method: "PATCH" });
  }, []);

  const markAllAsRead = useCallback(() => {
    const now = new Date().toISOString();
    setState((s) => ({
      ...s,
      notifications: s.notifications.map((n) => ({ ...n, read_at: n.read_at ?? now })),
      unreadCount: 0,
    }));
    void copilotApiFetch("/api/copilot/notifications/mark-all-read", { method: "POST" });
  }, []);

  useEffect(() => { void doFetch(); }, [doFetch]);

  useEffect(() => {
    const id = setInterval(() => void doFetch(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [doFetch]);

  useEffect(() => {
    function onFocus() { void doFetch(); }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [doFetch]);

  return { ...state, markAsRead, markAllAsRead, refetch: doFetch };
}
