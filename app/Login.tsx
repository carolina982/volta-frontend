import { FontAwesome5 } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { TextInput } from "react-native-paper";
import { useStore } from "../context/Store";

export default function Login() {
  const { login } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router =useRouter();
 
  const handledLogin = async ()=>{
    if (!email || !password){
      Alert.alert("Error","Por favor acompleta todos los campos");
      return;
    }
    setLoading(true);
    try {
      const response=await fetch ("https://volta-backend-px1a.onrender.com/api/auth/login",
        {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({email:email.trim().toLowerCase(),password,}),
      }
    );
    let data;
    try{
      data=await response.json();
    }catch{
      data={};
    }
    if (!response.ok){
      Alert.alert("Error", data.message || "Ocurrio un problema al iniciar sesion");
      return;
    }
   if (Platform.OS === "web"){
    localStorage.setItem("token",data.token);
   }else{
    await AsyncStorage.setItem("token",data.token)
   }
    if (!data || !data.user){
      Alert.alert("Error","Respuesta inalidad del servidor");
      return;
    }
    login(data.user );
    router.replace("/Dashboard");
    console .log("Respuesta login",data)
    }catch (error){
      console.error("Login error",error);
      Alert.alert("Error","No se pudo iniciar sesion .Intenta mas tarder");
    }finally{
      setLoading(false);
    }
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>
          <FontAwesome5 name="truck-moving" size={85.5}color="#007bff"style={styles.icon}/>
          <Text style={styles.title}>Volta</Text>
          <TextInput placeholder="Correo electrónico"value={email}onChangeText={setEmail}keyboardType="email-address"autoCapitalize="none"mode="flat"underlineColor="#0d75bb" activeUnderlineColor="#0d75bb"dense contentStyle={{ color: "#000", fontWeight: "600" }}  style={styles.input}/>
          <TextInput placeholder="Contraseña"value={password}onChangeText={setPassword}secureTextEntry={!showPassword}mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"dense contentStyle={{ color: "#000", fontWeight: "600" }}style={styles.input} right={
          <TextInput.Icon icon={showPassword ? "eye-off" : "eye"} color="#007bff" onPress={() => setShowPassword(!showPassword)} /> }/>

          <TouchableOpacity style={[styles.button, loading && { opacity: 0.7 }]} onPress={handledLogin} disabled={loading}>
            <Text style={styles.buttonText}>
              {loading ? "Iniciando sesión..." : "Iniciar Sesión"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/ForgotPassword")}><Text style={{ color: "#007bff", marginTop: 10 }}>
              ¿Olvidaste tu contraseña?
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.registerButton}
            onPress={() => router.push("/Register")}
          >
            <Text style={styles.registerText}>
              ¿No tienes cuenta? Regístrate
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1 , justifyContent: "center",alignItems: "center",paddingHorizontal: 20,backgroundColor: "#f5f7fa",},
  icon: { marginBottom: 20 },
  title: { fontSize: 28, marginBottom: 30, fontWeight: "bold" },
  input: {width: "100%",height: 50,backgroundColor: "transparent",marginBottom: 15, },
  button: {width: "100%",height: 50,backgroundColor: "#007bff",borderRadius: 10,justifyContent: "center",alignItems: "center",marginTop: 10,},
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  registerButton: { marginTop: 15 },
  registerText: { color: "#007bff", fontSize: 16 },
});