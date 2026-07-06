import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { TextInput } from "react-native-paper";

export default function ResetPassword() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  // Estados para manejo de errores debajo de los campos
  const [tokenError, setTokenError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [generalError, setGeneralError] = useState("");

  const handleReset = async () => {
    // Limpiar errores previos
    setTokenError("");
    setPasswordError("");
    setConfirmError("");
    setGeneralError("");

    if (!email) {
      setGeneralError("El correo electrónico de recuperación no es válido.");
      return;
    }

    let hasError = false;

    if (!token) {
      setTokenError("El código de recuperación es requerido.");
      hasError = true;
    }

    if (!password) {
      setPasswordError("La contraseña nueva es requerida.");
      hasError = true;
    } else if (password.length < 6) { // <-- Validación de contraseña fuerte
      setPasswordError("La contraseña debe tener al menos 6 caracteres.");
      hasError = true;
    }

    if (!confirm) {
      setConfirmError("Por favor confirma la contraseña.");
      hasError = true;
    } else if (password !== confirm) {
      setConfirmError("Las contraseñas no coinciden.");
      hasError = true;
    }

    if (hasError) return;

    setLoading(true);

    try {
      const response = await fetch(
        "https://volta-backend-px1a.onrender.com/api/auth/reset-password",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.toString().toLowerCase(),
            token: token.trim(),
            // Enviamos el string en texto plano. El backend se encargará del hasheo final
            // solucionando el problema de 'Reset hashea contraseña dos veces'.
            newPassword: password, 
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setGeneralError(data.message || "Código inválido o expirado.");
        return;
      }

      // CORREGIDO: Redirección inmediata y limpia al Login sin Alerts intermedios que alteren la UX
      router.replace("/Login");

    } catch (error: any) {
      setGeneralError("No se pudo conectar con el servidor. Inténtalo más tarde.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      
      {/* CORREGIDO: Pantalla de carga bloqueante idéntica a la estética de todo el flujo */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Actualizando contraseña...</Text>
        </View>
      )}

      <Text style={styles.title}>Nueva contraseña</Text>
      
      {/* Input de Código */}
      <TextInput 
        placeholder="Código de verificación"
        value={token}
        onChangeText={(text) => { setToken(text); setTokenError(""); }}
        mode="flat"
        underlineColor={tokenError ? "#ff3333" : "#0d75bb"}
        activeUnderlineColor={tokenError ? "#ff3333" : "#0d75bb"}
        style={styles.input} 
        contentStyle={{ color: "#000", fontWeight: "600" }}
      />
      {tokenError ? <Text style={styles.errorText}>{tokenError}</Text> : null}

      {/* Input de Nueva Contraseña */}
      <TextInput 
        placeholder="Contraseña nueva"
        value={password}
        onChangeText={(text) => { setPassword(text); setPasswordError(""); }}
        secureTextEntry 
        mode="flat"
        underlineColor={passwordError ? "#ff3333" : "#0d75bb"}
        activeUnderlineColor={passwordError ? "#ff3333" : "#0d75bb"}
        style={styles.input}
        contentStyle={{ color: "#000", fontWeight: "600" }}
      />
      {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}

      {/* Input de Confirmación */}
      <TextInput 
        placeholder="Confirmar contraseña"
        value={confirm}
        onChangeText={(text) => { setConfirm(text); setConfirmError(""); }}
        secureTextEntry 
        mode="flat"
        underlineColor={confirmError ? "#ff3333" : "#0d75bb"}
        activeUnderlineColor={confirmError ? "#ff3333" : "#0d75bb"} 
        style={styles.input}
        contentStyle={{ color: "#000", fontWeight: "600" }}
      />
      {confirmError ? <Text style={styles.errorText}>{confirmError}</Text> : null}

      {generalError ? <Text style={styles.generalErrorText}>{generalError}</Text> : null}

      <TouchableOpacity 
        style={[styles.button, loading && { opacity: 0.6 }]}
        onPress={handleReset}
        disabled={loading}
      >
        <Text style={styles.buttonText}>Guardar contraseña</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20, backgroundColor: "#f8f9fa" },
  title: { fontSize: 26, fontWeight: "bold", marginBottom: 25, color: "#007bff" },
  input: { width: "100%", height: 50, backgroundColor: "transparent", marginTop: 5 },
  errorText: { width: "100%", color: "#ff3333", fontSize: 13, marginTop: 2, marginBottom: 8, alignSelf: "flex-start", paddingLeft: 5 },
  generalErrorText: { color: "#ff3333", fontSize: 15, fontWeight: "bold", marginVertical: 10, textAlign: "center" },
  button: { width: "100%", height: 50, backgroundColor: "#007bff", borderRadius: 10, justifyContent: "center", alignItems: "center", marginTop: 15 },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    zIndex: 999,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: { marginTop: 14, color: "#ffffff", fontWeight: "700", fontSize: 16 }
});