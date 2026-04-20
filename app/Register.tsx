import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Alert, Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { TextInput } from "react-native-paper";
import { useStore } from "../context/Store";
import { api } from "../services/api";

export default function Register({ navigation }: any) {
  const { addUser } = useStore();

  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rol, setRol] = useState<"Admin" | "Chofer">("Chofer" );
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Función para abrir el selector de Rol tipo Menú
  const showRolPicker = () => {
    Alert.alert(
      "Selecciona tu rol",
      "Elige una opción:",
      [
        { text: "Chofer", onPress: () => setRol("Chofer") },
        { text: "Admin", onPress: () => setRol("Admin") },
        { text: "Cancelar", style: "cancel" },
      ]
    );
  };

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
    if (!email || !nombre || !apellido || !password || !confirmPassword || !rol) {
      Alert.alert("Error", "Todos los campos son obligatorios");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Error", "Las contraseñas no coinciden");
      return;
    }

    try {
      let res;
      if (photoUrl) {
        const formData = new FormData();
        formData.append("name", nombre+" "+apellido);
        //formData.append("apellido", apellido);
        formData.append("email", email.toLowerCase());
        formData.append("password", password);
        formData.append("rol", rol);
        if (Platform.OS === "web") {
          const response = await fetch(photoUrl);
          const blob = await response.blob();
          const filename = `imagen_${Date.now()}.jpg`;
          formData.append("imagenUrl", new File([blob], filename, { type: blob.type }));
          res = await api.post("/users/register", formData);
        } else {
          const uriParts = photoUrl.split(".");
          const fileType = uriParts[uriParts.length - 1];
          formData.append(
            "image",
            { uri: photoUrl, name: `imagen.${fileType}`, type: `image/${fileType}` } as any
          );
          res = await api.post("/users/register", formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        }
      } else {
        const newUser ={name:nombre+" "+apellido, email:email.toLocaleLowerCase(),password,role:rol}
        res = await api.post("/users/register", newUser);
      }

      if (res.status === 200 || res.status === 201) {
        Alert.alert("Éxito", "Usuario registrado correctamente");
        addUser(res.data);
        navigation.navigate("Login");
      } else {
        Alert.alert("Error", "No se pudo registrar el usuario");
      }
    } catch (error: any) {
      console.error("Error registrando usuario:", error.response || error);
      Alert.alert("Error", error.response?.data?.message || "Algo salió mal");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Registro</Text>
      
      <TextInput placeholder="Nombre" value={nombre} onChangeText={setNombre} mode="flat" underlineColor="#0d75bb" activeUnderlineColor="#0d75bb" contentStyle={{ color: "#000", fontWeight: "600" }} style={styles.input} />
      <TextInput placeholder="Apellido" value={apellido} onChangeText={setApellido} mode="flat" underlineColor="#0d75bb" activeUnderlineColor="#0d75bb" contentStyle={{ color: "#000", fontWeight: "600" }} style={styles.input} />
      <TextInput placeholder="Correo" value={email} onChangeText={setEmail} mode="flat" underlineColor="#0d75bb" activeUnderlineColor="#0d75bb" contentStyle={{ color: "#000", fontWeight: "600" }} style={styles.input} keyboardType="email-address" />
      
      <TextInput placeholder="Contraseña"  value={password} onChangeText={setPassword} mode="flat" underlineColor="#0d75bb" activeUnderlineColor="#0d75bb" contentStyle={{ color: "#000", fontWeight: "600" }}style={styles.input} secureTextEntry={!showPassword} right={<TextInput.Icon icon={showPassword ? "eye-off" : "eye"} color="#007bff" onPress={() => setShowPassword(!showPassword)} />} />
      
      <TextInput placeholder="Confirmar contraseña"  value={confirmPassword} onChangeText={setConfirmPassword} mode="flat" underlineColor="#0d75bb" activeUnderlineColor="#0d75bb" contentStyle={{ color: "#000", fontWeight: "600" }}style={styles.input} secureTextEntry={!showConfirmPassword} right={<TextInput.Icon icon={showConfirmPassword ? "eye-off" : "eye"} color="#007bff" onPress={() => setShowConfirmPassword(!showConfirmPassword)} />} />
      
      <Text style={styles.label}>Selecciona tu rol:</Text>
      
      {Platform .OS ===  "web" ? (
        <View style={styles.pickerContainer}>
          <Picker selectedValue={rol} onValueChange={(itemValue)=> setRol(itemValue)} style={styles.picker}>
            <Picker.Item label="Chofer" value="Chofer" />
            <Picker.Item label="Admin" value="Admin" />
          </Picker>
        </View>
      ):(
        <TouchableOpacity style={styles.customPicker} onPress={showRolPicker}>
          <Text style={styles.pickerText}>{rol}</Text>
          <Text style={styles.arrowIcon}>▼</Text>
        </TouchableOpacity>
      )
    }
      <View style={styles.photoButtons}>
        <TouchableOpacity style={styles.photoButton} onPress={pickImageFromGallery}>
          <Text style={styles.photoButtonText}>Elegir foto</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.photoButton} onPress={takePhoto}>
          <Text style={styles.photoButtonText}>Tomar foto</Text>
        </TouchableOpacity>
      </View>

      {photoUrl && <Image source={{ uri: photoUrl }} style={styles.avatarPreview} />}
      
      <TouchableOpacity style={styles.button} onPress={handleRegister}>
        <Text style={styles.buttonText}>Registrarse</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.registerButton} onPress={() => navigation.navigate("Login")}>
        <Text style={styles.registerText}>¿Ya tienes cuenta? Inicia Sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 50, paddingHorizontal: 20, backgroundColor: "#f5f5f5" },
  title: { fontSize: 28, fontWeight: "bold", marginBottom: 30, textAlign: "center" },
  label: { marginBottom: 8, fontWeight: 'bold', color: '#333' },
  input: { width: "100%", height: 50, backgroundColor: "transparent", marginBottom: 15 },
  customPicker:{width: "100%", height: 50,backgroundColor: "#fff",borderRadius: 10,borderWidth: 1,borderColor: "#0d75bb",flexDirection: "row",alignItems: "center",justifyContent: "space-between",paddingHorizontal: 15,marginBottom: 20},
  pickerText: { fontSize: 16, color: "#333" },
  arrowIcon: { color: "#0d75bb", fontSize: 12 },
  photoButtons: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  photoButton: { flex: 0.48, height: 45, backgroundColor: "#007bff", justifyContent: "center", alignItems: "center", borderRadius: 10 },
  photoButtonText: { color: "#fff", fontSize: 14, fontWeight: "bold" },
  avatarPreview: { width: 100, height: 100, borderRadius: 50, alignSelf: "center", marginVertical: 10 },
  button: { width: "100%", height: 50, backgroundColor: "#007bff", borderRadius: 10, justifyContent: "center", alignItems: "center", marginTop: 10 },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  registerButton: { marginTop: 15, alignItems: "center" },
  registerText: { color: "#007bff", fontSize: 16 },
  pickerContainer:{borderWidth:1, borderRadius:0.4,marginBottom:20},
  picker:{width:"100%",height:25},
});