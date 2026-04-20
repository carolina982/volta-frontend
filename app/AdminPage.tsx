import { Picker } from "@react-native-picker/picker";
import React, { useEffect, useState } from "react";
import { Alert, FlatList, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Button, TextInput } from "react-native-paper";
import { api } from "../services/api";
import { User } from "../types";

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [initialUserSnapshot, setInitialUserSnapshot] = useState<Partial<User>>({});

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const res = await api.get("/users");
      setUsers(res.data);
    } catch (error) {
      console.error("Error cargando usuarios", error);
    }
  };
  const handleEdit = (user?: User) => {
    if (user) {
      setEditingUser({ ...user });
      setInitialUserSnapshot({ ...user });
      setIsAdding(false);
    } else {
      const newUser: Partial<User> = {
        nombre: "",
        apellido: "",
        email: "",
        password: "",
        rol: "Chofer",
        photoUrl: null,
      };
      setEditingUser(newUser as User);
      setInitialUserSnapshot({ ...newUser });
      setIsAdding(true);
    }
    setModalVisible(true);
  };

  const saveChanges = async () => {
    if (!editingUser) return;
    const {nombre, apellido, email, password, rol, photoUrl,_id } = editingUser;
    if (!nombre || !apellido || !email || (!password && isAdding) || !rol) {
      Alert.alert("Error", "Todos los campos obligatorios deben estar completos");
      return;
    }
    try {
      if (isAdding) {
        await api.post("/users", { nombre, apellido, email, password, rol, photoUrl });
        Alert.alert("Éxito", "Usuario creado correctamente");
      } else {
        const changedFields: Partial<User> = {};
        if (nombre !== initialUserSnapshot.nombre) changedFields.nombre = nombre;
        if (apellido !== initialUserSnapshot.apellido) changedFields.apellido = apellido;
        if (email !== initialUserSnapshot.email) changedFields.email = email;
        if (rol !== initialUserSnapshot.rol) changedFields.rol = rol;
        if (password) changedFields.password = password;

        if (Object.keys(changedFields).length === 0) {
          Alert.alert("Info", "No se realizaron cambios");
        } else {
          await api.patch(`/users/${_id}`, changedFields);
          Alert.alert("Éxito", "Usuario actualizado correctamente");
        }
      }
      await loadUsers();
      setModalVisible(false);
      setEditingUser(null);
      setIsAdding(false);
    } catch (error) {
      console.error("Error guardando usuario", error);
      Alert.alert("Error", "No se pudo guardar el usuario");
    }
  };
