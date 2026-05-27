import { Picker } from "@react-native-picker/picker";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import { Alert, FlatList, Image, Modal, Platform, StyleSheet, Text, View } from "react-native";
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

  useEffect(() => {
    loadUnits();
  }, []);

  console.log(editingUnit?.inventarios);
  
  const loadUnits = async () => {
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


    const renderItem = ({ item }: { item: Unit }) => {
    let estadoColor = "#4caf50"; //Disponible
    if (item.estado === "Mantenimiento") estadoColor = "#ff9800";
    if (item.estado === "Ocupado") estadoColor = "#f44336";
    return (
      <View style={[styles.card,{flexDirection:Platform.OS === "web" ? "row":"column",alignItems:"center"}]}>

         <Image source={{uri:item.imagenUrl ||'https://reactjs.org/logo-og.png',}}style={styles.unitImage}/>
         <Button mode="contained" buttonColor="#0d4b75" onPress={()=>seleccionarImagenUnidad(item.id)}>Foto</Button>

        <View style={{ flex: 1, width:"100%",marginLeft:Platform.OS === "web" ?15:0}}>
          <View style={{flexDirection: "row",justifyContent: "space-between",alignItems: "center",}}>
            <Text style={styles.title}>{item.nombre} </Text>
            <View  style={[styles.estadoBadge,{ backgroundColor: estadoColor },]}>
              <Text style={styles.estadoText}> {item.estado}</Text>
              </View>
               </View>
                <Text>Modelo: {item.modelo}</Text>
                <Text> Capacidad: {item.capacidad}</Text>
                <Text>Placas: {item.placas}</Text>
                {unidadesConRemolque.includes(item.nombre
                 ) && (
                 <>
                 <Text style={{fontWeight: "bold",marginTop: 5, }}>  Tipo Remolque</Text>
                 <Text>{item.tipoRemolque || "Ninguno"}</Text>
                 {item.placaRemolque ? (
                  <Text>Placa remolque:{item.placaRemolque}</Text>
                ) : null}
                 </>
                 )}
                 <View style={{flexDirection: "row",marginTop: 10, gap: 10,}}>
                  <Button mode="contained"buttonColor="#0d75bb"textColor="rgb(243, 246, 248)"onPress={() => openModal(item)}> Editar </Button>
                  <Button mode="contained" buttonColor="red" textColor="rgb(243, 246, 248)"onPress={() => deleteUnit(item.id)}> Eliminar</Button>
                </View>
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
  container: { flex: 1, padding: 15, backgroundColor: "#f5f5f5" },
  card: { backgroundColor: "#fff",padding: 15,marginBottom: 12,borderRadius: 12,shadowColor: "#000",shadowOpacity: 0.05,shadowOffset: { width: 0, height: 2 },shadowRadius: 5,elevation: 2, },
  uniImage:{width:Platform.OS ==="web" ? 180:220,height:Platform.OS === "web" ? 180:220,borderRadius:12,marginTop:15},
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 5 },
  unitImage:{width:180,height:180, borderRadius:18,marginRight:18},
  pageTitle: { fontSize: 22, fontWeight: "bold", marginBottom: 15, color: "#0d75bb" },
  estadoBadge: {paddingHorizontal: 8,paddingVertical: 3,borderRadius: 12,},
  estadoText: { color: "#fff", fontWeight: "bold" },
  modalContent: { flex: 1, padding: 20, backgroundColor: "#f5f5f5" },
  modalTitle: { fontSize:22, fontWeight: "bold", marginBottom:10,marginTop:10 },
  input: { borderRadius: 5, padding: 10, marginBottom: 10, backgroundColor: "transparent"},
});