import { FontAwesome5 } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
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
import { api } from "../services/api";

export default function ResetPassword() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [tokenError, setTokenError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [generalError, setGeneralError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const { width } = useWindowDimensions();
  const [isMounted, setIsMounted] = useState(false);
  const isLargeScreen = isMounted && width >= 768;
  const emailStr = String(email || "").trim().toLowerCase();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleReset = async () => {
    setTokenError("");
    setPasswordError("");
    setConfirmError("");
    setGeneralError("");
    setSuccessMsg("");

    if (!emailStr) {
      setGeneralError("El correo electrónico de recuperación no es válido.");
      return;
    }

    let hasError = false;

    if (!token.trim()) {
      setTokenError("El código de recuperación es requerido.");
      hasError = true;
    }

    if (!password) {
      setPasswordError("La contraseña nueva es requerida.");
      hasError = true;
    } else if (password.length < 6) {
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
      await api.post("/auth/reset-password", {
        email: emailStr,
        token: token.trim(),
        newPassword: password,
      });

      setSuccessMsg("Contraseña actualizada. Redirigiendo al login…");
      setTimeout(() => {
        router.replace("/Login");
      }, 900);
    } catch (error: any) {
      const serverMsg = error?.response?.data?.message;
      setGeneralError(serverMsg || "Código inválido o expirado. Solicita uno nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.container, isLargeScreen && styles.containerDesktop]}>
          <View style={[styles.card, isLargeScreen && styles.cardDesktop]}>
            {loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#ffffff" />
                <Text style={styles.loadingText}>Actualizando contraseña...</Text>
              </View>
            )}

            <View style={styles.brandRow}>
              <View style={styles.logoBadge}>
                <FontAwesome5 name="lock" size={isLargeScreen ? 26 : 22} color="#ffffff" />
              </View>
              <Text style={styles.title}>Nueva contraseña</Text>
              <Text style={styles.description}>
                {emailStr
                  ? `Enviamos un código a ${emailStr}. Introdúcelo junto con tu nueva contraseña.`
                  : "Introduce el código de recuperación y tu nueva contraseña."}
              </Text>
            </View>

            <TextInput
              placeholder="Código de verificación"
              placeholderTextColor="#9ca3af"
              value={token}
              onChangeText={(text) => {
                setToken(text);
                setTokenError("");
              }}
              keyboardType="number-pad"
              autoCapitalize="none"
              mode="flat"
              underlineColor={tokenError ? "#dc2626" : "#d1d5db"}
              activeUnderlineColor={tokenError ? "#dc2626" : "#111111"}
              dense
              contentStyle={styles.inputContent}
              style={styles.input}
            />
            {tokenError ? <Text style={styles.errorText}>{tokenError}</Text> : null}

            <TextInput
              placeholder="Contraseña nueva"
              placeholderTextColor="#9ca3af"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setPasswordError("");
              }}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              mode="flat"
              underlineColor={passwordError ? "#dc2626" : "#d1d5db"}
              activeUnderlineColor={passwordError ? "#dc2626" : "#111111"}
              dense
              contentStyle={styles.inputContent}
              style={styles.input}
              right={
                <TextInput.Icon
                  icon={showPassword ? "eye-off" : "eye"}
                  color="#111111"
                  onPress={() => setShowPassword((v) => !v)}
                />
              }
            />
            {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}

            <TextInput
              placeholder="Confirmar contraseña"
              placeholderTextColor="#9ca3af"
              value={confirm}
              onChangeText={(text) => {
                setConfirm(text);
                setConfirmError("");
              }}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              mode="flat"
              underlineColor={confirmError ? "#dc2626" : "#d1d5db"}
              activeUnderlineColor={confirmError ? "#dc2626" : "#111111"}
              dense
              contentStyle={styles.inputContent}
              style={styles.input}
            />
            {confirmError ? <Text style={styles.errorText}>{confirmError}</Text> : null}

            {generalError ? <Text style={styles.generalErrorText}>{generalError}</Text> : null}
            {successMsg ? <Text style={styles.successText}>{successMsg}</Text> : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleReset}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Text style={styles.buttonText}>Guardar contraseña</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/ForgotPassword")}
              style={styles.backLink}
            >
              <Text style={styles.linkText}>← Volver a solicitar código</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/Login")} style={styles.backLinkSecondary}>
              <Text style={styles.linkTextMuted}>Ir al inicio de sesión</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    ...(Platform.OS === "web" ? { minHeight: "100vh" as any } : {}),
  },
  scrollContent: {
    flexGrow: 1,
    width: "100%",
    ...(Platform.OS === "web" ? { minHeight: "100vh" as any } : {}),
  },
  container: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
    backgroundColor: "#ffffff",
    ...(Platform.OS === "web" ? { minHeight: "100vh" as any } : {}),
  },
  containerDesktop: {
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 20,
    paddingVertical: 28,
    position: "relative",
    ...(Platform.OS === "web" ? { boxShadow: "0 12px 40px rgba(0,0,0,0.08)" as any } : {}),
  },
  cardDesktop: {
    paddingHorizontal: 36,
    paddingVertical: 40,
    maxWidth: 440,
  },
  brandRow: { alignItems: "center", marginBottom: 20 },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#111111",
    justifyContent: "center",
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
    paddingHorizontal: 4,
  },
  input: { width: "100%", height: 48, backgroundColor: "transparent", marginTop: 8 },
  inputContent: { color: "#111111", fontWeight: "600" },
  errorText: { width: "100%", color: "#dc2626", fontSize: 12, marginTop: 4 },
  generalErrorText: {
    color: "#dc2626",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 10,
    textAlign: "center",
  },
  successText: {
    color: "#059669",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 10,
    textAlign: "center",
  },
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
  backLink: { marginTop: 18, alignSelf: "center" },
  backLinkSecondary: { marginTop: 10, alignSelf: "center" },
  linkText: { color: "#111111", fontSize: 14, fontWeight: "600", textDecorationLine: "underline" },
  linkTextMuted: { color: "#6b7280", fontSize: 13, fontWeight: "500", textDecorationLine: "underline" },
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
