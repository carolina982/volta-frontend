import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { Alert, Platform } from "react-native";

export const  BASE_URL="https://volta-backend-px1a.onrender.com/api";

export const api=axios .create({
  baseURL:BASE_URL,
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
    if (error.response && error .response.status === 401){
      console.log ("Token expirado o invalido . Cerrando sesion ..");
       if (Platform.OS === "web"){
        localStorage.removeItem("token");
        window.location.href="/";
       }else{
        await AsyncStorage.removeItem("token");
        Alert.alert(
          "Sesion expirada",
          "Tu sesion ha caducado .Por Favor  inicia sesion nuevamente"
        );
       }
    }
    return Promise.reject(error);
  }
);