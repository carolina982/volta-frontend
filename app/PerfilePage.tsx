import { FontAwesome5 } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { TextInput } from "react-native-paper";
import { api, BASE_URL } from "../services/api";
import { User } from "../types";

interface PerfilPageProps {
  currentUser: User | null;
  setCurrentUser?: (user: User) => void;
}

const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, "");

const resolvePhotoUrl = (photoUrl?: string | null) => {
  if (!photoUrl) return null;
  if (photoUrl.startsWith("http") || photoUrl.startsWith("file:") || photoUrl.startsWith("blob:")) {
    return photoUrl;
  }
  return `${API_ORIGIN}${photoUrl.startsWith("/") ? "" : "/"}${photoUrl}`;
};

const isLocalPhotoUri = (uri?: string | null) => {
  if (!uri) return false;
  return (
    uri.startsWith("file://") ||
    uri.startsWith("blob:") ||
    uri.startsWith("content://") ||
    uri.startsWith("ph://") ||
    uri.startsWith("assets-library://") ||
    uri.startsWith("data:")
  );
};

export default function PerfilPage({ currentUser, setCurrentUser }: PerfilPageProps) {
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 900;
  const isMobile = width < 768;

  const [nombre, setNombre] = useState(currentUser?.nombre ?? "");
  const [apellido, setApellido] = useState(currentUser?.apellido ?? "");
  const [email, setEmail] = useState(currentUser?.email ?? "");
  const [contacto, setContacto] = useState(currentUser?.contacto ?? "");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formMessage, setFormMessage] = useState("");

  const displayRole = currentUser?.rol || "Usuario";
  const roleKey = displayRole.toLowerCase();
  const isAdmin = roleKey === "admin";
  /** Operador / Ayudante: datos bloqueados, solo foto + guardar */
  const fieldsLocked = !isAdmin;

  useEffect(() => {
    if (!currentUser) return;

    setContacto(currentUser.contacto || "");
    setNombre(currentUser.nombre || "");
    setApellido(currentUser.apellido || "");
    setEmail(currentUser.email || "");
    setPhotoUri(resolvePhotoUrl(currentUser.photoUrl));
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

  const roleIcon = useMemo(() => {
    if (roleKey === "admin") return "user-shield";
    if (roleKey.includes("ayudante")) return "user-friends";
    return "truck";
  }, [roleKey]);

  const ensureGalleryPermission = async () => {
    if (Platform.OS === "web") return true;

    const current = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (current.granted) return true;

    if (current.canAskAgain === false) {
      Alert.alert(
        "Permiso de fotos",
        "Activa el acceso a fotos en Ajustes del teléfono para cambiar tu imagen de perfil.",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Abrir Ajustes", onPress: () => Linking.openSettings() },
        ]
      );
      return false;
    }

    const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (requested.granted) return true;

    Alert.alert(
      "Permiso requerido",
      "Necesitamos acceso a tu galería para subir la foto de perfil.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Abrir Ajustes", onPress: () => Linking.openSettings() },
      ]
    );
    return false;
  };

  const handleSave = async () => {
    if (!currentUser || isSaving) return;
    setFormMessage("");

    if (!fieldsLocked && (!nombre.trim() || !apellido.trim())) {
      setFormMessage("Nombre y apellido son obligatorios.");
      return;
    }

    if (fieldsLocked && !isLocalPhotoUri(photoUri)) {
      setFormMessage("Elige una nueva imagen para guardar cambios.");
      return;
    }

    setIsSaving(true);
    try {
      const formData = new FormData();

      if (!fieldsLocked) {
        formData.append("nombre", nombre.trim());
        formData.append("apellido", apellido.trim());
        formData.append("email", email.trim());
        formData.append("contacto", contacto.trim());
      }

      if (isLocalPhotoUri(photoUri) && photoUri) {
        if (Platform.OS === "web") {
          const response = await fetch(photoUri);
          const blob = await response.blob();
          const ext = blob.type?.includes("png") ? "png" : "jpeg";
          formData.append("photo", blob, `profile.${ext}`);
        } else {
          const ext = photoUri.toLowerCase().includes(".png") ? "png" : "jpg";
          formData.append("photo", {
            uri: photoUri,
            name: `profile.${ext}`,
            type: ext === "png" ? "image/png" : "image/jpeg",
          } as any);
        }
      }

      const endpoint = fieldsLocked
        ? `/users/${currentUser._id}/photo`
        : `/users/${currentUser._id}`;

      const res = await api.patch(endpoint, formData, {
        headers: Platform.OS === "web" ? { "Content-Type": "multipart/form-data" } : undefined,
        transformRequest: Platform.OS === "web" ? undefined : [(data) => data],
        timeout: 60000,
      });

      const data = res.data || {};
      if (data.photoUrl) {
        setPhotoUri(`${resolvePhotoUrl(data.photoUrl)}?t=${Date.now()}`);
      }

      if (setCurrentUser) {
        setCurrentUser({
          ...currentUser,
          ...data,
          nombre: fieldsLocked ? currentUser.nombre : data.nombre ?? nombre,
          apellido: fieldsLocked ? currentUser.apellido : data.apellido ?? apellido,
          email: fieldsLocked ? currentUser.email : data.email ?? email,
          contacto: fieldsLocked ? currentUser.contacto : data.contacto ?? contacto,
          rol: currentUser.rol,
          photoUrl: data.photoUrl
            ? `${resolvePhotoUrl(data.photoUrl)}?t=${Date.now()}`
            : currentUser.photoUrl,
        });
      }

      notify(
        "Éxito",
        fieldsLocked ? "Foto actualizada correctamente" : "Perfil actualizado correctamente"
      );
    } catch (error: any) {
      console.error(error);
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "No se pudo actualizar el perfil";
      setFormMessage(message);
      notify("Error", message);
    } finally {
      setIsSaving(false);
    }
  };

  const pickerImage = async () => {
    try {
      const ok = await ensureGalleryPermission();
      if (!ok) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setPhotoUri(result.assets[0].uri);
        setFormMessage("");
      }
    } catch (error) {
      console.error(error);
      notify("Error", "No se pudo abrir la galería de fotos");
    }
  };

  const inputProps = {
    mode: "flat" as const,
    underlineColor: "transparent",
    activeUnderlineColor: "transparent",
    dense: true,
    contentStyle: [styles.inputContent, fieldsLocked && styles.inputContentLocked],
    style: [styles.input, fieldsLocked && styles.inputLocked],
    placeholderTextColor: "#9ca3af",
    editable: !fieldsLocked,
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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 24}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scrollContent,
          isMobile && styles.scrollContentMobile,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        nestedScrollEnabled
      >
        <View style={[styles.container, isMobile && styles.containerMobile]}>
          <View style={styles.pageHeader}>
            <View style={styles.pageHeaderText}>
              <Text style={[styles.title, isMobile && styles.titleMobile]}>Mi Perfil</Text>
              <Text style={styles.subtitle}>
                {fieldsLocked
                  ? "Puedes cambiar tu foto de perfil"
                  : "Actualiza tu información personal"}
              </Text>
            </View>
            <View style={styles.roleBadge}>
              <FontAwesome5 name={roleIcon} size={10} color="#ffffff" />
              <Text style={styles.roleBadgeText}>{displayRole}</Text>
            </View>
          </View>

          {fieldsLocked ? (
            <View style={styles.lockBanner}>
              <FontAwesome5 name="lock" size={12} color="#64748b" />
              <Text style={styles.lockBannerText}>
                Tus datos están bloqueados. Solo puedes cambiar la foto y guardar.
              </Text>
            </View>
          ) : null}

          <View
            style={[
              styles.profilePanel,
              isLargeScreen && styles.profilePanelDesktop,
              isMobile && styles.profilePanelMobile,
            ]}
          >
            <View style={[styles.avatarSection, isMobile && styles.avatarSectionMobile]}>
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
              <Text style={styles.photoHint}>
                {Platform.OS === "web"
                  ? "JPG o PNG · se guarda al pulsar Guardar"
                  : "Si pide permiso, elige Permitir · luego Guardar"}
              </Text>
            </View>

            <View style={[styles.formSection, isLargeScreen && styles.formSectionDesktop]}>
              <View style={isLargeScreen ? styles.fieldRow : styles.fieldStack}>
                <View style={isLargeScreen ? styles.fieldHalf : styles.fieldFull}>
                  {renderField(
                    "Nombre",
                    <TextInput
                      placeholder="Nombre"
                      value={nombre}
                      onChangeText={setNombre}
                      returnKeyType="next"
                      {...inputProps}
                    />
                  )}
                </View>
                <View style={isLargeScreen ? styles.fieldHalf : styles.fieldFull}>
                  {renderField(
                    "Apellido",
                    <TextInput
                      placeholder="Apellido"
                      value={apellido}
                      onChangeText={setApellido}
                      returnKeyType="next"
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
                  returnKeyType="next"
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
                  returnKeyType="done"
                  {...inputProps}
                />
              )}

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Rol</Text>
                <View style={styles.roleReadonly}>
                  <FontAwesome5 name={roleIcon} size={13} color="#111111" />
                  <Text style={styles.roleReadonlyText}>{displayRole}</Text>
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
                    <Text style={styles.saveButtonText}>
                      {fieldsLocked ? "Guardar foto" : "Guardar Cambios"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 28 },
  scrollContentMobile: { paddingBottom: 120 },
  container: {
    flex: 1,
    paddingHorizontal: 0,
    paddingVertical: 4,
    backgroundColor: "transparent",
  },
  containerMobile: { paddingHorizontal: 2 },
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
  titleMobile: { fontSize: 22 },
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
  lockBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  lockBannerText: {
    flex: 1,
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
    lineHeight: 17,
  },
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
  profilePanelMobile: {
    padding: 16,
    gap: 8,
  },
  avatarSection: {
    alignItems: "center",
    marginBottom: 8,
  },
  avatarSectionMobile: {
    marginBottom: 18,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    width: "100%",
  },
  avatarImage: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    marginBottom: 14,
    backgroundColor: "#f3f4f6",
  },
  avatarPlaceholder: {
    width: 108,
    height: 108,
    borderRadius: 54,
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
  photoHint: {
    marginTop: 8,
    fontSize: 11,
    color: "#9ca3af",
    fontWeight: "600",
  },
  formSection: { flex: 1, width: "100%" },
  formSectionDesktop: { paddingTop: 8 },
  fieldRow: { flexDirection: "row", gap: 12 },
  fieldStack: { width: "100%" },
  fieldHalf: { flex: 1 },
  fieldFull: { width: "100%" },
  fieldGroup: { marginBottom: 14, width: "100%" },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  input: {
    width: "100%",
    minHeight: 48,
    backgroundColor: "#fafafa",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 0,
  },
  inputLocked: {
    backgroundColor: "#f1f5f9",
    borderColor: "#e2e8f0",
  },
  inputContent: { color: "#111111", fontWeight: "600", fontSize: 14 },
  inputContentLocked: { color: "#64748b" },
  roleReadonly: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  roleReadonlyText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111111",
  },
  roleHelp: {
    marginTop: 6,
    fontSize: 11,
    color: "#9ca3af",
    fontWeight: "600",
  },
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
    paddingVertical: 15,
    marginTop: 6,
    minHeight: 52,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
});
