import { FontAwesome5 } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TextInput as RNTextInput,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { TextInput } from "react-native-paper";
import { api } from "../services/api";

const CODE_LENGTH = 6;

export default function ResetPassword() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resending, setResending] = useState(false);

  const [tokenError, setTokenError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [generalError, setGeneralError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  const inputRefs = useRef<(RNTextInput | null)[]>([]);
  const { width } = useWindowDimensions();
  const [isMounted, setIsMounted] = useState(false);
  const isLargeScreen = isMounted && width >= 768;
  const emailStr = String(email || "").trim().toLowerCase();
  const code = digits.join("");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const updateDigit = (index: number, raw: string) => {
    setTokenError("");
    setGeneralError("");

    
    const cleaned = raw.replace(/\D/g, "");
    if (cleaned.length > 1) {
      const next = Array(CODE_LENGTH).fill("");
      cleaned
        .slice(0, CODE_LENGTH)
        .split("")
        .forEach((ch, i) => {
          next[i] = ch;
        });
      setDigits(next);
      const focusAt = Math.min(cleaned.length, CODE_LENGTH - 1);
      inputRefs.current[focusAt]?.focus();
      return;
    }

    const ch = cleaned.slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = ch;
      return next;
    });
    if (ch && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const onKeyPress = (index: number, key: string) => {
    if (key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      setDigits((prev) => {
        const next = [...prev];
        next[index - 1] = "";
        return next;
      });
    }
  };

  const handleResend = async () => {
    if (!emailStr || resending) return;
    setResending(true);
    setGeneralError("");
    setInfoMsg("");
    try {
      await api.post("/auth/forgot-password", { email: emailStr });
      setDigits(Array(CODE_LENGTH).fill(""));
      setInfoMsg("Te enviamos un código nuevo. Revisa tu correo.");
      inputRefs.current[0]?.focus();
    } catch (error: any) {
      setGeneralError(
        error?.response?.data?.message || "No se pudo reenviar el código."
      );
    } finally {
      setResending(false);
    }
  };

  const handleReset = async () => {
    setTokenError("");
    setPasswordError("");
    setConfirmError("");
    setGeneralError("");
    setSuccessMsg("");
    setInfoMsg("");

    if (!emailStr) {
      setGeneralError("El correo de recuperación no es válido. Vuelve a solicitar el código.");
      return;
    }

    let hasError = false;

    if (code.length !== CODE_LENGTH) {
      setTokenError("Ingresa el código de 6 dígitos.");
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
      setConfirmError("Confirma la contraseña.");
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
        token: code,
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
                <FontAwesome5 name="shield-alt" size={isLargeScreen ? 24 : 20} color="#ffffff" />
              </View>
              <Text style={styles.title}>Verifica tu código</Text>
              <Text style={styles.description}>
                Escribe el código de 6 dígitos que enviamos a tu correo y define tu nueva contraseña.
              </Text>
            </View>

            {emailStr ? (
              <View style={styles.emailChip}>
                <FontAwesome5 name="envelope" size={12} color="#6b7280" />
                <Text style={styles.emailChipText} numberOfLines={1}>
                  {emailStr}
                </Text>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Código de verificación</Text>
              <View style={styles.codeRow}>
                {digits.map((digit, index) => (
                  <View
                    key={`code-${index}`}
                    style={[
                      styles.codeCell,
                      digit ? styles.codeCellFilled : null,
                      tokenError ? styles.codeCellError : null,
                    ]}
                  >
                    <RNTextInput
                      ref={(ref) => {
                        inputRefs.current[index] = ref;
                      }}
                      value={digit}
                      onChangeText={(text) => updateDigit(index, text)}
                      onKeyPress={({ nativeEvent }) => onKeyPress(index, nativeEvent.key)}
                      keyboardType="number-pad"
                      maxLength={index === 0 ? CODE_LENGTH : 1}
                      selectTextOnFocus
                      style={styles.codeBox}
                      textAlign="center"
                      autoComplete="one-time-code"
                      textContentType="oneTimeCode"
                      underlineColorAndroid="transparent"
                    />
                  </View>
                ))}
              </View>
              {tokenError ? <Text style={styles.errorText}>{tokenError}</Text> : null}
              <TouchableOpacity
                onPress={() => void handleResend()}
                disabled={resending || !emailStr}
                style={styles.resendBtn}
                activeOpacity={0.85}
              >
                <Text style={styles.resendText}>
                  {resending ? "Reenviando…" : "Reenviar código"}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Nueva contraseña</Text>
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
            </View>

            {infoMsg ? <Text style={styles.infoText}>{infoMsg}</Text> : null}
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
              <Text style={styles.linkText}>← Cambiar correo</Text>
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
    maxWidth: 440,
    alignSelf: "center",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 20,
    paddingVertical: 28,
    position: "relative",
    ...(Platform.OS === "web" ? { boxShadow: "0 16px 48px rgba(0,0,0,0.08)" as any } : {}),
  },
  cardDesktop: {
    paddingHorizontal: 36,
    paddingVertical: 40,
  },
  brandRow: { alignItems: "center", marginBottom: 16 },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: 18,
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
    letterSpacing: 0.2,
  },
  description: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
    paddingHorizontal: 4,
  },
  emailChip: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f3f4f6",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 18,
    maxWidth: "100%",
  },
  emailChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    flexShrink: 1,
  },
  section: { width: "100%", marginBottom: 4 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#111111",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  codeRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  codeCell: {
    flex: 1,
    minWidth: 40,
    maxWidth: 52,
    height: 54,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    backgroundColor: "#fafafa",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  codeCellFilled: {
    borderColor: "#111111",
    backgroundColor: "#ffffff",
  },
  codeCellError: {
    borderColor: "#dc2626",
  },
  codeBox: {
    width: "100%",
    height: "100%",
    margin: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    paddingTop: 0,
    paddingBottom: 0,
    fontSize: 22,
    fontWeight: "800",
    color: "#111111",
    textAlign: "center",
    ...(Platform.OS === "android"
      ? {
          textAlignVertical: "center" as const,
          includeFontPadding: false,
          // Evita que el texto baje dentro de la caja
          lineHeight: 24,
        }
      : Platform.OS === "ios"
        ? {
            // En iOS un lineHeight ≈ altura de la caja empuja el dígito hacia abajo
            lineHeight: 24,
          }
        : ({
            outlineStyle: "none",
            outlineWidth: 0,
            textAlign: "center",
            lineHeight: 50,
            display: "block",
            boxSizing: "border-box",
            paddingLeft: 0,
            paddingRight: 0,
          } as any)),
  },
  resendBtn: {
    alignSelf: "center",
    marginTop: 12,
    paddingVertical: 6,
  },
  resendText: {
    color: "#111111",
    fontSize: 13,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  divider: {
    height: 1,
    backgroundColor: "#f3f4f6",
    marginVertical: 18,
  },
  input: { width: "100%", height: 48, backgroundColor: "transparent", marginTop: 4 },
  inputContent: { color: "#111111", fontWeight: "600" },
  errorText: { width: "100%", color: "#dc2626", fontSize: 12, marginTop: 6 },
  infoText: {
    color: "#2563eb",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 10,
    textAlign: "center",
  },
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
    minHeight: 52,
    backgroundColor: "#111111",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 18,
    paddingVertical: 12,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#ffffff", fontSize: 15, fontWeight: "700", textAlign: "center" },
  backLink: { marginTop: 18, alignSelf: "center" },
  backLinkSecondary: { marginTop: 10, alignSelf: "center" },
  linkText: { color: "#111111", fontSize: 14, fontWeight: "600", textDecorationLine: "underline" },
  linkTextMuted: {
    color: "#6b7280",
    fontSize: 13,
    fontWeight: "500",
    textDecorationLine: "underline",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    zIndex: 999,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 18,
  },
  loadingText: { marginTop: 14, color: "#ffffff", fontWeight: "600", fontSize: 15 },
});
