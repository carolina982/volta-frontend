import { FontAwesome5 } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { TextInput } from "react-native-paper";
import { User } from "../types";

interface PerfilPageProps {
  currentUser: User | null;
  setCurrentUser?: (user: User) => void;
}

const roles: { value: "Admin" | "Operador"; label: string; icon: string }[] = [
  { value: "Admin", label: "Admin", icon: "user-shield" },
  { value: "Operador", label: "Operador", icon: "truck" },
];

export default function PerfilPage({ currentUser, setCurrentUser }: PerfilPageProps) {
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;

  const initialRole =
    currentUser?.rol === "Admin"
      ? "Admin"
      : ("Operador" as "Admin" | "Operador");

  const [nombre, setNombre] = useState(currentUser?.nombre ?? "");
  const [apellido, setApellido] = useState(currentUser?.apellido ?? "");
  const [rol, setRol] = useState<"Admin" | "Operador">(initialRole);
  const [email, setEmail] = useState(currentUser?.email ?? "");
  const [contacto, setContacto] = useState(currentUser?.contacto ?? "");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formMessage, setFormMessage] = useState("");

  useEffect(() => {
    if (!currentUser) return;

    setContacto(currentUser.contacto || "");
    setNombre(currentUser.nombre || "");
    setApellido(currentUser.apellido || "");
    setEmail(currentUser.email || "");
    setRol(
      currentUser.rol === "Admin" ? "Admin" : "Operador"
    );

    if (currentUser.photoUrl) {
      const imageURL = currentUser.photoUrl.startsWith("http")
        ? currentUser.photoUrl
        : `https://volta-backend-px1a.onrender.com${currentUser.photoUrl}`;
      setPhotoUri(imageURL);
    } else {
      setPhotoUri(null);
    }
  }, [currentUser]);

  const notify = (title: string, message: string) => {
    if (Platform.OS === "web") {
      window.alert(`${title}\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const getInitials = () =>
    `${nombre?.[0] || ""}${apellido?.[0] || ""}`.toUpperCase() || "U";

  const handleSave = async () => {
    if (!currentUser || isSaving) return;
    setFormMessage("");

    if (!nombre.trim() || !apellido.trim()) {
      setFormMessage("Nombre y apellido son obligatorios.");
      return;
    }

    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append("nombre", nombre.trim());
      formData.append("apellido", apellido.trim());
      formData.append("email", email.trim());
      formData.append("rol", rol);
      formData.append("contacto", contacto.trim());

      if (photoUri && (photoUri.startsWith("file://") || photoUri.startsWith("blob:"))) {
        if (Platform.OS === "web") {
          const response = await fetch(photoUri);
          const blob = await response.blob();
          formData.append("photo", blob, "profile.jpeg");
        } else {
          formData.append("photo", {
            uri: photoUri,
            name: "profile.jpeg",
            type: "image/jpeg",
          } as any);
        }
      }

      const res = await fetch(
        `https://volta-backend-px1a.onrender.com/api/users/${currentUser._id}`,
        { method: "PATCH", body: formData }
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "No se pudo actualizar el perfil");
      }

      if (data.photoUrl) {
        setPhotoUri(`https://volta-backend-px1a.onrender.com${data.photoUrl}?t=${Date.now()}`);
      }

      if (setCurrentUser) {
        const updatedPhotoUrl = data.photoUrl
          ? `https://volta-backend-px1a.onrender.com${data.photoUrl}?t=${Date.now()}`
          : currentUser.photoUrl;
        setCurrentUser({ ...currentUser, ...data, photoUrl: updatedPhotoUrl });
      }

      notify("Éxito", "Perfil actualizado correctamente");
    } catch (error: any) {
      console.error(error);
      const message = error.message || "No se pudo actualizar el perfil";
      setFormMessage(message);
      notify("Error", message);
    } finally {
      setIsSaving(false);
    }
  };

  const pickerImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      notify("Permiso requerido", "Necesitamos acceso a tus fotos");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const inputProps = {
    mode: "flat" as const,
    underlineColor: "transparent",
    activeUnderlineColor: "transparent",
    dense: true,
    contentStyle: styles.inputContent,
    style: styles.input,
    placeholderTextColor: "#9ca3af",
  };

  const renderField = (label: string, field: React.ReactNode) => (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {field}
    </View>
  );

  if (!currentUser) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#111111" />
        <Text style={styles.loadingText}>Cargando perfil...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.container}>
        <View style={styles.pageHeader}>
          <View style={styles.pageHeaderText}>
            <Text style={styles.title}>Mi Perfil</Text>
            <Text style={styles.subtitle}>Actualiza tu información personal</Text>
          </View>
          <View style={styles.roleBadge}>
            <FontAwesome5
              name={rol === "Admin" ? "user-shield" : "truck"}
              size={10}
              color="#ffffff"
            />
            <Text style={styles.roleBadgeText}>{rol}</Text>
          </View>
        </View>

        <View style={[styles.profilePanel, isLargeScreen && styles.profilePanelDesktop]}>
          <View style={styles.avatarSection}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{getInitials()}</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.changePhotoButton}
              onPress={pickerImage}
              activeOpacity={0.85}
            >
              <FontAwesome5 name="camera" size={12} color="#111111" />
              <Text style={styles.changePhotoText}>Cambiar Imagen</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.formSection, isLargeScreen && styles.formSectionDesktop]}>
            <View style={isLargeScreen ? styles.fieldRow : undefined}>
              <View style={isLargeScreen ? styles.fieldHalf : undefined}>
                {renderField(
                  "Nombre",
                  <TextInput
                    placeholder="Nombre"
                    value={nombre}
                    onChangeText={setNombre}
                    {...inputProps}
                  />
                )}
              </View>
              <View style={isLargeScreen ? styles.fieldHalf : undefined}>
                {renderField(
                  "Apellido",
                  <TextInput
                    placeholder="Apellido"
                    value={apellido}
                    onChangeText={setApellido}
                    {...inputProps}
                  />
                )}
              </View>
            </View>

            {renderField(
              "Email",
              <TextInput
                placeholder="Correo electrónico"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                {...inputProps}
              />
            )}

            {renderField(
              "Contacto",
              <TextInput
                placeholder="Teléfono de contacto"
                value={contacto}
                onChangeText={setContacto}
                keyboardType="phone-pad"
                {...inputProps}
              />
            )}

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Rol</Text>
              <View style={styles.roleSelector}>
                {roles.map((item) => {
                  const isActive = rol === item.value;
                  return (
                    <TouchableOpacity
                      key={item.value}
                      style={[styles.rolePill, isActive && styles.rolePillActive]}
                      onPress={() => setRol(item.value)}
                      activeOpacity={0.85}
                    >
                      <FontAwesome5
                        name={item.icon as any}
                        size={12}
                        color={isActive ? "#ffffff" : "#6b7280"}
                      />
                      <Text style={[styles.rolePillText, isActive && styles.rolePillTextActive]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {formMessage ? (
              <View style={styles.formMessageBox}>
                <FontAwesome5 name="exclamation-circle" size={12} color="#dc2626" />
                <Text style={styles.formMessage}>{formMessage}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={isSaving}
              activeOpacity={0.85}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <FontAwesome5 name="save" size={14} color="#ffffff" />
                  <Text style={styles.saveButtonText}>Guardar Cambios</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, paddingBottom: 24 },
  container: {
    flex: 1,
    paddingHorizontal: 0,
    paddingVertical: 4,
    backgroundColor: "transparent",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    paddingVertical: 60,
  },
  loadingText: { fontSize: 14, color: "#6b7280", fontWeight: "600" },
  pageHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  pageHeaderText: { flex: 1, paddingRight: 12 },
  title: { fontSize: 24, fontWeight: "800", color: "#111111", letterSpacing: 0.2 },
  subtitle: { fontSize: 13, color: "#6b7280", marginTop: 4 },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#111111",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  roleBadgeText: { color: "#ffffff", fontWeight: "700", fontSize: 12 },
  profilePanel: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 20,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 8px 24px rgba(0,0,0,0.04)" as any }
      : {}),
  },
  profilePanelDesktop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 32,
    padding: 28,
  },
  avatarSection: {
    alignItems: "center",
    marginBottom: 8,
    ...(Platform.OS === "web" ? {} : { marginBottom: 20 }),
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    marginBottom: 14,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  avatarText: { color: "#ffffff", fontWeight: "800", fontSize: 32 },
  changePhotoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#111111",
    backgroundColor: "#ffffff",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  changePhotoText: { color: "#111111", fontWeight: "700", fontSize: 13 },
  formSection: { flex: 1 },
  formSectionDesktop: { paddingTop: 8 },
  fieldRow: { flexDirection: "row", gap: 12 },
  fieldHalf: { flex: 1 },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  input: {
    width: "100%",
    height: 44,
    backgroundColor: "#fafafa",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 0,
  },
  inputContent: { color: "#111111", fontWeight: "600", fontSize: 14 },
  roleSelector: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  rolePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    backgroundColor: "#fafafa",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  rolePillActive: { backgroundColor: "#111111", borderColor: "#111111" },
  rolePillText: { fontSize: 13, fontWeight: "700", color: "#374151" },
  rolePillTextActive: { color: "#ffffff" },
  formMessageBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  formMessage: { flex: 1, color: "#dc2626", fontSize: 12, fontWeight: "600" },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#111111",
    borderRadius: 999,
    paddingVertical: 14,
    marginTop: 6,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
});
