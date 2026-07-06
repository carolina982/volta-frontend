import { FontAwesome5 } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
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

  // ---  CAPTCHA DE PALOMITA ---
  const [isCaptchaChecked, setIsCaptchaChecked] = useState(false);
  const [isCaptchaVerifying, setIsCaptchaVerifying] = useState(false);
  const [captchaError, setCaptchaError] = useState("");

  // --- ESTADOS PARA FLUJO DE 2FA  ---
  const [isTwoFactorRequired, setIsTwoFactorRequired] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorError, setTwoFactorError] = useState("");

  const router = useRouter();

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

  const handleCheckCaptcha = () => {
    if (isCaptchaChecked) return;
    setIsCaptchaVerifying(true);
    setCaptchaError("");
    setTimeout(() => {
      setIsCaptchaVerifying(false);
      setIsCaptchaChecked(true);
    }, 1200);
  };

  const validateEmail = (text: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(text);
  };

  const handledLogin = async () => {
    setEmailError("");
    setPasswordError("");
    setCaptchaError("");
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

    if (!isCaptchaChecked) {
      setCaptchaError("Por favor confirma que no eres un robot.");
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
        setIsCaptchaChecked(false);
        return;
      }

      if (response.status === 200 && data.requiresTwoFactor && !isTwoFactorRequired) {
        setIsTwoFactorRequired(true);
        setGeneralError("Se requiere un código de autenticación de dos factores (2FA).");
        return;
      }

      if (!response.ok) {
        setGeneralError(data.message || "Ocurrió un problema al iniciar sesión.");
        setIsCaptchaChecked(false);
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
      setIsCaptchaChecked(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>
          
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#ffffff" />
              <Text style={styles.loadingText}>Iniciando sesión de forma segura...</Text>
            </View>
          )}

          <FontAwesome5 name="truck-moving" size={85.5} color="#007bff" style={styles.icon} />
          <Text style={styles.title}>Volta</Text>

          {!isTwoFactorRequired ? (
            <>
              {/* Input de Correo */}
              <TextInput 
                placeholder="Correo electrónico"
                value={email}
                onChangeText={(text) => { setEmail(text); setEmailError(""); }}
                keyboardType="email-address"
                autoCapitalize="none"
                mode="flat"
                underlineColor={emailError ? "#ff3333" : "#0d75bb"} 
                activeUnderlineColor={emailError ? "#ff3333" : "#0d75bb"}
                dense 
                contentStyle={{ color: "#000", fontWeight: "600" }}  
                style={styles.input}
              />
              {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}

              {/* Input de Contraseña */}
              <TextInput 
                placeholder="Contraseña"
                value={password}
                onChangeText={(text) => { setPassword(text); setPasswordError(""); }}
                secureTextEntry={!showPassword}
                mode="flat"
                underlineColor={passwordError ? "#ff3333" : "#0d75bb"}
                activeUnderlineColor={passwordError ? "#ff3333" : "#0d75bb"}
                dense 
                contentStyle={{ color: "#000", fontWeight: "600" }}
                style={styles.input} 
                right={
                  <TextInput.Icon 
                    icon={showPassword ? "eye-off" : "eye"} 
                    color="#007bff" 
                    onPress={() => setShowPassword(!showPassword)} 
                  />
                }
              />
              {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}

              {/* Fila Recordarme */}
              <View style={styles.rememberMeContainer}>
                <Text style={styles.rememberMeText}>Recordar mi correo electrónico</Text>
                <Switch
                  value={rememberMe}
                  onValueChange={setRememberMe}
                  trackColor={{ false: "#767577", true: "#a5d1f3" }}
                  thumbColor={rememberMe ? "#0d75bb" : "#f4f3f4"}
                />
              </View>
            </>
          ) : (
            <>
              {/* Input exclusivo para Código 2FA */}
              <Text style={styles.twoFactorTitle}>Código de Autenticación de Dos Factores</Text>
              <TextInput 
                placeholder="Ingresa el código de 6 dígitos"
                value={twoFactorCode}
                onChangeText={(text) => { setTwoFactorCode(text); setTwoFactorError(""); }}
                keyboardType="number-pad"
                maxLength={6}
                mode="flat"
                underlineColor={twoFactorError ? "#ff3333" : "#0d75bb"}
                activeUnderlineColor={twoFactorError ? "#ff3333" : "#0d75bb"}
                dense
                contentStyle={{ color: "#000", fontWeight: "600", textAlign: "center" }}
                style={styles.input}
              />
              {twoFactorError ? <Text style={styles.errorText}>{twoFactorError}</Text> : null}
              
              <TouchableOpacity onPress={() => setIsTwoFactorRequired(false)} style={{ marginTop: 10 }}>
                <Text style={{ color: "#64748b", textDecorationLine: "underline" }}>Regresar al formulario principal</Text>
              </TouchableOpacity>
            </>
          )}

          {/* CAPTCHA de Palomita Interactiva */}
          <View style={styles.captchaWrapper}>
            <TouchableOpacity 
              style={[styles.captchaBox, isCaptchaChecked && styles.captchaBoxChecked]} 
              onPress={handleCheckCaptcha}
              activeOpacity={0.7}
              disabled={isCaptchaVerifying || isCaptchaChecked}
            >
              <View style={[styles.checkboxSquare, isCaptchaChecked && styles.checkboxSquareChecked]}>
                {isCaptchaVerifying && <ActivityIndicator size="small" color="#007bff" />}
                {isCaptchaChecked && <FontAwesome5 name="check" size={14} color="#22c55e" />}
              </View>
              <Text style={styles.captchaLabel}>No soy un robot</Text>
              
              <View style={styles.recaptchaLogoContainer}>
                <FontAwesome5 name="recycle" size={16} color="#007bff" />
                <Text style={styles.recaptchaLogoText}>reCAPTCHA</Text>
              </View>
            </TouchableOpacity>
            {captchaError ? <Text style={styles.errorText}>{captchaError}</Text> : null}
          </View>

          {generalError ? <Text style={styles.generalErrorText}>{generalError}</Text> : null}

          <TouchableOpacity 
            style={[styles.button, loading && { opacity: 0.5 }]} 
            onPress={handledLogin} 
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {isTwoFactorRequired ? "Verificar y Entrar" : "Iniciar Sesión"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/ForgotPassword")}>
            <Text style={{ color: "#007bff", marginTop: 15 }}>
              ¿Olvidaste tu contraseña?
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.registerButton} onPress={() => router.push("/Register")}>
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
  container: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20, backgroundColor: "#f5f7fa" },
  icon: { marginBottom: 20 },
  title: { fontSize: 28, marginBottom: 30, fontWeight: "bold" },
  input: { width: "100%", height: 50, backgroundColor: "transparent", marginTop: 5 },
  errorText: { width: "100%", color: "#ff3333", fontSize: 13, marginTop: 4, alignSelf: "flex-start", paddingLeft: 5 },
  generalErrorText: { color: "#ff3333", fontSize: 15, fontWeight: "bold", marginTop: 10, textAlign: "center" },
  button: { width: "100%", height: 50, backgroundColor: "#007bff", borderRadius: 10, justifyContent: "center", alignItems: "center", marginTop: 15 },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  registerButton: { marginTop: 20 },
  registerText: { color: "#007bff", fontSize: 16 },
  rememberMeContainer: { flexDirection: "row",alignItems: "center",justifyContent: "space-between",width: "100%",marginTop: 15,marginBottom: 10,paddingHorizontal: 5},
  rememberMeText: { fontSize: 14, color: "#475569", fontWeight: "500" },
  twoFactorTitle: { fontSize: 15, fontWeight: "600", color: "#1e293b", marginTop: 10, textAlign: "center", width: "100%" },

  // ESTILOS CAPTCHA
  captchaWrapper: { width: "100%", marginTop: 10, marginBottom: 5 },
  captchaBox: { width: "100%", height: 64,backgroundColor: "#f8fafc", borderRadius: 6, borderWidth: 1.5, borderColor: "#cbd5e1", flexDirection: "row", alignItems: "center", paddingHorizontal: 15,justifyContent: "space-between", },
  captchaBoxChecked: { borderColor: "#e2e8f0", backgroundColor: "#f1f5f9" },
  checkboxSquare: { width: 26,height: 26,borderWidth: 2,borderColor: "#94a3b8",borderRadius: 4,backgroundColor: "#fff",justifyContent: "center",alignItems: "center", },
  checkboxSquareChecked: { borderColor: "#22c55e" },
  captchaLabel: { flex: 1, fontSize: 15, color: "#334155", fontWeight: "600", marginLeft: 14 },
  recaptchaLogoContainer: { alignItems: "center", justifyContent: "center" },
  recaptchaLogoText: { fontSize: 9, color: "#64748b", fontWeight: "700", marginTop: 2 },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15, 23, 42, 0.75)", zIndex: 999, justifyContent: "center", alignItems: "center",},
  loadingText: { marginTop: 14, color: "#ffffff", fontWeight: "700", fontSize: 16 }
});