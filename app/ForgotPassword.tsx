import { FontAwesome5 } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { TextInput } from "react-native-paper";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [generalError, setGeneralError] = useState("");

  const router = useRouter();
  const { width } = useWindowDimensions();
  const [isMounted, setIsMounted] = useState(false);
  const isLargeScreen = isMounted && width >= 768;

  useEffect(() => {
    setIsMounted(true);
  }, []);

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
    }
    if (!validateEmail(email)) {
      setEmailError("Por favor ingresa un formato de correo válido.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("https://volta-backend-px1a.onrender.com/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setGeneralError(data.message || "No se pudo enviar el correo de recuperación.");
        return;
      }

      router.push({
        pathname: "/ResetPassword",
        params: { email: email.trim().toLowerCase() },
      });
    } catch {
      setGeneralError("No se pudo conectar con el servidor. Inténtalo más tarde.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.container, isLargeScreen && styles.containerDesktop]}>
          <View style={[styles.card, isLargeScreen && styles.cardDesktop]}>

            {loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#ffffff" />
                <Text style={styles.loadingText}>Enviando código...</Text>
              </View>
            )}

            <View style={styles.brandRow}>
              <View style={styles.logoBadge}>
                <FontAwesome5 name="key" size={isLargeScreen ? 26 : 22} color="#ffffff" />
              </View>
              <Text style={styles.title}>Recuperar contraseña</Text>
              <Text style={styles.description}>
                Ingresa tu correo y te enviaremos un código de recuperación.
              </Text>
            </View>

            <TextInput placeholder="Correo electrónico"placeholderTextColor="#9ca3af"value={email}onChangeText={(text) => { setEmail(text); setEmailError(""); }} keyboardType="email-address"autoCapitalize="none" mode="flat"underlineColor={emailError ? "#dc2626" : "#d1d5db"} activeUnderlineColor={emailError ? "#dc2626" : "#111111"} dense contentStyle={styles.inputContent} style={styles.input} />
            {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
            {generalError ? <Text style={styles.generalErrorText}>{generalError}</Text> : null}
            <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]}onPress={handledSend}disabled={loading}activeOpacity={0.85}>
              <Text style={styles.buttonText}>Enviar código de recuperación</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/Login")} style={styles.backLink}>
              <Text style={styles.linkText}>← Volver al inicio de sesión</Text>
            </TouchableOpacity>

          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1,backgroundColor: "#f3f4f6",...(Platform.OS === "web" ? { minHeight: "100vh" as any } : {})},
  scrollContent: { flexGrow: 1,width: "100%",...(Platform.OS === "web" ? { minHeight: "100vh" as any } : {}), },
  container: {flex: 1,width: "100%",justifyContent: "center",alignItems: "center",paddingHorizontal: 16,paddingVertical: 24,backgroundColor: "#ffffff",...(Platform.OS === "web" ? { minHeight: "100vh" as any } : {}),},
  containerDesktop: {backgroundColor: "#f3f4f6",paddingHorizontal: 32,paddingVertical: 48,},
  card: {width: "100%",maxWidth: 420,alignSelf: "center",backgroundColor: "#ffffff",borderRadius: 16,borderWidth: 1,borderColor: "#e5e7eb",paddingHorizontal: 20,paddingVertical: 28,position: "relative",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 12px 40px rgba(0,0,0,0.08)" as any }
      : {}),
  },
  cardDesktop: {paddingHorizontal: 36,paddingVertical: 40,maxWidth: 440,
  },
  brandRow: { alignItems: "center", marginBottom: 24 },
  logoBadge: {width: 56,height: 56,borderRadius: 28,backgroundColor: "#111111",justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111111",
    textAlign: "center",
    letterSpacing: 0.3,
  },
  description: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  input: { width: "100%", height: 48, backgroundColor: "transparent", marginTop: 8 },
  inputContent: { color: "#111111", fontWeight: "600" },
  errorText: { width: "100%", color: "#dc2626", fontSize: 12, marginTop: 4 },
  generalErrorText: { color: "#dc2626", fontSize: 14, fontWeight: "600", marginTop: 10, textAlign: "center" },
  button: {
    width: "100%",
    minHeight: 50,
    backgroundColor: "#111111",
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
    paddingVertical: 12,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#ffffff", fontSize: 15, fontWeight: "700", textAlign: "center" },
  backLink: { marginTop: 20, alignSelf: "center" },
  linkText: { color: "#111111", fontSize: 14, fontWeight: "600", textDecorationLine: "underline" },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    zIndex: 999,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 16,
  },
  loadingText: { marginTop: 14, color: "#ffffff", fontWeight: "600", fontSize: 15 },
});
