import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from '@react-native-picker/picker';
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { useEffect, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Button, TextInput } from "react-native-paper";
import * as XLSX from "xlsx";
import { useStore } from "../context/Store";
import { api } from "../services/api";


interface Trip {
  Viaje: any;
  tripId: unknown;
  conductorNombre: any;
  id: string; 
  rutaAcubrir: string;
  unidadId: string; 
  conductorId: string |{_id:string};
  fechaSalida: string; 
  fechaLlegada: string;
  destino: string;  
  estado: string;
  kilometrajeSalida?: number; 
  kilometrajeLlegada?:number;
  acompanante:string;
  def:string;
}

interface Unit { id: string; nombre: string; placa:string }
interface User { id: string; nombre: string; apellido?: string; }

export default function TripsPage() {
  const { currentUser } = useStore();
  //console.log("current user",currentUser);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [rutaAcubrir, setRutaAcubrir] = useState("");
  const [unidadId, setUnidadId] = useState("");
  const [conductorId, setConductorId] = useState("");
  const [fechaSalida, setFechaSalida] = useState("");
  const [fechaLlegada, setFechaLlegada] = useState("");
  const [destino, setDestino] = useState("");
  const [estado, setEstado] = useState("pendiente");
  const [kilometrajeSalida, setKilometrajeSalida] = useState("");
  const [kilometrajeLlegada, setKilometrajeLlegada] = useState("");
  const [acompanante,setAcompanante]=useState("");
  const [def,setDef]=useState("");
  const [exportType , setExportType]=useState("");
  const [showLlegadaPicker,setShowLlegadaPicker]=useState (false);
  const [showSalidaPicker,setShowSalidaPicker]=useState (false);
  const [selectedUnit,setSelectedUnit]=useState<Unit | null>(null);
  const [unitPlaca,setUnitPlaca]=useState("");
  const [tipoRemolque,setTipoRemolque]=useState("");
  const [mostrarRemolque,setMostrarRemolque]=useState(false);
  const [placaRemolque,setPlacaRemolque]=useState("");


  useEffect(() => {
    if (currentUser) {
      loadTrips();
      loadUnits();
      loadUsers();
    }
  }, [currentUser]);
  if (!currentUser) {
    return (
      <View style={{flex:1,justifyContent:"center",alignItems:"center"}}>
        <Text>Cargando usuario...</Text>

      </View>
    );
  }
  const isAdmin= currentUser.rol?.toLocaleLowerCase() ==="admin";
  const loadTrips = async () => {
  try {
    let token: string | null = null;
    if (Platform.OS === "web") {
      token = localStorage.getItem("token");
    } else {
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      token = await AsyncStorage.getItem("token");
    }
    if (!token) {
      console.warn("No hay token disponible. No se pudo cargar los viajes.");
      Alert.alert("Error", "No se pudo cargar viajes: token no disponible");
      return;
    }
    console.log ("Token usando en loadtrips",token);
    const res =await api.get("/trips",{
      headers:{
        Authorization:`Bearer ${token}`,
      },
    });
    console.log("Respuesta backend",res.data);
    let allTrips = res.data.map((t: any) => ({...t, id: t._id }));
    if (!isAdmin) {
  allTrips = allTrips.filter((t: any) => {
    const conductor = typeof t.conductorId === "object"
      ? t.conductorId._id
      : t.conductorId;

      console.log ("Condutor del vaije",conductor);
      console.log("Usuario actual",currentUser.id);
    return String(conductor) === String(currentUser._id);
  });
}
    setTrips(allTrips);
    generateReports(allTrips);
  } catch (error: any) {
    console.error("Error cargando viajes:", error.response?.data || error);
    Alert.alert("Error", "No se pudieron cargar los viajes. Ver consola para más detalles.");
  }
};
  const loadUnits =async ()=>{
    try {
      const res=await api.get("/units");
      setUnits(res.data.map((u:any)=>({
        id: u._id,
        nombre: u.nombre,
        placa:u.placas ?? "",
      })));
    }catch (error){
      console.error("Error cargando unidades",error)
    }
  }

  const generateReports =(tripsData:Trip[])=>{
     const daily:{[key:string]:number}={};
     const monthly:{[key:string]:number}={};
    tripsData.forEach((trip)=>{
      const salida=new Date(trip.fechaSalida);
      const daykey =salida.toLocaleDateString("es-ES");
      const monthkey =`${salida.getMonth ()+1}/${salida.getFullYear()}`;
      daily[daykey]=(daily[daykey] || 0)+1;
      monthly[monthkey]=(monthly[monthkey] || 0) +1;
    });

  }
  const loadUsers = async () => {
    try {
      const res = await api.get("/users");
      setUsers(res.data.map((u: any) => ({ ...u, id: u._id })));
    } catch (error) {
      console.error("Error cargando usuarios:", error);
    }
  };
  const openModal = (trip?: Trip) => {
    if (trip) {
      setEditingTrip(trip);
      setRutaAcubrir(trip.rutaAcubrir);
      setUnidadId(trip.unidadId);
      const conductorId =typeof trip.conductorId === "object"? trip.conductorId._id : trip.conductorId;
      setConductorId(conductorId);
      setFechaSalida(new Date(trip.fechaSalida).toLocaleDateString("es-ES"));
      setFechaLlegada(trip.fechaLlegada? new Date(trip.fechaLlegada).toLocaleDateString("es-ES"): "");
      setDestino(trip.destino);
      setEstado(trip.estado);
      setKilometrajeSalida(trip.kilometrajeSalida?.toString() || "");
      setKilometrajeLlegada(trip.kilometrajeLlegada?.toString() || "");
      setAcompanante(trip.acompanante)
      setDef(trip.def || "");
      } else {
      setEditingTrip(null);
      setRutaAcubrir("");  
      setUnidadId(""); 
      setConductorId("");  
      setFechaSalida("");
      setFechaLlegada("");  
      setDestino(""); 
      setEstado("pendiente");   
      setKilometrajeSalida("");
      setAcompanante("");
      setDef("");
    }
    setModalVisible(true);
  };
  const parseDate = (dateStr: string) => {
    const [day, month, year] = dateStr.split("/");
    return new Date(Number(year), Number(month) - 1, Number(day));
  };
  
  const saveTrip = async () => {
  const estadoCalculado = fechaLlegada && fechaLlegada.trim() !== "" ? "completado" : "pendiente";

  if (isAdmin) {
    if (!rutaAcubrir|| !unidadId || !conductorId || !fechaSalida) {
      Alert.alert("Falta información", "Nombre, unidad, conductor y fecha de salida son obligatorios.");
      return;
    }
  }
  const payload: any = {
    rutaAcubrir:rutaAcubrir,
    unidadId,
    conductorId,
    destino,
    fechaLlegada:parseDate(fechaLlegada),
    estado: estadoCalculado,
  };
  if (fechaSalida && fechaSalida.trim() !== "") {
    payload.fechaSalida = parseDate(fechaSalida);
  }
  if (fechaLlegada && fechaLlegada.trim() !== "") {
    payload.fechaLlegada = parseDate(fechaLlegada);
  }
  if (kilometrajeSalida && kilometrajeSalida.trim() !== "") {
    payload.kilometrajeSalida = Number(kilometrajeSalida);
  }
  if (kilometrajeLlegada && kilometrajeLlegada.trim() !== "") {
    payload.kilometrajeLlegada=Number(kilometrajeLlegada);
  }
  // llama a atraer el tipo de remolque 
  if(mostrarRemolque){
    if(tipoRemolque)payload.tipoRemolque=tipoRemolque;
    if(placaRemolque)payload.placaRemolque=placaRemolque;
  }

  payload.acompanante = acompanante === "none" || acompanante === ""? null:acompanante;
  if (def && def.trim() !== "") payload.def = def;
  try {
    if (editingTrip) {
      await api.put(`/trips/${editingTrip.id}`, payload);
    } else if (isAdmin) {
      await api.post("/trips", payload);
    }
    await loadTrips();
    setModalVisible(false);
  } catch (error: any) {
    console.error("Error guardando viaje", error.response?.data || error);
    Alert.alert("Error", "No se pudo guardar el viaje. Revisa la consola para más detalles.");
  }
};

  const deleteTrip = async (id: string) => {
    if (!isAdmin) return;
    let confirmed = false;
    if (Platform.OS === "web") {
      confirmed = window.confirm("¿Desea eliminar este viaje?");
      if (!confirmed) return;
    } else {
      confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert("Confirmar", "¿Desea eliminar este viaje?", [
          { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
          { text: "Eliminar", style: "destructive", onPress: () => resolve(true) },
        ], { cancelable: true });
      });
      if (!confirmed) return;
    }

    try {
      await api.delete(`/trips/${id}`);
      setTrips((prev) => prev.filter((t) => t.id !== id));
      Alert.alert("Éxito", "Viaje eliminado correctamente");
    } catch (error) {
      console.error("Error eliminando viaje", error);
      Alert.alert("Error", "No se pudo eliminar el viaje");
    }
  };

