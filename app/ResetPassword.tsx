import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity } from "react-native";
import { TextInput } from "react-native-paper";

export default function ResetPassword({ route, navigation }: any) {

  const { email } = route.params; 
  const [token, setToken] = useState(""); 
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!token) {
      Alert.alert("Error", "Ingresa el código");
      return;
    }

    if (!password || !confirm) {
      Alert.alert("Error", "Completa ambos campos");
      return;
    }

    if (password !== confirm) {
      Alert.alert("Error", "Las contraseñas no coinciden");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        "http://192.168.1.81:3000/api/auth/reset-password",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            token,
            newPassword: password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) throw new Error(data.message);

      Alert.alert("Éxito", "Tu contraseña se ha restablecido correctamente");

      navigation.navigate("Login");

    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>Nueva contraseña</Text>
      <TextInput placeholder="Código"value={token}onChangeText={setToken}mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"style={styles.input}/>
      <TextInput placeholder="Contraseña nueva"value={password}onChangeText={setPassword}secureTextEntry mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"style={styles.input} />
      <TextInput placeholder="Confirmar contraseña"value={confirm}onChangeText={setConfirm}secureTextEntry mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb" style={styles.input}/>

      <TouchableOpacity
        style={[styles.button, loading && { opacity: 0.7 }]}
        onPress={handleReset}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Guardando..." : "Guardar contraseña"}
        </Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 25 },
  input: { width: "100%", height: 50, marginBottom: 15 },
  button: { width: "100%", height: 50, backgroundColor: "#007bff", borderRadius: 10, justifyContent: "center", alignItems: "center",},
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
});