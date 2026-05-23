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
const SESSION_GENERATED_KEY = "copilot_notifications_generated_session_v1";

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

  // Fire the notification generator once per browser session.
  // Checks sessionStorage so it never re-runs on route changes.
  useEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    if (sessionStorage.getItem(SESSION_GENERATED_KEY)) return;

    void (async () => {
      try {
        const res = await copilotApiFetch("/api/copilot/notifications/generate", {
          method: "POST",
        });
        if (res.ok) {
          sessionStorage.setItem(SESSION_GENERATED_KEY, "1");
          void doFetch();
          if (process.env.NODE_ENV === "development") {
            const result = await res.clone().json().catch(() => null);
            console.log("[notifications] session generate", result);
          }
        }
      } catch {
        // Silent — never surface notification errors to the user
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty: run only on mount, not on every doFetch change

  return { ...state, markAsRead, markAllAsRead, refetch: doFetch };
}
