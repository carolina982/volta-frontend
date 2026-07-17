import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { api } from "../services/api";

const resolveProjectId = () =>
  Constants.expoConfig?.extra?.eas?.projectId ??
  (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId ??
  null;

/**
 * Registra el token de push del dispositivo y escucha notificaciones entrantes.
 * @param enabled       Solo registra cuando hay sesión activa.
 * @param onNotification Callback para refrescar la campana al recibir/tocar una push.
 */
export function usePushNotifications(enabled: boolean, onNotification?: () => void) {
  const onNotificationRef = useRef(onNotification);
  onNotificationRef.current = onNotification;

  useEffect(() => {
    if (!enabled || Platform.OS === "web") return;

    let receivedSub: ReturnType<typeof Notifications.addNotificationReceivedListener> | undefined;
    let responseSub:
      | ReturnType<typeof Notifications.addNotificationResponseReceivedListener>
      | undefined;

    (async () => {
      try {
        // Canal Android (necesario para que suene/vibre y se muestre correctamente).
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "General",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#111111",
          });
        }

        // Permiso de notificaciones: necesario TAMBIÉN para notificaciones locales
        // (que sí funcionan en Expo Go, sin build ni projectId).
        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== "granted") {
          console.warn("[push] Permiso de notificaciones no concedido:", finalStatus);
          return;
        }

        // --- A partir de aquí: token push REMOTO (requiere build + projectId + dispositivo físico) ---

        // En Expo Go (SDK 53+) el push remoto no está soportado: se necesita development build.
        if (Constants.appOwnership === "expo") {
          console.warn(
            "[push] Expo Go: se usarán notificaciones locales (la app debe estar abierta). Para push con la app cerrada, usa un development build."
          );
          return;
        }

        // El push solo funciona en dispositivos físicos, no en emuladores/simuladores.
        if (!Device.isDevice) {
          console.warn(
            "[push] Las notificaciones push remotas requieren un dispositivo físico (no emulador)."
          );
          return;
        }

        const projectId = resolveProjectId();
        if (!projectId) {
          console.warn(
            "[push] Falta projectId de EAS. Ejecuta `eas init` y agrega extra.eas.projectId en app.json; sin esto no se puede obtener el token push."
          );
          return;
        }

        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
        const token = tokenData.data;
        if (token) {
          await api.post("/notifications/push-token", { token });
          console.log("[push] Token registrado:", token);
        }
      } catch (error) {
        console.warn("[push] No se pudo registrar push:", error);
      }
    })();

    // Refresca la campana in-app cuando llega una push (app abierta) o cuando el usuario la toca.
    receivedSub = Notifications.addNotificationReceivedListener(() => {
      onNotificationRef.current?.();
    });
    responseSub = Notifications.addNotificationResponseReceivedListener(() => {
      onNotificationRef.current?.();
    });

    return () => {
      receivedSub?.remove();
      responseSub?.remove();
    };
  }, [enabled]);
}
