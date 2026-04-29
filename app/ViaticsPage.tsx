import { Picker } from "@react-native-picker/picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { useEffect, useState } from "react";
import { Alert, FlatList, Image, Linking, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { ActivityIndicator, Button, TextInput } from "react-native-paper";
import * as XLSX from "xlsx";
import { useStore } from "../context/Store";
import { api, BASE_URL } from "../services/api";
import { Viatico } from "../types";

interface Trip { id: string;nombre: string; conductorId: string; conductorNombre?: string;}


const conceptosBase = [ "Comidas","Hospedaje", "Taxi","Regaderas",
  "Pensión","Vulcanizadora","Casetas efectivo","Limpieza Unidad",
  "Multa","Comisiones","Fumigación","DEF"
];

const preciosFijos:Record<string,number>={
  comidas:400
};

const conceptosList = conceptosBase.flatMap(c => [
  `${c} Cantidad`,
  `${c} Costo`
]);

export default function ViaticsPage() {

  const { currentUser } = useStore();
  const isAdmin =currentUser?.rol?.toLocaleLowerCase()==="admin";
  const [viaticos, setViaticos] = useState<Viatico[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingViatico, setEditingViatico] = useState<Viatico | null>(null);

  const [tripId, setTripId] = useState("");
  const [conceptos, setConceptos] = useState<{ [key: string]: string }>(
    conceptosList.reduce((acc, c) => ({ ...acc, [c]: "0" }), {})
  );
  const [tag, setTag] = useState("0");
  const [factura, setFactura] = useState<string | null>(null);
  const [facturaRemoved, setFacturaRemoved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showFactura, setShowFactura] = useState(false);
  const [filter, setFilter] = useState<"day" | "week" | "month">("month");
  const [conductorFilter, setConductorFilter] = useState<string>("");

  const [dieselCargas,setDieselCargas]=useState("");
  const [dieselCosto,setDieselCosto]=useState("");
  const [totalSDieselGlobal,setTotalDieselGlobal]=useState(0);
  const [viaticoSeleccionado,setViaticoSeleccionado]=useState<any>(null);
  const [casetaFoto,setCasetaFoto]=useState<string | null>(null);
  const [casetaFotoRemoved,setCasetaFotoRemoved]=useState(false);

  interface CargaDiesel{
    cantidad:string;
    costo:string;
  }

  const [dieselHistorial,setDieselHistorial]=useState<CargaDiesel[]>([]);

  const agregarCargaDiesel= ()=>{
    if(!dieselCargas || !dieselCosto) return;
    setDieselHistorial([
      ...dieselHistorial,
      {cantidad:dieselCargas ,costo:dieselCosto}
    ]);
    setDieselCargas("");
    setDieselCosto("");
  };

  const editarCarga=(index:number)=>{
    const item=dieselHistorial[index];
    setDieselCargas(item.cantidad);
    setDieselCosto(item.costo);
    const actualizado =[...dieselHistorial];
    actualizado.splice(index,1);
    setDieselHistorial(actualizado);
  };

  const eliminarCarga =(index:number)=>{
    const actualizado =dieselHistorial.filter((_,i)=> i !== index);
    setDieselHistorial(actualizado);
  };

  useEffect(()=>{const total=dieselHistorial.reduce( (acc, item)=> acc + Number(item.costo || 0),0
  );
  setTotalDieselGlobal(total);
  },[dieselHistorial]);
  useEffect(()=>{loadTrips(); }, [currentUser]);

  
  useEffect(()=>{if(currentUser){loadTrips();loadViaticos();}},[currentUser,filter,conductorFilter]);
  const loadTrips = async () => {
    try {
      const res = await api.get("/trips");
      let tripsData = res.data.map((t: any) => ({ 
        ...t,
        id: t._id,
        conductorNombre: t.conductorNombre || t.conductor?.nombre || "Sin asignar"
      }));

      if (currentUser?.rol === "Chofer")
        tripsData = tripsData.filter((t: any) => t.conductorId === currentUser.id);

      setTrips(tripsData);

    } catch (e) {
      console.error(e);
    }
  };

  const loadViaticos = async () => {
    try {
      const res = await api.get(`/viatics?filter=${filter}`);

      let viaticosData = res.data.map((v: any) => ({
        ...v,
        id: v._id,
        facturaUrl: v.factura ? `${BASE_URL.replace("/api", "")}${v.factura}` : undefined
      }));
                      
      if (currentUser?.rol === "Chofer") {
        viaticosData = viaticosData.filter((v: any) =>
          trips.find(t => t.id === v.tripId)?.conductorId === currentUser.id
        );
      }

      if (conductorFilter) {
        viaticosData = viaticosData.filter((v: any) => {
          const trip=trips.find((t)=>t.id === (typeof v.tripId === "object" ? v.tripId._id : v.tripId));
          return trip && trip.conductorId === conductorFilter;
        });
      }
      console.log("TRIPS:",trips);
      console.log("VIATICOS RAW:" ,viaticosData);
      viaticosData =viaticosData.map((v:any)=>{
        const conceptosPlano:any ={};
        conceptosBase.forEach(base=>{
          conceptosPlano[`${base} Cantidad`]=v.conceptos?.[base]?.cantidad ?? 0;
          conceptosPlano[`${base} Costo`]=v.conceptos?.[base]?.costo ?? 0;
        });
        return{
          ...v,
          conceptos:conceptosPlano,
          dieselCargas:v.dieselCargas ?? 0,
          dieselCosto:v.dieselCosto ?? 0,
          tag:v.tag ?? 0,
          total:v.total ?? 0,
        };
      });

     viaticosData=viaticosData.map((v:Viatico)=>{
      const trip=trips.find(t=>t.id === v.tripId);
      return{
        ...v,
        viajeNombre:trip?.nombre,
        conductorNombre:trip?.conductorNombre ?? "Sin asignar",
      };
     });
      setViaticos(viaticosData);
      calcularTotalDieselGlobal(viaticosData);

    } catch (e) {
      console.error(e);
      Alert.alert("Error", "No se pudieron cargar los viáticos");
    }
  };

  const calcularTotal = () => {
    let total = 0;
    conceptosBase.forEach(base =>{const cantidad =Number(conceptos[`${base} Cantidad`] || 0);

      if (base === "Comidas"){
        total +=cantidad *400;
      }
      else{
        const costo=Number(conceptos[`${base} Costo`] || 0);
        total +=cantidad * costo;
      }
    });
    dieselHistorial.forEach(c=>{
      total += Number(c.costo || 0);
    });
    total +=Number(tag || 0);
    return total;
  };

  //exportacion  excel 
const exportViaticosToExcel =async ()=>{
  try {
    if (!viaticos.length){
      Alert.alert("Aviso ","No hay datos para exportar");
      return;
    }
    const sorted=[...viaticos].sort( (a,b)=>
      new Date(a.createdAt || a.fecha || 0).getTime()-
      new Date(b.createdAt || b.fecha || 0).getTime()
    );
    const ws_data:any [][]=[];
    let currentMonth="";
    let currentWeek=0;
    let currentDay=0;

    let monthTotal=0;
    let weekTotal=0;
    let dayTotal=0;

    for (const v of sorted){
      const rawDate=v.createdAt ||v.fecha || v.updatedAt;
      const date=rawDate ? new Date(rawDate) :new Date();
      if (isNaN(date.getTime())) continue;
      const monthName =date.toLocaleString("es-Es",{
        month:"long",
        year:"numeric",
      });
      const weekNumber=Math.ceil(date.getDate()/7);
      const dayNumber=date.getDate();
      
      const tripId=typeof v.tripId === "object" ? v.tripId :v.tripId;
      const trip=trips.find(t=>t.id  === tripId);
      const viajeNombre= v.viajeNombre || trip?.nombre || (v.tripId as any)?.nombre || "N/A";
      const conductorNombre=v.conductorNombre || trip?.conductorNombre || (v.tripId as any)?.conductorNombre || "Sin asignar";
      const dieselTotal= Array.isArray((v as any).dieselHistorial) ?(v as any).dieselHistorial.reduce((acc:number,d:any)=>acc+Number (d.costo || 0),0):Number(v.dieselCosto || 0);
      //cambio  de mes 
      if (monthName !== currentMonth){
        if (monthTotal > 0){
          ws_data.push([`Total Dia ${currentDay}:${dayTotal}`]);
          ws_data.push([`Total Semana ${currentWeek}:${weekTotal}`]);
          ws_data.push([`Total del mes ${currentMonth}:${monthTotal}`]);
          ws_data.push([]);
        }
        ws_data.push([`Mes:${monthName.toUpperCase()}`]);
        ws_data.push([
          "Semana",
          "Fecha",
          "Viaje",
          "Conductor",
          "Diesel",
          "Tag",
          ...conceptosList,
          "Total",
        ]);
        currentMonth=monthName;
        currentWeek=0;
        currentDay=0;
        monthTotal=0;
        weekTotal=0;
        dayTotal=0;
      }
      // cambio de semana 
      if (weekNumber !== currentWeek){
        if (currentWeek !== 0){
          ws_data.push([`Total semana ${currentWeek}:${weekTotal}`]);
          ws_data.push([]);
        }
        currentWeek=weekNumber;
        weekTotal=0;
      }
      // cambio de dia 
      if (dayNumber !== currentDay){
        if (currentDay !== 0){
          ws_data.push([`Total Dia ${currentDay}:${dayTotal}`]);
        }
        currentDay=dayNumber;
        dayTotal=0;
      }

      const conceptosValores=conceptosList.map(c=>{
        if (c === "Comidas Costo"){
          const cantidad=Number(v.conceptos?.["Comidas Cantidad"]?? 0);
          return cantidad * 400;
        }
        return Number(v.conceptos?.[c] ?? 0);
      });
      const total =Number(v.total ?? 0);

      ws_data.push([
        weekNumber,
        date.toLocaleDateString(),
        viajeNombre,
        conductorNombre,
        dieselTotal,
        Number(v.tag || 0),
        ...conceptosValores,
        total,
      ]);
      monthTotal+=total;
      weekTotal+=total;
      dayTotal+=total;
    }
    if (monthTotal>0){
      ws_data.push([`Total Dia ${currentDay}:${dayTotal}`]);
      ws_data.push([`Total Semana ${currentWeek}:${weekTotal}`]);
      ws_data.push([`Total del Mes ${currentMonth}:${monthTotal}`])
    }
    const ws =XLSX.utils.aoa_to_sheet(ws_data);
    const wb =XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb,ws,"Viaticos");
    
    if (Platform.OS === "web"){
      const excelBuffer= XLSX.write(wb,{
        bookType:"xlsx",
        type:"array",
      });
      const blob=new Blob([excelBuffer],{
        type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url=window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href=url;
      a.download="Viaticos.xlsx";
      a.click();
      window.URL.revokeObjectURL(url);
    }else{
      const base64=XLSX.write(wb,{
        bookType:"xlsx",
        type:"base64",
      });
      const fileUri=(FileSystem as any).documentDirectory +"Viaticos.xlsx";
      await FileSystem.writeAsStringAsync(fileUri,base64,{
        encoding:"base64",
      });
      const canShare=await Sharing.isAvailableAsync();
      if (!canShare){
        Alert.alert("Error","No se puede compartir el archivo ");
        return;
      }
      await Sharing.shareAsync(fileUri);
    }
    Alert.alert("Exito","Reporte generado correctamente");
  }catch (error){
    console.error("Error exportando",error);
    Alert.alert("Error","No se pudo generar el archivo");
  }
};


const openModal =(viatico?:Viatico)=>{
  if (viatico) {
    setEditingViatico(viatico);
    setTripId((viatico.tripId as any)?._id || viatico.tripId);

    if (Array.isArray((viatico as any).dieselHistorial)){
      setDieselHistorial(
        (viatico as any).dieselHistorial.map((d: any)=>({
          cantidad:String(d.cargas ?? 0),
          costo:String(d.costo ?? 0),
        }))
      );
    }else {
      setDieselHistorial([]);
    }
    setTag(String(viatico.tag ?? 0));
    setFactura(viatico.facturaUrl || null);
  }else{
    setEditingViatico(null);
    setTripId("");
    setFactura(null);
    setConceptos(conceptosList.reduce((acc,c)=>({...acc,[c]:"0"}),{}));
    setDieselHistorial([]);
    setTag("0");
  }
  setFacturaRemoved(false);
  setShowFactura(false);
  setModalVisible(true);
}
 const pickFactura = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["image/*", "application/pdf"] });
      if ((result as any).type === "cancel") return;
      const uri = (result as any).uri ?? (result as any).assets?.[0]?.uri;
      if (!uri) return Alert.alert("Error", "No se pudo seleccionar el archivo");
      setFactura(uri);
      setFacturaRemoved(false);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Ocurrió un problema al seleccionar el archivo");
    }
  };

  const pickCasetaFoto= async ()=>{
    try{
      const result=await DocumentPicker.getDocumentAsync({
        type:["image/*"],
        copyToCacheDirectory:true
      });
      if (result.canceled) return;

      const file=result.assets[0];
      setCasetaFoto(file.uri);
      setCasetaFotoRemoved(false);
    }catch (e){
      console.error(e);
      Alert.alert("Error","No se pudo seleccionar la imagen ");
    }
  };
  const normalizarViaticoParaEditar =(viatico:any,conceptosBase:string [])=>{
    const conceptosPlano:any={};
    conceptosBase.forEach(base =>{
      conceptosPlano[`${base} Cantidad`]=viatico.conceptos?.[base]?.cantidad?.toString()  ?? "";
      conceptosPlano[`${base} Costo`]=viatico.conceptos?.[base]?.costo?.toString () ?? "";
    });
    return{
      ...viatico,
      conceptos:conceptosPlano,
      dieselHistorial:Array.isArray(viatico.dieselHistorial)
       ? viatico.dieselHistorial.map((d:any)=>({
        cantidad:d.cargas?.toString () ?? "",
        costo:d.costo?.toString () ?? "",
       })) :[],
       tag:viatico.tag?.toString() ?? "",
    };
  };
  const saveViatico = async () => {
  if (!tripId) {
    Alert.alert("Error", "Selecciona un viaje");
    return;
  }
  setLoading(true);

  try {
    const formData = new FormData();
    formData.append("tripId", tripId);
    const conceptosFinal :any={};
    conceptosBase.forEach(base=>{
      conceptosFinal[base]={
        cantidad:Number(conceptos[`${base} Cantidad`] || 0),
        costo:Number(conceptos[`${base} Costo`] || 0),
      };
    });
    formData.append("conceptos",JSON.stringify(conceptosFinal));
    const dieselCargasTotal = dieselHistorial.length;
    const dieselCostoTotal = dieselHistorial.reduce(
      (acc, d) => acc + Number(d.costo || 0),
      0
    );
    formData.append("dieselCargas",String(dieselCargasTotal));
    formData.append("dieselCosto", String(dieselCostoTotal));
    formData.append("dieselHistorial",JSON.stringify(dieselHistorial.map(d=>({cargas:Number(d.cantidad || 0),costo:Number(d.costo|| 0),}))
  ));
    formData.append("tag", String(Number(tag || 0)));
    formData.append("total", String(calcularTotal()));
    if (factura) {
      if (Platform.OS === "web") {
        const response = await fetch(factura);
        const blob = await response.blob();
        const file = new File([blob], "factura", { type: blob.type });
        formData.append("factura", file);
      } else {
        const uri = factura.startsWith("file://") ? factura :`file://${factura}`;
        const filename = uri.split("/").pop()!;
        const type = filename.endsWith(".pdf")
          ? "application/pdf"
          : filename.endsWith(".png")
          ? "image/png"
          : "image/jpeg";

        formData.append("factura", { uri, name: filename, type } as any);
      }
    } else if (facturaRemoved) {
      formData.append("factura", "");
    }
    const url = editingViatico
      ? `${BASE_URL}/viatics/${editingViatico.id}`
      : `${BASE_URL}/viatics`;

    const method = editingViatico ? "PUT" : "POST";

    const res = await fetch(url, { method, body: formData });
    if (!res.ok) throw new Error(await res.text());

    await loadViaticos();
    setModalVisible(false);
  } catch (error) {                                        
    console.error(error);
    Alert.alert("Error", "No se pudo guardar el viático");
  } finally {
    setLoading(false);
  }
};
  const calcularTotalDieselGlobal =(viaticosData:Viatico[])=>{
    let total =0;
    viaticosData.forEach(v=>{
      if (Array.isArray((v as any).dieselHistorial)){
        (v as any).dieselHistorial.forEach((c:any)=>{
          total += Number(c.costo || 0);
        });
      }else{
        total += Number(v.dieselCosto || 0);
      }
    });
    setTotalDieselGlobal(total);
  };

  
  const deleteViatico = async (id: string) => {
    let confirmed = false;

    if (Platform.OS === "web") {
      confirmed = window.confirm("¿Eliminar viático?");
      if (!confirmed) return;
      
    } else {
      confirmed = await new Promise(resolve => {
        Alert.alert("Confirmar", "¿Eliminar viático?", [
          { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
          { text: "Eliminar", style: "destructive", onPress: () => resolve(true) },
        ]);
      });
      if (!confirmed) return;
    }

    try {
      await api.delete(`/viatics/${id}`);
      setViaticos(prev => prev.filter(v => v.id !== id));
    } catch (e) {
      Alert.alert("Error", "No se pudo eliminar");
    }
  };

  const renderItem=({item}:{item:Viatico})=>{
    const viajeNombre=(item.tripId as any)?.nombre ;
    const conductorNombre=(item.tripId as any)?.conductorNombre ?? "Sin asignar"
    return(
      <View style={styles.card}>
        <Text style={styles.title}>Viatico:{viajeNombre}</Text>
        <Text style={styles.subtitle}>Conductor:{conductorNombre }</Text>
        <Text style={styles.total}>Total:${item.total}</Text>
      <View style={styles.buttonRow}>
        <Button mode="contained" buttonColor="#0d75bb" textColor="rgb(243, 246, 248)"style={styles.button}onPress={()=>openModal(item)}>Ver detalles</Button>
        <Button mode="contained" buttonColor="#e53935"textColor="rgb(243, 246, 248)" style={styles.button} onPress={() => deleteViatico(item.id)}>Eliminar</Button>
      </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Viáticos Registrados</Text>
      <Button mode="contained" buttonColor="#0d75bb"textColor="rgb(243, 246, 248)" onPress={() => openModal()}>Nuevo Viático</Button>
      {currentUser?.rol !== "Chofer" && (
       <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
         <Text style={{ fontWeight: "bold", marginRight: 8}}>Exportar por:</Text>
           <View style={{ flex: 1, backgroundColor: "#fff", borderRadius: 5, marginRight: 8 }}>
             <Picker selectedValue={filter} onValueChange={(value)=>setFilter(value)} style={{height:20}}  mode={Platform.OS === "ios"?"dropdown":"dropdown"}>
             <Picker.Item label="Día" value="day" />
             <Picker.Item label="Semana" value="week" />
             <Picker.Item label="Mes" value="month" />
            </Picker>
          </View>
         <Button mode="contained" buttonColor="#0d75bb"textColor="rgb(243, 246, 248)" onPress={exportViaticosToExcel}> Exportar Excel</Button>
        </View>
      )}
      <FlatList data={viaticos}keyExtractor={item => item.id}renderItem={renderItem}style={{ marginTop: 15 }}/>
      <Modal visible={modalVisible} animationType="slide">
         <KeyboardAwareScrollView enableOnAndroid extraScrollHeight={120} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 200,flexGrow:1 }} >
          <Text style={styles.modalTitle}>
            {editingViatico ? "Editar Viático" : "Nuevo Viático"}
          </Text>
          <Text style={styles.label}>Viaje:</Text>                                                                                                                                                                                
          <Picker selectedValue={tripId} onValueChange={setTripId} style={styles.picker}>
            <Picker.Item label="Selecciona un viaje" value />
            {trips.map(t => (
              <Picker.Item key={t.id} label={`${t.nombre} (${t.conductorNombre})`}value={t.id}/>
            ))}
          </Picker>
            <View style={{ flexDirection: "row" }}>
             <View style={{ flex:1, paddingRight:3 }}>
              <View style={{ marginBottom: 10 }}>  
              <Text style={styles.label}>Comidas</Text>
              <TextInput value={conceptos["Comidas Cantidad"]}onChangeText={(t) =>setConceptos({...conceptos,["Comidas Cantidad"]: t,})}
              keyboardType="numeric" mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"textColor="#000"contentStyle={{ color: "#000", fontWeight: "600" }}style={styles.input} placeholder="Días" />
              <TextInput value={String((Number(conceptos["Comidas Cantidad"]) || 0) * 400)} editable={false} mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"textColor="#000"contentStyle={{ color: "#000", fontWeight: "600" }}style={styles.input} placeholder="Costo"/>
              </View>
              {conceptosBase
              .filter((b)=> b !== "Comidas" && (isAdmin || b !== "Comisiones"))
              .slice(0,Math.ceil((conceptosBase.length -1)/2))
              .map((base) => (
              <View key={base} style={{ marginBottom: 10 }}>
                <Text style={styles.label}>{base}</Text>
                <TextInput value={conceptos[`${base} Cantidad`]} 
                 onChangeText={(t)=>setConceptos
                 ({ ...conceptos,[`${base} Cantidad`]: t })} keyboardType="numeric"mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"textColor="#000"contentStyle={{ color: "#000", fontWeight: "600" }}style={styles.input}placeholder="Días"/>
                <TextInput value={conceptos[`${base} Costo`]}
                   onChangeText={(t)=>setConceptos
                    ({...conceptos,[`${base} Costo`]: t})}keyboardType="numeric"mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"textColor="#000"contentStyle={{ color: "#000", fontWeight: "600" }}style={styles.input}placeholder="Costo"/>
                {base === "Casetas efectivo" && (
                  <View style={{marginBottom:10}}>
                    <Text style={styles.label}>Subir foto :</Text>
                    {casetaFoto ? (
                      <>
                      <Image source={{uri:casetaFoto}} style={styles.facturaPreview}/>
                      <View style={{flexDirection:"row",gap:10}}>
                        <Button mode="contained" buttonColor="#0d75bb" onPress={pickCasetaFoto}>Remplazar</Button>
                        <Button mode="contained" buttonColor="#0d75bb" onPress={()=>{setCasetaFoto(null);setCasetaFotoRemoved(true);}}>Eliminar</Button>
                      </View>
                      </>
                    ):(
                      <Button mode="contained" buttonColor="#0d75bb" onPress={pickCasetaFoto}>Subir foto </Button>
                    )}
              </View>
           )}
          </View>
              ))}
              </View>
          <View style={{ flex: 1, paddingLeft: 3 }}>
             {conceptosBase
             .filter((b)=> b !== "Comidas" && (isAdmin || b !=="Comisiones"))
             .slice(Math.ceil((conceptosBase.length -0)/2))
             .map((base) =>(
             <View key={base} style={{ marginBottom: 10 }}>
              <Text style={styles.label}>{base}</Text>
              <TextInput value={conceptos[`${base} Cantidad`]}onChangeText={(t)=>setConceptos({ ...conceptos, [`${base} Cantidad`]: t})} keyboardType="numeric"mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"textColor="#000"contentStyle={{ color: "#000", fontWeight: "600" }}style={styles.input}placeholder="Días"/>
              <TextInput value={conceptos[`${base} Costo`]}onChangeText={(t) =>setConceptos({ ...conceptos, [`${base} Costo`]: t })}keyboardType="numeric"mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"textColor="#000"contentStyle={{ color: "#000", fontWeight: "600" }}style={styles.input}placeholder="Costo"/>
              </View>
              ))}
            </View>
          </View>
          <View style={{marginTop:20}}>
            <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center"}}> 
              <Text style={{fontWeight:"bold",fontSize:18}}>Diesel</Text>
                 <TouchableOpacity onPress={agregarCargaDiesel}>
                     <Text style={{fontSize:28,fontWeight:"bold"}}> + </Text>
                 </TouchableOpacity>
                  </View>
                <Text style={{marginTop:5}}>Cargas</Text>
                <TextInput  style={styles.input}mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb" textColor="#000"contentStyle={{ color: "#000", fontWeight: "600" }}value={dieselCargas}onChangeText={setDieselCargas}keyboardType="numeric"  />
                <Text style={{marginTop:5}}>Costo</Text>
                <TextInput style={styles.input}mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"textColor="#000"contentStyle={{ color: "#000", fontWeight: "600" }}value={dieselCosto}onChangeText={setDieselCosto}keyboardType="numeric"/>
                <View style={{marginTop:15,padding:10,backgroundColor:"#f1f1f1",borderRadius:5}}>
                  {dieselHistorial.map((item,index)=>(
                    <View key={index}style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center",paddingVertical:6,borderBottomWidth:1,borderColor:"#ddd"}}>
                      <Text style={{flex:1}}> Cargas: {item.cantidad} Costo: {item.costo}</Text>
                         <View style={{flexDirection:"row"}}>
                            <TouchableOpacity onPress={()=>editarCarga(index)}style={{backgroundColor:"#b5b5b5",paddingHorizontal:10,paddingVertical:4,borderRadius:5,marginRight:8}}>
                             <Text style={{color:"#000"}}>Editar</Text>
                             </TouchableOpacity>
                             <TouchableOpacity onPress={()=>eliminarCarga(index)} style={{backgroundColor:"#cc0000",paddingHorizontal:10,paddingVertical:4,borderRadius:5}}>
                           <Text style={{color:"#fff"}}>Eliminar</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
            </View>
             <Text style={styles.label}>TAG:</Text>
             <TextInput value={tag}onChangeText={setTag}keyboardType="numeric"returnKeyLabel="done"mode="flat"underlineColor="#0d75bb" activeUnderlineColor="#0d75bb"textColor="#000"contentStyle={{ color: "#000", fontWeight: "600" }}style={styles.input}/>
             <Text style={{ fontWeight: "bold", fontSize: 18, marginTop: 15 }}>Total: ${calcularTotal()}</Text>
             
             <Text style={styles.label}>Subir Factura:</Text>
             
              {factura ? (
               <>
                {showFactura ? (
                  factura.toLowerCase().endsWith(".pdf") ? (
                   <View style={{ marginBottom: 10 }}>
                     <Text>Factura en PDF</Text>
                     <Button mode="contained" buttonColor="#499dd4"textColor="rgb(243, 246, 248)"onPress={() => Platform.OS === "web" ? window.open(factura, "_blank") : Linking.openURL(factura)}>Abrir PDF</Button>
                   </View>
                ):(
                  <Image source={{ uri: factura }} style={styles.facturaPreview} />
                )
              ) : (
              <Button mode="contained"buttonColor="#0d75bb" textColor="rgb(243, 246, 248)"onPress={() => setShowFactura(true)}>Mostrar Factura</Button>
              )}
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 5 }}>
                <Button mode="contained" buttonColor="#888"textColor="rgb(243, 246, 248)" onPress={pickFactura}>Reemplazar factura</Button>
                <Button mode="contained" buttonColor="#e27975ff" textColor="rgb(243, 246, 248)"onPress={() => { setFactura(null); setFacturaRemoved(true); setShowFactura(false); }}>Eliminar</Button>
              </View>
              </>
             ) : (
           <Button mode="contained" buttonColor="#094268"textColor="rgb(243, 246, 248)" onPress={pickFactura}>Subir factura</Button>
         )}
          {loading ? <ActivityIndicator style={{ marginTop: 20 }} /> : (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 20 }}>                                                                                                                                                                                                            
              <Button mode="contained" buttonColor="#888"textColor="rgb(243, 246, 248)" onPress={() => setModalVisible(false)}>Cancelar</Button>
              <Button mode="contained" buttonColor="#167abd" textColor="rgb(243, 246, 248)"onPress={saveViatico}>Guardar</Button>
            </View>
          )}

       </KeyboardAwareScrollView>
      </Modal>
    </View>
  );
}


const styles = StyleSheet.create({
  container:{flex: 1, padding: 15, backgroundColor: "#f5f5f5" },
  card:{backgroundColor: "#fff", padding: 12, marginBottom: 10, borderRadius: 8 },
  title:{fontSize: 22, fontWeight: "bold" },
  modalContent:{flex: 1, padding: 20 },
  modalTitle:{fontSize: 20, fontWeight: "bold", marginBottom: 15 },
  input:{backgroundColor: "#fff", marginBottom: 10 },
  label:{fontWeight: "bold", marginTop: 10 },
  picker:{backgroundColor: "#fff", borderRadius: 5, marginBottom: 10 },
  facturaPreview: {width: "100%", height: 200, resizeMode: "contain", marginBottom: 10 },
  inputLeftContainer:{alignItems:"flex-start",},
  inputLeft:{backgroundColor:"#fff", width:80, paddingHorizontal:0},
  subtitle:{fontSize:16,color:"#555"},
  total:{fontSize:16,marginTop:4,marginBottom:10},
  buttonRow:{flexDirection:"row",justifyContent:"space-between",marginTop:10},
  button:{flex:1, marginHorizontal:5},

});
