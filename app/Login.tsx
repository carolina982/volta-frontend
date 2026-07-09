import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { TextInput } from "react-native-paper";
import { useStore } from "../context/Store";

export default function Login() {
  const { login } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [generalError, setGeneralError] = useState("");

  // --- ESTADOS PARA FLUJO DE 2FA  ---
  const [isTwoFactorRequired, setIsTwoFactorRequired] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorError, setTwoFactorError] = useState("");

  const router = useRouter();
  const { width } = useWindowDimensions();
  const [isMounted, setIsMounted] = useState(false);
  const isLargeScreen = isMounted && width >= 768;
  const webFont = Platform.OS === "web"
    ? { fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' as const }
    : {};

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // CORREGIDO: Bloque seguro para evitar la pantalla roja 'Native module is null' en iOS
  useEffect(() => {
    const loadRememberedEmail = async () => {
      try {
        if (Platform.OS === "web") {
          const savedEmail = localStorage.getItem("rememberedEmail");
          if (savedEmail) {
            setEmail(savedEmail);
            setRememberMe(true);
          }
        } else {
          // Validamos explícitamente que el módulo nativo esté disponible antes de ejecutar el método
          if (AsyncStorage && typeof AsyncStorage.getItem === "function") {
            const savedEmail = await AsyncStorage.getItem("rememberedEmail");
            if (savedEmail) {
              setEmail(savedEmail);
              setRememberMe(true);
            }
          }
        }
      } catch (error) {
        // Captura el error de forma silenciosa para que no interrumpa el desarrollo en iOS
        console.warn("AsyncStorage nativo no se ha inicializado todavía:", error);
      }
    };
    loadRememberedEmail();
  }, []);

  const validateEmail = (text: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(text);
  };

  const handledLogin = async () => {
    setEmailError("");
    setPasswordError("");
    setGeneralError("");
    setTwoFactorError("");

    let hasError = false;

    if (!email) {
      setEmailError("El correo electrónico es requerido.");
      hasError = true;
    } else if (!validateEmail(email)) {
      setEmailError("Por favor ingresa un formato de correo válido.");
      hasError = true;
    }

    if (!password) {
      setPasswordError("La contraseña es requerida.");
      hasError = true;
    } else if (password.length < 6) {
      setPasswordError("La contraseña debe tener al menos 6 caracteres.");
      hasError = true;
    }

    if (isTwoFactorRequired && !twoFactorCode) {
      setTwoFactorError("El código de verificación 2FA es requerido.");
      hasError = true;
    }

    if (hasError) return;

    setLoading(true);
    try {
      if (rememberMe) {
        if (Platform.OS === "web") {
          localStorage.setItem("rememberedEmail", email.trim().toLowerCase());
        } else {
          if (AsyncStorage && typeof AsyncStorage.setItem === "function") {
            await AsyncStorage.setItem("rememberedEmail", email.trim().toLowerCase());
          }
        }
      } else {
        if (Platform.OS === "web") {
          localStorage.removeItem("rememberedEmail");
        } else {
          if (AsyncStorage && typeof AsyncStorage.removeItem === "function") {
            await AsyncStorage.removeItem("rememberedEmail");
          }
        }
      }

      const payload: any = { email: email.trim().toLowerCase(), password };
      if (isTwoFactorRequired) {
        payload.twoFactorCode = twoFactorCode;
      }

      const response = await fetch(
        "https://volta-backend-px1a.onrender.com/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      
      const data = await response.json();

      if (response.status === 403 && data.requiresVerification) {
        setGeneralError("Tu cuenta de correo electrónico no ha sido verificada. Por favor revisa tu bandeja de entrada.");
        return;
      }

      if (response.status === 200 && data.requiresTwoFactor && !isTwoFactorRequired) {
        setIsTwoFactorRequired(true);
        setGeneralError("Se requiere un código de autenticación de dos factores (2FA).");
        return;
      }

      if (!response.ok) {
        setGeneralError(data.message || "Ocurrió un problema al iniciar sesión.");
        return;
      }

      if (!data.token) {
        setGeneralError("No se recibió el token de autenticación del servidor.");
        return;
      }

      if (Platform.OS === "web") {
        localStorage.setItem("token", data.token);
      } else {
        if (AsyncStorage && typeof AsyncStorage.setItem === "function") {
          await AsyncStorage.setItem("token", data.token);
        }
      }

      const userId = data.user.id || data.user._id;

      login(
        {
          _id: data.user._id,
          id: userId, 
          nombre: data.user.nombre,
          apellido: data.user.apellido,
          email: data.user.email,
          rol: data.user.rol,
          photoUrl: data.user.photoUrl,
          contacto: data.user.contacto,
        },
        data.token
      );

      router.replace("/Dashboard");
    } catch (error) {
      setGeneralError("No se pudo conectar con el servidor. Inténtalo más tarde.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.container, isLargeScreen && styles.containerDesktop]}>
          <View style={[styles.card, isLargeScreen ? styles.cardDesktop : styles.cardMobile]}>

          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#ffffff" />
              <Text style={styles.loadingText}>Iniciando sesión...</Text>
            </View>
          )}

          <View style={styles.brandRow}>
            <Image
              source={require("../assets/images/logo-volta.jpeg")}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>

          {!isTwoFactorRequired ? (
            <>
              <TextInput placeholder="Correo electrónico"placeholderTextColor="#9ca3af"value={email}
                onChangeText={(text) => { setEmail(text); setEmailError(""); }}
                keyboardType="email-address"
                autoCapitalize="none"
                mode="flat"
                underlineColor={emailError ? "#dc2626" : "#d1d5db"}
                activeUnderlineColor={emailError ? "#dc2626" : "#111111"}
                dense
                contentStyle={[styles.inputContent, webFont]}
                style={styles.input}
              />
              {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}

              <TextInput
                placeholder="Contraseña"
                placeholderTextColor="#9ca3af"
                value={password}
                onChangeText={(text) => { setPassword(text); setPasswordError(""); }}
                secureTextEntry={!showPassword}
                mode="flat"
                underlineColor={passwordError ? "#dc2626" : "#d1d5db"}
                activeUnderlineColor={passwordError ? "#dc2626" : "#111111"}
                dense
                contentStyle={[styles.inputContent, webFont]}
                style={styles.input}
                right={
                  <TextInput.Icon
                    icon={showPassword ? "eye-off" : "eye"}
                    color="#111111"
                    onPress={() => setShowPassword(!showPassword)}
                  />
                }
              />
              {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}

              <View style={styles.rememberMeContainer}>
                <Text style={[styles.rememberMeText, webFont]}>Recordar mi correo</Text>
                <Switch
                  value={rememberMe}
                  onValueChange={setRememberMe}
                  trackColor={{ false: "#e5e7eb", true: "#9ca3af" }}
                  thumbColor={rememberMe ? "#111111" : "#f9fafb"}
                />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.twoFactorTitle}>Código de verificación 2FA</Text>
              <TextInput
                placeholder="Código de 6 dígitos"
                placeholderTextColor="#9ca3af"
                value={twoFactorCode}
                onChangeText={(text) => { setTwoFactorCode(text); setTwoFactorError(""); }}
                keyboardType="number-pad"
                maxLength={6}
                mode="flat"
                underlineColor={twoFactorError ? "#dc2626" : "#d1d5db"}
                activeUnderlineColor={twoFactorError ? "#dc2626" : "#111111"}
                dense
                contentStyle={[styles.inputContent, webFont, { textAlign: "center" }]}
                style={styles.input}
              />
              {twoFactorError ? <Text style={styles.errorText}>{twoFactorError}</Text> : null}

              <TouchableOpacity onPress={() => setIsTwoFactorRequired(false)} style={styles.backLink}>
                <Text style={styles.linkMuted}>Regresar al formulario principal</Text>
              </TouchableOpacity>
            </>
          )}

          {generalError ? <Text style={styles.generalErrorText}>{generalError}</Text> : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handledLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={[styles.buttonText, webFont]}>
              {isTwoFactorRequired ? "Verificar y Entrar" : "Iniciar Sesión"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/ForgotPassword")} style={styles.forgotLink}>
            <Text style={styles.forgotLinkText}>¿Olvidaste tu contraseña?</Text>
          </TouchableOpacity>

          <View style={[styles.registerBox, !isLargeScreen && styles.registerBoxMobile]}>
            <Text style={[styles.registerHint, webFont]}>¿No tienes cuenta?</Text>
            <TouchableOpacity
              style={styles.registerButton}
              onPress={() => router.push("/Register")}
              activeOpacity={0.85}
            >
              <Text style={[styles.registerButtonText, webFont]}>Regístrate</Text>
            </TouchableOpacity>
          </View>

          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen:{flex: 1,backgroundColor: "#f3f4f6",...(Platform.OS === "web" ? { minHeight: "100vh" as any } : {}), },
  scrollContent:{flexGrow: 1,width: "100%",...(Platform.OS === "web" ? { minHeight: "100vh" as any } : {}), },
  container:{flex: 1,width: "100%",justifyContent: "center",alignItems: "center",paddingHorizontal: 20,paddingVertical: 24,backgroundColor: "#ffffff",...(Platform.OS === "web" ? { minHeight: "100vh" as any } : {}),},
  containerDesktop: { backgroundColor: "#f3f4f6",paddingHorizontal: 32, paddingVertical: 48,},
  card: {width: "100%",maxWidth: 420,alignSelf: "center",backgroundColor: "#ffffff",paddingHorizontal: 20,paddingVertical: 28,position: "relative",},
  cardMobile:{borderWidth: 0,borderRadius: 0,maxWidth: "100%",paddingHorizontal: 0,paddingVertical: 8,...(Platform.OS === "web" ? { boxShadow: "none" as any } : {}),},
  cardDesktop: {width: "100%",maxWidth: 480,alignSelf: "center",borderRadius: 16,borderWidth: 1,borderColor: "#e5e7eb",paddingHorizontal: 40,paddingVertical: 44,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 12px 40px rgba(0,0,0,0.08)" as any }
      : {}),
  },
  brandRow: { alignItems: "center", marginBottom: 28 },
  logoImage: {width: 240,height: 90,maxWidth: "100%",},
  input: { width: "100%", height: 48, backgroundColor: "transparent", marginTop: 4 },
  inputContent: { color: "#111111", fontWeight: "600", fontSize: 15 },
  errorText: { width: "100%", color: "#dc2626", fontSize: 12, marginTop: 4, alignSelf: "flex-start" },
  generalErrorText: { color: "#dc2626", fontSize: 14, fontWeight: "600", marginTop: 10, textAlign: "center" },
  button: {width: "100%",height: 50,backgroundColor: "#111111",borderRadius: 999,justifyContent: "center",alignItems: "center",marginTop: 16,...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),},
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },
  forgotLink: { marginTop: 16, alignSelf: "center" },
  forgotLinkText: { color: "#6b7280", fontSize: 13, fontWeight: "500", textDecorationLine: "underline" },
  registerBox: { width: "100%", marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: "#e5e7eb", flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap",gap: 10,},
  registerBoxMobile: { borderTopWidth: 0, paddingTop: 16, marginTop: 16, },
  registerHint: { color: "#6b7280", fontSize: 14, fontWeight: "500" },
  registerButton: {paddingHorizontal: 18,paddingVertical: 10,borderRadius: 999,borderWidth: 1.5,borderColor: "#111111",backgroundColor: "#ffffff",...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  registerButtonText: { color: "#111111", fontSize: 14, fontWeight: "700", letterSpacing: 0.2 },
  linkMuted: { color: "#6b7280", fontSize: 13, textDecorationLine: "underline" },
  backLink: { marginTop: 10, alignSelf: "center" },
  rememberMeContainer: {flexDirection: "row",alignItems: "center",justifyContent: "space-between",width: "100%",marginTop: 12,marginBottom: 4,
  },
  rememberMeText: { fontSize: 13, color: "#374151", fontWeight: "500", flex: 1, marginRight: 8 },
  twoFactorTitle: { fontSize: 15, fontWeight: "700", color: "#111111", marginTop: 8, textAlign: "center", width: "100%" },
  loadingOverlay: {  ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0, 0, 0, 0.72)", zIndex: 999, justifyContent: "center", alignItems: "center", borderRadius: 16,},
  loadingText: { marginTop: 14, color: "#ffffff", fontWeight: "600", fontSize: 15 },
});