import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
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

  // IDs ya conocidos, para disparar notificación local SOLO de las nuevas.
  const knownIdsRef = useRef<Set<string> | null>(null);

  const refreshUnread = useCallback(async () => {
    try {
      const res = await api.get("/notifications/unread-count");
      setUnreadCount(res.data?.count ?? 0);
    } catch (error) {
      console.warn("Error contando notificaciones:", error);
    }
  }, []);

  /** Dispara una notificación local nativa (funciona en Expo Go, sin build). */
  const fireLocalNotification = useCallback(async (n: AppNotification) => {
    if (Platform.OS === "web") return;
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: n.title,
          body: n.body,
          sound: true,
          data: { type: n.type, tripId: n.tripId ?? "" },
        },
        trigger: null, // inmediata
      });
    } catch (error) {
      console.warn("Error mostrando notificación local:", error);
    }
  }, []);

  /**
   * Sondea la lista completa. Si aparecen notificaciones nuevas sin leer,
   * las muestra como notificación local en el teléfono.
   */
  const pollNotifications = useCallback(async () => {
    try {
      const res = await api.get("/notifications");
      const list: AppNotification[] = res.data || [];
      setItems(list);
      setUnreadCount(list.filter((n) => !n.read).length);

      // Primera carga: registrar lo existente sin notificar.
      if (knownIdsRef.current === null) {
        knownIdsRef.current = new Set(list.map((n) => n.id));
        return;
      }

      const nuevas = list.filter((n) => !knownIdsRef.current!.has(n.id));
      for (const n of nuevas) {
        knownIdsRef.current!.add(n.id);
        if (!n.read) await fireLocalNotification(n);
      }
    } catch (error) {
      console.warn("Error sondeando notificaciones:", error);
    }
  }, [fireLocalNotification]);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/notifications");
      const list: AppNotification[] = res.data || [];
      setItems(list);
      setUnreadCount(list.filter((n) => !n.read).length);
      if (knownIdsRef.current === null) {
        knownIdsRef.current = new Set(list.map((n) => n.id));
      } else {
        list.forEach((n) => knownIdsRef.current!.add(n.id));
      }
    } catch (error) {
      console.warn("Error cargando notificaciones:", error);
    } finally {
      setLoading(false);
    }
  }, []);

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
    pollNotifications();
    const interval = setInterval(pollNotifications, 30000);
    return () => clearInterval(interval);
  }, [active, pollNotifications]);

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
