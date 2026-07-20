import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { Trip, Unit, User, Viatico } from "../types";

// ================== PARCHE DE PORTABILIDAD (ARREGLA EL ERROR ROJO) ==================
if (Platform.OS !== "web") {
  if (typeof global.HTMLAnchorElement === "undefined") {
    // @ts-ignore
    global.HTMLAnchorElement = class {};
  }
}
// ====================================================================================

interface StoreContextProps {
  currentUser: User | null;
  token: string | null;
  users: User[];
  trips: Trip[];
  units: Unit[];
  viatics: Viatico[];
  /** false mientras se restaura la sesión desde storage */
  isHydrated: boolean;

  setCurrentUser: (user: User | null) => void;
  setToken: (token: string | null) => void;

  addUser: (user: User) => void;
  updateUser: (user: User) => void;
  removeUser: (userId: string) => void;

  addTrip: (trip: Trip) => void;
  updateTrip: (trip: Trip) => void;
  removeTrip: (tripId: string) => void;

  addViatic: (viatic: Viatico) => void;
  updateViatic: (viatic: Viatico) => void;
  removeViatic: (viaticId: string) => void;

  addUnit: (unit: Unit) => void;
  updateUnit: (unit: Unit) => void;
  removeUnit: (unitId: string) => void;

  login: (user: User, token: string) => void;
  logout: () => void;
}

const StoreContext = createContext<StoreContextProps>({} as StoreContextProps);

const readStorage = async (key: string): Promise<string | null> => {
  if (Platform.OS === "web") {
    return localStorage.getItem(key);
  }
  if (AsyncStorage && typeof AsyncStorage.getItem === "function") {
    return AsyncStorage.getItem(key);
  }
  return null;
};

const writeStorage = async (key: string, value: string) => {
  if (Platform.OS === "web") {
    localStorage.setItem(key, value);
    return;
  }
  if (AsyncStorage && typeof AsyncStorage.setItem === "function") {
    await AsyncStorage.setItem(key, value);
  }
};

const removeStorage = async (key: string) => {
  if (Platform.OS === "web") {
    localStorage.removeItem(key);
    return;
  }
  if (AsyncStorage && typeof AsyncStorage.removeItem === "function") {
    await AsyncStorage.removeItem(key);
  }
};

export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [viatics, setViatics] = useState<Viatico[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  // Carga de sesión — no guardar nada hasta terminar esto
  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const [dataStr, savedToken] = await Promise.all([
          readStorage("storeData"),
          readStorage("token"),
        ]);

        if (cancelled) return;

        if (dataStr) {
          const parsed = JSON.parse(dataStr);
          setUsers(parsed.users || []);
          setTrips(parsed.trips || []);
          setUnits(parsed.units || []);
          setViatics(parsed.viatics || []);
          // No pisar un login que ocurrió mientras AsyncStorage aún cargaba (común en móvil).
          setCurrentUser((prev) => prev || parsed.currentUser || null);
          if (parsed.token) {
            setToken((prev) => prev || parsed.token);
          }
        }

        if (savedToken) {
          setToken((prev) => prev || savedToken);
        }
      } catch (error) {
        console.warn("Error restaurando sesión:", error);
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  // Guardado — solo después de hidratar para no pisar la sesión con null
  useEffect(() => {
    if (!isHydrated) return;

    const saveData = async () => {
      try {
        const data = JSON.stringify({
          currentUser,
          token,
          users,
          trips,
          units,
          viatics,
        });
        await writeStorage("storeData", data);
        if (token) {
          await writeStorage("token", token);
        } else {
          await removeStorage("token");
        }
      } catch (error) {
        console.warn("Error guardando sesión:", error);
      }
    };

    saveData();
  }, [isHydrated, currentUser, token, users, trips, units, viatics]);

  const addUser = (user: User) => setUsers((prev) => [...prev, user]);
  const updateUser = (updatedUser: User) =>
    setUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
  const removeUser = (userId: string) =>
    setUsers((prev) => prev.filter((u) => u.id !== userId));

  const addTrip = (trip: Trip) => setTrips((prev) => [...prev, trip]);
  const updateTrip = (updatedTrip: Trip) =>
    setTrips((prev) => prev.map((t) => (t.id === updatedTrip.id ? updatedTrip : t)));
  const removeTrip = (tripId: string) =>
    setTrips((prev) => prev.filter((u) => u.id !== tripId));

  const addViatic = (viatic: Viatico) => setViatics((prev) => [...prev, viatic]);
  const updateViatic = (updatedViatic: Viatico) =>
    setViatics((prev) => prev.map((v) => (v.id === updatedViatic.id ? updatedViatic : v)));
  const removeViatic = (viaticId: string) =>
    setViatics((prev) => prev.filter((v) => v.id !== viaticId));

  const addUnit = (unit: Unit) => setUnits((prev) => [...prev, unit]);
  const updateUnit = (updatedUnit: Unit) =>
    setUnits((prev) => prev.map((u) => (u.id === updatedUnit.id ? updatedUnit : u)));
  const removeUnit = (unitId: string) =>
    setUnits((prev) => prev.filter((u) => u.id !== unitId));

  const login = (user: User, tokenValue: string) => {
    setCurrentUser(user);
    setToken(tokenValue);
  };

  const logout = async () => {
    try {
      await removeStorage("storeData");
      await removeStorage("token");
      setCurrentUser(null);
      setToken(null);
    } catch (error) {
      console.warn("Error al cerrar sesión:", error);
      setCurrentUser(null);
      setToken(null);
    }
  };

  return (
    <StoreContext.Provider
      value={{
        currentUser,
        token,
        users,
        trips,
        units,
        viatics,
        isHydrated,
        setCurrentUser,
        setToken,
        addUser,
        updateUser,
        removeUser,
        addTrip,
        updateTrip,
        removeTrip,
        addViatic,
        updateViatic,
        removeViatic,
        addUnit,
        updateUnit,
        removeUnit,
        login,
        logout,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export function useStore() {
  return useContext(StoreContext);
}

//  Funciones auxiliares protegidas para portabilidad nativa global
export async function setItem(key: string, value: string) {
  try {
    await writeStorage(key, value);
  } catch (e) {
    console.warn("Fallo al escribir en storage:", e);
  }
}

export async function getItem(key: string) {
  try {
    return await readStorage(key);
  } catch (e) {
    console.warn("Fallo al leer storage:", e);
    return null;
  }
}
