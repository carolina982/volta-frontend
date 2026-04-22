import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, View, } from "react-native";
import { Avatar, Button, TextInput } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { User } from "../types";

interface PerfilPageProps {
  currentUser: User | null;
  setCurrentUser?: (user: User) => void;
}

export default function PerfilPage({
  currentUser,
  setCurrentUser,
}: PerfilPageProps) {
  if (!currentUser) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0d75bb" />
        <Text>Cargando perfil...</Text>
      </View>
    );
  }

  const [nombre, setNombre] = useState(currentUser.nombre);
  const [apellido, setApellido] = useState(currentUser.apellido);
  const [rol, setRol] = useState<"Admin" | "Chofer">(currentUser.rol);
  const [email, setEmail] = useState(currentUser.email);
  const [contacto ,setContacto]=useState(currentUser.contacto);
  useEffect (()=> {
    if (currentUser){
      setContacto(currentUser.contacto || "");
      setNombre(currentUser.nombre || "");
      setApellido(currentUser.apellido || "");
      setEmail(currentUser.email || "");
      setRol(currentUser.rol || "Chofer");
    }
  },[currentUser]);
 
  const [photoUri, setPhotoUri] = useState<string | null>(
    currentUser.photoUrl
      ? `https://volta-backend-m25k.onrender.com${currentUser.photoUrl}`
      : null
  );
  const [isSaving, setIsSaving] = useState(false);
  


 const handleSave = async () => {
  setIsSaving(true);

  try {
    const formData = new FormData();

    formData.append("nombre", nombre);
    formData.append("apellido", apellido);
    formData.append("email", email);
    formData.append("rol", rol);
    formData.append("contacto",contacto);

    if (photoUri && photoUri.startsWith("file://")) {
      formData.append("photo", {
        uri: photoUri,
        name: "profile.jpg",
        type: "image/jpeg",
      } as any);
    }

    console.log("id",currentUser._id);
    const res=await fetch(`https://volta-backend-m25k.onrender.com/api/users/${currentUser._id}`,{
      method:"PATCH",
      body:formData,
    }
    );
    const data = await res.json();

   // actualizar usuario en app
    if (setCurrentUser) {
      setCurrentUser(data);
    }

    Alert.alert("Éxito", "Perfil actualizado correctamente");
  } catch (error) {
    console.log(error);
    Alert.alert("Error", "No se pudo actualizar el perfil");
  } finally {
    setIsSaving(false);
  }
};
  const pickerImage =async ()=>{
    const permission= await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted){
      Alert.alert("Permiso requerido","Necesitamos acceso a tus fotos");
      return;
    }
    const result =await ImagePicker.launchImageLibraryAsync({
      mediaTypes:ImagePicker.MediaTypeOptions.Images,
      quality:0.5,
    });
    if (!result.canceled){
      const uri=result.assets[0].uri;
      setPhotoUri(uri);
    }
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f5f7fa" }}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {photoUri ? (
          <Avatar.Image
            size={100}
            source={{ uri: photoUri }}
            style={styles.avatar}
          />
        ) : (
          <Avatar.Text
            size={100}
            label={(nombre ?? "")
              .split(" ")
              .map((n: string) => n[0])
              .join("")
              .toUpperCase()}
            style={styles.avatar}
          />
        )}

        <Button mode="outlined"style={styles.changePhotoButton}onPress={pickerImage }labelStyle={{ color: "#0d75bb" }}>
          Cambiar Imagen
        </Button>

        <Text style={styles.title}>Perfil</Text>
        <TextInput label="Nombre"value={nombre}onChangeText={setNombre}mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"textColor="#000"contentStyle={{ color: "#000", fontWeight: "600" }}style={styles.input}/>
        <TextInput label="Apellido"value={apellido}onChangeText={setApellido}mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"textColor="#000"contentStyle={{ color: "#000", fontWeight: "600" }} style={styles.input}/>
        <TextInput label="Email"value={email}onChangeText={setEmail}mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"textColor="#000"contentStyle={{ color: "#000", fontWeight: "600" }}style={styles.input}/>
        <TextInput label="Contacto"value={contacto}onChangeText={setContacto}mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"textColor="#000"contentStyle={{ color: "#000", fontWeight: "600" }}style={styles.input}/>
        <Text style={styles.rolLabel}>Rol</Text>
        <Picker selectedValue={rol}onValueChange={(value: "Admin" | "Chofer") => setRol(value)}style={styles.picker} mode={Platform.OS === "ios"?"dropdown":"dropdown"}>
          <Picker.Item label="Admin" value="Admin" />
          <Picker.Item label="Chofer" value="Chofer" />
        </Picker>
        <Button  mode="contained"buttonColor="#0d75bb"textColor="rgb(243, 246, 248)"style={styles.button}onPress={handleSave}loading={isSaving}>
          Guardar Cambios
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingContainer:{flex: 1,justifyContent: "center",alignItems: "center",},
  container:{padding: 20,paddingTop: 10,paddingBottom: 40,flexGrow: 1,backgroundColor: "#f5f7fa",},
  avatar:{backgroundColor: "#0d75bb", marginBottom: 10,alignSelf: "center" },
  changePhotoButton: {marginBottom: 20,borderColor: "#0d75bb",alignSelf: "center",},
  title: {fontSize: 24,fontWeight: "bold",marginBottom: 20,color: "#000",textAlign: "center",},
  input: {width: "100%",marginBottom: 15,backgroundColor: "transparent",borderRadius: 8,},
  rolLabel: {alignSelf: "flex-start",marginBottom: 5,color: "#000",fontWeight: "600",},
  picker: {width: "100%",marginBottom: 10,color: "#0d75bb",backgroundColor: "#fff", borderRadius: 8,},
  button: {width: "100%",marginTop: 20,},
});