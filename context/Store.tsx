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
  users: User[];
  trips: Trip[];
  units: Unit[];
  viatics: Viatico[];

  setCurrentUser: (user: User | null) => void;
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


  login: (user: User) => void;
  logout: () => void;
}


const StoreContext = createContext<StoreContextProps>({} as StoreContextProps);


export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [viatics, setViatics] = useState<Viatico[]>([]);


  useEffect(() => {
    const loadData = async () => {
      try {
        // Corrección de portabilidad: usar AsyncStorage siempre en móvil
        const dataStr = Platform.OS === "web" 
          ? localStorage.getItem("storeData") 
          : await AsyncStorage.getItem("storeData");

        if (dataStr) {
          const parsed = JSON.parse(dataStr);
          setUsers(parsed.users || []);
          setTrips(parsed.trips || []);
          setUnits(parsed.units || []);
          setViatics(parsed.viatics || []);
          setCurrentUser(parsed.currentUser || null);
        }
      } catch (error) {
        console.error("Error cargando datos:", error);
      }
    };
    loadData();
  }, []);


  useEffect(() => {
    const saveData = async () => {
      try {
        const data = JSON.stringify({ currentUser, users, trips, units, viatics });
        if (Platform.OS === "web") {
          localStorage.setItem("storeData", data);
        } else {
          await AsyncStorage.setItem("storeData", data);
        }
      } catch (error) {
        console.error("Error guardando datos:", error);
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
    setTrips((prev) => prev.filter((t) => t.id !== tripId));


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


  const login = (user: User) => setCurrentUser(user);
  const logout =async()=>{
    try {
      if (Platform.OS === "web"){
        localStorage.removeItem("storeData");
      }else{
        await AsyncStorage.removeItem("storeData");
      }
      setCurrentUser(null);
    }catch (error){
      console.error("Error cerrando sesion",error);
    }
  };
  return (
    <StoreContext.Provider
      value={{
        currentUser, users, trips, units, viatics,
        setCurrentUser, addUser, updateUser, removeUser,
        addTrip, updateTrip, removeTrip, addViatic,
        updateViatic, removeViatic, addUnit, updateUnit,
        removeUnit, login, logout,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

// Funciones auxiliares simplificadas para portabilidad
export async function setItem(key: string, value: string) {
  if (Platform.OS === "web") {
    localStorage.setItem(key, value);
  } else {
    
    await AsyncStorage.setItem(key, value);
  }
}

export async function getItem(key: string) {
  if (Platform.OS === "web") {
    return localStorage.getItem(key);
  } else {
    return await AsyncStorage.getItem(key);
  }
}

export const useStore = () => useContext(StoreContext);