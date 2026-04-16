import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import { Alert, Button, Image, StyleSheet, Text, View } from "react-native";
import { User } from "../app/types";

interface ProfileTabProps {
  currentUser: User;
}

export default function ProfileTab({ currentUser }: ProfileTabProps) {
  const [photoUri, setPhotoUri] = useState<string | null>(currentUser.photoUrl || null);

  const pickImage = async () => {

    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert("Permiso denegado", "Se requiere acceso a la galería para subir una foto.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri); 
    }
  };

  return (
    <View style={styles.container}>
      <Image
        source={{ uri: photoUri || "https://via.placeholder.com/120" }}
        style={styles.photo}
      />
      <Button title="Cambiar Foto" onPress={pickImage} />
      <Text style={styles.label}>Nombre:</Text>
      <Text style={styles.value}>{currentUser.nombre}</Text>
      <Text style={styles.label}>Email:</Text>
      <Text style={styles.value}>{currentUser.email}</Text>
      <Text style={styles.label}>Rol:</Text>
      <Text style={styles.value}>{currentUser.rol}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", padding: 16 },
  photo: {width: 120,height: 120,borderRadius: 60,marginBottom: 16,backgroundColor: "#ccc",},
  label: {fontWeight: "bold",marginTop: 12, },
  value: {fontSize:16,},
});