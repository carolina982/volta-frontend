import { FontAwesome5 } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import { Alert, FlatList, Image, Modal, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { Button, TextInput, } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../services/api";

interface Unit {
  id: string;
  nombre: string;
  placas: string;
  modelo: string;
  capacidad: string;
  estado: "Disponible" | "Mantenimiento" | "Ocupado";
  tipoRemolque?:"Lowboy" |"Caja Seca" |"";
  placaRemolque?:string;
  inventarios?: {
  _id: string;
  archivo: string;
  fecha: string;
}[];
 imagenUrl?: string;
}

export default function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);

  const [nombre, setNombre] = useState("");
  const [placas, setPlacas] = useState("");
  const [modelo, setModelo] = useState("");
  const [capacidad, setCapacidad] = useState("");
  const [estado, setEstado] = useState<Unit["estado"]>("Disponible");
  const [tipoRemolque,setTipoRemolque]=useState<"" | "Lowboy" |"Caja Seca">("");
  const [placaRemolque,setPlacaRemolque]=useState("");
  
  const unidadesConRemolque=["002","007"];
  const [mostrarRemolque,setMostrarRemolque]=useState(false);
  const [pdf,setPdf]= useState <DocumentPicker.DocumentPickerAsset | null>(null);
  const [inventarios,setInventarios]=useState([]);
  const [imagenUrl,setImagenUrl]=useState("");
  
  const {width}=useWindowDimensions();
  const isMobile=width <768;
  useEffect(() => {
    loadUnits();
  }, []);

  const loadUnits = async () => {
    setListLoading(true);
    setLoadError("");
    try {
      const res = await api.get("/units");
      const mappedUnits= res.data.map((u:any)=> ({
        id:u.id || u._id,
        nombre:u.nombre,
        placas:u.placas,
        modelo:u.modelo,
        capacidad:String (u.capacidad),
        estado:u.estado,
        tipoRemolque:u.tipoRemolque || "",
        placaRemolque:u.placaRemolque || "",
        inventarios:u.inventarios || [],
        imagenUrl:u.imagenUrl || "",
      }));
      setUnits(mappedUnits);
    } catch (error) {
      console.error("Error cargando unidades", error);
      setLoadError("No se pudieron cargar las unidades.");
    } finally {
      setListLoading(false);
    }
  };

  const openModal = (unit?: Unit) => {
    if (unit) {
      setEditingUnit(unit);
      setNombre(unit.nombre);
      setPlacas(unit.placas);
      setModelo(unit.modelo);
      setCapacidad(unit.capacidad.toString());
      setEstado(unit.estado);
      setTipoRemolque(unit.tipoRemolque || "");
      setPlacaRemolque(unit.placaRemolque || "");
      setImagenUrl(unit.imagenUrl || "");

    } else {
      setEditingUnit(null);
      setNombre("");
      setPlacas("");
      setModelo("");
      setCapacidad("");
      setEstado("Disponible");

      setTipoRemolque("");
      setPlacaRemolque("");
    }
    setMostrarRemolque(unit? unidadesConRemolque.includes(unit.nombre):false);
    setModalVisible(true);
  };

  const saveUnit = async () => {
    if (!nombre || !placas || !modelo || !capacidad) {
      Alert.alert("Error", "Completa todos los datos");
      return;
    }
    const unitData = {
      nombre,placas,
      modelo,capacidad,
      estado,tipoRemolque,
      placaRemolque:tipoRemolque ? placaRemolque:"",
      imagenUrl,
    };

    try {
      if (editingUnit) {
        await api.put(`/units/${editingUnit.id}`,unitData);
      } else {
        await api.post("/units", unitData);
      }
      await loadUnits();
      setModalVisible(false);
    } catch (error) {
      console.error("Error guardando unidad", error);
      Alert.alert("Error", "No se pudo guardar la unidad");
    }
  };

  const pickPDF=async ()=>{
    const result=await DocumentPicker.getDocumentAsync({
      type:"application/pdf",
    });
    if (result.assets &&  result.assets.length > 0){
      setPdf(result.assets[0]);
    }
  };

  const  pickerImage =async ()=>{
    const result= await ImagePicker.launchImageLibraryAsync({
      mediaTypes:ImagePicker.MediaTypeOptions.Images,
      allowsEditing:true,
      quality:0.7,
    });
    if (!result.canceled){
      setImagenUrl(result.assets[0].uri);
    }
  };
  

 const seleccionarImagenUnidad=async(unitId:string)=>{
    try{
      const result=await ImagePicker.launchImageLibraryAsync({
        mediaTypes:ImagePicker.MediaTypeOptions.Images,
        allowsEditing:true,
        quality:0.7
      });
      if (result.canceled) return;
      const imageUri=result.assets[0].uri;
      const formData=new FormData();
      const response=await fetch(imageUri);
      const blob= await response.blob();
      formData.append(
        "image",blob,`unidad_${Date.now()}.jpg`
      );
      await api.post(`/units/${unitId}/image`,
      formData,
      {
        headers:{
          "Content-Type":"multipart/form-Data",
        },
      }
    );
    Alert.alert("Exito","Image actualizada");
    await loadUnits ();
    }catch (error){
      console.error(error);
      Alert.alert("Error","No se puede subir imagen");
    }
  };

  const deleteUnit = async(id:string)=>{
    console.log ("Eliminar unidad id",id);
    let confirmed =false;
    if (Platform.OS === "web"){
      confirmed= window.confirm("¿Desea eliminar esta unidad?");
      if (!confirmed) return;
    }else {
      confirmed = await new Promise<boolean>((resolve)=>{
        Alert.alert("Confirmar" , "¿Desea eliminar esta unidad?",[
          {text:"Cancelar" , style:"cancel" , onPress:()=>resolve(false)},
          {text:"Eliminar", style:"destructive" , onPress:()=>resolve(true)},
        ],
        {cancelable:true}
      );
      });
      if (!confirmed) return;
    }
    try {
      const res= await api.delete(`/units/${id}`);
      console.log("DELETE unidad response", res.data);
      setUnits((prev)=>prev.filter((u)=> u.id !==id));
      Alert.alert("Exito", "Unidad eliminada correctamente");
    }catch (error){
      console.log("Error eliminando unidad", error);
      Alert.alert("Error", "No se pudo eliminar la unidad")
    }
  };


  const subirInventario=async ()=>{
    if (!pdf){
      Alert.alert("Error","Selecciona PDF ");
      return;
    }
    if (!editingUnit){
      Alert.alert("Error","Selecciona la unidad");
      return;
    }
    try {
      const formData =new FormData();
      const response =await fetch(pdf.uri);
      const blob =await response.blob();
      formData.append("file",blob,pdf.name);
      await api.post(`/units/${editingUnit.id}/inventario`,formData);
      Alert.alert("Exito","Inventario subido correctamente");
    }catch (error:any){
      console.log("error?.response.data");
      Alert.alert("Error",JSON.stringify(error?.response?.data || error));
    }
  };


  const eliminarInventario=async (inventarioId:string)=>{
    if (!editingUnit) return;
    try{
      await api.delete(`/units/${editingUnit.id}/inventarios/${inventarioId}`);

     const res=await api.get(`/units/${editingUnit.id}`);
     const u=res.data;
     setEditingUnit({
       id: u.id,
        nombre:u.nombre,
        placas:u.placas,
        modelo:u.modelo,
        capacidad:String(u.capacidad),
        estado:u.estado,
        tipoRemolque:u.tipoRemolque || "",
        placaRemolque:u.placaRemolque || "",
        inventarios:u.inventarios || [],
     });
      
      Alert.alert("Exito","Inventario eliminado");
      loadUnits();
    }catch (error){
      console.error(error);
      Alert.alert("Error","No se pudo eliminar");
    }
  };

  const abrirPDF=async (url:string)=>{
    try {
      if (!url.startsWith("http")){
        url=`${api.defaults.baseURL}${url}`;
      }
      if (Platform.OS === "web"){
        window.open(url,"_blank");
      }else {
        Alert.alert("Error","No se puede abrir PDF");
      }
    }catch (error){
      console.error(error);
      Alert.alert ("Error" ,"No se pudo abrir PDF ")
    }
  };


  const getEstadoStyle = (estado: Unit["estado"]) => {
    if (estado === "Disponible") {
      return { badge: styles.estadoDisponible, text: styles.estadoTextDisponible, icon: "check-circle" as const, iconColor: "#059669" };
    }
    if (estado === "Mantenimiento") {
      return { badge: styles.estadoMantenimiento, text: styles.estadoTextMantenimiento, icon: "tools" as const, iconColor: "#d97706" };
    }
    return { badge: styles.estadoOcupado, text: styles.estadoTextOcupado, icon: "ban" as const, iconColor: "#dc2626" };
  };

  const renderItem = ({ item }: { item: Unit }) => {
    const estado = getEstadoStyle(item.estado);
    const hasRemolque = unidadesConRemolque.includes(item.nombre);

    return (
      <View style={[styles.card, isMobile ? styles.cardMobile : styles.cardDesktop]}>
        <TouchableOpacity style={styles.imageWrap} onPress={() => seleccionarImagenUnidad(item.id)} activeOpacity={0.85}>
          {item.imagenUrl ? (
            <Image source={{ uri: item.imagenUrl }} style={styles.unitImage} />
          ) : (
            <View style={styles.unitImagePlaceholder}>
              <FontAwesome5 name="truck" size={28} color="#9ca3af" />
            </View>
          )}
          <View style={styles.photoBadge}>
            <FontAwesome5 name="camera" size={10} color="#ffffff" />
          </View>
        </TouchableOpacity>

        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <Text style={styles.unitName}>{item.nombre}</Text>
            <View style={[styles.estadoBadge, estado.badge]}>
              <FontAwesome5 name={estado.icon} size={10} color={estado.iconColor} />
              <Text style={[styles.estadoText, estado.text]}>{item.estado}</Text>
            </View>
          </View>

          <View style={styles.specGrid}>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Modelo</Text>
              <Text style={styles.specValue} numberOfLines={1}>{item.modelo}</Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Capacidad</Text>
              <Text style={styles.specValue}>{item.capacidad}</Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Placas</Text>
              <Text style={styles.specValue}>{item.placas}</Text>
            </View>
            {hasRemolque && (
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Remolque</Text>
                <Text style={styles.specValue} numberOfLines={1}>
                  {item.tipoRemolque || "Ninguno"}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.cardActions}>
            <TouchableOpacity style={styles.iconAction} onPress={() => openModal(item)} activeOpacity={0.85}>
              <FontAwesome5 name="pen" size={13} color="#111111" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.iconAction, styles.iconActionDanger]} onPress={() => deleteUnit(item.id)} activeOpacity={0.85}>
              <FontAwesome5 name="trash-alt" size={13} color="#dc2626" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderText}>
          <Text style={styles.pageTitle}>Unidades Registradas</Text>
          <Text style={styles.subtitle}>Flota, capacidad y estado de cada vehículo</Text>
        </View>
        {!listLoading && !loadError && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{units.length}</Text>
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.addButton} onPress={() => openModal()} activeOpacity={0.85}>
        <FontAwesome5 name="plus" size={14} color="#ffffff" />
        <Text style={styles.addButtonText}>Nueva Unidad</Text>
      </TouchableOpacity>

      <View style={styles.listPanel}>
        {listLoading ? (
          <View style={styles.emptyState}>
            <FontAwesome5 name="spinner" size={20} color="#9ca3af" />
            <Text style={styles.emptyText}>Cargando unidades...</Text>
          </View>
        ) : loadError ? (
          <View style={styles.emptyState}>
            <FontAwesome5 name="exclamation-triangle" size={20} color="#dc2626" />
            <Text style={styles.emptyText}>{loadError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadUnits}>
              <Text style={styles.retryButtonText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : units.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome5 name="truck" size={22} color="#9ca3af" />
            <Text style={styles.emptyTitle}>No hay unidades</Text>
            <Text style={styles.emptyText}>Pulsa "Nueva Unidad" para registrar la primera.</Text>
          </View>
        ) : (
          <FlatList
            data={units}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            numColumns={isMobile ? 1 : 2}
            columnWrapperStyle={isMobile ? undefined : styles.listRow}
          />
        )}
      </View>
             <Modal visible={modalVisible} animationType="slide">
              <SafeAreaView style={{flex:1,backgroundColor:"#fff"}}>
               <View style={styles.modalContent}>
                
               <Text style={styles.modalTitle}>{editingUnit ? "Editar Unidad" : "Nueva Unidad"}</Text>
               <TextInput placeholder="Nombre"value={nombre}onChangeText={setNombre} mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb" placeholderTextColor="#000"dense contentStyle={{ color: "#000", fontWeight: "600" }} style={styles.input}/>
               <TextInput placeholder="Placas"value={placas}onChangeText={setPlacas}mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"placeholderTextColor="#000"dense contentStyle={{ color: "#000", fontWeight: "600" }} style={styles.input}/>
               <TextInput placeholder="Modelo"value={modelo}onChangeText={setModelo}mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"placeholderTextColor="#000"dense contentStyle={{ color: "#000", fontWeight: "600" }} style={styles.input}/>
               <TextInput placeholder="Capacidad"value={capacidad}onChangeText={setCapacidad}mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"placeholderTextColor="#000"dense contentStyle={{ color: "#000", fontWeight: "600" }} style={styles.input}/>
               <TextInput placeholder="Estado (Disponible / Mantenimiento / Ocupado)"value={estado}onChangeText={(text) => setEstado(text as Unit["estado"])} mode="flat"underlineColor="#0d75bb"
               activeUnderlineColor="#0d75bb"  placeholderTextColor="#000" dense contentStyle={{ color: "#000", fontWeight: "600" }} style={styles.input}/>
              
               {mostrarRemolque && (
               <>
               <Text style={{ fontWeight: "bold", marginTop: 5 }}>Tipo de remolque</Text>
                 <View style={{ backgroundColor: "#fff", borderRadius: 5, borderWidth: 1, borderColor: "#ccc", marginBottom: 10 }}>
                   <Picker selectedValue={tipoRemolque} onValueChange={setTipoRemolque}>
                   <Picker.Item label="Lowboy" value="Lowboy"/>
                   <Picker.Item label="Caja Seca" value="Caja Seca"/>
                   <Picker.Item label="Ninguno" value=""/>
                   </Picker>
                </View>
                  {(tipoRemolque === "Lowboy" || tipoRemolque === "Caja Seca") && (
                    <TextInput placeholder="Placa del remolque"value={placaRemolque}onChangeText={setPlacaRemolque}mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"dense style={styles.input}/>
                  )}
                 </>
                )}
               <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 15 }}>
               <Button mode="contained" buttonColor="#888" textColor="rgb(243, 246, 248)" onPress={() => setModalVisible(false)}>Cancelar</Button>
               <Button mode="contained" buttonColor="#0d75bb" textColor="rgb(243, 246, 248)"onPress={saveUnit}>Guardar</Button> 
          </View>
          
               <Text style={{fontWeight:"bold",marginTop:20}}>Inventario</Text>
               <Button mode="contained" buttonColor="#0d4b75" onPress={pickPDF}>Seleccionar PDF</Button>
               {pdf && (
                <Text style={{marginTop:5}}>Archivo :{pdf.name}</Text>
               )}
               <Button mode="contained" buttonColor="#0d4b75" style={{marginTop:10}} onPress={subirInventario}>Subir Inventario</Button>
               {editingUnit?.inventarios?.map((inv)=>(
                <View key={inv._id} style={{marginTop:15,backgroundColor:"#fff",padding:10,borderRadius:8}}>
                  <Text style={{fontWeight:"bold"}}>PDF Inventario</Text>
                  <Text>fecha:{""}{new Date(inv.fecha).toLocaleDateString()}</Text>
                  <View style={{flexDirection:"row",marginTop:10,gap:10}}>
                    <Button mode="contained" buttonColor="#0d75bb" onPress={()=>abrirPDF(inv.archivo)}>ver pdf</Button>
                    <Button mode="contained" buttonColor="red" onPress={()=>eliminarInventario(inv._id)}>Eliminar</Button>
                  </View>
                </View>
               ))}
                   
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: 4,
    backgroundColor: "transparent",
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  pageHeaderText: { flex: 1, paddingRight: 12 },
  pageTitle: { fontSize: 24, fontWeight: "800", color: "#111111", letterSpacing: 0.2 },
  subtitle: { fontSize: 13, color: "#6b7280", marginTop: 4 },
  countBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  countBadgeText: { color: "#ffffff", fontWeight: "800", fontSize: 14 },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#111111",
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 999,
    marginBottom: 18,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const, alignSelf: "flex-start" as const } : {}),
  },
  addButtonText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
  listPanel: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    flex: 1,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 8px 24px rgba(0,0,0,0.04)" as any }
      : {}),
  },
  listContent: { paddingBottom: 24, gap: 12 },
  listRow: { gap: 12 },
  emptyState: {
    paddingVertical: 48,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#111111" },
  emptyText: { fontSize: 14, color: "#64748b", textAlign: "center" },
  retryButton: {
    marginTop: 8,
    backgroundColor: "#111111",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  retryButtonText: { color: "#fff", fontWeight: "700" },
  card: {
    backgroundColor: "#fafafa",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    flex: 1,
  },
  cardMobile: { width: "100%" },
  cardDesktop: { minWidth: 0, maxWidth: "49%" as any },
  imageWrap: {
    position: "relative",
    alignSelf: "flex-start",
    marginBottom: 12,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  unitImage: {
    width: 88,
    height: 88,
    borderRadius: 14,
    backgroundColor: "#e5e7eb",
  },
  unitImagePlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 14,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  photoBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 12,
  },
  unitName: { fontSize: 20, fontWeight: "800", color: "#111111", flex: 1 },
  estadoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  estadoDisponible: { backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#a7f3d0" },
  estadoMantenimiento: { backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fde68a" },
  estadoOcupado: { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca" },
  estadoText: { fontSize: 11, fontWeight: "700" },
  estadoTextDisponible: { color: "#059669" },
  estadoTextMantenimiento: { color: "#d97706" },
  estadoTextOcupado: { color: "#dc2626" },
  specGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  specItem: {
    minWidth: "46%",
    flexGrow: 1,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  specLabel: { fontSize: 10, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.4 },
  specValue: { fontSize: 13, fontWeight: "600", color: "#111111", marginTop: 2 },
  cardActions: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  iconAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  iconActionDanger: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 5 },
  modalContent: { flex: 1, padding: 20, backgroundColor: "#f5f5f5" },
  modalTitle: { fontSize: 22, fontWeight: "bold", marginBottom: 10, marginTop: 10 },
  input: { borderRadius: 5, padding: 10, marginBottom: 10, backgroundColor: "transparent" },
});