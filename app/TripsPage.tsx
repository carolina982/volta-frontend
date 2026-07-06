import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from '@react-native-picker/picker';
import React, { useEffect, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Button, TextInput } from "react-native-paper";
import { useStore } from "../context/Store";
import { api } from "../services/api";

interface KilometrajeRegistro {
  km: string;
  descripcion: string;
}

interface Trip {
  id: string; 
  rutaAcubrir: string;
  unidadId: string; 
  conductorId: string | {_id: string};
  fechaSalida: string; 
  fechaLlegada: string;
  destino: string;  
  estado: string;
  acompanante: string;
  def: string;
  
  kilometrajeSalida?: { numero: number; descripcion: string }[];
  kilometrajeLlegada?: { numero: number; descripcion: string }[];
  
  kmSalidaList?: KilometrajeRegistro[];
  kmLlegadaList?: KilometrajeRegistro[];
}

interface Unit { id: string; nombre: string; placa: string }
interface User { id: string; nombre: string; apellido?: string; }

export default function TripsPage() {
  const { currentUser } = useStore();
  
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
  const [acompanante, setAcompanante] = useState("");
  const [def, setDef] = useState("");
  const [exportType, setExportType] = useState("dia");
  const [showLlegadaPicker, setShowLlegadaPicker] = useState(false);
  const [showSalidaPicker, setShowSalidaPicker] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [unitPlaca, setUnitPlaca] = useState("");
  const [tipoRemolque, setTipoRemolque] = useState("");
  const [mostrarRemolque, setMostrarRemolque] = useState(false);
  const [placaRemolque, setPlacaRemolque] = useState("");
  const [viajesActivos, setViajesActivos] = useState(0);

  // Estados para ocultar/mostrar los historiales de kilometraje
  const [mostrarHistorialSalida, setMostrarHistorialSalida] = useState(false);
  const [mostrarHistorialLlegada, setMostrarHistorialLlegada] = useState(false);

  // Lista de historial de kilometraje
  const [kmSalidaList, setKmSalidaList] = useState<KilometrajeRegistro[]>([{ km: "", descripcion: "" }]);
  const [kmLlegadaList, setKmLlegadaList] = useState<KilometrajeRegistro[]>([{ km: "", descripcion: "" }]);

  useEffect(() => {
    if (currentUser) {
      loadTrips();
      loadUnits();
      loadUsers();
    }
  }, [currentUser]);

  if (!currentUser) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f4f6f9" }}>
        <Text>Cargando usuario...</Text>
      </View>
    );
  }

  const isAdmin = currentUser.rol?.toLowerCase() === "admin";

  const loadTrips = async () => {
    try {
      let token: string | null = null;
      if (Platform.OS === "web") {
        token = localStorage.getItem("token");
      } else {
        const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
        token = await AsyncStorage.getItem("token");
      }
      if (!token) return;
      
      const res = await api.get("/trips", {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      let allTrips = res.data.map((t: any) => ({ ...t, id: t._id }));
      if (!isAdmin) {
        allTrips = allTrips.filter((t: any) => {
          const conductor = typeof t.conductorId === "object" ? t.conductorId._id : t.conductorId;
          return String(conductor) === String(currentUser._id);
        });
      }
      setTrips(allTrips);
      const activos = allTrips.filter((t: Trip) => t.estado.toLowerCase() === "pendiente").length;
      setViajesActivos(activos);
    } catch (error: any) {
      console.error("Error cargando viajes:", error);
    }
  };

  const loadUnits = async () => {
    try {
      const res = await api.get("/units");
      setUnits(res.data.map((u: any) => ({
        id: u._id,
        nombre: u.nombre,
        placa: u.placas ?? "",
      })));
    } catch (error) {
      console.error("Error cargando unidades", error);
    }
  };
  
  const loadUsers = async () => {
    try {
      const res = await api.get("/users");
      setUsers(res.data.map((u: any) => ({ ...u, id: u._id })));
    } catch (error) {
      console.error("Error cargando usuarios:", error);
    }
  };

  const openModal = (trip?: Trip) => {
    setMostrarHistorialSalida(false);
    setMostrarHistorialLlegada(false);

    if (trip) {
      setEditingTrip(trip);
      setRutaAcubrir(trip.rutaAcubrir || "");
      setUnidadId(trip.unidadId || "");
      
      const cId = typeof trip.conductorId === "object" ? trip.conductorId._id : trip.conductorId;
      setConductorId(cId || "");
      
      setFechaSalida(trip.fechaSalida ? new Date(trip.fechaSalida).toLocaleDateString("es-ES") : "");
      setFechaLlegada(trip.fechaLlegada ? new Date(trip.fechaLlegada).toLocaleDateString("es-ES") : "");
      setDestino(trip.destino || "");
      setEstado(trip.estado || "pendiente");
      setAcompanante(typeof trip.acompanante === "object" ? (trip.acompanante as any)._id : (trip.acompanante || ""));
      setDef(trip.def || "");
      
      // CORRECCIÓN AQUÍ: 
      // Mapeamos lo que viene de la DB (numero) hacia lo que espera tu formulario (km)
      // Usamos 'any' en el mapeo para evitar el error de TypeScript sobre el tipo de dato
      setKmSalidaList(
        trip.kilometrajeSalida && Array.isArray(trip.kilometrajeSalida) 
          ? trip.kilometrajeSalida.map((i: any) => ({ km: String(i.numero), descripcion: i.descripcion }))
          : [{ km: "", descripcion: "" }]
      );
      
      setKmLlegadaList(
        trip.kilometrajeLlegada && Array.isArray(trip.kilometrajeLlegada)
          ? trip.kilometrajeLlegada.map((i: any) => ({ km: String(i.numero), descripcion: i.descripcion }))
          : [{ km: "", descripcion: "" }]
      );
      
    } else {
      setEditingTrip(null);
      setRutaAcubrir("");  
      setUnidadId(""); 
      setConductorId("");  
      setFechaSalida("");
      setFechaLlegada("");  
      setDestino(""); 
      setEstado("pendiente");   
      setAcompanante("");
      setDef("");
      setKmSalidaList([{ km: "", descripcion: "" }]);
      setKmLlegadaList([{ km: "", descripcion: "" }]);
    }
    setModalVisible(true);
  };

const agregarKmSalida = () => {
   
    setKmSalidaList([{ km: "", descripcion: "" }, ...kmSalidaList]);
  };

  const agregarKmLlegada = () => {
    
    setKmLlegadaList([{ km: "", descripcion: "" }, ...kmLlegadaList]);
  };

  const parseDate = (dateStr: string) => {
    const [day, month, year] = dateStr.split("/");
    return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
  };
  
const saveTrip = async () => {
  const estadoCalculado = fechaLlegada && fechaLlegada.trim() !== "" ? "completado" : "pendiente";

  // Validación básica
  if (isAdmin && (!rutaAcubrir || !unidadId || !conductorId || !fechaSalida)) {
    Alert.alert("Falta información", "Ruta, unidad, conductor y fecha de salida son obligatorios.");
    return;
  }
  
const formatList = (list: KilometrajeRegistro[]) => 
    list
      .filter(item => item.km && item.km.trim() !== "")
      .map(item => ({ 
        // Forzamos a número explícitamente
        numero: Number(item.km), 
        descripcion: item.descripcion ? String(item.descripcion) : "" 
      }));

  const payload: any = {
    rutaAcubrir,
    unidadId,
    conductorId: typeof conductorId === "object" ? (conductorId as any)._id : conductorId,
    destino,
    estado: estadoCalculado,
    acompanante: (acompanante === "none" || acompanante === "") ? null : acompanante,
    def: def || "",
    kilometrajeSalida: formatList(kmSalidaList),
    kilometrajeLlegada: formatList(kmLlegadaList)
  };

  // Limpieza extra: Eliminar campos nulos para no enviar claves vacías que puedan molestar a Mongoose
  if (!payload.acompanante) delete payload.acompanante;
  if (!payload.def) payload.def = "";

  if (fechaSalida) payload.fechaSalida = parseDate(fechaSalida).toISOString();
  if (fechaLlegada) payload.fechaLlegada = fechaLlegada.trim() !== "" ? parseDate(fechaLlegada).toISOString() : null;

  try {
    // Si la fecha de llegada es null, asegúrate de no enviarla si el esquema no la permite
    if (!payload.fechaLlegada) delete payload.fechaLlegada;

    if (editingTrip) {
      await api.put(`/trips/${editingTrip.id}`, payload);
    } else {
      await api.post("/trips", payload);
    }
    
    Alert.alert("Éxito", "Viaje guardado correctamente");
    await loadTrips();
    setModalVisible(false);
  } catch (error: any) {
    console.error("Error al guardar:", error.response?.data);
    Alert.alert("Error", "Revisa la consola para el detalle del error.");
  }
};
  


  const deleteTrip = async (id: string) => {
    if (!isAdmin) return;
    try {
      await api.delete(`/trips/${id}`);
      setTrips((prev) => prev.filter((t) => t.id !== id));
    } catch (error) {
      console.error("Error eliminando viaje", error);
    }
  };

  const exportToExcel = async () => { /* ... código de exportación intacto ... */ };

  const renderItem = ({ item }: { item: Trip }) => {
    const unidadNombre = units.find(u => u.id === item.unidadId)?.nombre || item.unidadId;
    const conductorId = typeof item.conductorId === "object" ? item.conductorId._id : item.conductorId;
    const conductorNombre = users.find(u => u.id === conductorId)?.nombre || "N/A";
    const AcompananteNombre = item.acompanante === "none" || !item.acompanante ? "Sin acompañante" : (users.find(u => u.id === item.acompanante)?.nombre ?? "Sin acompañante");
    const canEdit = isAdmin || String(currentUser._id) === String(conductorId);
    const canDelete = isAdmin;

    return (
      <View style={styles.card}>
        <Text style={styles.title}>{item.rutaAcubrir}</Text>
        <Text style={styles.textSmall}>Unidad: {unidadNombre}</Text>
        <Text style={styles.textSmall}>Conductor: {conductorNombre}</Text>
        <Text style={styles.textSmall}>Acompañante: {AcompananteNombre}</Text>
        <Text style={styles.textSmall}>Destino: {item.destino}</Text>
        <Text style={styles.textSmall}>Salida: {item.fechaSalida ? new Date(item.fechaSalida).toLocaleDateString() : "N/A"}</Text>
        <Text style={styles.textSmall}>Llegada: {item.fechaLlegada ? new Date(item.fechaLlegada).toLocaleDateString() : "N/A"}</Text>
        <Text style={styles.textSmall}>Estado: {item.estado}</Text>
        <Text style={styles.textSmall}>Def: {item.def || "Ninguno"}</Text>
        <View style={{ flexDirection: "row", marginTop: 8, gap: 10 }}>
          {canEdit && <Button mode="contained" buttonColor="#008bff" textColor="rgb(243, 246, 248)" onPress={() => openModal(item)}>Editar</Button>}
          {canDelete && <Button mode="contained" buttonColor="red" textColor="rgb(243, 246, 248)" onPress={() => deleteTrip(item.id)}>Eliminar</Button>}
        </View>
      </View>
    );
  };
 
  return (
    <View style={styles.container}>
      {/* HEADER DE LA PÁGINA CON TITULO Y BADGE DE VIAJES ACTIVOS */}
      <View style={styles.headerRow}>
        <Text style={styles.titleMain}>Viajes Registrados</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{viajesActivos} Activos</Text>
        </View>
      </View>

      {isAdmin && <Button mode="contained" buttonColor="#0d75bb" textColor="rgb(243, 246, 248)" onPress={() => openModal()}>Nuevo Viaje</Button>}
      
      {isAdmin && (
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
          <Text style={{ fontWeight: "bold", marginRight: 8 }}>Exportar por:</Text>
          <View style={{ flex: 1, backgroundColor: "#fff", borderRadius: 5, marginRight: 8, height: 40, justifyContent: "center" }}>
            <Picker selectedValue={exportType} onValueChange={(value) => setExportType(value)}>
              <Picker.Item label="Día" value="dia" />
              <Picker.Item label="Semana" value="semana" />
              <Picker.Item label="Mes" value="mes" />
            </Picker>
          </View>
          <Button mode="contained" buttonColor="#0d75bb" textColor="rgb(243, 246, 248)" onPress={exportToExcel}>Exportar Excel</Button>
        </View>
      )}

      <FlatList data={trips} keyExtractor={(item) => item.id} renderItem={renderItem} style={{ marginTop: 15 }} />

      <Modal visible={modalVisible} animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingTrip ? "Editar Viaje" : "Nuevo Viaje"}</Text>
            
            {isAdmin ? (
              <>
                <Text style={styles.label}>Ruta a cubrir:</Text>
                <TextInput value={rutaAcubrir} onChangeText={setRutaAcubrir} mode="flat" underlineColor="#8bc1e6ff" activeUnderlineColor="#8bc1e6ff" dense textColor="#000" contentStyle={{ color: "#000", fontWeight: "600" }} style={styles.input} />
                
                <Text style={styles.label}>Unidad:</Text>
                <View style={styles.pickerContainer}>
                  <Picker selectedValue={unidadId} onValueChange={(value) => { 
                    setUnidadId(value);
                    const unidad = units.find((u) => u.id === value) || null;
                    setSelectedUnit(unidad);
                    setUnitPlaca(unidad?.placa ?? "");
                    if (unidad && (unidad.nombre === "002" || unidad.nombre === "007")) {
                      setMostrarRemolque(true);
                    } else {
                      setMostrarRemolque(false);
                      setTipoRemolque("");
                      setPlacaRemolque("");
                    }
                  }}>
                    <Picker.Item label="Seleccionar unidad" value="" />
                    {units.map((u) => <Picker.Item key={u.id} label={`${u.nombre} ${u.placa}`} value={u.id} />)}
                  </Picker>
                </View>

                {mostrarRemolque && (
                  <>
                    <Text style={styles.label}>Tipo remolque:</Text>
                    <View style={styles.pickerContainer}>
                      <Picker selectedValue={tipoRemolque} onValueChange={setTipoRemolque}>
                        <Picker.Item label="Seleccionar Tipo" value="" />
                        <Picker.Item label="Lowboy" value="lowboy" />
                        <Picker.Item label="Caja seca" value="caja seca" />
                      </Picker>
                    </View>
                    <Text style={styles.label}>Placa del remolque</Text>
                    <TextInput value={placaRemolque} onChangeText={setPlacaRemolque} mode="flat" underlineColor="#0d75bb" activeUnderlineColor="#0d75bb" dense textColor="#000" contentStyle={{ color: "#000", fontWeight: "600" }} style={styles.input} placeholder="Ingrese la placa" />
                  </>
                )}

                <Text style={styles.label}>Conductor:</Text>
                <View style={styles.pickerContainer}>
                  <Picker selectedValue={conductorId} onValueChange={setConductorId}>
                    <Picker.Item label="Selecciona conductor" value="" />
                    {users.map(u => <Picker.Item key={u.id} label={u.nombre} value={u.id} />)}
                  </Picker>
                </View>

                <Text style={styles.label}>Acompañante:</Text>
                <View style={styles.pickerContainer}>
                  <Picker selectedValue={acompanante} onValueChange={setAcompanante}>
                    <Picker.Item label="Selecciona acompañante" value="" />
                    <Picker.Item label="Sin acompañante" value="none" />
                    {users.map(u => <Picker.Item key={u.id} label={u.nombre} value={u.id} />)}
                  </Picker>
                </View>

                <Text style={styles.label}>Def entregado </Text>
                <TextInput value={def} onChangeText={setDef} mode="flat" underlineColor="#0d75bb" activeUnderlineColor="#0d75bb" dense textColor="#000" contentStyle={{ color: "#000", fontWeight: "600" }} style={styles.input} />
                
                <Text style={styles.label}>Destino:</Text>
                <TextInput value={destino} onChangeText={setDestino} mode="flat" underlineColor="#0d75bb" activeUnderlineColor="#0d75bb" dense textColor="#000" contentStyle={{ color: "#000", fontWeight: "600" }} style={styles.input} />
               
                {/* HISTORIALES DE KILOMETRAJES COLAPSABLES */}
                <View style={styles.row}>
                  {/* SALIDA */}
                  <View style={styles.field}>
                    <TouchableOpacity style={styles.collapseHeader} onPress={() => setMostrarHistorialSalida(!mostrarHistorialSalida)}>
                      <Text style={styles.collapseTitle}>
                        {mostrarHistorialSalida ? "⬇️ Ocultar KM Salida" : "➡️ Mostrar KM Salida"}
                      </Text>
                    </TouchableOpacity>

                    {mostrarHistorialSalida && (
                      <View style={styles.historialBox}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                          <Text style={{ fontWeight: "bold", fontSize: 11 }}>Registros:</Text>
                          <Button mode="contained" buttonColor="#167abd" textColor="white" compact style={{ width: 35, height: 26 }} onPress={agregarKmSalida}>+</Button>
                        </View>
                        {kmSalidaList.map((item, index) => (
                          <View key={index} style={{ flexDirection: "row", gap: 5, marginBottom: 5 }}>
                            <TextInput placeholder="KM"style={[styles.input, { flex: 1 }]}keyboardType="numeric"value={item.km}underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"onChangeText={(text) => {setKmSalidaList(prev =>prev.map((it, i) => i === index ? { ...it, km: text } : it)
                                );
                              }}
                            />
                            <TextInput placeholder="Detalle"style={[styles.input, { flex: 1.5 }]}value={item.descripcion}underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"onChangeText={(text) => {
                                setKmSalidaList(prev =>
                                  prev.map((it, i) => i === index ? { ...it, descripcion: text } : it)
                                );
                              }}
                            />
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                  
                  {/* LLEGADA */}
                  <View style={styles.field}>
                    <TouchableOpacity style={styles.collapseHeader} onPress={() => setMostrarHistorialLlegada(!mostrarHistorialLlegada)}>
                      <Text style={styles.collapseTitle}>
                        {mostrarHistorialLlegada ? "⬇️ Ocultar KM Llegada" : "➡️ Mostrar KM Llegada"}
                      </Text>
                    </TouchableOpacity>

                    {mostrarHistorialLlegada && (
                      <View style={styles.historialBox}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                          <Text style={{ fontWeight: "bold", fontSize: 11 }}>Registros:</Text>
                          <Button mode="contained" buttonColor="#167abd" textColor="white" compact style={{  width: 35, height: 26 ,}} onPress={agregarKmLlegada}>+</Button>
                        </View>
                        {kmLlegadaList.map((item, index) => (
                          <View key={index} style={{ flexDirection: "row", gap: 5, marginBottom: 5 }}>
                            <TextInput
                              placeholder="KM"
                              style={[styles.input, { flex: 1 }]}
                              keyboardType="numeric"
                              value={item.km}
                              underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"
                              onChangeText={(text) => {
                                setKmLlegadaList(prev =>
                                  prev.map((it, i) => i === index ? { ...it, km: text } : it)
                                );
                              }}
                            />
                            <TextInput
                              placeholder="Detalle"
                              style={[styles.input, { flex: 1.5 }]}
                              value={item.descripcion}
                              underlineColor="#0d75bb"activeUnderlineColor="#0d75bb"
                              onChangeText={(text) => {
                                setKmLlegadaList(prev =>
                                  prev.map((it, i) => i === index ? { ...it, descripcion: text } : it)
                                );
                              }}
                            />
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>

                <Text style={styles.label}>Fecha de Salida:</Text>
                {Platform.OS === "web" ? (
                  <input type="date" value={fechaSalida ? new Date(parseDate(fechaSalida)).toISOString().split("T")[0] : ""}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const [year, month, day] = e.target.value.split("-");
                      const date = new Date(Number(year), Number(month) - 1, Number(day), 12);
                      const f = ("0" + date.getDate()).slice(-2) + "/" + ("0" + (date.getMonth() + 1)).slice(-2) + "/" + date.getFullYear();
                      setFechaSalida(f);
                    }} style={styles.webDatePicker} />
                ) : (
                  <>
                    <TouchableOpacity onPress={() => setShowSalidaPicker(true)}>
                      <TextInput value={fechaSalida} placeholder="Seleccionar fecha" editable={false} style={styles.input} />
                    </TouchableOpacity>
                    {showSalidaPicker && (
                      <DateTimePicker value={new Date()} mode="date" display="default" onChange={(event, date) => {
                        setShowSalidaPicker(false);
                        if (date) {
                          const f = ("0" + date.getDate()).slice(-2) + "/" + ("0" + (date.getMonth() + 1)).slice(-2) + "/" + date.getFullYear();
                          setFechaSalida(f);
                        }
                      }} />
                    )}
                  </>
                )}

                <Text style={styles.label}>Fecha de Llegada:</Text>
                {Platform.OS === "web" ? (
                  <input type="date" value={fechaLlegada ? new Date(parseDate(fechaLlegada)).toISOString().split("T")[0] : ""}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const [year, month, day] = e.target.value.split("-");
                      const date = new Date(Number(year), Number(month) - 1, Number(day), 12);
                      const f = ("0" + date.getDate()).slice(-2) + "/" + ("0" + (date.getMonth() + 1)).slice(-2) + "/" + date.getFullYear();
                      setFechaLlegada(f);
                    }} style={styles.webDatePicker} />
                ) : (
                  <>
                    <TouchableOpacity onPress={() => setShowLlegadaPicker(true)}>
                      <TextInput value={fechaLlegada} placeholder="Seleccionar fecha" editable={false} style={styles.input} />
                    </TouchableOpacity>
                    {showLlegadaPicker && (
                      <DateTimePicker value={new Date()} mode="date" display="default" onChange={(event, date) => {
                        setShowLlegadaPicker(false);
                        if (date) {
                          const f = ("0" + date.getDate()).slice(-2) + "/" + ("0" + (date.getMonth() + 1)).slice(-2) + "/" + date.getFullYear();
                          setFechaLlegada(f);
                        }
                      }} />
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <Text style={styles.label}>Fecha de llegada</Text>
                {Platform.OS === "web" ? (
                  <input type="date" onChange={(e) => {
                    if (!e.target.value) return;
                    const date = new Date(e.target.value + "T12:00:00");
                    const f = ("0" + date.getDate()).slice(-2) + "/" + ("0" + (date.getMonth() + 1)).slice(-2) + "/" + date.getFullYear();
                    setFechaLlegada(f);
                  }} style={styles.webDatePicker} />
                ) : (
                  <>
                    <TouchableOpacity onPress={() => setShowLlegadaPicker(true)}>
                      <TextInput value={fechaLlegada} placeholder="Seleccionar fecha" editable={false} style={styles.input} />
                    </TouchableOpacity>
                    {showLlegadaPicker && (
                      <DateTimePicker value={new Date()} mode="date" display="default" onChange={(event, date) => {
                        setShowLlegadaPicker(false);
                        if (date) {
                          const f = ("0" + date.getDate()).slice(-2) + "/" + ("0" + (date.getMonth() + 1)).slice(-2) + "/" + date.getFullYear();
                          setFechaLlegada(f);
                        }
                      }} />
                    )}
                  </>
                )}
              </>
            )}  

            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 25, marginBottom: 40 }}>
              <Button mode="contained" buttonColor="#888" textColor="rgb(243, 246, 248)" onPress={() => setModalVisible(false)}>Cancelar</Button>
              <Button mode="contained" buttonColor="#167abdff" textColor="rgb(243, 246, 248)" onPress={saveTrip}>Guardar</Button>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 15, backgroundColor: "#f4f6f9" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  titleMain: { fontSize: 22, fontWeight: "bold", color: "#1e293b" },
  badge: { backgroundColor: "#1976D2", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  badgeText: { color: "white", fontWeight: "bold", fontSize: 13 },
  card: { backgroundColor: "#fff", padding: 14, marginBottom: 10, borderRadius: 8, borderWidth: 1, borderColor: "#e2e8f0" },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 5 },
  textSmall: { fontSize: 13, marginBottom: 2, color: "#334155" },
  modalContent: { flex: 1, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 15 },
  input: { borderRadius: 6, padding: 2, marginBottom: 12, backgroundColor: "#fff" },
  label: { fontWeight: "bold", marginBottom: 4, marginTop: 4, color: "#1e293b" },
  pickerContainer: { backgroundColor: "#fff", borderRadius: 6, marginBottom: 12, borderWidth: 1, borderColor: "#cbd5e1" },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 15, marginTop: 5, marginBottom: 12 },
  field: { flex: 1 },
  collapseHeader: { paddingVertical: 10, paddingHorizontal: 12, backgroundColor: "#e2e8f0", borderRadius: 6, alignItems: "center" },
  collapseTitle: { fontSize: 11, fontWeight: "bold", color: "#334155" },
  historialBox: { marginTop: 8, padding: 8, backgroundColor: "#f8fafc", borderRadius: 6, borderWidth: 1, borderColor: "#cbd5e1" },
  webDatePicker: { padding: 10, borderRadius: 6, marginBottom: 12, borderWidth: 1, borderColor: "#cbd5e1", width: "100%" }
});
