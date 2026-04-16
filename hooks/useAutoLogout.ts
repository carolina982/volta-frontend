import { useEffect, useRef } from "react";
import { AppState } from "react-native";

const INACTIVITY_TIME = 90 * 9000;  // duracion de tiempo automatico

export default function useAutoLogout(logout: () => void) {
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivity = useRef(Date.now());

  const resetTimer = () => {
    console.log("actividad detectada");

    lastActivity.current = Date.now();

    if (timeout.current) {
      clearTimeout(timeout.current);
    }

    timeout.current = setTimeout(() => {
      const diff = Date.now() - lastActivity.current;

      console.log("tiempo sin actividad:", diff);

      if (diff >= INACTIVITY_TIME) {
        console.log(" cerrando sesión...");
        logout();
      }
    }, INACTIVITY_TIME);
  };

  useEffect(() => {
    resetTimer();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        const diff = Date.now() - lastActivity.current;

        if (diff >= INACTIVITY_TIME) {
          console.log("🔒 cerrando sesión por background");
          logout();
        } else {
          resetTimer();
        }
      }
    });

    return () => {
      if (timeout.current) clearTimeout(timeout.current);
      subscription.remove();
    };
  }, []);

  return { resetTimer };
}