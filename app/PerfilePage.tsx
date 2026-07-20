import { FontAwesome5 } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
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
  const raw = String(photoUrl).trim();
  if (!raw) return null;
  if (
    raw.startsWith("http") ||
    raw.startsWith("file:") ||
    raw.startsWith("blob:") ||
    raw.startsWith("content://") ||
    raw.startsWith("ph://") ||
    raw.startsWith("data:")
  ) {
    return raw;
  }
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${API_ORIGIN}${path}`;
};

/** Guarda en sesión la ruta relativa del API (sin cache-bust). */
const toStoredPhotoUrl = (photoUrl?: string | null) => {
  if (!photoUrl) return null;
  const raw = String(photoUrl).split("?")[0].trim();
  if (!raw) return null;
  if (raw.startsWith("/uploads/")) return raw;
  try {
    if (raw.startsWith("http")) {
      const u = new URL(raw);
      if (u.pathname.startsWith("/uploads/")) return u.pathname;
    }
  } catch {
    /* ignore */
  }
  return raw;
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
  const [apellidoPaterno, setApellidoPaterno] = useState(
    currentUser?.apellidoPaterno ||
      (currentUser?.apellidoMaterno ? "" : currentUser?.apellido) ||
      ""
  );
  const [apellidoMaterno, setApellidoMaterno] = useState(currentUser?.apellidoMaterno ?? "");
  const [email, setEmail] = useState(currentUser?.email ?? "");
  const [contacto, setContacto] = useState(currentUser?.contacto ?? "");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [savedPhotoUri, setSavedPhotoUri] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [formOk, setFormOk] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const displayRole = currentUser?.rol || "Usuario";
  const roleKey = displayRole.toLowerCase();
  const isAdmin = roleKey === "admin";
  /** Operador / Ayudante: datos bloqueados, solo foto + guardar */
  const fieldsLocked = !isAdmin;
  const hasPendingPhoto = isLocalPhotoUri(photoUri);

  useEffect(() => {
    if (!currentUser) return;

    setContacto(currentUser.contacto || "");
    setNombre(currentUser.nombre || "");
    setApellidoPaterno(
      currentUser.apellidoPaterno ||
        (currentUser.apellidoMaterno ? "" : currentUser.apellido) ||
        ""
    );
    setApellidoMaterno(currentUser.apellidoMaterno || "");
    setEmail(currentUser.email || "");
    const resolved = resolvePhotoUrl(currentUser.photoUrl);
    setPhotoUri(resolved);
    setSavedPhotoUri(resolved);
    setPhotoFailed(false);
    setFormMessage("");
    setFormOk(false);
  }, [currentUser]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvt, (e) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const notify = (title: string, message: string) => {
    if (Platform.OS === "web") {
      window.alert(`${title}\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const getInitials = () =>
    `${nombre?.[0] || ""}${apellidoPaterno?.[0] || ""}`.toUpperCase() || "U";

  const apellidoCompleto = [apellidoPaterno, apellidoMaterno]
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .join(" ");

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

  const ensureCameraPermission = async () => {
    if (Platform.OS === "web") return false;

    const current = await ImagePicker.getCameraPermissionsAsync();
    if (current.granted) return true;

    if (current.canAskAgain === false) {
      Alert.alert(
        "Permiso de cámara",
        "Activa la cámara en Ajustes para tomar tu foto de perfil.",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Abrir Ajustes", onPress: () => Linking.openSettings() },
        ]
      );
      return false;
    }

    const requested = await ImagePicker.requestCameraPermissionsAsync();
    if (requested.granted) return true;

    Alert.alert(
      "Permiso requerido",
      "Necesitamos acceso a la cámara para tomar la foto de perfil.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Abrir Ajustes", onPress: () => Linking.openSettings() },
      ]
    );
    return false;
  };

  const applyPickedAsset = (uri: string) => {
    setPhotoUri(uri);
    setPhotoFailed(false);
    setFormMessage("");
    setFormOk(false);
  };

  const pickFromGallery = async () => {
    try {
      const ok = await ensureGalleryPermission();
      if (!ok) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.75,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        applyPickedAsset(result.assets[0].uri);
      }
    } catch (error) {
      console.error(error);
      notify("Error", "No se pudo abrir la galería de fotos");
    }
  };

  const takePhoto = async () => {
    try {
      if (Platform.OS === "web") {
        await pickFromGallery();
        return;
      }
      const ok = await ensureCameraPermission();
      if (!ok) return;

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.75,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        applyPickedAsset(result.assets[0].uri);
      }
    } catch (error) {
      console.error(error);
      notify("Error", "No se pudo abrir la cámara");
    }
  };

  const discardPendingPhoto = () => {
    setPhotoUri(savedPhotoUri);
    setPhotoFailed(false);
    setFormMessage("");
    setFormOk(false);
  };

  const handleSave = async () => {
    if (!currentUser || isSaving) return;
    setFormMessage("");
    setFormOk(false);

    if (!fieldsLocked && (!nombre.trim() || !apellidoPaterno.trim())) {
      setFormMessage("Nombre y apellido paterno son obligatorios.");
      return;
    }

    if (fieldsLocked && !hasPendingPhoto) {
      setFormMessage("Elige una nueva imagen (galería o cámara) para guardar.");
      return;
    }

    if (!fieldsLocked && !hasPendingPhoto) {
      const unchanged =
        nombre.trim() === (currentUser.nombre || "") &&
        apellidoPaterno.trim() ===
          (currentUser.apellidoPaterno ||
            (currentUser.apellidoMaterno ? "" : currentUser.apellido) ||
            "") &&
        apellidoMaterno.trim() === (currentUser.apellidoMaterno || "") &&
        email.trim() === (currentUser.email || "") &&
        contacto.trim() === (currentUser.contacto || "");
      if (unchanged) {
        setFormMessage("No hay cambios para guardar.");
        return;
      }
    }

    setIsSaving(true);
    try {
      const formData = new FormData();

      if (!fieldsLocked) {
        formData.append("nombre", nombre.trim());
        formData.append("apellidoPaterno", apellidoPaterno.trim());
        formData.append("apellidoMaterno", apellidoMaterno.trim());
        formData.append("apellido", apellidoCompleto);
        formData.append("email", email.trim());
        formData.append("contacto", contacto.trim());
      }

      if (hasPendingPhoto && photoUri) {
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

      const userId = currentUser._id || currentUser.id;
      const endpoint = fieldsLocked ? `/users/${userId}/photo` : `/users/${userId}`;

      const res = await api.patch(endpoint, formData, {
        headers: Platform.OS === "web" ? { "Content-Type": "multipart/form-data" } : undefined,
        transformRequest: Platform.OS === "web" ? undefined : [(data) => data],
        timeout: 60000,
      });

      const data = res.data || {};
      const storedPhoto = toStoredPhotoUrl(data.photoUrl) || toStoredPhotoUrl(currentUser.photoUrl);
      const displayPhoto = data.photoUrl
        ? `${resolvePhotoUrl(data.photoUrl)}?t=${Date.now()}`
        : savedPhotoUri;

      if (displayPhoto) {
        setPhotoUri(displayPhoto);
        setSavedPhotoUri(displayPhoto);
        setPhotoFailed(false);
      }

      if (setCurrentUser) {
        setCurrentUser({
          ...currentUser,
          ...data,
          _id: String(data._id || currentUser._id || userId),
          id: String(data._id || data.id || currentUser.id || userId),
          nombre: fieldsLocked ? currentUser.nombre : data.nombre ?? nombre.trim(),
          apellido: fieldsLocked ? currentUser.apellido : data.apellido ?? apellidoCompleto,
          apellidoPaterno: fieldsLocked
            ? currentUser.apellidoPaterno
            : data.apellidoPaterno ?? apellidoPaterno.trim(),
          apellidoMaterno: fieldsLocked
            ? currentUser.apellidoMaterno
            : data.apellidoMaterno ?? apellidoMaterno.trim(),
          email: fieldsLocked ? currentUser.email : data.email ?? email.trim(),
          contacto: fieldsLocked ? currentUser.contacto : data.contacto ?? contacto.trim(),
          rol: currentUser.rol,
          // Ruta relativa + cache-bust para que el header refresque la imagen
          photoUrl: storedPhoto ? `${storedPhoto}?t=${Date.now()}` : currentUser.photoUrl,
        });
      }

      const okMsg = fieldsLocked
        ? "Foto actualizada correctamente"
        : "Perfil actualizado correctamente";
      setFormOk(true);
      setFormMessage(okMsg);
      notify("Éxito", okMsg);
    } catch (error: any) {
      console.error(error);
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "No se pudo actualizar el perfil";
      setFormOk(false);
      setFormMessage(message);
      notify("Error", message);
    } finally {
      setIsSaving(false);
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
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scrollContent,
          isMobile && styles.scrollContentMobile,
          keyboardHeight > 0 && { paddingBottom: keyboardHeight + 48 },
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
                  ? "Actualiza tu foto · el resto lo gestiona un admin"
                  : "Actualiza tu información personal y foto"}
              </Text>
            </View>
            <View style={styles.roleBadge}>
              <FontAwesome5 name={roleIcon} size={10} color="#ffffff" />
              <Text style={styles.roleBadgeText}>{displayRole}</Text>
            </View>
          </View>

          <View
            style={[
              styles.profilePanel,
              isLargeScreen && styles.profilePanelDesktop,
              isMobile && styles.profilePanelMobile,
            ]}
          >
            <View style={[styles.avatarSection, isMobile && styles.avatarSectionMobile]}>
              <View style={styles.avatarWrap}>
                {photoUri && !photoFailed ? (
                  <Image
                    source={{ uri: photoUri }}
                    style={styles.avatarImage}
                    onError={() => setPhotoFailed(true)}
                  />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>{getInitials()}</Text>
                  </View>
                )}
                {hasPendingPhoto ? (
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>Nueva</Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.profileName} numberOfLines={2}>
                {[nombre, apellidoPaterno, apellidoMaterno].filter(Boolean).join(" ") || "Usuario"}
              </Text>
              <View style={styles.profileRolePill}>
                <FontAwesome5 name={roleIcon} size={10} color="#111111" />
                <Text style={styles.profileRolePillText}>{displayRole}</Text>
              </View>

              <View style={styles.photoActions}>
                <TouchableOpacity
                  style={styles.changePhotoButton}
                  onPress={pickFromGallery}
                  activeOpacity={0.85}
                >
                  <FontAwesome5 name="images" size={12} color="#111111" />
                  <Text style={styles.changePhotoText}>Galería</Text>
                </TouchableOpacity>
                {Platform.OS !== "web" ? (
                  <TouchableOpacity
                    style={styles.changePhotoButton}
                    onPress={takePhoto}
                    activeOpacity={0.85}
                  >
                    <FontAwesome5 name="camera" size={12} color="#111111" />
                    <Text style={styles.changePhotoText}>Cámara</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {hasPendingPhoto ? (
                <TouchableOpacity onPress={discardPendingPhoto} style={styles.discardLink}>
                  <Text style={styles.discardLinkText}>Descartar foto nueva</Text>
                </TouchableOpacity>
              ) : null}

              <Text style={styles.photoHint}>
                {hasPendingPhoto
                  ? "Foto lista · pulsa Guardar para subirla"
                  : Platform.OS === "web"
                    ? "JPG o PNG · se guarda al pulsar Guardar"
                    : "Elige galería o cámara · luego Guardar"}
              </Text>
              {fieldsLocked ? (
                <Text style={styles.photoHintLocked}>
                  Nombre, correo y contacto solo los cambia un administrador.
                </Text>
              ) : null}
            </View>

            <View style={[styles.formSection, isLargeScreen && styles.formSectionDesktop]}>
              <View style={styles.fieldStack}>
                <View style={styles.fieldFull}>
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
                <View style={isLargeScreen ? styles.fieldRow : styles.fieldStack}>
                  <View style={isLargeScreen ? styles.fieldHalf : styles.fieldFull}>
                    {renderField(
                      "Apellido paterno",
                      <TextInput
                        placeholder="Apellido paterno"
                        value={apellidoPaterno}
                        onChangeText={setApellidoPaterno}
                        returnKeyType="next"
                        {...inputProps}
                      />
                    )}
                  </View>
                  <View style={isLargeScreen ? styles.fieldHalf : styles.fieldFull}>
                    {renderField(
                      "Apellido materno",
                      <TextInput
                        placeholder="Apellido materno"
                        value={apellidoMaterno}
                        onChangeText={setApellidoMaterno}
                        returnKeyType="next"
                        {...inputProps}
                      />
                    )}
                  </View>
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
                <View
                  style={[
                    styles.formMessageBox,
                    formOk ? styles.formMessageBoxOk : styles.formMessageBoxErr,
                  ]}
                >
                  <FontAwesome5
                    name={formOk ? "check-circle" : "exclamation-circle"}
                    size={12}
                    color={formOk ? "#059669" : "#dc2626"}
                  />
                  <Text
                    style={[
                      styles.formMessage,
                      formOk ? styles.formMessageOk : styles.formMessageErr,
                    ]}
                  >
                    {formMessage}
                  </Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.saveButton,
                  (isSaving || (fieldsLocked && !hasPendingPhoto)) && styles.saveButtonDisabled,
                ]}
                onPress={handleSave}
                disabled={isSaving || (fieldsLocked && !hasPendingPhoto)}
                activeOpacity={0.85}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <FontAwesome5 name="save" size={14} color="#ffffff" />
                    <Text style={styles.saveButtonText}>
                      {fieldsLocked ? "Guardar foto" : "Guardar cambios"}
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
  avatarWrap: {
    position: "relative",
    marginBottom: 12,
  },
  avatarImage: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 3,
    borderColor: "#e5e7eb",
    backgroundColor: "#111111",
    overflow: "hidden",
  },
  avatarPlaceholder: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#e5e7eb",
  },
  avatarText: { color: "#ffffff", fontWeight: "800", fontSize: 34 },
  pendingBadge: {
    position: "absolute",
    right: -2,
    bottom: 4,
    backgroundColor: "#059669",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  pendingBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
  },
  profileName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111111",
    textAlign: "center",
    letterSpacing: 0.2,
    marginBottom: 8,
    maxWidth: 280,
  },
  profileRolePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 14,
  },
  profileRolePillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111111",
  },
  photoActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  changePhotoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#111111",
    backgroundColor: "#ffffff",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  changePhotoText: { color: "#111111", fontWeight: "700", fontSize: 13 },
  discardLink: { marginTop: 10 },
  discardLinkText: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  photoHint: {
    marginTop: 8,
    fontSize: 11,
    color: "#9ca3af",
    fontWeight: "600",
    textAlign: "center",
  },
  photoHintLocked: {
    marginTop: 6,
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "600",
    textAlign: "center",
    maxWidth: 260,
    lineHeight: 16,
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
    letterSpacing: 0.2,
    marginBottom: 6,
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
  formMessageBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  formMessageBoxErr: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  formMessageBoxOk: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
  },
  formMessage: { flex: 1, fontSize: 12, fontWeight: "600" },
  formMessageErr: { color: "#dc2626" },
  formMessageOk: { color: "#059669" },
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
  saveButtonDisabled: { opacity: 0.45 },
  saveButtonText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
});
