import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import { Alert, Image, Modal, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, TextInput } from "react-native-paper";
import { api, BASE_URL } from "../services/api";
import { User } from "./types";

interface Announcement {
  id: string;
  titulo: string;
  contenido: string;
  fecha: string;
  image?: string | null;
}

interface HomePageProps {
  currentUser: User;
}
export default function HomePage({ currentUser }: HomePageProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [contenido, setContenido] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null); // solo web
  useEffect(() => {
    loadAnnouncements();
  }, []);
  const loadAnnouncements = async () => {
    try {
      const res = await api.get("/announcements");
      setAnnouncements(
        res.data.map((a: any) => ({
          ...a,
          id: a._id,
          image: a.image ? `${BASE_URL.replace("/api", "")}${a.image}`: null,
        }))
      );
    } catch (error) {
      console.error("Error cargando anuncios", error);
      Platform.OS === "web"
        ? alert("No se pudieron cargar los anuncios")
        : Alert.alert("Error", "No se pudieron cargar los anuncios");
    }
  };
  const handleSelectImage =async()=>{
    try{
      //pedir permiso
       const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
       if (!permission.granted){
        Alert.alert("Permiso requerido", "se necesita acceso a la galeria");
        return;
       }
       const result =await ImagePicker.launchImageLibraryAsync({
        mediaTypes:ImagePicker.MediaTypeOptions.Images,
        quality:0.7,
        allowsEditing:true,
        });
        if (!result.canceled){
          const uri=result.assets[0].uri;
          setImageUri(uri);
        }
    }catch (error){
      console.error(error);
      Alert.alert("Error","No se pudo seleccionar la imagen")
    }
  }
  const handleSaveAnnouncement = async () => {
    if (!titulo || !contenido) {
      Platform.OS === "web"
        ? alert("Completa todos los campos")
        : Alert.alert("Error", "Completa todos los campos");
      return;
    }
    try {
      const formData = new FormData();
      formData.append("titulo", titulo);
      formData.append("contenido", contenido);
      if (Platform.OS === "web") {
        if (imageFile) formData.append("image", imageFile);
      } else {
        if (imageUri && !imageUri.startsWith("http")){
          const filename =imageUri.split("/").pop() || "imagen.jpg";
          formData.append ("image",{
            uri:imageUri,
            name:filename,
            type:"imqge/jpeg",
          } as any);
        }
      }
      const url = editingId ? `/announcements/${editingId}` : "/announcements";
      const res = await api({
        method: editingId ? "put" : "post",
        url,
        data: formData,
        headers: { "Content-Type": "multipart/form-data" },
      });
      const savedAnnouncement = res.data;
      const updatedAnnouncement: Announcement = {
        id: savedAnnouncement._id,
        titulo: savedAnnouncement.titulo,
        contenido: savedAnnouncement.contenido,
        fecha: savedAnnouncement.fecha,
        image: savedAnnouncement.image
          ? `${BASE_URL.replace("/api", "")}${savedAnnouncement.image}`
          : null,
      };

      setAnnouncements((prev) =>
        editingId
          ? prev.map((a) => (a.id === editingId ? updatedAnnouncement : a))
          : [updatedAnnouncement, ...prev]
      );
      setModalVisible(false);
      setTitulo("");
      setContenido("");
      setImageUri(null);
      setImageFile(null);
      setEditingId(null);

      const successMsg = editingId ? "Anuncio actualizado" : "Anuncio creado";
      Platform.OS === "web" ? alert(successMsg) : Alert.alert("Éxito", successMsg);
    } catch (error) {
      console.error("Error guardando anuncio", error);
      Platform.OS === "web"
        ? alert("No se pudo guardar el anuncio")
        : Alert.alert("Error", "No se pudo guardar el anuncio");
    }
  };

  const handleEdit = (a: Announcement) => {
    setTitulo(a.titulo);
    setContenido(a.contenido);
    if (Platform.OS === "web") {
      setImageFile(null);
    } else {
      setImageUri(a.image || null);
    }
    setEditingId(a.id);
    setModalVisible(true);
  };
  const deleteAnnouncement = async (id: string) => {
    try {
      await api.delete(`/announcements/${id}`);
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } catch (error) {
      console.error("Error eliminando anuncio", error);
      Platform.OS === "web"
        ? alert("No se pudo eliminar anuncio")
        : Alert.alert("Error", "No se pudo eliminar anuncio");
    }
  };
  
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Bienvenidos</Text>
      {announcements.map((a) => (
        <View key={a.id} style={styles.card}>
          <Text style={styles.cardTitle}>{a.titulo}</Text>
          <Text>{a.contenido}</Text>
          {a.image && (
            <Image
              source={{ uri: a.image }}
              style={styles.announcementImage}
            />
          )}
          <Text style={styles.date}>{new Date(a.fecha).toLocaleDateString()}</Text>
          {currentUser.rol?.toLowerCase() === "admin" && (
            <View style={styles.buttonsRow}>
              <Button mode="contained"buttonColor="#f39c12"textColor="rgb(243, 246, 248)"style={styles.actionButton}onPress={() => handleEdit(a)}>Editar</Button>
              <Button mode="contained"buttonColor="red"textColor="rgb(243, 246, 248)"style={styles.actionButton}onPress={() => deleteAnnouncement(a.id)}>Eliminar</Button>
            </View>
          )}
        </View>
      ))}
      {currentUser.rol?.toLowerCase() === "admin" && (
        <Button mode="contained"buttonColor="#0d75bb"textColor="rgb(243, 246, 248)"style={styles.createButton}onPress={() => {
            setTitulo(""); setContenido("");
            setImageUri(null); setImageFile(null);
            setEditingId(null); setModalVisible(true);
          }} >
          Crear Aviso
        </Button>
      )}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalBackground}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>{editingId ? "Editar Anuncio" : "Nuevo Anuncio"}</Text>
            <TextInput label="Titulo"value={titulo}onChangeText={setTitulo}mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"textColor="#000"contentStyle={{ color: "#000", fontWeight: "600" }}style={styles.input}/>
            <TextInput label="Contenido"value={contenido}onChangeText={setContenido}mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"multiline textColor="#000"contentStyle={{ color: "#000", fontWeight: "600" }}style={styles.input}/>
            <Button mode="contained"
              buttonColor={imageUri || imageFile ? "#28a745" : "#007bff"}
              style={{ marginBottom: 10 }}
              onPress={handleSelectImage} textColor="rgb(243, 246, 248)"
            >
              {imageUri || imageFile ? "Cambiar Imagen" : "Agregar Imagen"}
            </Button>
            {(imageUri || imageFile) && (
              <Image source={{uri:Platform.OS === "web"?imageFile ?URL.createObjectURL(imageFile):undefined :imageUri || undefined,}} style={styles.previewImage}/>
            )}
            <View style={styles.buttonsRow}>
              <Button mode="contained"buttonColor="#888" textColor="rgb(243, 246, 248)"
                onPress={()=>{setModalVisible(false);setEditingId(null);setImageUri(null);setImageFile(null)}}>Cancelar
              </Button>
              <Button mode="contained" buttonColor="#007bff"textColor="rgb(243, 246, 248)" onPress={handleSaveAnnouncement}>Guardar</Button>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

 const styles = StyleSheet.create({
  container: { flex: 1, padding: 15, backgroundColor: "#f5f5f5" },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 15, textAlign: "center" },
  card: { backgroundColor: "#fff", padding: 12, borderRadius: 8, marginBottom: 15 },
  cardTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 5 },
  date: { fontSize: 12, color: "#666", marginTop: 5 },
  buttonsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  actionButton: { flex: 1, marginHorizontal: 5 },
  createButton: { marginTop: 20 , },
  modalBackground: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContainer: { width: "90%", backgroundColor: "#fff", padding: 20, borderRadius: 10 },
  modalTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 15, textAlign: "center" },
  input: { marginBottom: 15, backgroundColor: "#fff" ,},
  announcementImage: {width: "100%",height: 180,aspectRatio: 1.6, borderRadius: 10,resizeMode: "contain",marginTop: 10,backgroundColor: "",},
  previewImage: {width: "100%",height:150, aspectRatio: 1.6,borderRadius: 10,resizeMode: "contain",marginBottom:10 , backgroundColor:"",}
});