const deleteUser =async (id:string)=>{
  let confirmed = false ;
  if (Platform.OS === "web"){
    confirmed=window.confirm("¿Desea eliminar este usuario?");
    if (!confirmed) return ;
  }else {
    confirmed =await new  Promise<boolean>((resolve)=>{
      Alert.alert("Confirmar", "¿Desea eliminar este usuario?",[
        {text:"Cancelar", style:"cancel" , onPress:()=>resolve (false)},
        {text:"Eliminar", style:"destructive", onPress:()=>resolve(true)},
      ],
      {cancelable:true}
    );
    });
    if (!confirmed)return;
  }
  try {
    const res =await api.delete(`/users/${id}`);
    setUsers((prevUsers)=>prevUsers.filter((u)=>u._id !== id));
    Alert.alert("Exito","Usuario eliminando correctamente");
  }catch (error:any){
    console.error("Error  eliminando usuario",error);
    Alert.alert("Error","No se pudo eliminar el usuario");
  }
};
  const renderItem = ({ item }: { item: User }) => (
    <View style={styles.userCard}>
      <View style={styles.userInfo}>
        <Text style={styles.name} numberOfLines={2}>{item.nombre} {item.apellido}</Text>
        <Text style={styles.email} numberOfLines={2}>{item.email}</Text>
        <Text style={styles.role}>Rol: {item.rol}</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.editButton} onPress={() => handleEdit(item)}>
          <Text style={styles.actionText}>Editar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteButton} onPress={()=>deleteUser(item._id)}>
          <Text style={styles.actionText}>Eliminar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Usuarios Registrados</Text>
      <Button mode="contained"buttonColor="#0d75bb"textColor="#fff"style={{ borderRadius: 25, marginTop: 10 }}onPress={() => handleEdit()}> Agregar Usuario </Button>
      <FlatList data={users} keyExtractor={(item) => item._id}renderItem={renderItem} contentContainerStyle={{ paddingBottom: 20, marginTop: 10 }} keyboardShouldPersistTaps="handled"/>
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{isAdding ? "Agregar Usuario" : "Editar Usuario"}</Text>
            <TextInput placeholder="Nombre"placeholderTextColor="#000"contentStyle={{ color: "#000", fontWeight: "600" }}style={styles.input}value={editingUser?.nombre}onChangeText={(text) => editingUser && setEditingUser({ ...editingUser, nombre: text })}mode="flat" underlineColor="#0d75bb"activeUnderlineColor="#0d75bb" />
            <TextInput placeholder="Apellido"placeholderTextColor="#000"contentStyle={{ color: "#000", fontWeight: "600" }}style={styles.input}value={editingUser?.apellido}onChangeText={(text) => editingUser && setEditingUser({ ...editingUser, apellido: text })}mode="flat" underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"/>
            <TextInput placeholder="Correo"placeholderTextColor="#000"contentStyle={{ color: "#000", fontWeight: "600" }}style={styles.input}value={editingUser?.email}onChangeText={(text) => editingUser && setEditingUser({ ...editingUser, email: text })}mode="flat" underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"/>
            {isAdding && (
            <TextInput placeholder="Contraseña"placeholderTextColor="#000"contentStyle={{ color: "#000", fontWeight: "600" }}style={styles.input}secureTextEntry value={editingUser?.password}onChangeText={(text) => editingUser && setEditingUser({ ...editingUser, password: text })}mode="flat" underlineColor="#0d75bb"activeUnderlineColor="#0d75bb" />
            )}
            <View style={styles.pickerContainer}>
              <Picker
                style={{height:50}}
                selectedValue={editingUser?.rol}
                onValueChange={(itemValue) =>
                  editingUser && setEditingUser({ ...editingUser, rol: itemValue as "Admin" | "Chofer" })
                }
              >
                <Picker.Item label="Admin" value="Admin" />
                <Picker.Item label="Chofer" value="Chofer" />
              </Picker>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10 }}>
              <Button mode="contained" buttonColor="#888"textColor="#fff"
                style={{ borderRadius: 25, marginTop: 10 }}
                onPress={() => {setModalVisible(false);setEditingUser(null);setIsAdding(false);}}>Cancelar</Button>
              <Button mode="contained" buttonColor="#007bff"textColor="#fff"
                style={{ borderRadius: 25, marginTop: 10 }}
                onPress={saveChanges}>Guardar</Button>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {flex: 1, padding: 15, backgroundColor: "#f5f5f5",paddingHorizontal:20 },
  actions:{flexDirection:"row",marginTop:10},
  title: {fontSize: 22, fontWeight: "bold", marginBottom: 5 },
  userCard:{flexDirection: "column",backgroundColor: "#fff",padding: 12,marginBottom: 10,borderRadius: 10,alignItems: "stretch",width: "100%",},
  userInfo:{flex:1, width:"100%",minWidth:0},
  name:{fontSize: 16, fontWeight: "bold", flexShrink:1},
  email:{fontSize: 14, color: "#555" , flexShrink:1},
  role:{fontSize: 14, color: "#007bff", marginTop: 2 , flexShrink:1},
  editButton:{backgroundColor:"#007bff",padding:5 ,borderRadius:5 , marginBottom:Platform.OS ==="web" ? 6:10,marginRight:Platform.OS === "web"? 0:15, ...(Platform.OS === "web" && {cursor:"pointer"}),},
  deleteButton:{backgroundColor: "#ec514cff", padding: 5, borderRadius: 5,marginBottom:Platform.OS ==="web" ? 6:10,marginRight:Platform.OS === "web"? 0:15, ...(Platform.OS === "web" && {cursor:"pointer"}), },
  actionText:{color: "#fff", fontWeight: "bold" },
  modalContainer:{flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent:{width:Platform.OS === "web" ? 400 :"90%", backgroundColor: "#fff", padding: 20, borderRadius: 10 },
  modalTitle:{fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  input:{width: "100%", height: 50, backgroundColor: "transparent", paddingHorizontal: 15, marginBottom: 15, borderRadius: 10,  },
  pickerContainer:{borderWidth: 1, borderColor: "#ccc", borderRadius: 5, marginBottom: 10 ,overflow:"hidden"},
});