import { FontAwesome5 } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from '@react-native-picker/picker';
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { Portal, TextInput } from "react-native-paper";
import * as XLSX from "xlsx";
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

const exportOptions: { value: string; label: string }[] = [
  { value: "dia", label: "Día" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mes" },
];

export default function TripsPage() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  // Estados para ocultar/mostrar los historiales de kilometraje
  const [mostrarHistorialSalida, setMostrarHistorialSalida] = useState(false);
  const [mostrarHistorialLlegada, setMostrarHistorialLlegada] = useState(false);

  // Lista de historial de kilometraje
  const [kmSalidaList, setKmSalidaList] = useState<KilometrajeRegistro[]>([{ km: "", descripcion: "" }]);
  const [kmLlegadaList, setKmLlegadaList] = useState<KilometrajeRegistro[]>([{ km: "", descripcion: "" }]);

  const isAdmin = currentUser?.rol?.toLowerCase() === "admin";

  const closeModal = useCallback(() => setModalVisible(false), []);

  const loadTrips = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    setLoadError("");
    try {
      let token: string | null = null;
      if (Platform.OS === "web") {
        token = localStorage.getItem("token");
      } else {
        const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
        token = await AsyncStorage.getItem("token");
      }
      if (!token) {
        setLoadError("Sesión no válida. Vuelve a iniciar sesión.");
        return;
      }

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
    } catch (error: any) {
      console.error("Error cargando viajes:", error);
      setLoadError("No se pudieron cargar los viajes. Verifica la conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  }, [currentUser, isAdmin]);

  const loadUnits = useCallback(async () => {
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
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const res = await api.get("/users");
      setUsers(res.data.map((u: any) => ({ ...u, id: u._id })));
    } catch (error) {
      console.error("Error cargando usuarios:", error);
    }
  }, []);

 const openModal = useCallback((trip?: Trip) => {
    setMostrarHistorialSalida(false);
    setMostrarHistorialLlegada(false);

    if (trip) {
      setEditingTrip(trip);
      setRutaAcubrir(trip.rutaAcubrir || "");
      setUnidadId(trip.unidadId || "");

      // Corregido: Si conductorId es null o undefined, el resultado será ""
      const cId = trip.conductorId && typeof trip.conductorId === "object" 
        ? (trip.conductorId as any)?._id || "" 
        : (trip.conductorId || "");
      setConductorId(cId);

      setFechaSalida(trip.fechaSalida ? new Date(trip.fechaSalida).toLocaleDateString("es-ES") : "");
      setFechaLlegada(trip.fechaLlegada ? new Date(trip.fechaLlegada).toLocaleDateString("es-ES") : "");
      setDestino(trip.destino || "");
      setEstado(trip.estado || "pendiente");

      // Corregido: Si acompanante es null o undefined, el resultado será ""
      const aId = trip.acompanante && typeof trip.acompanante === "object"
        ? (trip.acompanante as any)?._id || ""
        : (trip.acompanante || "");
      setAcompanante(aId);

      setDef(trip.def || "");

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
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadTrips();
      loadUnits();
      loadUsers();
    }
  }, [currentUser, loadTrips, loadUnits, loadUsers]);

  if (!currentUser) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f4f6f9" }}>
        <Text>Cargando usuario...</Text>
      </View>
    );
  }

const agregarKmSalida = () => {
   
    setKmSalidaList([{ km: "", descripcion: "" }, ...kmSalidaList]);
  };

  const agregarKmLlegada = () => {
    
    setKmLlegadaList([{ km: "", descripcion: "" }, ...kmLlegadaList]);
  };

const  parseDate=(dateStr:string)=>{
  if (!dateStr || dateStr.trim ()=== "") return null;
  const [day,month,year]=dateStr.split("/");
  if (!year || !month ||!day) return null;
  return new Date(Number(year),Number(month)-1,Number(day),12,0,0);
}
  
