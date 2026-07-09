import { FontAwesome5 } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Image, Linking, Modal, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { ActivityIndicator, Portal, TextInput } from "react-native-paper";
import * as XLSX from "xlsx";
import { useStore } from "../context/Store";
import { api, BASE_URL } from "../services/api";
import { Viatico } from "../types";

interface Trip { 
  id: string;
  nombre: string; 
  conductorId: string; 
  conductorNombre?: string; 
  rutaAcubrir?:string; 
  destino?:string
};

const conceptosBase = [ "Comidas","Hospedaje", "Taxi","Regaderas",
  "Pensión","Vulcanizadora","Casetas efectivo",
  "Multa","Comisiones","Fumigación","DEF"
];

const preciosFijos:Record<string,number>={
  comidas:400
};

const conceptosList = conceptosBase.flatMap(c => [
  `${c} Cantidad`,
  `${c} Costo`
]);

const createEmptyConceptos = () =>
  conceptosList.reduce((acc, c) => ({ ...acc, [c]: "" }), {} as { [key: string]: string });

const formatNumericField = (value: number | string | undefined | null) => {
  if (value === undefined || value === null || value === "") return "";
  const num = Number(value);
  return num === 0 ? "" : String(value);
};

const normalizarViaticoParaEditar = (viatico: any, conceptosBaseList: string[]) => {
  const conceptosPlano: any = {};
  conceptosBaseList.forEach(base => {
    conceptosPlano[`${base} Cantidad`] = formatNumericField(viatico.conceptos?.[base]?.cantidad ?? viatico.conceptos?.[`${base} Cantidad`]);
    conceptosPlano[`${base} Costo`] = formatNumericField(viatico.conceptos?.[base]?.costo ?? viatico.conceptos?.[`${base} Costo`]);
  });
  return {
    ...viatico,
    conceptos: conceptosPlano,
    dieselHistorial: Array.isArray(viatico.dieselHistorial)
      ? viatico.dieselHistorial.map((d: any) => ({
          cantidad: formatNumericField(d.cargas ?? d.cantidad),
          costo: formatNumericField(d.costo),
        }))
      : [],
    tag: formatNumericField(viatico.tag),
  };
};

const filterOptions: { value: "day" | "week" | "month"; label: string }[] = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
];