//exportacion excel 
  const exportToExcel = async () => {
  try {
    if (!trips.length) {
      Alert.alert("Aviso", "No hay viajes para exportar");
      return;
    }

    const sortedTrips = [...trips].sort(
      (a, b) =>
        new Date(a.fechaSalida).getTime() -
        new Date(b.fechaSalida).getTime()
    );

    const ws_data: any[][] = [];

    let currentMonth = "";
    let currentWeek = 0;
    let currentDay = 0;

    let monthTotal = 0;
    let weekTotal = 0;
    let dayTotal = 0;

    for (const t of sortedTrips) {
      const salida = new Date(t.fechaSalida);
      const llegada = new Date(t.fechaLlegada);

      const monthName = salida.toLocaleString("es-ES", {
        month: "long",
        year: "numeric",
      });

      const weekNumber = Math.ceil(salida.getDate() / 7);
      const dayNumber = salida.getDate();

      //  CAMBIO DE MES
      if (monthName !== currentMonth) {

        if (currentMonth !== "") {
          ws_data.push([`TOTAL DÍA ${currentDay}: ${dayTotal}`]);
          ws_data.push([`TOTAL SEMANA ${currentWeek}: ${weekTotal}`]);
          ws_data.push([`TOTAL MES ${currentMonth}: ${monthTotal}`]);
          ws_data.push([]);
        }

        ws_data.push([`MES: ${monthName.toUpperCase()}`]);
        ws_data.push([
          "Semana",
          "Nombre",
          "Destino",
          "Fecha salida",
          "Fecha llegada",
          "Día",
          "Conductor",
          "Acompañante",
          "KilometrajeSalida",
          "KilometrajeLlegada",
          "Estado",
        ]);

        currentMonth = monthName;
        currentWeek = 0;
        currentDay = 0;
        monthTotal = 0;
        weekTotal = 0;
        dayTotal = 0;
      }

      //cambio de semana 
      if (weekNumber !== currentWeek) {

        if (currentWeek !== 0) {
          ws_data.push([`TOTAL SEMANA ${currentWeek}: ${weekTotal}`]);
          ws_data.push([]);
        }
        currentWeek = weekNumber;
        weekTotal = 0;
      }
      // cambio de dia 
      if (dayNumber !== currentDay) {

        if (currentDay !== 0) {
          ws_data.push([`TOTAL DÍA ${currentDay}: ${dayTotal}`]);
        }

        currentDay = dayNumber;
        dayTotal = 0;
      }

      ws_data.push([
        weekNumber,
        t.rutaAcubrir ?? "N/A",
        t.destino ?? "N/A",
        salida.toLocaleDateString("es-ES"),
        llegada.toLocaleDateString("es-ES"),
        dayNumber,
        users.find((u) => u.id === t.conductorId)?.nombre ?? "N/A",
        t.acompanante ?? "N/A",
        Number(t.kilometrajeSalida ?? 0),
        Number(t.kilometrajeLlegada ?? 0),
        t.estado ?? "N/A",
      ]);

      dayTotal++;
      weekTotal++;
      monthTotal++;
    }

    ws_data.push([`TOTAL DÍA ${currentDay}: ${dayTotal}`]);
    ws_data.push([`TOTAL SEMANA ${currentWeek}: ${weekTotal}`]);
    ws_data.push([`TOTAL MES ${currentMonth}: ${monthTotal}`]);

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte_Viajes");

    if (Platform.OS === "web") {
      const excelBuffer = XLSX.write(wb, { bookType: "xlsx",type: "array",});
      const blob = new Blob([excelBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Reporte_Viajes.xlsx";
      a.click();
      window.URL.revokeObjectURL(url);

    } else {

      const base64 = XLSX.write(wb, {
        bookType: "xlsx",
        type: "base64",
      });

      const fileUri =(FileSystem as any).documentDirectory + "Reporte_Viajes.xlsx";

      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: "base64",
      });

      await Sharing.shareAsync(fileUri);
    }
    Alert.alert("Éxito", "Reporte Excel generado correctamente");

  } catch (error) {
    console.error("Error exportando Excel", error);
    Alert.alert("Error", "No se pudo generar el archivo excel");
  }
};


  const renderItem = ({ item }: { item: Trip }) => {
    const unidadNombre = units.find(u => u.id === item.unidadId)?.nombre || item.unidadId;
    const conductorId=typeof item.conductorId ==="object" ?item.conductorId._id :item.conductorId;
    const conductorNombre=users.find(u => u.id === conductorId)?.nombre || "N/A";
    const AcompananteNombre=item.acompanante === "none" ? "Sin acompañante" :(users.find(u=> u.id === item.acompanante)?.nombre ?? "Sin acompañante");
    const conductorIdItme=typeof item.conductorId === "object" ? item.conductorId._id :item.conductorId;
    const canEdit=isAdmin || String (currentUser._id) === String(conductorIdItme);
    const canDelete = isAdmin;
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{item.rutaAcubrir}</Text>
        <Text style={styles.textSmall}>Unidad:{unidadNombre} {unitPlaca}</Text>
        <Text style={styles.textSmall}>Conductor:{conductorNombre}</Text>
        <Text style={styles.textSmall}>Acompañante:{AcompananteNombre}</Text>
        <Text style={styles.textSmall}>Destino:{item.destino}</Text>
        <Text style={styles.textSmall}>Salida:{new Date(item.fechaSalida).toLocaleDateString()}</Text>
        <Text style={styles.textSmall}>Llegada:{new Date(item.fechaLlegada).toLocaleDateString()}</Text>
        <Text style={styles.textSmall}>Estado: {item.estado}</Text>
        <Text style={styles.textSmall}>Def:{item.def}</Text>
        <Text style={styles.textSmall}>KilometrajeSalida: {item.kilometrajeSalida ?? 0} km</Text>
        <Text style={styles.textSmall}>KilometrajeLlegada: {item.kilometrajeLlegada ?? 0} km</Text>
        <View style={{ flexDirection: "row", marginTop: 5, gap: 10 }}>
          {canEdit && <Button mode="contained" buttonColor="#008bff" textColor="rgb(243, 246, 248)"onPress={() => openModal(item)}>Editar</Button>}
          {canDelete && <Button mode="contained" buttonColor="red"textColor="rgb(243, 246, 248)" onPress={() => deleteTrip(item.id)}>Eliminar</Button>}
        </View>
      </View>
    );
  };
  function setFilter(itemValue: { new(fileBits: BlobPart[], fileName: string, options?: FilePropertyBag | undefined): File; prototype: File; }, itemIndex: number): void {
    throw new Error('Function not implemented.');
  }
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Viajes Registrados</Text>
      {isAdmin && <Button mode="contained" buttonColor="#0d75bb"textColor="rgb(243, 246, 248)" onPress={() => openModal()}>Nuevo Viaje</Button>}
      {isAdmin && (
       <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
       <Text style={{ fontWeight: "bold", marginRight: 8,}}>Exportar por:</Text>
       <View style={{ flex: 1, backgroundColor: "#fff", borderRadius: 5, marginRight: 8 }}>
       <Picker selectedValue={exportType} onValueChange={(value) => setExportType(value)}style={{ height: 20 }} >
        <Picker.Item label="Día" value="dia" />
        <Picker.Item label="Semana" value="semana" />
        <Picker.Item label="Mes" value="mes" />
       </Picker>
       </View>
       <Button mode="contained" buttonColor="#0d75bb" textColor="rgb(243, 246, 248)"onPress={exportToExcel }>Exportar Excel  </Button>
         </View>
      )}
      <FlatList data={trips}keyExtractor={(item) => item.id}renderItem={renderItem}style={{ marginTop: 15 }}/>
      <Modal visible={modalVisible} animationType="slide">
        <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS === "ios" ?"padding":"height"}>
      <ScrollView style={styles.modalContent}>
      <Text style={styles.modalTitle}> {editingTrip ? "Editar Viaje" : "Nuevo Viaje"}</Text>
      {isAdmin ? (
        <>
         <Text style={styles.label}>Ruta a cubrir:</Text>
         <TextInput value={rutaAcubrir} onChangeText={setRutaAcubrir} mode="flat" underlineColor="#8bc1e6ff" activeUnderlineColor="#8bc1e6ff" dense textColor="#000"contentStyle={{ color: "#000", fontWeight: "600" }} style={styles.input} />
         <Text style={styles.label}>Unidad:</Text>
         <Picker selectedValue={unidadId} onValueChange={(value)=>{ setUnidadId(value);
         const unidad = units.find((u)=>u.nombre === value) || null;
         setSelectedUnit(unidad);
         setUnitPlaca(unidad?.placa ?? "");
         console.log("Unidad seleccionada:", unidad);
         if (unidad && ( unidad.nombre === "002" || unidad.nombre === "007" )) {
          setMostrarRemolque(true);
         } else {
          setMostrarRemolque(false);
          setTipoRemolque("");
          setPlacaRemolque("");
        }
       }}
        style={styles.picker}>
          <Picker.Item label="Seleccionar unidad" value=""/>
          {units.map((u)=>(
            <Picker.Item
            key={u.id}label={`${u.nombre} ${u.placa}`}value={u.id}
            />
             ))}
             </Picker>
        {mostrarRemolque && (
          <>
          <Text style={styles.label}>Tipo remolque:</Text>
          <Picker selectedValue={tipoRemolque} onValueChange={setTipoRemolque} style={styles.picker}>
            <Picker.Item label="Seleccionar Tipo "value=""/>
            <Picker.Item label="Lowboy"value="lowboy"/>
            <Picker.Item label="Caja seca"value="caja seca"/>
          </Picker>
          <Text style={styles.label}>Placa del remolque</Text>
          <TextInput value={placaRemolque}onChangeText={setPlacaRemolque}mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"dense textColor="#000"contentStyle={{ color: "#000", fontWeight: "600" }}style={styles.input} placeholder="Ingrese la placa"/>
          </>
        )}
        <Text style={styles.label}>Conductor:</Text>
        <Picker selectedValue={conductorId} onValueChange={setConductorId} style={styles.picker}>
          <Picker.Item label="Selecciona conductor" value="" />
          {users.map(u => <Picker.Item key={u.id} label={u.nombre} value={u.id}  />)}
        </Picker>
        <Text style={styles.label}>Acompañante:</Text>
        <Picker selectedValue={acompanante} onValueChange={setAcompanante} style={styles.picker}>

          <Picker.Item label="Selecciona acompañante" value="" />
          <Picker.Item label="Sin acompañante" value="none" />
          {users.map(u => <Picker.Item key={u.id} label={u.nombre} value={u.id} />)}
        </Picker>
        <Text style={styles.label}>Def entregado </Text>
         <TextInput value={def} onChangeText={setDef} mode="flat" underlineColor="#0d75bb" activeUnderlineColor="#0d75bb" dense textColor="#000"contentStyle={{ color: "#000", fontWeight: "600" }} style={styles.input} />
        <Text style={styles.label}>Destino:</Text>
         <TextInput value={destino} onChangeText={setDestino} mode="flat" underlineColor="#0d75bb" activeUnderlineColor="#0d75bb" dense  textColor="#000"contentStyle={{ color: "#000", fontWeight: "600" }}style={styles.input} />
        <View style={styles.row}>
          <View style={styles.field}>
            <Text style={styles.label}>Kilometraje salida km</Text>
            <TextInput value={kilometrajeSalida}onChangeText={setKilometrajeSalida}keyboardType="numeric"mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"dense textColor="#000"contentStyle={{color:"#000",fontWeight:"600"}}style={styles.input}/>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Kilometraje llegada km</Text>
            <TextInput value={kilometrajeLlegada}onChangeText={setKilometrajeLlegada}keyboardType="numeric"mode="flat"underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"dense textColor="#000"contentStyle={{color:"#000",fontWeight:"600"}}style={styles.input}/>
          </View>
        </View>
        <Text style={styles.label}>Fecha de Salida:</Text>
        {Platform.OS === "web" ?(
          <input type="date" value={fechaSalida 
          ? new Date(parseDate(fechaSalida)).toISOString().split("T")[0]
           : ""
          }
          onChange={(e)=>{
            const date=new Date(e.target.value);
            const f= ("0"+date.getDate()).slice(2) +"/"+
                     ("0"+(date.getMonth()+1)).slice(2)+"/"+
                     date.getFullYear();
            setFechaSalida(f);
          }}
          style={{padding:10,borderRadius:5,marginBottom:10}}/>
        ):(
          <>
          <TouchableOpacity onPress={()=>setShowLlegadaPicker(true)}>
            <TextInput value="fechaSalida" placeholder="Seleccionar fecha" editable={false} style={styles.input}/>
          </TouchableOpacity>
          { setShowSalidaPicker && (
            <DateTimePicker value={new Date()} mode="date" display="default" onChange={(event,date)=>{
              setShowSalidaPicker(false);
              if (date){
                const f =
                  ("0" + date.getDate()).slice(-2)+ "/"+
                  ("0" +(date.getMonth()+1)).slice(-2)+"/"+
                  date.getFullYear();

                  setFechaSalida(f);
              }
            }}
            />
          )}
          </>
        )}
         <Text style={styles.label}>Fecha de Llegada:</Text>
        {Platform.OS === "web" ?(
          <input type="date" value={fechaLlegada ? new Date(parseDate(fechaLlegada)).toISOString().split("T")[0] : ""}
          onChange={(e)=>{
            const date =new Date (e.target.value);
             const f= 
                      ("0" +date.getDate()).slice(2) +"/"+
                      ("0" +(date.getMonth()+1)).slice(2)+"/"+
                      date.getFullYear();
                      setFechaLlegada(f);
          }}
          style={{padding:10,borderRadius:5,marginBottom:10}}/>
        ):(
          <>
          <TouchableOpacity onPress={()=>setShowLlegadaPicker(true)}>
            <TextInput value="fechaLlegada" placeholder="Seleccionar fecha" editable={false} style={styles.input}/>
          </TouchableOpacity>
          { setShowSalidaPicker && (
            <DateTimePicker value={new Date()} mode="date" display="default" onChange={(event,date)=>{
              setShowSalidaPicker(false);
              if (date){
                const f =
                  ("0" + date.getDate()).slice(-2)+ "/"+
                  ("0" +(date.getMonth()+1)).slice(-2)+"/"+
                  date.getFullYear();

                  setFechaLlegada(f);
              }
            }}
            />
          )}
          </>
        )}

        </>
        ) : (
        <>
        <Text style={styles.label}>Fecha de llegada</Text>
        {Platform.OS === "web" ?(
          <input type="date" onChange={(e)=>{const date=new Date(e.target.value);
            const f= 
               ("0" + date.getDate()).slice(-2) +"/" +
               ("0" + (date.getMonth() +1)).slice(-2) + "/"+
               date.getFullYear();
               setFechaLlegada(f);
          }}
          />
        ):(
          <>
          <TouchableOpacity onPress={() => setShowLlegadaPicker(true)}>
            <TextInput value={fechaLlegada} placeholder="seleccionar fecha" editable={false} style={styles.input}/>
          </TouchableOpacity>
          {showLlegadaPicker && (
            <DateTimePicker value={new Date()} mode="date" display="default" onChange={(event,date)=> {
              setShowLlegadaPicker(false)
              if (date){
                const f= ("0" +date.getDate()).slice(-2) +"/"+
                         ("0" + (date.getMonth ()+1)).slice (-2) +"/"+
                         date.getFullYear();
                    setFechaLlegada(f);
              }
            }}
            />
          )}
          </>
        )}
        </>
        )}  
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10 }}>
          <Button mode="contained" buttonColor="#888"textColor="rgb(243, 246, 248)" onPress={() => setModalVisible(false)}>Cancelar</Button>
          <Button mode="contained" buttonColor="#167abdff" textColor="rgb(243, 246, 248)"onPress={saveTrip}>Guardar
      </Button>
    </View>
  </ScrollView>
  </KeyboardAvoidingView>
</Modal>
</View>
  )
};
const styles = StyleSheet.create({
  container:{flex: 1, padding: 15, backgroundColor: "#f5f5f5" },
  card:{backgroundColor: "#fff", padding: 10, marginBottom: 10, borderRadius: 8 },
  title:{fontSize: 22, fontWeight: "bold", marginBottom: 5 },
  textSmall:{fontSize: 13, marginBottom: 2 },
  modalContent:{flex: 1, padding: 20 },
  modalTitle:{fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  input:{borderRadius: 5, padding: 8, marginBottom: 10, backgroundColor: "#fff" },
  label:{fontWeight: "bold", marginBottom: 5 },
  picker:{backgroundColor: "#fff", borderRadius: 5, marginBottom: 10 },
  row:{flexDirection:"row" ,justifyContent:"space-between",gap:15},
  field:{flex:1}
});