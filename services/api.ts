import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { Alert, Platform } from "react-native";

export const  BASE_URL="https://volta-backend-px1a.onrender.com/api";

export const api=axios .create({
  baseURL:BASE_URL,
  timeout: 20000,
});

api.interceptors.request.use(
  async (config)=>{
    try {
      let token :string | null=null;
      if (Platform.OS === "web"){
        token =localStorage.getItem("token");
      }else{
        token=await AsyncStorage.getItem("token");
      }
      console.log ("Token enviado",token);
      if (token){
        config.headers.Authorization= `Bearer ${token}`;
      }
    }catch (err){
      console.warn("Error al obtener token",err);
    }
    return config;
  },
  (error)=>Promise.reject(error)
);


api.interceptors.response.use(
  (response)=>response,
  async (error)=>{
    const status = error.response?.status;
    const url = String(error.config?.url || "");
    // 401 en login/register es credencial incorrecta, no sesión caducada.
    const isAuthAttempt =
      url.includes("/auth/login") ||
      url.includes("/auth/register") ||
      url.includes("/auth/forgot-password") ||
      url.includes("/auth/reset-password");

    if (status === 401 && !isAuthAttempt) {
      console.log("Token expirado o invalido. Cerrando sesion..");
      if (Platform.OS === "web") {
        localStorage.removeItem("token");
        window.location.href = "/";
      } else {
        await AsyncStorage.removeItem("token");
        Alert.alert(
          "Sesion expirada",
          "Tu sesion ha caducado. Por favor inicia sesion nuevamente"
        );
      }
    }
    return Promise.reject(error);
  }
);