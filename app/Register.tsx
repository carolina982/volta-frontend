import { FontAwesome5 } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Image,
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
import { useStore } from "../context/Store";
import { api } from "../services/api";

type RegisterRole = "Admin" | "Operador";

const notify = (title: string, message: string) => {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
};

export default function Register() {
  const router = useRouter();
  const { login, addUser } = useStore();
  const { width } = useWindowDimensions();
  const [isMounted, setIsMounted] = useState(false);
  const isLargeScreen = isMounted && width >= 768;
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellidoPaterno, setApellidoPaterno] = useState("");
  const [apellidoMaterno, setApellidoMaterno] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rol, setRol] = useState<RegisterRole>("Operador");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [contacto, setContacto] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const roles: { value: RegisterRole; label: string; icon: string; hint: string }[] = [
    { value: "Operador", label: "Operador", icon: "truck", hint: "Operador de ruta" },
    { value: "Admin", label: "Admin", icon: "user-shield", hint: "Gestión completa" },
  ];

  const pickImageFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) setPhotoUrl(result.assets[0].uri);
  };

  const takePhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) setPhotoUrl(result.assets[0].uri);
  };

  const handleRegister = async () => {
    if (saving) return;

    if (!email || !nombre || !apellidoPaterno || !contacto || !password || !confirmPassword || !rol) {
      notify("Error", "Todos los campos son obligatorios (excepto apellido materno)");
      return;
    }

    if (password.length < 6) {
      notify("Error", "La contraseña debe tener al menos 6 caracteres");
      return;
    }

    if (password !== confirmPassword) {
      notify("Error", "Las contraseñas no coinciden");
      return;
    }

    setSaving(true);
    try {
      let res;

      if (photoUrl) {
        const formData = new FormData();
        const apellidoCompleto = [apellidoPaterno, apellidoMaterno]
          .map((s) => s.trim())
          .filter(Boolean)
          .join(" ");
        formData.append("nombre", nombre.trim());
        formData.append("apellidoPaterno", apellidoPaterno.trim());
        formData.append("apellidoMaterno", apellidoMaterno.trim());
        formData.append("apellido", apellidoCompleto);
        formData.append("email", email.trim().toLowerCase());
        formData.append("password", password);
        formData.append("rol", rol);
        formData.append("contacto", contacto.trim());

        if (Platform.OS === "web") {
          const response = await fetch(photoUrl);
          const blob = await response.blob();
          const filename = `imagen_${Date.now()}.jpg`;
          formData.append("photo", new File([blob], filename, { type: "image/jpeg" }));
          res = await api.post("/users/register", formData);
        } else {
          const uriParts = photoUrl.split(".") || [];
          const fileType = uriParts[uriParts.length - 1] || "jpg";
          formData.append("photo", {
            uri: photoUrl,
            name: `imagen.${fileType}`,
            type: `image/${fileType === "jpg" ? "jpeg" : fileType}`,
          } as any);
          // No forzar Content-Type: axios debe poner el boundary del multipart
          res = await api.post("/users/register", formData);
        }
      } else {
        const apellidoCompleto = [apellidoPaterno, apellidoMaterno]
          .map((s) => s.trim())
          .filter(Boolean)
          .join(" ");
        const newUser = {
          nombre: nombre.trim(),
          apellidoPaterno: apellidoPaterno.trim(),
          apellidoMaterno: apellidoMaterno.trim(),
          apellido: apellidoCompleto,
          email: email.trim().toLowerCase(),
          password,
          rol,
          contacto: contacto.trim(),
        };
        res = await api.post("/users/register", newUser);
      }

      if (res.status === 200 || res.status === 201) {
        const data = res.data;
        const userId = data._id || data.id;
        const user = {
          _id: userId,
          id: userId,
          nombre: data.nombre,
          apellido: data.apellido,
          apellidoPaterno: data.apellidoPaterno || apellidoPaterno.trim(),
          apellidoMaterno: data.apellidoMaterno || apellidoMaterno.trim(),
          email: data.email,
          rol: data.rol,
          photoUrl: data.photoUrl || null,
          contacto: data.contacto || "",
        };

        if (data.token) {
          if (Platform.OS === "web") {
            localStorage.setItem("token", data.token);
          } else if (AsyncStorage && typeof AsyncStorage.setItem === "function") {
            await AsyncStorage.setItem("token", data.token);
          }
          login(user, data.token);
        }

        addUser(user);
        notify("Éxito", "Usuario registrado correctamente");
        router.replace("/Dashboard");
      } else {
        notify("Error", "No se pudo registrar el usuario");
      }
    } catch (error: any) {
      console.error("Error registrando usuario:", error.response || error);
      const data = error.response?.data;
      const message =
        data?.message ||
        (Array.isArray(data?.errors) ? data.errors.map((e: any) => e.msg).filter(Boolean).join("\n") : null) ||
        data?.errors?.[0]?.msg ||
        (error.code === "ECONNABORTED"
          ? "El servidor tardó demasiado en responder"
          : "No se pudo registrar. Verifica la conexión.");
      notify("Error", message);
    } finally {
      setSaving(false);
    }
  };

  const inputProps = {
    mode: "flat" as const,
    underlineColor: "#d1d5db",
    activeUnderlineColor: "#111111",
    dense: true,
    contentStyle: styles.inputContent,
    style: styles.input,
    placeholderTextColor: "#9ca3af",
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.container, isLargeScreen && styles.containerDesktop]}>
          <View style={[styles.card, isLargeScreen && styles.cardDesktop]}>

            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.push("/Login")}
              activeOpacity={0.85}
            >
              <FontAwesome5 name="arrow-left" size={14} color="#111111" />
              <Text style={styles.backButtonText}>Regresar</Text>
            </TouchableOpacity>

            <View style={styles.brandRow}>
              <View style={styles.logoBadge}>
                <FontAwesome5 name="user-plus" size={isLargeScreen ? 24 : 20} color="#ffffff" />
              </View>
              <Text style={styles.title}>Registro</Text>
              <Text style={styles.description}>Crea tu cuenta para acceder a Volta</Text>
            </View>

            <TextInput placeholder="Nombre" value={nombre} onChangeText={setNombre} {...inputProps} />
            <TextInput
              placeholder="Apellido paterno"
              value={apellidoPaterno}
              onChangeText={setApellidoPaterno}
              {...inputProps}
            />
            <TextInput
              placeholder="Apellido materno"
              value={apellidoMaterno}
              onChangeText={setApellidoMaterno}
              {...inputProps}
            />
            <TextInput
              placeholder="Correo"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              {...inputProps}
            />
            <TextInput placeholder="Contacto" value={contacto} onChangeText={setContacto} {...inputProps} />

            <TextInput
              placeholder="Contraseña"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              {...inputProps}
              right={
                <TextInput.Icon
                  icon={showPassword ? "eye-off" : "eye"}
                  color="#111111"
                  onPress={() => setShowPassword(!showPassword)}
                />
              }
            />
            <TextInput
              placeholder="Confirmar contraseña"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              {...inputProps}
              right={
                <TextInput.Icon
                  icon={showConfirmPassword ? "eye-off" : "eye"}
                  color="#111111"
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                />
              }
            />

            <Text style={styles.label}>Selecciona tu rol</Text>
            <View style={styles.roleSelector}>
              {roles.map((item) => {
                const isActive = rol === item.value;
                return (
                  <TouchableOpacity
                    key={item.value}
                    style={[styles.roleOption, isActive && styles.roleOptionActive]}
                    onPress={() => setRol(item.value)}
                    activeOpacity={0.85}
                  >
                    <FontAwesome5
                      name={item.icon as any}
                      size={16}
                      color={isActive ? "#ffffff" : "#6b7280"}
                    />
                    <Text style={[styles.roleOptionLabel, isActive && styles.roleOptionLabelActive]}>
                      {item.label}
                    </Text>
                    <Text style={[styles.roleOptionHint, isActive && styles.roleOptionHintActive]}>
                      {item.hint}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.photoButtons}>
              <TouchableOpacity style={styles.photoButtonOutline} onPress={pickImageFromGallery} activeOpacity={0.85}>
                <Text style={styles.photoButtonOutlineText}>Elegir foto</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoButtonOutline} onPress={takePhoto} activeOpacity={0.85}>
                <Text style={styles.photoButtonOutlineText}>Tomar foto</Text>
              </TouchableOpacity>
            </View>

            {photoUrl && <Image source={{ uri: photoUrl }} style={styles.avatarPreview} />}

            <TouchableOpacity
              style={[styles.button, saving && styles.buttonDisabled]}
              onPress={handleRegister}
              activeOpacity={0.85}
              disabled={saving}
            >
              <Text style={styles.buttonText}>{saving ? "Registrando..." : "Registrarse"}</Text>
            </TouchableOpacity>

            <View style={styles.loginBox}>
              <Text style={styles.loginHint}>¿Ya tienes cuenta?</Text>
              <TouchableOpacity style={styles.loginButton} onPress={() => router.push("/Login")} activeOpacity={0.85}>
                <Text style={styles.loginButtonText}>Inicia Sesión</Text>
              </TouchableOpacity>
            </View>

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
    maxWidth: 460,
    alignSelf: "center",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 20,
    paddingVertical: 28,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 12px 40px rgba(0,0,0,0.08)" as any }
      : {}),
  },
  cardDesktop: {
    maxWidth: 480,
    paddingHorizontal: 40,
    paddingVertical: 40,
  },
  backButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fafafa",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111111",
  },
  brandRow: { alignItems: "center", marginBottom: 20 },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#111111",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  title: { fontSize: 26, fontWeight: "800", color: "#111111", letterSpacing: 0.3 },
  description: { fontSize: 14, color: "#6b7280", marginTop: 6, textAlign: "center" },
  label: { marginTop: 4, marginBottom: 10, fontWeight: "600", color: "#374151", fontSize: 13 },
  roleSelector: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  roleOption: {
    flex: 1,
    minHeight: 88,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    backgroundColor: "#fafafa",
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  roleOptionActive: {
    backgroundColor: "#111111",
    borderColor: "#111111",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 8px 20px rgba(0,0,0,0.18)" as any }
      : {}),
  },
  roleOptionLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111111",
  },
  roleOptionLabelActive: {
    color: "#ffffff",
  },
  roleOptionHint: {
    fontSize: 11,
    color: "#9ca3af",
    textAlign: "center",
  },
  roleOptionHintActive: {
    color: "#d1d5db",
  },
  input: { width: "100%", height: 46, backgroundColor: "transparent", marginBottom: 4 },
  inputContent: { color: "#111111", fontWeight: "600" },
  photoButtons: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginBottom: 8 },
  photoButtonOutline: {
    flex: 1,
    height: 44,
    borderWidth: 1.5,
    borderColor: "#111111",
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  photoButtonOutlineText: { color: "#111111", fontSize: 13, fontWeight: "700" },
  avatarPreview: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignSelf: "center",
    marginVertical: 10,
    borderWidth: 2,
    borderColor: "#e5e7eb",
  },
  button: {
    width: "100%",
    height: 50,
    backgroundColor: "#111111",
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  loginBox: {
    width: "100%",
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  loginHint: { color: "#6b7280", fontSize: 14, fontWeight: "500" },
  loginButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#111111",
    backgroundColor: "#ffffff",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  loginButtonText: { color: "#111111", fontSize: 14, fontWeight: "700" },
});