const saveTrip = async () => {
  const estadoCalculado = fechaLlegada && fechaLlegada.trim() !== "" ? "completado" : "pendiente";

  if (isAdmin && (!rutaAcubrir || !unidadId || !conductorId || !fechaSalida)) {
    Alert.alert("Falta información", "Ruta, unidad, conductor y fecha de salida son obligatorios.");
    return;
  }
  
  const formatList = (list: KilometrajeRegistro[]) => 
    list
      .filter(item => item.km && item.km.trim() !== "")
      .map(item => ({ 
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

  if (!payload.acompanante) delete payload.acompanante;
  if (!payload.def) payload.def = "";

  const salida = parseDate(fechaSalida);
  if (salida) payload.fechaSalida = salida.toISOString();

  const llegada = parseDate(fechaLlegada);
  if (llegada) {
    payload.fechaLlegada = llegada.toISOString();
  } else {
    // Esto asegura que no intentemos enviar una fecha inválida
    delete payload.fechaLlegada;
  }

  try {
    setSaving(true);
    if (editingTrip) {
      await api.put(`/trips/${editingTrip.id}`, payload);
    } else {
      await api.post("/trips", payload);
    }
    
    Alert.alert("Éxito", "Viaje guardado correctamente");
    await loadTrips();
    closeModal();
  } catch (error: any) {
    console.error("Error al guardar:", error.response?.data);
    Alert.alert("Error", "Revisa la consola para el detalle del error.");
  } finally {
    setSaving(false);
  }
};
  


const deleteTrip = async(id:string)=>{
  if (!isAdmin) return;
  const proceedWinthDelete =async ()=>{
    try {
      await api.delete('/trips/${id}');
      setTrips((prev)=>prev.filter((t)=> t.id !== id));
      Alert.alert("Exito","Viaje eliminado correctamente");
    }catch(error){
      console.error("Error eliminando viaje",error);
      Alert.alert("Error ","No se pudo eliminar el viaje");
    }
  };
  if (Platform.OS === "web"){
    const confirmed =window.confirm("Estas seguro de que deseas eliminar este viaje");
    if (confirmed) proceedWinthDelete();
  }else{
    Alert.alert("Confirmar eliminacion ","¿Estas seguro de que deseas eliminar este viaje?",
      [
        {text:"Cancelar",style:"cancel"},
        {text:"Eliminar",style:"destructive",onPress:proceedWinthDelete}
      ]
    );
  }
};

  const exportToExcel = async () => {
    if (trips.length === 0) {
      Alert.alert("Sin datos", "No hay viajes para exportar.");
      return;
    }

    try {
      const rows = trips.map((t) => ({
        Ruta: t.rutaAcubrir ?? "",
        Destino: t.destino ?? "",
        Salida: t.fechaSalida ? new Date(t.fechaSalida).toLocaleDateString("es-ES") : "",
        Llegada: t.fechaLlegada ? new Date(t.fechaLlegada).toLocaleDateString("es-ES") : "",
        Estado: t.estado ?? "",
        Conductor: users.find((u) => u.id === (typeof t.conductorId === "object" ? t.conductorId._id : t.conductorId))?.nombre ?? "",
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Viajes");

      if (Platform.OS === "web") {
        const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const blob = new Blob([excelBuffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "Reporte_Viajes.xlsx";
        a.click();
        window.URL.revokeObjectURL(url);
      }

      Alert.alert("Éxito", "Reporte Excel generado correctamente");
    } catch (error) {
      console.error("Error exportando Excel", error);
      Alert.alert("Error", "No se pudo generar el archivo Excel");
    }
  };

  const getEstadoStyle = (estado: string) => {
    const isCompletado = estado.toLowerCase() === "completado";
    if (isCompletado) {
      return { badge: styles.estadoCompletado, text: styles.estadoTextCompletado, icon: "check-circle" as const, iconColor: "#059669" };
    }
    return { badge: styles.estadoPendiente, text: styles.estadoTextPendiente, icon: "clock" as const, iconColor: "#d97706" };
  };

  const renderItem = ({ item }: { item: Trip }) => {
    const unidadNombre = units.find((u) => u.id === item.unidadId)?.nombre || item.unidadId;
    const conductorIdVal = typeof item.conductorId === "object" ? item.conductorId._id : item.conductorId;
    const conductorNombre = users.find((u) => u.id === conductorIdVal)?.nombre || "N/A";
    const acompananteNombre =
      item.acompanante === "none" || !item.acompanante
        ? "Sin acompañante"
        : users.find((u) => u.id === item.acompanante)?.nombre ?? "Sin acompañante";
    const canEdit = isAdmin || String(currentUser._id) === String(conductorIdVal);
    const canDelete = isAdmin;
    const estado = getEstadoStyle(item.estado);

    return (
      <View style={[styles.card, isMobile ? styles.cardMobile : styles.cardDesktop]}>
        <View style={styles.cardIconWrap}>
          <FontAwesome5 name="route" size={20} color="#111111" />
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.rutaAcubrir}</Text>
            <View style={[styles.estadoBadge, estado.badge]}>
              <FontAwesome5 name={estado.icon} size={10} color={estado.iconColor} />
              <Text style={[styles.estadoText, estado.text]}>{item.estado}</Text>
            </View>
          </View>

          <View style={styles.specGrid}>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Unidad</Text>
              <Text style={styles.specValue}>{unidadNombre}</Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Conductor</Text>
              <Text style={styles.specValue} numberOfLines={1}>{conductorNombre}</Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Destino</Text>
              <Text style={styles.specValue} numberOfLines={1}>{item.destino || "—"}</Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Salida</Text>
              <Text style={styles.specValue}>
                {item.fechaSalida ? new Date(item.fechaSalida).toLocaleDateString("es-MX") : "—"}
              </Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Llegada</Text>
              <Text style={styles.specValue}>
                {item.fechaLlegada ? new Date(item.fechaLlegada).toLocaleDateString("es-MX") : "—"}
              </Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Acompañante</Text>
              <Text style={styles.specValue} numberOfLines={1}>{acompananteNombre}</Text>
            </View>
          </View>

          <View style={styles.cardActions}>
            {canEdit && (
              <TouchableOpacity style={styles.iconAction} onPress={() => openModal(item)} activeOpacity={0.85}>
                <FontAwesome5 name="pen" size={13} color="#111111" />
              </TouchableOpacity>
            )}
            {canDelete && (
              <TouchableOpacity style={[styles.iconAction, styles.iconActionDanger]} onPress={() => deleteTrip(item.id)} activeOpacity={0.85}>
                <FontAwesome5 name="trash-alt" size={13} color="#dc2626" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  const modalInputProps = {
    mode: "flat" as const,
    underlineColor: "transparent",
    activeUnderlineColor: "transparent",
    dense: true,
    contentStyle: styles.modalInputContent,
    style: styles.modalInput,
    placeholderTextColor: "#9ca3af",
  };

  const renderModalField = (label: string, field: React.ReactNode) => (
    <View style={styles.modalFieldGroup}>
      <Text style={styles.modalFieldLabel}>{label}</Text>
      {field}
    </View>
  );

  const renderPickerField = (label: string, picker: React.ReactNode) => (
    renderModalField(label, <View style={styles.pickerWrap}>{picker}</View>)
  );

  const renderKmSection = (
    title: string,
    visible: boolean,
    setVisible: (v: boolean) => void,
    list: KilometrajeRegistro[],
    setList: React.Dispatch<React.SetStateAction<KilometrajeRegistro[]>>,
    onAdd: () => void
  ) => (
    <View style={styles.kmSection}>
      <TouchableOpacity style={styles.kmHeader} onPress={() => setVisible(!visible)} activeOpacity={0.85}>
        <View style={styles.kmHeaderLeft}>
          <FontAwesome5 name="tachometer-alt" size={12} color="#111111" />
          <Text style={styles.kmHeaderTitle}>KM {title}</Text>
        </View>
        <FontAwesome5 name={visible ? "chevron-up" : "chevron-down"} size={12} color="#6b7280" />
      </TouchableOpacity>

      {visible && (
        <View style={styles.kmBody}>
          <View style={styles.kmBodyHeader}>
            <Text style={styles.kmBodyLabel}>Registros</Text>
            <TouchableOpacity style={styles.addKmBtn} onPress={onAdd} activeOpacity={0.85}>
              <FontAwesome5 name="plus" size={11} color="#ffffff" />
            </TouchableOpacity>
          </View>
          {list.map((item, index) => (
            <View key={index} style={styles.kmRow}>
             
              <View style={styles.kmInputWide}>
                <Text style={styles.kmInputLabel}>Detalle</Text>
                <TextInput
                  placeholder="Descripción"
                  value={item.descripcion}
                  onChangeText={(text) => setList((prev) => prev.map((it, i) => (i === index ? { ...it, descripcion: text } : it)))}
                  {...modalInputProps}
                />
              </View>
               <View style={styles.kmInputHalf}>
                <Text style={styles.kmInputLabel}>KM</Text>
                <TextInput
                  placeholder="0"
                  keyboardType="numeric"
                  value={item.km}
                  onChangeText={(text) => setList((prev) => prev.map((it, i) => (i === index ? { ...it, km: text } : it)))}
                  {...modalInputProps}
                />
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderDateField = (
    label: string,
    value: string,
    onChange: (formatted: string) => void,
    showPicker: boolean,
    setShowPicker: (v: boolean) => void
  ) => (
    renderModalField(
      label,
      Platform.OS === "web" ? (
        <input
          type="date"
         value ={value && parseDate(value)  ? new Date(parseDate(value) as Date).toISOString().split("T")[0]:""}
          onChange={(e) => {
            if (!e.target.value) return;
            const [year, month, day] = e.target.value.split("-");
            const date = new Date(Number(year), Number(month) - 1, Number(day), 12);
            const f = `${("0" + date.getDate()).slice(-2)}/${("0" + (date.getMonth() + 1)).slice(-2)}/${date.getFullYear()}`;
            onChange(f);
          }}
          style={styles.webDatePicker as any}
        />
      ) : (
        <>
          <TouchableOpacity onPress={() => setShowPicker(true)} activeOpacity={0.85}>
            <TextInput value={value} placeholder="Seleccionar fecha" editable={false} {...modalInputProps} />
          </TouchableOpacity>
          {showPicker && (
            <DateTimePicker
              value={new Date()}
              mode="date"
              display="default"
              onChange={(_event, date) => {
                setShowPicker(false);
                if (date) {
                  const f = `${("0" + date.getDate()).slice(-2)}/${("0" + (date.getMonth() + 1)).slice(-2)}/${date.getFullYear()}`;
                  onChange(f);
                }
              }}
            />
          )}
        </>
      )
    )
  );

  function renderModalContent() {
    return (
      <View
        style={styles.modalCard}
        onStartShouldSetResponder={() => true}
        {...(Platform.OS === "web" ? { onClick: (e: any) => e.stopPropagation() } : {})}
      >
        <View style={styles.modalHeader}>
          <View style={styles.modalHeaderLeft}>
            <View style={styles.modalIconBadge}>
              <FontAwesome5 name="route" size={16} color="#ffffff" />
            </View>
            <View>
              <Text style={styles.modalTitle}>{editingTrip ? "Editar Viaje" : "Nuevo Viaje"}</Text>
              <Text style={styles.modalSubtitle}>
                {editingTrip ? "Actualiza la información del viaje" : "Completa los datos para registrar el viaje"}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.modalCloseButton} onPress={closeModal} disabled={saving} activeOpacity={0.85}>
            <FontAwesome5 name="times" size={14} color="#6b7280" />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={styles.modalBodyWrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {isAdmin ? (
              <>
                {renderModalField(
                  "Ruta a cubrir",
                  <TextInput value={rutaAcubrir} onChangeText={setRutaAcubrir} placeholder="Ej. CDMX - Guadalajara" {...modalInputProps} />
                )}

                {renderPickerField(
                  "Unidad",
                  <Picker
                    selectedValue={unidadId}
                    onValueChange={(value) => {
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
                    }}
                    style={styles.picker}
                  >
                    <Picker.Item label="Seleccionar unidad" value="" />
                    {units.map((u) => <Picker.Item key={u.id} label={`${u.nombre} ${u.placa}`} value={u.id} />)}
                  </Picker>
                )}

                {mostrarRemolque && (
                  <>
                    {renderPickerField(
                      "Tipo remolque",
                      <Picker selectedValue={tipoRemolque} onValueChange={setTipoRemolque} style={styles.picker}>
                        <Picker.Item label="Seleccionar tipo" value="" />
                        <Picker.Item label="Lowboy" value="lowboy" />
                        <Picker.Item label="Caja seca" value="caja seca" />
                      </Picker>
                    )}
                    {renderModalField(
                      "Placa del remolque",
                      <TextInput value={placaRemolque} onChangeText={setPlacaRemolque} placeholder="Placa" {...modalInputProps} />
                    )}
                  </>
                )}

                <View style={styles.modalFieldRow}>
                  <View style={styles.modalFieldHalf}>
                    {renderPickerField(
                      "Conductor",
                      <Picker selectedValue={conductorId} onValueChange={setConductorId} style={styles.picker}>
                        <Picker.Item label="Selecciona conductor" value="" />
                        {users.map((u) => <Picker.Item key={u.id} label={u.nombre} value={u.id} />)}
                      </Picker>
                    )}
                  </View>
                  <View style={styles.modalFieldHalf}>
                    {renderPickerField(
                      "Acompañante",
                      <Picker selectedValue={acompanante} onValueChange={setAcompanante} style={styles.picker}>
                        <Picker.Item label="Selecciona acompañante" value="" />
                        <Picker.Item label="Sin acompañante" value="none" />
                        {users.map((u) => <Picker.Item key={u.id} label={u.nombre} value={u.id} />)}
                      </Picker>
                    )}
                  </View>
                </View>

                <View style={styles.modalFieldRow}>
                  <View style={styles.modalFieldHalf}>
                    {renderModalField(
                      "DEF entregado",
                      <TextInput value={def} onChangeText={setDef} placeholder="0" keyboardType="numeric" {...modalInputProps} />
                    )}
                  </View>
                  <View style={styles.modalFieldHalf}>
                    {renderModalField(
                      "Destino",
                      <TextInput value={destino} onChangeText={setDestino} placeholder="Ciudad destino" {...modalInputProps} />
                    )}
                  </View>
                </View>

                <Text style={styles.modalSectionTitle}>Kilometraje</Text>
                <View style={styles.kmGrid}>
                  {renderKmSection("Salida", mostrarHistorialSalida, setMostrarHistorialSalida, kmSalidaList, setKmSalidaList, agregarKmSalida)}
                  {renderKmSection("Llegada", mostrarHistorialLlegada, setMostrarHistorialLlegada, kmLlegadaList, setKmLlegadaList, agregarKmLlegada)}
                </View>

                <View style={styles.modalFieldRow}>
                  <View style={styles.modalFieldHalf}>
                    {renderDateField("Fecha de salida", fechaSalida, setFechaSalida, showSalidaPicker, setShowSalidaPicker)}
                  </View>
                  <View style={styles.modalFieldHalf}>
                    {renderDateField("Fecha de llegada", fechaLlegada, setFechaLlegada, showLlegadaPicker, setShowLlegadaPicker)}
                  </View>
                </View>
              </>
            ) : (
              renderDateField("Fecha de llegada", fechaLlegada, setFechaLlegada, showLlegadaPicker, setShowLlegadaPicker)
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.cancelButton} onPress={closeModal} disabled={saving} activeOpacity={0.85}>
            <Text style={styles.cancelButtonText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={saveTrip}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.saveButtonText}>Guardar</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderText}>
          <Text style={styles.pageTitle}>Viajes Registrados</Text>
          <Text style={styles.subtitle}>Rutas, conductores y estado de cada viaje</Text>
        </View>
      </View>

      {isAdmin && (
        <View style={styles.toolbarPanel}>
          <View style={styles.toolbarActions}>
            <TouchableOpacity style={styles.addButton} onPress={() => openModal()} activeOpacity={0.85}>
              <FontAwesome5 name="plus" size={14} color="#ffffff" />
              <Text style={styles.addButtonText}>Nuevo Viaje</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.toolbarFiltersRow, isMobile && styles.toolbarFiltersRowMobile]}>
            <View style={styles.filterBlock}>
              <Text style={styles.toolbarLabel}>Periodo</Text>
              <View style={styles.segmentedControl}>
                {exportOptions.map((opt) => {
                  const isActive = exportType === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.filterPill, isActive && styles.filterPillActive]}
                      onPress={() => setExportType(opt.value)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <TouchableOpacity style={styles.exportButton} onPress={exportToExcel} activeOpacity={0.85}>
              <FontAwesome5 name="file-excel" size={13} color="#111111" />
              <Text style={styles.exportButtonText}>Exportar Excel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.listPanel}>
        {!loading && !loadError && trips.length > 0 && (
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderTitle}>{trips.length} viajes</Text>
            <Text style={styles.listHeaderHint}>
              Periodo: {exportOptions.find((o) => o.value === exportType)?.label}
            </Text>
          </View>
        )}

        {loading ? (
          <View style={styles.emptyState}>
            <FontAwesome5 name="spinner" size={20} color="#9ca3af" />
            <Text style={styles.emptyText}>Cargando viajes...</Text>
          </View>
        ) : loadError ? (
          <View style={styles.emptyState}>
            <FontAwesome5 name="exclamation-triangle" size={20} color="#dc2626" />
            <Text style={styles.emptyText}>{loadError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadTrips}>
              <Text style={styles.retryButtonText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : trips.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome5 name="route" size={22} color="#9ca3af" />
            <Text style={styles.emptyTitle}>No hay viajes registrados</Text>
            <Text style={styles.emptyText}>
              {isAdmin ? 'Pulsa "Nuevo Viaje" para crear el primero.' : "Aún no tienes viajes asignados."}
            </Text>
          </View>
        ) : (
          <FlatList
            data={trips}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            numColumns={isMobile ? 1 : 2}
            columnWrapperStyle={isMobile ? undefined : styles.listRow}
            scrollEnabled={false}
          />
        )}
      </View>

      {Platform.OS === "web" && modalVisible ? (
        <Portal>
          <View
            style={styles.webModalOverlay}
            {...(Platform.OS === "web" ? { onClick: closeModal } : {})}
          >
            {renderModalContent()}
          </View>
        </Portal>
      ) : (
        <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={closeModal}>
          <View style={styles.modalContainer}>
            {renderModalContent()}
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1,paddingVertical: 4,backgroundColor: "transparent",},
  pageHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16,},
  pageHeaderText: { flex: 1, paddingRight: 12 },
  pageTitle: { fontSize: 24, fontWeight: "800", color: "#111111", letterSpacing: 0.2 },
  subtitle: { fontSize: 13, color: "#6b7280", marginTop: 4 },
  toolbarPanel: {backgroundColor: "#ffffff",borderRadius: 14,borderWidth: 1,borderColor: "#e5e7eb",padding: 14,marginBottom: 14,gap: 12,...(Platform.OS === "web"  ? { boxShadow: "0 8px 24px rgba(0,0,0,0.04)" as any } : {}),},
  toolbarActions: { flexDirection: "row", alignItems: "center" },
  toolbarFiltersRow: {flexDirection: "row",alignItems: "flex-end",justifyContent: "space-between",gap: 12,paddingTop: 12,borderTopWidth: 1,borderTopColor: "#f3f4f6", },
  toolbarFiltersRowMobile: { flexDirection: "column", alignItems: "stretch" },
  filterBlock: { flex: 1, minWidth: 0 },
  toolbarLabel: {fontSize: 11, fontWeight: "700",color: "#9ca3af",textTransform: "uppercase",letterSpacing: 0.5,marginBottom: 8,},
  segmentedControl: {flexDirection: "row",alignSelf: "flex-start",backgroundColor: "#f3f4f6",borderRadius: 999,padding: 4,gap: 4,},
  filterPill: {paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),},
  filterPillActive: { backgroundColor: "#111111" },
  filterPillText: { fontSize: 12, fontWeight: "700", color: "#6b7280" },
  filterPillTextActive: { color: "#ffffff" },
  addButton: {flexDirection: "row",alignItems: "center",justifyContent: "center",gap: 8,backgroundColor: "#111111",paddingVertical: 12,paddingHorizontal: 18,borderRadius: 999,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const, alignSelf: "flex-start" as const } : {}),
  },
  addButtonText:{color: "#ffffff", fontWeight: "700", fontSize: 14 },
  exportButton:{flexDirection: "row",alignItems: "center",gap: 8,paddingVertical: 10,paddingHorizontal: 16, borderRadius: 999,borderWidth: 1.5,borderColor: "#111111",backgroundColor: "#ffffff",flexShrink: 0,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  exportButtonText: { color: "#111111", fontWeight: "700", fontSize: 13 },
  listPanel: { backgroundColor: "#ffffff", borderRadius: 14, borderWidth: 1, borderColor: "#e5e7eb", padding: 14, flex: 1,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 8px 24px rgba(0,0,0,0.04)" as any }
      : {}),
  },
  listHeader: {flexDirection: "row",alignItems: "center",justifyContent: "space-between",paddingBottom: 12,marginBottom: 12,borderBottomWidth: 1,borderBottomColor: "#f3f4f6", },
  listHeaderTitle: { fontSize: 14, fontWeight: "700", color: "#111111" },
  listHeaderHint: { fontSize: 12, color: "#9ca3af", fontWeight: "600" },
  listContent: { paddingBottom: 8, gap: 12 },
  listRow: { gap: 12 },
  emptyState: { paddingVertical: 48,paddingHorizontal: 20,alignItems: "center",gap: 8,},
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#111111" },
  emptyText: { fontSize: 14, color: "#64748b", textAlign: "center" },
  retryButton: {marginTop: 8,backgroundColor: "#111111",paddingHorizontal: 16,paddingVertical: 10,borderRadius: 999,   ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}), },
  retryButtonText: { color: "#fff", fontWeight: "700" },
  card: { flexDirection: "row",backgroundColor: "#fafafa",borderRadius: 14,borderWidth: 1,borderColor: "#e5e7eb",padding: 14,flex: 1,gap: 12, },
  cardMobile: { width: "100%" },
  cardDesktop: { minWidth: 0, maxWidth: "49%" as any },
  cardIconWrap: {width: 44,height: 44,borderRadius: 12,backgroundColor: "#ffffff",borderWidth: 1,borderColor: "#e5e7eb",alignItems: "center",justifyContent: "center",},
  cardBody: { flex: 1, minWidth: 0 },
  cardHeader: {flexDirection: "row",alignItems: "center",justifyContent: "space-between",gap: 8,marginBottom: 10,},
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#111111", flex: 1 },
  estadoBadge: {flexDirection: "row",alignItems: "center",gap: 5,paddingHorizontal: 10,paddingVertical: 5,borderRadius: 999, },
  estadoPendiente: { backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fde68a" },
  estadoCompletado: { backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#a7f3d0" },
  estadoText: { fontSize: 11, fontWeight: "700" },
  estadoTextPendiente: { color: "#d97706" },
  estadoTextCompletado: { color: "#059669" },
  specGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  specItem: {minWidth: "46%",flexGrow: 1,backgroundColor: "#ffffff",borderRadius: 10,borderWidth: 1,borderColor: "#e5e7eb",paddingHorizontal: 10,paddingVertical: 8,},
  specLabel: {fontSize: 10,fontWeight: "700",color: "#9ca3af",textTransform: "uppercase",letterSpacing: 0.4,},
  specValue: { fontSize: 13, fontWeight: "600", color: "#111111", marginTop: 2 },
  cardActions: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  iconAction: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center", justifyContent: "center", ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),},
  iconActionDanger: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
  webModalOverlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0,backgroundColor: "rgba(0,0,0,0.5)",justifyContent: "center",alignItems: "center",zIndex: 9999,padding: 20,
  ...(Platform.OS === "web" ? { cursor: "default" } : {}),
} as any, 
  modalContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 16,
  },
  modalCard: {width: Platform.OS === "web" ? 720 : "96%",maxHeight: Platform.OS === "web" ? ("90vh" as any) : "92%",backgroundColor: "#ffffff", borderRadius: 16, overflow: "hidden", borderWidth: 1,borderColor: "#e5e7eb",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 20px 50px rgba(0,0,0,0.18)" as any }
      : {}),
  },
  modalHeader:{flexDirection: "row",alignItems: "flex-start",justifyContent: "space-between",paddingHorizontal: 22,paddingTop: 22,paddingBottom: 16,borderBottomWidth: 1,borderBottomColor: "#f3f4f6",},
  modalHeaderLeft:{flexDirection: "row",alignItems: "center",gap: 12,flex: 1,paddingRight: 12,},
  modalIconBadge:{width: 40,height: 40,borderRadius: 20,backgroundColor: "#111111",alignItems: "center",justifyContent: "center",},
  modalTitle:{fontSize: 18, fontWeight: "800", color: "#111111" },
  modalSubtitle:{fontSize: 12, color: "#6b7280", marginTop: 2 },
  modalCloseButton:{width: 32,height: 32,borderRadius: 16,backgroundColor: "#f3f4f6",alignItems: "center", justifyContent: "center", ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  modalBodyWrap:{flexShrink: 1 },
  modalScroll:{flexGrow: 0, flexShrink: 1 },
  modalScrollContent:{paddingHorizontal: 22, paddingTop: 18, paddingBottom: 24 },
  modalFieldGroup:{marginBottom: 14 },
  modalFieldLabel:{fontSize: 12,fontWeight: "700",color: "#374151",marginBottom: 6,letterSpacing: 0.2, },
  modalFieldRow: { flexDirection: "row", gap: 12 },
  modalFieldHalf: { flex: 1, minWidth: 0 },
  modalInput: {width: "100%",height: 42,backgroundColor: "#fafafa",borderRadius: 10,borderWidth: 1,borderColor: "#e5e7eb",},
  modalInputContent: { color: "#111111", fontWeight: "600", fontSize: 14 },
  pickerWrap: { backgroundColor: "#fafafa", borderRadius: 10, borderWidth: 1, borderColor: "#e5e7eb", overflow: "hidden",},
  picker: { width: "100%", color: "#111111" },
  modalSectionTitle: { fontSize: 13, fontWeight: "800", color: "#111111", marginBottom: 10, marginTop: 4, letterSpacing: 0.2,},
  kmGrid: { flexDirection: "row", gap: 12, marginBottom: 14 },
  kmSection: { flex: 1, backgroundColor: "#fafafa", borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb", overflow: "hidden", },
  kmHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 12,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),},
  kmHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  kmHeaderTitle: { fontSize: 12, fontWeight: "700", color: "#111111" },
  kmBody: { paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  kmBodyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, marginBottom: 8, },
  kmBodyLabel: { fontSize: 10, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.4 },
  addKmBtn: {width: 24,height: 24,borderRadius: 12,backgroundColor: "#111111",alignItems: "center",justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),},
  kmRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  kmInputHalf:{flex: 1 },
  kmInputWide: {flex: 1.5 },
  kmInputLabel: {fontSize: 10,fontWeight: "700",color: "#9ca3af",textTransform: "uppercase",letterSpacing: 0.4,  marginBottom: 4,},
  webDatePicker: { padding: 10, borderRadius: 10, marginBottom: 0,borderWidth: 1,borderColor: "#e5e7eb",backgroundColor: "#fafafa",width: "100%",fontSize: 14,fontWeight: "600",color: "#111111",},
  modalActions: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingHorizontal: 22, paddingTop: 14,paddingBottom: 22,borderTopWidth: 1,borderTopColor: "#f3f4f6",
  },
  cancelButton: {flex: 1,backgroundColor: "#ffffff",borderRadius: 999,paddingVertical: 13,alignItems: "center",borderWidth: 1.5,borderColor: "#111111",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  cancelButtonText: { color: "#111111", fontWeight: "700", fontSize: 14 },
  saveButton: {flex: 1,backgroundColor: "#111111",borderRadius: 999,paddingVertical: 13,alignItems: "center",justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: "#ffffff", fontWeight: "700", fontSize: 14 },
});
