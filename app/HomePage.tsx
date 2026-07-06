import { FontAwesome5 } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Button, Checkbox, FAB, Searchbar, Snackbar, TextInput } from "react-native-paper";
import { api, BASE_URL } from "../services/api";
import { User } from "../types";

interface Announcement {
  id: string;
  titulo: string;
  contenido: string;
  fecha: string;
  autor?: string;
  fijado?: boolean;
  image?: string | null;
}

interface HomePageProps {
  currentUser: User;
}

export default function HomePage({ currentUser }: HomePageProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  
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

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const loadAnnouncements = async () => {
    try {
      const res = await api.get("/announcements");
      const data = res.data.map((a: any) => ({
        ...a,
        id: a._id,
        fijado: a.fijado || false,
        autor: a.autor || "Administración",
        image: a.image ? `${BASE_URL.replace("/api", "")}${a.image}` : null,
      }));

      const sortedData = data.sort((a: Announcement, b: Announcement) => {
        if (a.fijado && !b.fijado) return -1;
        if (!a.fijado && b.fijado) return 1;
        return new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
      });

      setAnnouncements(sortedData);
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
      formData.append("autor", autor || `${currentUser.nombre} ${currentUser.apellido}`);
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

  const filteredAnnouncements = announcements.filter(a => 
    a.titulo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.contenido.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView 
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.welcomeBanner}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={styles.bannerTitle}>¡Hola, {currentUser.nombre}!</Text>
            <Text style={styles.bannerSubtitle}>Revisa los avisos importantes y circulares de la flota.</Text>
          </View>
          
          {isAdmin && Platform.OS === "web" && (
            <Button mode="contained" icon="plus" buttonColor="#0d75bb" textColor="#fff" onPress={openCreateModal}>
              Crear Aviso
            </Button>
          )}
        </View>

        <Searchbar
          placeholder="Buscar avisos por título o palabra clave..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
          inputStyle={{ minHeight: 45 }}
        />

        {loading ? (
          <View style={styles.centerSection}>
            <ActivityIndicator size="large" color="#007bff" />
            <Text style={{ marginTop: 12, color: "#64748b" }}>Sincronizando feed...</Text>
          </View>
        ) : filteredAnnouncements.length === 0 ? (
          <View style={styles.emptyContainer}>
            <FontAwesome5 name="search" size={50} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>No se encontraron avisos</Text>
            <Text style={styles.emptyText}>Prueba cambiando los términos de búsqueda.</Text>
          </View>
        ) : (
          <View style={Platform.OS === "web" ? styles.webGrid : styles.mobileStack}>
            {filteredAnnouncements.map((a) => (
              <View key={a.id} style={[styles.card, a.fijado && styles.cardPinned]}>
                {a.fijado && (
                  <View style={styles.pinnedBadge}>
                    <FontAwesome5 name="thumbtack" size={11} color="#fff" />
                    <Text style={styles.pinnedBadgeText}>IMPORTANTE</Text>
                  </View>
                )}

                {a.image && (
                  <Image source={{ uri: a.image }} style={styles.announcementImage} />
                )}
                
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>{a.titulo}</Text>
                  <View style={styles.dividerLine} />
                  <Text style={styles.cardBody}>{a.contenido}</Text>
                  
                  <View style={styles.cardMetaRow}>
                    <Text style={styles.metaText}>
                      <FontAwesome5 name="user" size={11} color="#94a3b8" /> Por: {a.autor}
                    </Text>
                    <Text style={styles.metaText}>
                      <FontAwesome5 name="calendar-alt" size={11} color="#94a3b8" /> {new Date(a.fecha).toLocaleDateString()}
                    </Text>
                  </View>

                 {isAdmin && (
                  <View style={styles.buttonsRow}>
                    <Button  mode="outlined" icon="pencil" textColor="#f39c12" style={[styles.actionButton, { borderColor: "#f39c12" }]} onPress={() => handleEdit(a)}{...(Platform.OS === 'web' ? { title: "Editar este anuncio" } : {})}>Editar
                    </Button>
                    <Button  mode="contained" icon="trash" buttonColor="#ef4444" textColor="#fff" style={styles.actionButton} onPress={() => handleDeleteConfirm(a.id)}{...(Platform.OS === 'web' ? { title: "Eliminar este anuncio" } : {})}> Eliminar
                 </Button>
                </View>
                 )}
                </View>
              </View>
            ))}
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {isAdmin && Platform.OS !== "web" && (
        <FAB icon="plus" style={styles.fab} color="#fff" onPress={openCreateModal} />
      )}

      <Modal visible={modalVisible} animationType="fade" transparent={true} onRequestClose={closeModal}>
        <View style={styles.modalBackground}>
          <View style={[styles.modalContainer, Platform.OS === "web" && styles.modalContainerWeb]}>
            <Text style={styles.modalTitle}>{editingId ? "⚙️ Modificar Aviso" : "📣 Publicar Nuevo Aviso"}</Text>
            
            {/* CORREGIDO */}
            <TextInput  label="Título del aviso *"value={titulo} onChangeText={setTitulo} mode="outlined" style={styles.input} error={showErrors && !titulo.trim()}activeOutlineColor="#0d75bb"/>
            <TextInput  label="Contenido / Cuerpo del mensaje *" value={contenido} onChangeText={setContenido}mode="outlined" multiline numberOfLines={5} style={styles.input} error={showErrors && !contenido.trim()}activeOutlineColor="#0d75bb"/>
            
            <Text style={styles.charCounter}>{contenido.length} caracteres registrados</Text>
            <TextInput  label="Autor del aviso *"value={autor} onChangeText={setAutor} mode="outlined" style={styles.input} activeOutlineColor="#0d75bb"/>

            <TouchableOpacity style={styles.checkboxContainer} onPress={() => setFijado(!fijado)}>
              <Checkbox status={fijado ? "checked" : "unchecked"} color="#0d75bb" />
              <Text style={styles.checkboxLabel}>Fijar este aviso en la parte superior</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: "row", gap: 10, marginBottom: 15 }}>
              <Button mode="contained-tonal" icon="image" style={{ flex: 1 }} onPress={() => handleSelectImage(false)}>
                {Platform.OS === "web" ? "Subir Archivo" : "Galería"}
              </Button>
              {Platform.OS !== "web" && (
                <Button mode="contained-tonal" icon="camera" style={{ flex: 1 }} onPress={() => handleSelectImage(true)}>
                  Cámara
                </Button>
              )}
            </View>

            {imageUri && (
              <View style={styles.previewContainer}>
                <Image source={{ uri: imageUri }} style={styles.previewImage} />
                <TouchableOpacity style={styles.removeImageBadge} onPress={() => { setImageUri(null); setImageFile(null); }}>
                  <FontAwesome5 name="times" size={12} color="#fff" />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.buttonsRow}>
              <Button mode="text" textColor="#64748b" style={{ flex: 1 }} onPress={closeModal} disabled={saving}>
                Cancelar
              </Button>
              <Button mode="contained" buttonColor="#007bff" style={{ flex: 1, marginLeft: 10 }} onPress={handleSaveAnnouncement} loading={saving} disabled={saving}>
                Guardar
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      <Snackbar visible={snackbarVisible} onDismiss={() => setSnackbarVisible(false)} duration={4000} style={{ backgroundColor: "#1e293b" }}>
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f6f9", paddingHorizontal: 15 },
  centerSection: { padding: 50, justifyContent: "center", alignItems: "center" },
  searchBar: { marginBottom: 20, backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#e2e8f0" },
  
  welcomeBanner: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#ffffff", padding: 20, borderRadius: 12, marginVertical: 20, borderWidth: 1, borderColor: "#e2e8f0" },
  bannerTitle: { fontSize: 22, fontWeight: "bold", color: "#1e293b" },
  bannerSubtitle: { fontSize: 14, color: "#64748b", marginTop: 4 },

  emptyContainer: { padding: 50, alignItems: "center", backgroundColor: "#ffffff", borderRadius: 12, borderWidth: 1, borderColor: "#e2e8f0" },
  emptyTitle: { fontSize: 17, fontWeight: "bold", color: "#475569", marginTop: 15 },
  emptyText: { fontSize: 13, color: "#94a3b8", textAlign: "center", marginTop: 5, maxWidth: 350 },

  webGrid: {flexDirection: "row",flexWrap: "wrap",gap: 20 },
  mobileStack: { flexDirection: "column", gap: 15 },
  card: {backgroundColor: "#fff",borderRadius: 12,overflow: "hidden",borderWidth: 1,borderColor: "#e2e8f0",position: "relative",elevation: 2,// CORREGIDO: Reemplazado calc() por porcentaje segurowidth: Platform.OS === "web" ? "31%" : "100%",minWidth: Platform.OS === "web" ? 300 : undefined{
    },
  cardPinned: { borderColor: "#0d75bb", borderWidth: 1.5, backgroundColor: "#f8fafc" },
  pinnedBadge: { position: "absolute", top: 12, left: 12, backgroundColor: "#0d75bb", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 5, zIndex: 10 },
  pinnedBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  
  announcementImage: { width: "100%", height: 190, resizeMode: "cover" },
  cardContent: { padding: 18 },
  cardTitle: { fontSize: 17, fontWeight: "bold", color: "#1e293b" },
  dividerLine: { height: 1, backgroundColor: "#e2e8f0", marginVertical: 10 },
  cardBody: { fontSize: 14, color: "#475569", lineHeight: 21 },
  cardMetaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 15, backgroundColor: "#f8fafc", padding: 8, borderRadius: 6 },
  metaText: { fontSize: 12, color: "#64748b", fontWeight: "500" },

  buttonsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 15 },
  actionButton: { flex: 1, marginHorizontal: 4, borderRadius: 8 },

  fab: { position: "absolute", margin: 20, right: 0, bottom: 20, backgroundColor: "#0d75bb" },

  modalBackground: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(15, 23, 42, 0.5)" },
  modalContainer: { width: "92%", backgroundColor: "#fff", padding: 25, borderRadius: 16, maxHeight: "90%" },
  modalContainerWeb: { maxWidth: 650 },
  modalTitle: { fontSize: 19, fontWeight: "bold", marginBottom: 18, color: "#1e293b" },
  input: { marginBottom: 12, backgroundColor: "#fff" },
  charCounter: { fontSize: 11, color: "#94a3b8", textAlign: "right", marginTop: -8, marginBottom: 12, marginRight: 4 },
  
  checkboxContainer: { flexDirection: "row", alignItems: "center", marginBottom: 15, marginLeft: -4 },
  checkboxLabel: { fontSize: 13, color: "#475569", fontWeight: "500" },
  
  previewContainer: { position: "relative", marginBottom: 15 },
  previewImage: { width: "100%", height: 190, borderRadius: 10, resizeMode: "cover" },
  removeImageBadge: { position: "absolute", top: 8, right: 8, backgroundColor: "rgba(239, 68, 68, 0.9)", width: 26, height: 26, borderRadius: 13, justifyContent: "center", alignItems: "center" }
});