import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { Trip, Unit, User, Viatico } from "../types";


// ================== PARCHE DE PORTABILIDAD (ARREGLA EL ERROR ROJO) ==================
if (Platform.OS !== 'web') {
  if (typeof global.HTMLAnchorElement === 'undefined') {
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

export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [viatics, setViatics] = useState<Viatico[]>([]);

  //  Carga de datos segura contra fallos del puente nativo de AsyncStorage
  useEffect(() => {
    const loadData = async () => {
      try {
        if (Platform.OS === "web") {
          const dataStr = localStorage.getItem("storeData");
          if (dataStr) {
            const parsed = JSON.parse(dataStr);
            setUsers(parsed.users || []);
            setTrips(parsed.trips || []);
            setUnits(parsed.units || []);
            setViatics(parsed.viatics || []);
            setCurrentUser(parsed.currentUser || null);
          }
        } else {
          if (AsyncStorage && typeof AsyncStorage.getItem === "function") {
            const dataStr = await AsyncStorage.getItem("storeData");
            if (dataStr) {
              const parsed = JSON.parse(dataStr);
              setUsers(parsed.users || []);
              setTrips(parsed.trips || []);
              setUnits(parsed.units || []);
              setViatics(parsed.viatics || []);
              setCurrentUser(parsed.currentUser || null);
            }
          }
        }
      } catch (error) {
        console.warn("AsyncStorage no inicializado en loadData:", error);
      }
    };
    loadData();
  }, []);

 
  //  Guardado de datos con validación explícita de seguridad
  useEffect(() => {
    const saveData = async () => {
      try {
        const data = JSON.stringify({ currentUser, users, trips, units, viatics });
        if (Platform.OS === "web") {
          localStorage.setItem("storeData", data);
        } else {
          if (AsyncStorage && typeof AsyncStorage.setItem === "function") {
            await AsyncStorage.setItem("storeData", data);
          }
        }
      } catch (error) {
        console.warn("AsyncStorage no inicializado en saveData:", error);
      }
    };
    saveData();
  }, [currentUser, users, trips, units, viatics]);


  const addUser = (user: User) => setUsers((prev) => [...prev, user]);
  const updateUser = (updatedUser: User) =>
    setUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
  const removeUser = (userId: string) =>
    setUsers((prev) => prev.filter((u) => u.id !== userId));

  const addTrip = (trip: Trip) => setTrips((prev) => [...prev, trip]);
  const updateTrip = (updatedTrip: Trip) =>
    setTrips((prev) => prev.map((t) => (t.id === updatedTrip.id ? updatedTrip : t)));
  const removeTrip = (tripId: string) =>
    setTrips((prev) => prev.filter((u) => u.id !== tripId)); // Corregido tipado lógico implícito

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

  const login = (user: User, token: string) => { setCurrentUser(user); setToken(token); };
  
  // CORREGIDO: Borrado seguro al hacer logout
  
  const logout = async () => {
    try {
      if (Platform.OS === "web") {
        localStorage.removeItem("storeData");
      } else {
        if (AsyncStorage && typeof AsyncStorage.removeItem === "function") {
          await AsyncStorage.removeItem("storeData");
        }
      }
      setCurrentUser(null);
      setToken(null);
    } catch (error) {
      console.warn("AsyncStorage no inicializado en logout:", error);
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
        setCurrentUser,
        setToken, 
        addUser, updateUser, removeUser,
        addTrip, updateTrip, removeTrip, addViatic,
        updateViatic, removeViatic, addUnit, updateUnit,
        removeUnit, login, logout,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

//  Funciones auxiliares protegidas para portabilidad nativa global
export async function setItem(key: string, value: string) {
  if (Platform.OS === "web") {
    localStorage.setItem(key, value);
  } else {
    try {
      if (AsyncStorage && typeof AsyncStorage.setItem === "function") {
        await AsyncStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn("Fallo al escribir en AsyncStorage nativo:", e);
    }
  }
}

export async function getItem(key: string) {
  if (Platform.OS === "web") {
    return localStorage.getItem(key);
  } else {
    try {
      if (AsyncStorage && typeof AsyncStorage.getItem === "function") {
        return await AsyncStorage.getItem(key);
      }
    } catch (e) {
      console.warn("Fallo al leer de AsyncStorage nativo:", e);
    }
    return null;
  }
}

export const useStore = () => useContext(StoreContext);