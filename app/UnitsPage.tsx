import { Picker } from "@react-native-picker/picker";
import * as DocumentPicker from "expo-document-picker";
import * as Linking from "expo-linking";
import React, { useEffect, useState } from "react";
import { Alert, FlatList, Modal, Platform, StyleSheet, Text, View } from "react-native";
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
}

export default function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
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

  useEffect(() => {
    loadUnits();
  }, []);

  const loadUnits = async () => {
    try {
      const res = await api.get("/units");
      const mappedUnits= res.data.map((u:any)=> ({
        id:u.id,
        nombre:u.nombre,
        placas:u.placas,
        modelo:u.modelo,
        capacidad:String (u.capacidad),
        estado:u.estado,
        tipoRemolque:u.tipoRemolque || "",
        placaRemolque:u.placaRemolque || "",
        inventarios:u.inventarios || [],
      }));
      setUnits(mappedUnits);
    } catch (error) {
      console.error("Error cargando unidades", error);
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

  const subirInventario = async () => {
  if (!pdf) {
    Alert.alert("Error", "Seleciona PDF ");
    return;
  }
  if (!editingUnit) {
    Alert.alert("Error", "Selecciona la unidad");
    return;
  }

  try {
    const formData = new FormData();

    formData.append("file", {
      uri: pdf.uri,
      name: pdf.name,
      type: "application/pdf",
    } as any);

    await api.post(`/units/${editingUnit.id}/inventario`, formData, {
      headers: {
        "Content-Type": "multipart/form-data", // ✅ CORREGIDO
      },
    });

  
    const res = await api.get(`/units/${editingUnit.id}`);
    const u = res.data;

    setEditingUnit({
      id: u.id,
      nombre: u.nombre,
      placas: u.placas,
      modelo: u.modelo,
      capacidad: String(u.capacidad),
      estado: u.estado,
      tipoRemolque: u.tipoRemolque || "",
      placaRemolque: u.placaRemolque || "",
      inventarios: u.inventarios || [],
    });

    await loadUnits();
    setPdf(null);

    Alert.alert("Exito", "Inventario subido correctamente");
  } catch (error) {
    console.error(error);
    Alert.alert("Error", "No se pudo subir el inventario");
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

  const abrirPDF =async (url:string)=>{
    const supported=await Linking.canOpenURL(url);
    if (supported){
      await Linking.openURL(url);
    }else{
      Alert.alert("Error","No se puede abrir PDF")
    }
  };
  
  const renderItem = ({ item }: { item: Unit }) => {
    let estadoColor = "#4caf50"; //Disponible
    if (item.estado === "Mantenimiento") estadoColor = "#ff9800";
    if (item.estado === "Ocupado") estadoColor = "#f44336";
    return (
      <View style={styles.card}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.title}>{item.nombre}</Text>
          <View style={[styles.estadoBadge, { backgroundColor: estadoColor }]}>
            <Text style={styles.estadoText}>{item.estado}</Text>
          </View>
        </View>
          <Text>Modelo: {item.modelo}</Text>
          <Text>Capacidad: {item.capacidad}</Text>
          <Text>Placas: {item.placas}</Text>
          {unidadesConRemolque.includes(item.nombre)&&(
          <>
          <Text style={{fontWeight:"bold",marginTop:5}}>Tipo Remolque</Text>
          <Text>{item.tipoRemolque || "Ninguno"}</Text>
          {item.placaRemolque?(
            <Text>Placa remolque:{item.placaRemolque}</Text>
          ):null}
          </>
        )}
        <View style={{ flexDirection: "row", marginTop: 10, gap: 10 }}>
          <Button mode="contained" buttonColor="#0d75bb"textColor="rgb(243, 246, 248)" onPress={() => openModal(item)}> Editar </Button>
          <Button mode="contained" buttonColor="red" textColor="rgb(243, 246, 248)"onPress={() =>deleteUnit(item.id)}>Eliminar</Button>
        </View>
      </View>
    );
  };
  return (
    <View style={styles.container}>
       <Text style={styles.title}>Unidades Registradas</Text>
         <Button mode="contained" buttonColor="#0d75bb" textColor="rgb(243, 246, 248)"onPress={() => openModal()}>Nueva Unidad </Button>
           <FlatList data={units}keyExtractor={(item) => item.id}contentContainerStyle={{paddingBottom:120}}renderItem={renderItem}style={{ marginTop: 15 }}/>
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
                <View key={inv._id}  style={{flexDirection:"row",marginTop:10,gap:10}}>
                  <Text>PDF</Text>
                  <Text> Fecha :{new Date(inv.fecha).toLocaleDateString()}</Text>
                  <Button mode="contained" buttonColor="#0d4b75" style={{marginTop:5}} onPress={()=>abrirPDF(inv.archivo)}>Ver  PDF</Button>
                  <Button mode="contained" buttonColor="red" style={{marginTop:5}} onPress={()=>eliminarInventario(inv._id)}>Eliminar</Button>
                  </View>
               ))}       
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 15, backgroundColor: "#f5f5f5" },
  card: { backgroundColor: "#fff",padding: 15,marginBottom: 12,borderRadius: 12,shadowColor: "#000",shadowOpacity: 0.05,shadowOffset: { width: 0, height: 2 },shadowRadius: 5,elevation: 2, },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 5 },
  pageTitle: { fontSize: 22, fontWeight: "bold", marginBottom: 15, color: "#0d75bb" },
  estadoBadge: {paddingHorizontal: 8,paddingVertical: 3,borderRadius: 12,},
  estadoText: { color: "#fff", fontWeight: "bold" },
  modalContent: { flex: 1, padding: 20, backgroundColor: "#f5f5f5" },
  modalTitle: { fontSize:22, fontWeight: "bold", marginBottom:10,marginTop:10 },
  input: { borderRadius: 5, padding: 10, marginBottom: 10, backgroundColor: "transparent"},
});