import { FontAwesome5 } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Animated, Image, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput as RNTextInput, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { Checkbox, Portal, Snackbar, TextInput } from "react-native-paper";
import { api, BASE_URL } from "../services/api";
import { User } from "../types";

interface Announcement {
  id: string;
  titulo: string;
  contenido: string;
  fecha: string;
  autor?: string;
  autorPhotoUrl?: string | null;
  fijado?: boolean;
  image?: string | null;
}

interface HomePageProps {
  currentUser: User;
}

export default function HomePage({ currentUser }: HomePageProps) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [contenido, setContenido] = useState("");
  const [autor, setAutor] = useState("");
  const [fijado, setFijado] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [showErrors, setShowErrors] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");

  const isAdmin = currentUser.rol?.toLowerCase() === "admin";

  const fadeAnim=React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadAnnouncements();
  }, []);

  useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Si presiona Ctrl + N (o Cmd + N en Mac)
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      // Solo abrimos si el modal no está abierto ya para evitar duplicados
      if (isAdmin && !modalVisible) openCreateModal();
    }
  };

  if (Platform.OS === 'web') {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }
}, [isAdmin, modalVisible]); // Agregué modalVisible como dependencia para mayor seguridad

const loadAnnouncements = async () => {
    try {
      const res = await api.get("/announcements");
      const mediaBase = BASE_URL.replace(/\/api\/?$/, "");
      const resolveUrl = (url?: string | null) => {
        if (!url) return null;
        if (url.startsWith("http")) return url;
        return `${mediaBase}${url.startsWith("/") ? url : `/${url}`}`;
      };

      const data = res.data.map((a: any) => ({
        ...a,
        id: a._id,
        fijado: a.fijado || false,
        autor: a.autor || "Administración",
        autorPhotoUrl: resolveUrl(a.autorPhotoUrl),
        image: resolveUrl(a.image),
      }));

      const sortedData = data.sort((a: Announcement, b: Announcement) => {
        if (a.fijado && !b.fijado) return -1;
        if (!a.fijado && b.fijado) return 1;
        return new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
      });

      setAnnouncements(sortedData);

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    } catch (error) {
      console.error("Error cargando anuncios", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadAnnouncements();
  };

  const modalInputProps = {
    mode: "flat" as const,
    underlineColor: "transparent",
    activeUnderlineColor: "transparent",
    dense: true,
    contentStyle: styles.modalInputContent,
    style: styles.modalInput,
    placeholderTextColor: "#9ca3af",
  };

  const renderModalField = (label: string, field: React.ReactNode) => (
    <View style={styles.modalFieldGroup}>
      <Text style={styles.modalFieldLabel}>{label}</Text>
      {field}
    </View>
  );

  const handleSelectImage = async (useCamera = false) => {
    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = (e: any) => {
        const file = e.target.files[0];
        if (file) {
          setImageFile(file);
          setImageUri(URL.createObjectURL(file));
        }
      };
      input.click();
      return;
    }

    if (useCamera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return Alert.alert("Permiso requerido", "Se necesita acceso a la cámara.");
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true });
      if (!result.canceled) setImageUri(result.assets[0].uri);
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return Alert.alert("Permiso requerido", "Se necesita acceso a la galería.");
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, allowsEditing: true });
      if (!result.canceled) setImageUri(result.assets[0].uri);
    }
  };

  const handleSaveAnnouncement = async () => {
    if (!titulo.trim() || !contenido.trim()) {
      setShowErrors(true);
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("titulo", titulo);
      formData.append("contenido", contenido);
      formData.append("autor", autor || `${currentUser.nombre} ${currentUser.apellido}`.trim());
      formData.append("autorPhotoUrl", currentUser.photoUrl || "");
      formData.append("fijado", String(fijado));

      if (Platform.OS === "web") {
        if (imageFile) formData.append("image", imageFile);
      } else if (imageUri && !imageUri.startsWith("http")) {
        const filename = imageUri.split("/").pop() || "imagen.jpg";
        formData.append("image", {
          uri: imageUri,
          name: filename,
          type: "image/jpeg",
        } as any);
      }

      const url = editingId ? `/announcements/${editingId}` : "/announcements";
      await api({
        method: editingId ? "put" : "post",
        url,
        data: formData,
        headers: { "Content-Type": "multipart/form-data" },
      });

      showFeedback(editingId ? "¡Aviso actualizado!" : "¡Aviso publicado!");
      await loadAnnouncements();
      closeModal();
    } catch (error) {
      console.error(error);
      showFeedback("Hubo un error al procesar el aviso.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = (id: string) => {
    if (Platform.OS === "web") {
      if (confirm("¿Estás seguro de que deseas eliminar este aviso?")) deleteAnnouncement(id);
    } else {
      Alert.alert(
        "Confirmar eliminación",
        "Esta acción quitará el aviso de forma permanente.",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Eliminar", style: "destructive", onPress: () => deleteAnnouncement(id) }
        ]
      );
    }
  };

  const deleteAnnouncement = async (id: string) => {
    try {
      await api.delete(`/announcements/${id}`);
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
      showFeedback("Aviso eliminado");
    } catch (error) {
      console.error(error);
    }
  };

  const openCreateModal = () => {
    setTitulo("");
    setContenido("");
    setAutor(`${currentUser.nombre} ${currentUser.apellido}`);
    setFijado(false);
    setImageUri(null);
    setImageFile(null);
    setEditingId(null);
    setShowErrors(false);
    setModalVisible(true);
  };

  const handleEdit = (a: Announcement) => {
    setTitulo(a.titulo);
    setContenido(a.contenido);
    setAutor(a.autor || "");
    setFijado(a.fijado || false);
    setImageUri(a.image || null);
    setEditingId(a.id);
    setShowErrors(false);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingId(null);
  };

  const showFeedback = (msg: string) => {
    setSnackbarMessage(msg);
    setSnackbarVisible(true);
  };

  const filteredAnnouncements = announcements;

  const renderModalContent = () => (
    <View
      style={styles.modalCard}
      onStartShouldSetResponder={() => true}
      {...(Platform.OS === "web" ? { onClick: (e: any) => e.stopPropagation() } : {})}
    >
      <View style={styles.modalHeader}>
        <View style={styles.modalHeaderLeft}>
          <View style={styles.modalIconBadge}>
            <FontAwesome5 name="bullhorn" size={16} color="#ffffff" />
          </View>
          <View>
            <Text style={styles.modalTitle}>{editingId ? "Editar Aviso" : "Nuevo Aviso"}</Text>
            <Text style={styles.modalSubtitle}>
              {editingId ? "Actualiza el contenido del aviso" : "Publica un aviso para la flota"}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.modalCloseButton} onPress={closeModal} disabled={saving} activeOpacity={0.85}>
          <FontAwesome5 name="times" size={14} color="#6b7280" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
        {renderModalField(
          "Título",
          <TextInput
            placeholder="Título del aviso"
            value={titulo}
            onChangeText={setTitulo}
            error={showErrors && !titulo.trim()}
            {...modalInputProps}
          />
        )}
        {renderModalField(
          "Contenido",
          <TextInput
            placeholder="Cuerpo del mensaje"
            value={contenido}
            onChangeText={setContenido}
            multiline
            numberOfLines={5}
            error={showErrors && !contenido.trim()}
            {...modalInputProps}
            style={[styles.modalInput, styles.modalInputMultiline]}
          />
        )}
        <Text style={styles.charCounter}>{contenido.length} caracteres</Text>

        {renderModalField(
          "Autor",
          <TextInput placeholder="Nombre del autor" value={autor} onChangeText={setAutor} {...modalInputProps} />
        )}

        <TouchableOpacity style={styles.checkboxContainer} onPress={() => setFijado(!fijado)} activeOpacity={0.85}>
          <Checkbox status={fijado ? "checked" : "unchecked"} color="#111111" />
          <Text style={styles.checkboxLabel}>Fijar aviso en la parte superior</Text>
        </TouchableOpacity>

        <View
          {...(Platform.OS === "web"
            ? {
                onDragOver: (e: any) => e.preventDefault(),
                onDrop: (e: any) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) {
                    setImageFile(file);
                    setImageUri(URL.createObjectURL(file));
                  }
                },
              }
            : {})}
          style={styles.dropZone}
        >
          <FontAwesome5 name="cloud-upload-alt" size={22} color="#9ca3af" />
          <Text style={styles.dropZoneText}>
            {Platform.OS === "web" ? "Arrastra una imagen o selecciona archivo" : "Adjunta una imagen al aviso"}
          </Text>
          <View style={styles.modalBtnRow}>
            <TouchableOpacity style={styles.modalBtn} onPress={() => handleSelectImage(false)} activeOpacity={0.85}>
              <Text style={styles.modalBtnText}>{Platform.OS === "web" ? "Subir archivo" : "Galería"}</Text>
            </TouchableOpacity>
            {Platform.OS !== "web" && (
              <TouchableOpacity style={styles.modalBtn} onPress={() => handleSelectImage(true)} activeOpacity={0.85}>
                <Text style={styles.modalBtnText}>Cámara</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {imageUri && (
          <View style={styles.previewContainer}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
            <TouchableOpacity
              style={styles.removeImageBadge}
              onPress={() => { setImageUri(null); setImageFile(null); }}
              activeOpacity={0.85}
            >
              <FontAwesome5 name="times" size={12} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <View style={styles.modalActions}>
        <TouchableOpacity style={styles.cancelButton} onPress={closeModal} disabled={saving} activeOpacity={0.85}>
          <Text style={styles.cancelButtonText}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSaveAnnouncement}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.saveButtonText}>Guardar</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          Platform.OS === "web"
            ? undefined
            : <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#111111" />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.pageHeader, isMobile && styles.pageHeaderMobile]}>
          <View style={styles.pageHeaderText}>
            <Text style={styles.pageTitle}>¡Hola, {currentUser.nombre}!</Text>
            <Text style={styles.subtitle}>Revisa los avisos importantes y circulares de la flota.</Text>
          </View>
          {isAdmin && !isMobile ? (
            <TouchableOpacity
              style={styles.addButton}
              onPress={openCreateModal}
              activeOpacity={0.85}
            >
              <FontAwesome5 name="plus" size={13} color="#ffffff" />
              <Text style={styles.addButtonText}>Crear Aviso</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {isAdmin && isMobile ? (
          <TouchableOpacity
            style={[styles.addButton, styles.addButtonMobile]}
            onPress={openCreateModal}
            activeOpacity={0.85}
          >
            <FontAwesome5 name="plus" size={13} color="#ffffff" />
            <Text style={styles.addButtonText}>Crear Aviso</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.listPanel}>
          {!loading && filteredAnnouncements.length > 0 && (
            <View style={styles.listHeader}>
              <Text style={styles.listHeaderTitle}>{filteredAnnouncements.length} avisos</Text>
            </View>
          )}

          {loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color="#111111" />
              <Text style={styles.emptyText}>Sincronizando avisos...</Text>
            </View>
          ) : filteredAnnouncements.length === 0 ? (
            <View style={styles.emptyState}>
              <FontAwesome5 name="bullhorn" size={24} color="#9ca3af" />
              <Text style={styles.emptyTitle}>No hay avisos</Text>
              <Text style={styles.emptyText}>
                {isAdmin ? 'Pulsa "Crear Aviso" para publicar el primero.' : "Aún no hay circulares publicadas."}
              </Text>
            </View>
          ) : (
            <View style={isMobile ? styles.mobileStack : styles.webGrid}>
              {filteredAnnouncements.map((a) => (
                <Animated.View
                  key={a.id}
                  style={{
                    opacity: fadeAnim,
                    transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
                    width: isMobile ? "100%" : "32%",
                    minWidth: isMobile ? undefined : 280,
                  }}
                >
                  <View style={[styles.card, a.fijado && styles.cardPinned]}>
                    {a.fijado && (
                      <View style={styles.pinnedBadge}>
                        <FontAwesome5 name="thumbtack" size={10} color="#111111" />
                        <Text style={styles.pinnedBadgeText}>IMPORTANTE</Text>
                      </View>
                    )}

                    {a.image && <Image source={{ uri: a.image }} style={styles.announcementImage} />}

                    <View style={styles.cardContent}>
                      <Text style={styles.cardTitle}>{a.titulo}</Text>
                      <Text style={styles.cardBody} numberOfLines={4}>{a.contenido}</Text>

                      <View style={styles.cardMetaRow}>
                        <View style={styles.authorRow}>
                          {a.autorPhotoUrl ? (
                            <Image source={{ uri: a.autorPhotoUrl }} style={styles.authorAvatar} />
                          ) : (
                            <View style={styles.authorAvatarFallback}>
                              <Text style={styles.authorAvatarInitials}>
                                {(a.autor || "A")
                                  .split(" ")
                                  .filter(Boolean)
                                  .slice(0, 2)
                                  .map((p) => p[0]?.toUpperCase() || "")
                                  .join("") || "A"}
                              </Text>
                            </View>
                          )}
                          <View style={styles.authorTextWrap}>
                            <Text style={styles.authorName} numberOfLines={2}>
                              {a.autor || "Administración"}
                            </Text>
                            <Text style={styles.metaText}>
                              {new Date(a.fecha).toLocaleDateString("es-MX", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {isAdmin && (
                        <View style={styles.cardActions}>
                          <TouchableOpacity style={styles.iconAction} onPress={() => handleEdit(a)} activeOpacity={0.85}>
                            <FontAwesome5 name="pen" size={12} color="#111111" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.iconAction, styles.iconActionDanger]}
                            onPress={() => handleDeleteConfirm(a.id)}
                            activeOpacity={0.85}
                          >
                            <FontAwesome5 name="trash-alt" size={12} color="#dc2626" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                </Animated.View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {Platform.OS === "web" && modalVisible ? (
        <Portal>
          <View style={styles.modalBackground} {...(Platform.OS === "web" ? { onClick: closeModal } : {})}>
            {renderModalContent()}
          </View>
        </Portal>
      ) : (
        <Modal visible={modalVisible} animationType="fade" transparent onRequestClose={closeModal}>
          <View style={styles.modalBackground}>{renderModalContent()}</View>
        </Modal>
      )}

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={4000}
        style={{ backgroundColor: "#111111" }}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  scrollContent: { paddingVertical: 4, paddingBottom: 24 },
  pageHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 12,
    flexWrap: "wrap",
  },
  pageHeaderMobile: {
    marginBottom: 12,
    flexWrap: "nowrap",
  },
  pageHeaderText: { flex: 1, minWidth: 180 },
  pageTitle: { fontSize: 24, fontWeight: "800", color: "#111111", letterSpacing: 0.2 },
  subtitle: { fontSize: 13, color: "#6b7280", marginTop: 4 },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#111111",
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 999,
    flexShrink: 0,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  addButtonMobile: {
    width: "100%",
    alignSelf: "stretch" as const,
    paddingVertical: 14,
    marginBottom: 14,
  },
  addButtonText: { color: "#ffffff", fontWeight: "700", fontSize: 13 },
  listPanel: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    ...(Platform.OS === "web" ? { boxShadow: "0 8px 24px rgba(0,0,0,0.04)" as any } : {}),
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  listHeaderTitle: { fontSize: 14, fontWeight: "700", color: "#111111" },
  listHeaderHint: { fontSize: 12, color: "#9ca3af", fontWeight: "600" },
  emptyState: { paddingVertical: 48, paddingHorizontal: 20, alignItems: "center", gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#111111" },
  emptyText: { fontSize: 14, color: "#64748b", textAlign: "center" },
  mobileStack: { flexDirection: "column", gap: 12 },
  webGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: {
    backgroundColor: "#fafafa",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    position: "relative",
  },
  cardPinned: { borderColor: "#111111", borderWidth: 1.5 },
  pinnedBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#111111",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    zIndex: 10,
  },
  pinnedBadgeText: { color: "#111111", fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  announcementImage: { width: "100%", height: 160, resizeMode: "cover" },
  cardContent: { padding: 14 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#111111", marginBottom: 8 },
  cardBody: { fontSize: 13, color: "#4b5563", lineHeight: 20 },
  cardMetaRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  authorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e5e7eb",
  },
  authorAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },
  authorAvatarInitials: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  authorTextWrap: { flex: 1, minWidth: 0 },
  authorName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111111",
    marginBottom: 2,
  },
  metaText: { fontSize: 11, color: "#6b7280", fontWeight: "600" },
  cardActions: { flexDirection: "row", gap: 8, justifyContent: "flex-end", marginTop: 12 },
  iconAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  iconActionDanger: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },

  modalBackground: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 20,
    ...(Platform.OS === "web" ? { position: "fixed" as any, zIndex: 9999 } : {}),
  },
  modalCard: {
    width: Platform.OS === "web" ? 560 : "96%",
    maxHeight: Platform.OS === "web" ? ("90vh" as any) : "92%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    ...(Platform.OS === "web" ? { boxShadow: "0 20px 50px rgba(0,0,0,0.18)" as any } : {}),
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  modalHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, paddingRight: 12 },
  modalIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#111111" },
  modalSubtitle: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  modalScroll: { flexGrow: 0, flexShrink: 1 },
  modalScrollContent: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 20 },
  modalFieldGroup: { marginBottom: 14 },
  modalFieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  modalInput: {
    width: "100%",
    backgroundColor: "#fafafa",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  modalInputMultiline: { minHeight: 110 },
  modalInputContent: { color: "#111111", fontWeight: "600", fontSize: 14 },
  charCounter: { fontSize: 11, color: "#9ca3af", textAlign: "right", marginTop: -8, marginBottom: 12 },
  checkboxContainer: { flexDirection: "row", alignItems: "center", marginBottom: 14, marginLeft: -4 },
  checkboxLabel: { fontSize: 13, color: "#374151", fontWeight: "600" },
  dropZone: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#d1d5db",
    padding: 16,
    borderRadius: 12,
    marginBottom: 14,
    backgroundColor: "#fafafa",
    alignItems: "center",
    gap: 8,
  },
  dropZoneText: { fontSize: 13, color: "#6b7280", textAlign: "center" },
  modalBtnRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  modalBtn: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#111111",
    backgroundColor: "#ffffff",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  modalBtnText: { color: "#111111", fontWeight: "700", fontSize: 12 },
  previewContainer: { position: "relative", marginBottom: 8 },
  previewImage: { width: "100%", height: 160, borderRadius: 10, resizeMode: "cover" },
  removeImageBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#111111",
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 22,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#111111",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  cancelButtonText: { color: "#111111", fontWeight: "700", fontSize: 14 },
  saveButton: {
    flex: 1,
    backgroundColor: "#111111",
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: "#ffffff", fontWeight: "700", fontSize: 14 },
});