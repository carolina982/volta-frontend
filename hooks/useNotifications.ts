import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  type: string;
  tripId: string | null;
  read: boolean;
  createdAt: string;
};

export function useNotifications(active: boolean) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshUnread = useCallback(async () => {
    try {
      const res = await api.get("/notifications/unread-count");
      setUnreadCount(res.data?.count ?? 0);
    } catch (error) {
      console.warn("Error contando notificaciones:", error);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/notifications");
      setItems(res.data || []);
      await refreshUnread();
    } catch (error) {
      console.warn("Error cargando notificaciones:", error);
    } finally {
      setLoading(false);
    }
  }, [refreshUnread]);

  const markRead = useCallback(async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, read: true } : item))
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (error) {
      console.warn("Error marcando notificación:", error);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await api.patch("/notifications/read-all");
      setItems((prev) => prev.map((item) => ({ ...item, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.warn("Error marcando todas:", error);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    refreshUnread();
    const interval = setInterval(refreshUnread, 30000);
    return () => clearInterval(interval);
  }, [active, refreshUnread]);

  return {
    unreadCount,
    items,
    loading,
    refreshUnread,
    loadNotifications,
    markRead,
    markAllRead,
  };
}