export default function ViaticsPage() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { currentUser } = useStore();
  const isAdmin = currentUser?.rol?.toLocaleLowerCase() === "admin";
  const [viaticos, setViaticos] = useState<Viatico[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingViatico, setEditingViatico] = useState<Viatico | null>(null);

  const [tripId, setTripId] = useState("");
  const [conceptos, setConceptos] = useState<{ [key: string]: string }>(createEmptyConceptos);
  const [tag, setTag] = useState("");
  const [factura, setFactura] = useState<string | null>(null);
  const [facturaRemoved, setFacturaRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
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

  const closeModal = useCallback(() => setModalVisible(false), []);

  const calcularTotalDieselGlobal = (viaticosData: Viatico[]) => {
    let total = 0;
    viaticosData.forEach(v => {
      if (Array.isArray((v as any).dieselHistorial)) {
        (v as any).dieselHistorial.forEach((c: any) => {
          total += Number(c.costo || 0);
        });
      } else {
        total += Number(v.dieselCosto || 0);
      }
    });
    setTotalDieselGlobal(total);
  };

  const loadTrips = useCallback(async () => {
    if (!currentUser) return;
    try {
      const res = await api.get("/trips");
      let tripsData = res.data.map((t: any) => ({
        ...t,
        id: t._id,
        conductorNombre: t.conductorNombre || t.conductor?.nombre || "Sin asignar",
      }));

      if (currentUser?.rol === "Operador") {
        tripsData = tripsData.filter((t: any) => t.conductorId === currentUser.id);
      }

      setTrips(tripsData);
    } catch (e) {
      console.error(e);
      setLoadError("No se pudieron cargar los viajes.");
    }
  }, [currentUser]);

  const loadViaticos = useCallback(async () => {
    setListLoading(true);
    setLoadError("");
    try {
      const res = await api.get(`/viatics?filter=${filter}`);

    let viaticosData = res.data.map((v: any) => ({
      ...v,
      id: v._id,

      facturaUrl: v.factura
        ? `${BASE_URL.replace("/api", "")}${v.factura}`
        : undefined,
    }));

    if (currentUser?.rol === "Operador") {
      viaticosData = viaticosData.filter((v: any) => {

        const tripId =
          typeof v.tripId === "object" && v.tripId !== null
            ? v.tripId._id
            : v.tripId;

        const trip = trips.find((t: any) => t.id === tripId);

        return trip?.conductorId === currentUser.id;
      });
    }

    // Filtrar conductor
    if (conductorFilter) {

      viaticosData = viaticosData.filter((v: any) => {

        const tripId =
          typeof v.tripId === "object" && v.tripId !== null
            ? v.tripId._id
            : v.tripId;

        const trip = trips.find((t: any) => t.id === tripId);

        return trip && trip.conductorId === conductorFilter;
      });
    }

    console.log("TRIPS:", trips);
    console.log("VIATICOS RAW:", viaticosData);

    viaticosData = viaticosData.map((v: any) => {

      const tripId =
        typeof v.tripId === "object" && v.tripId !== null
          ? v.tripId._id
          : v.tripId;

      const trip = trips.find((t: any) => t.id === tripId);

      const conceptosPlano: any = {};

      conceptosBase.forEach(base => {
        conceptosPlano[`${base} Cantidad`] =
          v.conceptos?.[base]?.cantidad ?? 0;
        conceptosPlano[`${base} Costo`] =
          v.conceptos?.[base]?.costo ?? 0;
      });

      return {
        ...v,
        conceptos: conceptosPlano,
        dieselCargas: v.dieselCargas ?? 0,
        dieselCosto:
          v.dieselCosto ??
          v.diselCosto ??
          0,

        tag: v.tag ?? 0,
        total: v.total ?? 0,
        viajeNombre:
          v.tripNombre ||
          trip?.rutaAcubrir ||
          trip?.destino ||
          (v.tripId as any)?.rutaAcubrir ||
          (v.tripId as any)?.destino ||
          "Sin viaje",

        conductorNombre:
          v.conductorNombre ||
          trip?.conductorNombre ||
          (v.tripId as any)?.conductorNombre ||
          "Sin asignar",
      };
    });

    setViaticos(viaticosData);
    calcularTotalDieselGlobal(viaticosData);
  } catch (e) {
    console.error(e);
    setLoadError("No se pudieron cargar los viáticos.");
    Alert.alert("Error", "No se pudieron cargar los viáticos");
  } finally {
    setListLoading(false);
  }
}, [filter, conductorFilter, trips, currentUser]);

  useEffect(() => {
    if (currentUser) loadTrips();
  }, [currentUser, loadTrips]);

  useEffect(() => {
    if (currentUser) loadViaticos();
  }, [currentUser, loadViaticos]);

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
      const trip=trips.find(t=>t.id === (typeof v.tripId === "object" ? (v.tripId as any)._id:v.tripId));
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


const openModal = useCallback((viatico?: Viatico) => {
  if (viatico) {
    const normalized = normalizarViaticoParaEditar(viatico, conceptosBase);
    setEditingViatico(viatico);
    setTripId((viatico.tripId as any)?._id || viatico.tripId);
    setConceptos(normalized.conceptos);
    setDieselHistorial(normalized.dieselHistorial);
    setTag(normalized.tag);
    setFactura(viatico.facturaUrl || null);
  } else {
    setEditingViatico(null);
    setTripId("");
    setFactura(null);
    setConceptos(createEmptyConceptos());
    setDieselHistorial([]);
    setTag("");
    setDieselCargas("");
    setDieselCosto("");
    setCasetaFoto(null);
  }
  setFacturaRemoved(false);
  setCasetaFotoRemoved(false);
  setShowFactura(false);
  setModalVisible(true);
}, []);

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

  const saveViatico = async () => {
  if (!tripId) {
    Alert.alert("Error", "Selecciona un viaje");
    return;
  }
  setSaving(true);

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
      (acc, d) => acc + Number(d.costo || 0),0 );
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
    closeModal();
  } catch (error) {
    console.error(error);
    Alert.alert("Error", "No se pudo guardar el viático");
  } finally {
    setSaving(false);
  }
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

  const formatTotal = (value: number | string | undefined) => {
    const num = Number(value || 0);
    return num.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
  };

  const renderItem = ({ item }: { item: Viatico }) => {
    const viajeNombre = item.tripNombre || item.tripviajeNombre || item.viajeNombre || "Sin viaje";
    const conductorNombre = item.conductorNombre || "Sin asignar";

    return (
      <View style={[styles.card, isMobile ? styles.cardMobile : styles.cardDesktop]}>
        <View style={styles.cardIconWrap}>
          <FontAwesome5 name="receipt" size={20} color="#111111" />
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={1}>{viajeNombre}</Text>
            <View style={styles.totalBadge}>
              <Text style={styles.totalBadgeText}>{formatTotal(item.total)}</Text>
            </View>
          </View>

          <View style={styles.specGrid}>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Conductor</Text>
              <Text style={styles.specValue} numberOfLines={1}>{conductorNombre}</Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Diesel</Text>
              <Text style={styles.specValue}>
                {formatTotal(
                  Array.isArray((item as any).dieselHistorial)
                    ? (item as any).dieselHistorial.reduce((acc: number, d: any) => acc + Number(d.costo || 0), 0)
                    : item.dieselCosto
                )}
              </Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>TAG</Text>
              <Text style={styles.specValue}>{formatTotal(item.tag)}</Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Factura</Text>
              <Text style={styles.specValue}>{item.facturaUrl ? "Adjunta" : "Sin archivo"}</Text>
            </View>
          </View>

          <View style={styles.cardActions}>
            <TouchableOpacity style={styles.iconAction} onPress={() => openModal(item)} activeOpacity={0.85}>
              <FontAwesome5 name="eye" size={13} color="#111111" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconAction, styles.iconActionDanger]}
              onPress={() => deleteViatico(item.id)}
              activeOpacity={0.85}
            >
              <FontAwesome5 name="trash-alt" size={13} color="#dc2626" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const comidasCostoCalculado = (() => {
    const cantidad = Number(conceptos["Comidas Cantidad"] || 0);
    return cantidad > 0 ? String(cantidad * 400) : "";
  })();

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

  const renderModalBtn = (
    label: string,
    onPress: () => void,
    variant: "primary" | "outline" | "danger" = "outline"
  ) => (
    <TouchableOpacity
      style={[
        styles.modalBtn,
        variant === "primary" && styles.modalBtnPrimary,
        variant === "danger" && styles.modalBtnDanger,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text
        style={[
          styles.modalBtnText,
          variant === "primary" && styles.modalBtnTextPrimary,
          variant === "danger" && styles.modalBtnTextDanger,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const filteredConceptos = conceptosBase.filter((b) => b !== "Comidas" && (isAdmin || b !== "Comisiones"));
  const conceptMid = Math.ceil(filteredConceptos.length / 2);
  const leftConceptos = ["Comidas", ...filteredConceptos.slice(0, conceptMid)];
  const rightConceptos = filteredConceptos.slice(conceptMid);

  const renderConceptBlock = (base: string) => (
    <View key={base} style={styles.conceptCard}>
      <Text style={styles.conceptTitle}>{base}</Text>
      <View style={styles.conceptInputRow}>
        <View style={styles.conceptInputHalf}>
          <Text style={styles.conceptInputLabel}>Días</Text>
          <TextInput
            value={conceptos[`${base} Cantidad`]}
            onChangeText={(t) => setConceptos({ ...conceptos, [`${base} Cantidad`]: t })}
            keyboardType="numeric"
            placeholder="0"
            {...modalInputProps}
          />
        </View>
        <View style={styles.conceptInputHalf}>
          <Text style={styles.conceptInputLabel}>Costo</Text>
          <TextInput
            value={base === "Comidas" ? comidasCostoCalculado : conceptos[`${base} Costo`]}
            onChangeText={(t) => setConceptos({ ...conceptos, [`${base} Costo`]: t })}
            keyboardType="numeric"
            placeholder="0"
            editable={base !== "Comidas"}
            {...modalInputProps}
          />
        </View>
      </View>

      {base === "Casetas efectivo" && (
        <View style={styles.uploadBlock}>
          <Text style={styles.conceptInputLabel}>Comprobante caseta</Text>
          {casetaFoto ? (
            <>
              <Image source={{ uri: casetaFoto }} style={styles.facturaPreview} />
              <View style={styles.modalBtnRow}>
                {renderModalBtn("Reemplazar", pickCasetaFoto)}
                {renderModalBtn("Eliminar", () => { setCasetaFoto(null); setCasetaFotoRemoved(true); }, "danger")}
              </View>
            </>
          ) : (
            renderModalBtn("Subir foto", pickCasetaFoto, "primary")
          )}
        </View>
      )}
    </View>
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
              <FontAwesome5 name="receipt" size={16} color="#ffffff" />
            </View>
            <View>
              <Text style={styles.modalTitle}>
                {editingViatico ? "Editar Viático" : "Nuevo Viático"}
              </Text>
              <Text style={styles.modalSubtitle}>
                {editingViatico ? "Actualiza los gastos del viaje" : "Registra los gastos del viaje seleccionado"}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.modalCloseButton} onPress={closeModal} disabled={saving} activeOpacity={0.85}>
            <FontAwesome5 name="times" size={14} color="#6b7280" />
          </TouchableOpacity>
        </View>

        <KeyboardAwareScrollView
          enableOnAndroid
          extraScrollHeight={120}
          keyboardShouldPersistTaps="handled"
          style={styles.modalScroll}
          contentContainerStyle={styles.modalScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {renderModalField(
            "Viaje",
            <View style={styles.pickerWrap}>
              <Picker selectedValue={tripId} onValueChange={setTripId} style={styles.picker}>
                <Picker.Item label="Selecciona un viaje" value="" />
                {trips.map((t) => (
                  <Picker.Item
                    key={t.id}
                    label={`${t.rutaAcubrir || t.destino || "Sin viaje"} (${t.conductorNombre || "Sin"})`}
                    value={t.id}
                  />
                ))}
              </Picker>
            </View>
          )}

          <Text style={styles.modalSectionTitle}>Conceptos de gasto</Text>
          <View style={[styles.conceptGrid, isMobile && styles.conceptGridMobile]}>
            <View style={styles.conceptColumn}>{leftConceptos.map(renderConceptBlock)}</View>
            <View style={styles.conceptColumn}>{rightConceptos.map(renderConceptBlock)}</View>
          </View>

          <View style={styles.modalSection}>
            <View style={styles.modalSectionHeader}>
              <View style={styles.modalSectionHeaderLeft}>
                <FontAwesome5 name="gas-pump" size={14} color="#111111" />
                <Text style={styles.modalSectionTitle}>Diesel</Text>
              </View>
              <TouchableOpacity style={styles.addDieselBtn} onPress={agregarCargaDiesel} activeOpacity={0.85}>
                <FontAwesome5 name="plus" size={12} color="#ffffff" />
              </TouchableOpacity>
            </View>

            <View style={styles.conceptInputRow}>
              <View style={styles.conceptInputHalf}>
                <Text style={styles.conceptInputLabel}>Cargas</Text>
                <TextInput value={dieselCargas} onChangeText={setDieselCargas} keyboardType="numeric" placeholder="0" {...modalInputProps} />
              </View>
              <View style={styles.conceptInputHalf}>
                <Text style={styles.conceptInputLabel}>Costo</Text>
                <TextInput value={dieselCosto} onChangeText={setDieselCosto} keyboardType="numeric" placeholder="0" {...modalInputProps} />
              </View>
            </View>

            {dieselHistorial.length > 0 && (
              <View style={styles.dieselList}>
                {dieselHistorial.map((item, index) => (
                  <View key={index} style={styles.dieselItem}>
                    <Text style={styles.dieselItemText}>
                      {item.cantidad} cargas · {formatTotal(item.costo)}
                    </Text>
                    <View style={styles.dieselItemActions}>
                      <TouchableOpacity style={styles.iconAction} onPress={() => editarCarga(index)} activeOpacity={0.85}>
                        <FontAwesome5 name="pen" size={11} color="#111111" />
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.iconAction, styles.iconActionDanger]} onPress={() => eliminarCarga(index)} activeOpacity={0.85}>
                        <FontAwesome5 name="trash-alt" size={11} color="#dc2626" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {renderModalField(
            "TAG",
            <TextInput value={tag} onChangeText={setTag} keyboardType="numeric" placeholder="0" {...modalInputProps} />
          )}

          <View style={styles.totalSummary}>
            <Text style={styles.totalSummaryLabel}>Total estimado</Text>
            <Text style={styles.totalSummaryValue}>{formatTotal(calcularTotal())}</Text>
          </View>

          <View style={styles.modalSection}>
            <Text style={styles.modalSectionTitle}>Factura</Text>
            {factura ? (
              <>
                {showFactura ? (
                  factura.toLowerCase().endsWith(".pdf") ? (
                    <View style={styles.uploadBlock}>
                      <FontAwesome5 name="file-pdf" size={28} color="#111111" />
                      <Text style={styles.uploadHint}>Factura en PDF</Text>
                      {renderModalBtn(
                        "Abrir PDF",
                        () => (Platform.OS === "web" ? window.open(factura, "_blank") : Linking.openURL(factura)),
                        "primary"
                      )}
                    </View>
                  ) : (
                    <Image source={{ uri: factura }} style={styles.facturaPreview} />
                  )
                ) : (
                  renderModalBtn("Mostrar factura", () => setShowFactura(true), "primary")
                )}
                <View style={styles.modalBtnRow}>
                  {renderModalBtn("Reemplazar", pickFactura)}
                  {renderModalBtn("Eliminar", () => { setFactura(null); setFacturaRemoved(true); setShowFactura(false); }, "danger")}
                </View>
              </>
            ) : (
              <View style={styles.uploadBlock}>
                <FontAwesome5 name="cloud-upload-alt" size={24} color="#9ca3af" />
                <Text style={styles.uploadHint}>Adjunta imagen o PDF del comprobante</Text>
                {renderModalBtn("Subir factura", pickFactura, "primary")}
              </View>
            )}
          </View>
        </KeyboardAwareScrollView>

        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.cancelButton} onPress={closeModal} disabled={saving} activeOpacity={0.85}>
            <Text style={styles.cancelButtonText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={saveViatico}
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
          <Text style={styles.pageTitle}>Viáticos Registrados</Text>
          <Text style={styles.subtitle}>Gastos de viaje, diesel y comprobantes</Text>
        </View>
      </View>

      <View style={styles.toolbarPanel}>
        <View style={styles.toolbarActions}>
          <TouchableOpacity style={styles.addButton} onPress={() => openModal()} activeOpacity={0.85}>
            <FontAwesome5 name="plus" size={14} color="#ffffff" />
            <Text style={styles.addButtonText}>Nuevo Viático</Text>
          </TouchableOpacity>
        </View>

        {currentUser?.rol !== "Operador" && (
          <View style={[styles.toolbarFiltersRow, isMobile && styles.toolbarFiltersRowMobile]}>
            <View style={styles.filterBlock}>
              <Text style={styles.toolbarLabel}>Periodo</Text>
              <View style={styles.segmentedControl}>
                {filterOptions.map((opt) => {
                  const isActive = filter === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.filterPill, isActive && styles.filterPillActive]}
                      onPress={() => setFilter(opt.value)}
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

            <TouchableOpacity style={styles.exportButton} onPress={exportViaticosToExcel} activeOpacity={0.85}>
              <FontAwesome5 name="file-excel" size={13} color="#111111" />
              <Text style={styles.exportButtonText}>Exportar Excel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.listPanel}>
        {!listLoading && !loadError && viaticos.length > 0 && (
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderTitle}>{viaticos.length} viáticos</Text>
            <Text style={styles.listHeaderHint}>Periodo: {filterOptions.find((o) => o.value === filter)?.label}</Text>
          </View>
        )}
        {listLoading ? (
          <View style={styles.emptyState}>
            <FontAwesome5 name="spinner" size={20} color="#9ca3af" />
            <Text style={styles.emptyText}>Cargando viáticos...</Text>
          </View>
        ) : loadError ? (
          <View style={styles.emptyState}>
            <FontAwesome5 name="exclamation-triangle" size={20} color="#dc2626" />
            <Text style={styles.emptyText}>{loadError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadViaticos}>
              <Text style={styles.retryButtonText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : viaticos.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome5 name="wallet" size={22} color="#9ca3af" />
            <Text style={styles.emptyTitle}>No hay viáticos registrados</Text>
            <Text style={styles.emptyText}>Pulsa "Nuevo Viático" para crear el primero.</Text>
          </View>
        ) : (
          <FlatList
            data={viaticos}
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
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#111111",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 999,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const, alignSelf: "flex-start" as const } : {}),
  },
  addButtonText: { color: "#ffffff", fontWeight: "700", fontSize: 14 },
  toolbarPanel: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    marginBottom: 14,
    gap: 12,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 8px 24px rgba(0,0,0,0.04)" as any }
      : {}),
  },
  toolbarActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  toolbarFiltersRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  toolbarFiltersRowMobile: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  filterBlock: { flex: 1, minWidth: 0 },
  toolbarLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  segmentedControl: {
    flexDirection: "row",
    alignSelf: "flex-start",
    backgroundColor: "#f3f4f6",
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  filterPill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  filterPillActive: { backgroundColor: "#111111" },
  filterPillText: { fontSize: 12, fontWeight: "700", color: "#6b7280" },
  filterPillTextActive: { color: "#ffffff" },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#111111",
    backgroundColor: "#ffffff",
    flexShrink: 0,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  exportButtonText: { color: "#111111", fontWeight: "700", fontSize: 13 },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  listHeaderTitle: { fontSize: 14, fontWeight: "700", color: "#111111" },
  listHeaderHint: { fontSize: 12, color: "#9ca3af", fontWeight: "600" },
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
  listContent: { paddingBottom: 8, gap: 12 },
  listRow: { gap: 12 },
  card: {
    flexDirection: "row",
    backgroundColor: "#fafafa",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    flex: 1,
    gap: 12,
  },
  cardMobile: { width: "100%" },
  cardDesktop: { minWidth: 0, maxWidth: "49%" as any },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#111111", flex: 1 },
  totalBadge: {
    backgroundColor: "#111111",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  totalBadgeText: { color: "#ffffff", fontWeight: "700", fontSize: 11 },
  specGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
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
  specLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
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
  title: { fontSize: 22, fontWeight: "bold" },
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
  webModalOverlay: {
    position: "fixed" as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
    padding: 20,
    ...(Platform.OS === "web" ? { cursor: "default" as const } : {}),
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 16,
  },
  modalCard: {
    width: Platform.OS === "web" ? 860 : "96%",
    maxHeight: Platform.OS === "web" ? ("90vh" as any) : "92%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 20px 50px rgba(0,0,0,0.18)" as any }
      : {}),
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  modalHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    paddingRight: 12,
  },
  modalIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#111111" },
  modalSubtitle: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  modalScroll: { flexGrow: 0, flexShrink: 1 },
  modalScrollContent: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 24 },
  modalFieldGroup: { marginBottom: 14 },
  modalFieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  modalInput: {
    width: "100%",
    height: 42,
    backgroundColor: "#fafafa",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  modalInputContent: { color: "#111111", fontWeight: "600", fontSize: 14 },
  pickerWrap: {
    backgroundColor: "#fafafa",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  picker: { width: "100%", color: "#111111" },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111111",
    marginBottom: 12,
    marginTop: 4,
    letterSpacing: 0.2,
  },
  modalSection: {
    marginBottom: 16,
    padding: 14,
    backgroundColor: "#fafafa",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  modalSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalSectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  addDieselBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  conceptGrid: { flexDirection: "row", gap: 12, marginBottom: 8 },
  conceptGridMobile: { flexDirection: "column" },
  conceptColumn: { flex: 1, gap: 10 },
  conceptCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    marginBottom: 10,
  },
  conceptTitle: { fontSize: 13, fontWeight: "700", color: "#111111", marginBottom: 10 },
  conceptInputRow: { flexDirection: "row", gap: 8 },
  conceptInputHalf: { flex: 1 },
  conceptInputLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  dieselList: { marginTop: 12, gap: 8 },
  dieselItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dieselItemText: { flex: 1, fontSize: 13, fontWeight: "600", color: "#374151" },
  dieselItemActions: { flexDirection: "row", gap: 6 },
  totalSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#111111",
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 16,
  },
  totalSummaryLabel: { fontSize: 14, fontWeight: "600", color: "#d1d5db" },
  totalSummaryValue: { fontSize: 20, fontWeight: "800", color: "#ffffff" },
  uploadBlock: {
    alignItems: "center",
    gap: 10,
    padding: 16,
    backgroundColor: "#fafafa",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderStyle: "dashed",
    marginTop: 8,
  },
  uploadHint: { fontSize: 13, color: "#6b7280", textAlign: "center" },
  facturaPreview: {
    width: "100%",
    height: 180,
    resizeMode: "contain",
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    marginBottom: 8,
  },
  modalBtnRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 8 },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#111111",
    backgroundColor: "#ffffff",
    alignSelf: "flex-start",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  modalBtnPrimary: { backgroundColor: "#111111", borderColor: "#111111" },
  modalBtnDanger: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
  modalBtnText: { color: "#111111", fontWeight: "700", fontSize: 13 },
  modalBtnTextPrimary: { color: "#ffffff" },
  modalBtnTextDanger: { color: "#dc2626" },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 22,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#111111",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  cancelButtonText: { color: "#111111", fontWeight: "700", fontSize: 14 },
  saveButton: {
    flex: 1,
    backgroundColor: "#111111",
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: "#ffffff", fontWeight: "700", fontSize: 14 },
});
