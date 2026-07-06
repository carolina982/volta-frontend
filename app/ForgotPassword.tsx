import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Button, MD3LightTheme, Provider as PaperProvider, TextInput } from "react-native-paper";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Estado para manejo de error debajo del campo
  const [emailError, setEmailError] = useState("");
  const [generalError, setGeneralError] = useState("");

  const router = useRouter();

  // Función para validar formato de correo electrónico
  const validateEmail = (text: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(text);
  };

  const handledSend = async () => {
    setEmailError("");
    setGeneralError("");

    if (!email) {
      setEmailError("El correo electrónico es requerido.");
      return;
    } else if (!validateEmail(email)) {
      setEmailError("Por favor ingresa un formato de correo válido.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("https://volta-backend-px1a.onrender.com/api/auth/forgot-password",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
          }),
        }
      );
      
      const data = await res.json();
      
      if (!res.ok) {
        setGeneralError(data.message || "No se pudo enviar el correo de recuperación.");
        return;
      }

      // CORREGIDO: Redirección inmediata y limpia sin Alerts intermedios que alteren la UX
      router.push({
        pathname: "/ResetPassword",
        params: { email: email.trim().toLowerCase() },
      });
    
    } catch (error: any) {
      setGeneralError("No se pudo conectar con el servidor. Inténtalo más tarde.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PaperProvider theme={{ ...MD3LightTheme, colors: { ...MD3LightTheme.colors, primary: "#007bff", onSurfaceVariant: "#007bff" } }}>
      <View style={styles.container}>
        
        {/* CORREGIDO: Pantalla de carga bloqueante idéntica a la estética del Login */}
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={styles.loadingText}>Enviando código de recuperación...</Text>
          </View>
        )}

        <Text style={styles.title}>Recuperar contraseña</Text>
        
        <TextInput 
          placeholder="Correo electrónico" 
          value={email} 
          onChangeText={(text) => { setEmail(text); setEmailError(""); }} 
          keyboardType="email-address" 
          autoCapitalize="none" 
          mode="flat"
          underlineColor={emailError ? "#ff3333" : "#007bff"}
          activeUnderlineColor={emailError ? "#ff3333" : "#007bff"}
          style={styles.input}
          contentStyle={{ color: "#000", fontWeight: "600" }}
        />
        {/* CORREGIDO: Mensaje de error debajo del campo */}
        {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}

        {generalError ? <Text style={styles.generalErrorText}>{generalError}</Text> : null}

        <Button 
          mode="contained"
          onPress={handledSend}
          disabled={loading}
          contentStyle={styles.buttonContent}
          style={styles.button}
          labelStyle={styles.buttonLabel}
        >
          Enviar código de recuperación
        </Button>
        
        <Text style={styles.backLink} onPress={() => router.push("/Login")}>
          ← Volver al inicio de sesión
        </Text>
      </View>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "#f8f9fa" },
  title: { fontSize: 26, fontWeight: "bold", color: "#007bff", textAlign: "center", marginBottom: 25 },
  input: { backgroundColor: "transparent", paddingHorizontal: 5, height: 50, marginTop: 5 },
  errorText: { width: "100%", color: "#ff3333", fontSize: 13, marginTop: 2, marginBottom: 10, alignSelf: "flex-start", paddingLeft: 5 },
  generalErrorText: { color: "#ff3333", fontSize: 15, fontWeight: "bold", marginVertical: 10, textAlign: "center" },
  button: { backgroundColor: "#007bff", borderRadius: 10, elevation: 0, marginTop: 15 },
  buttonContent: { height: 50 },
  buttonLabel: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  backLink: { marginTop: 25, textAlign: "center", color: "#007bff", fontWeight: "600" },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    zIndex: 999,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: { marginTop: 14, color: "#ffffff", fontWeight: "700", fontSize: 16 }
});