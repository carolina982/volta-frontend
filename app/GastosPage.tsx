import { FontAwesome5 } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
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
  rutaAcubrir?: string;
  destino?: string;
}

interface SimpleUser {
  id: string;
  nombre: string;
  apellido?: string;
}

const toId = (value: any): string => {
  if (!value) return "";
  if (typeof value === "object") return String(value._id || value.id || "");
  return String(value);
};

const formatUserName = (u?: SimpleUser | null) => {
  if (!u) return "";
  return [u.nombre, u.apellido].filter(Boolean).join(" ").trim();
};

const resolveConductorNombre = (trip: any, users: SimpleUser[]) => {
  if (typeof trip?.conductorId === "object" && trip.conductorId) {
    const nested = formatUserName({
      id: toId(trip.conductorId),
      nombre: trip.conductorId.nombre || "",
      apellido: trip.conductorId.apellido,
    });
    if (nested) return nested;
  }
  if (trip?.conductorNombre && String(trip.conductorNombre).trim() && trip.conductorNombre !== "Sin asignar") {
    return String(trip.conductorNombre).trim();
  }
  if (trip?.conductor?.nombre) {
    return formatUserName({
      id: "",
      nombre: trip.conductor.nombre,
      apellido: trip.conductor.apellido,
    });
  }
  const id = toId(trip?.conductorId);
  const user = users.find((u) => String(u.id) === String(id));
  return formatUserName(user);
};

/** Devuelve el/los nombre(s) del/los acompañante(s) del viaje (conductor principal + destinos extra). */
const resolveAcompananteNombre = (trip: any, users: SimpleUser[]): string => {
  if (!trip) return "";
  const names: string[] = [];
  const pushName = (val: any) => {
    if (!val) return;
    if (typeof val === "object" && (val.nombre || val.apellido)) {
      const n = formatUserName({
        id: toId(val),
        nombre: val.nombre || "",
        apellido: val.apellido,
      });
      if (n) names.push(n);
      return;
    }
    const id = toId(val);
    if (!id) return;
    const u = users.find((x) => String(x.id) === id);
    const n = formatUserName(u);
    if (n) names.push(n);
  };
  pushName(trip.acompanante);
  if (Array.isArray(trip.destinoExtra)) {
    trip.destinoExtra.forEach((leg: any) => pushName(leg?.acompanante));
  }
  return [...new Set(names.filter(Boolean))].join(", ");
};

const formatTripOptionLabel = (t: Trip) => {
  const ruta = (t.rutaAcubrir || t.destino || "Sin viaje").trim();
  const operador = (t.conductorNombre || "").trim();
  if (operador && operador !== "Sin asignar" && operador !== "Sin") {
    return `${ruta} · ${operador}`;
  }
  return ruta;
};

const conceptosBase = ["Comidas", "Casetas efectivo", "DEF"];

const preciosFijos: Record<string, number> = {
  comidas: 400,
};

const excelHeaders = [
  "Semana",
  "Fecha",
  "Viaje",
  "Conductor",
  "Acompañante",
  "Comidas (días)",
  "Comidas ($)",
  "DEF (cantidad)",
  "Casetas efectivo ($)",
  "TAG ($)",
  "Casetas + TAG ($)",
  "Diesel ($)",
  "Otros gastos ($)",
  "Detalle otros gastos",
  "Total ($)",
];

const getConceptoValor = (conceptos: any, clave: string): number => {
  if (!conceptos) return 0;
  if (typeof conceptos.get === "function") {
    const nested = conceptos.get(clave.replace(/ (Cantidad|Costo)$/, ""));
    if (nested && typeof nested === "object") {
      if (clave.endsWith("Cantidad")) return Number(nested.cantidad || 0);
      if (clave.endsWith("Costo")) return Number(nested.costo || 0);
    }
  }
  if (conceptos[clave] !== undefined && conceptos[clave] !== null && typeof conceptos[clave] !== "object") {
    return Number(conceptos[clave] || 0);
  }
  const base = clave.replace(/ (Cantidad|Costo)$/, "");
  const nested = conceptos[base];
  if (nested && typeof nested === "object") {
    if (clave.endsWith("Cantidad")) return Number(nested.cantidad || 0);
    if (clave.endsWith("Costo")) return Number(nested.costo || 0);
  }
  return 0;
};

const getOtrosGastosExport = (v: any) => {
  const extras = Array.isArray(v.costosExtras)
    ? v.costosExtras
    : Array.isArray(v.conceptos?.["Otros gastos"]?.detalle)
      ? v.conceptos["Otros gastos"].detalle
      : [];
  const total =
    extras.reduce((acc: number, e: any) => acc + Number(e.costo || 0), 0) ||
    Number(v.conceptos?.["Otros gastos"]?.costo || v.conceptos?.["Otros gastos Costo"] || 0);
  const detalle = extras
    .map((e: any) => `${e.description || e.descripcion || "Gasto"}: ${Number(e.costo || 0)}`)
    .join(" | ");
  return { total, detalle };
};

const createEmptyConceptos = () =>
  ({
    "Comidas Cantidad": "",
    "Comidas Costo": "",
    "Casetas efectivo Cantidad": "",
    "Casetas efectivo Costo": "",
    "DEF Cantidad": "",
    "DEF Costo": "",
  }) as { [key: string]: string };

const formatNumericField = (value: number | string | undefined | null) => {
  if (value === undefined || value === null || value === "") return "";
  const num = Number(value);
  return num === 0 ? "" : String(value);
};

const normalizarViaticoParaEditar = (viatico: any, _conceptosBaseList: string[]) => {
  const conceptosPlano: any = createEmptyConceptos();
  conceptosPlano["Comidas Cantidad"] = formatNumericField(
    viatico.conceptos?.["Comidas"]?.cantidad ?? viatico.conceptos?.["Comidas Cantidad"]
  );
  conceptosPlano["Comidas Costo"] = formatNumericField(
    viatico.conceptos?.["Comidas"]?.costo ?? viatico.conceptos?.["Comidas Costo"]
  );
  conceptosPlano["Casetas efectivo Cantidad"] = formatNumericField(
    viatico.conceptos?.["Casetas efectivo"]?.cantidad ?? viatico.conceptos?.["Casetas efectivo Cantidad"]
  );
  conceptosPlano["Casetas efectivo Costo"] = formatNumericField(
    viatico.conceptos?.["Casetas efectivo"]?.costo ?? viatico.conceptos?.["Casetas efectivo Costo"]
  );
  conceptosPlano["DEF Cantidad"] = formatNumericField(
    viatico.conceptos?.["DEF"]?.cantidad ?? viatico.conceptos?.["DEF Cantidad"]
  );
  conceptosPlano["DEF Costo"] = "0";

  const extrasRaw = (viatico as any).costosExtras || viatico.conceptos?.["Otros gastos"]?.detalle;
  let costosExtras: { description: string; costo: string }[] = [];
  if (Array.isArray(extrasRaw)) {
    costosExtras = extrasRaw.map((e: any) => ({
      description: String(e.description || e.descripcion || "Gasto"),
      costo: formatNumericField(e.costo),
    }));
  } else {
    const otrosCosto = Number(
      viatico.conceptos?.["Otros gastos"]?.costo ?? viatico.conceptos?.["Otros gastos Costo"] ?? 0
    );
    if (otrosCosto > 0) {
      costosExtras = [{ description: "Otros gastos", costo: String(otrosCosto) }];
    }
  }

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
    costosExtras,
  };
};

const filterOptions: { value: "day" | "week" | "month" | "general"; label: string }[] = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "general", label: "General" },
];

const MONTH_SHORT_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Lunes 00:00 de la semana que contiene `ref`. */
const getWeekStartMonday = (ref = new Date()) => {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const weekday = d.getDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  d.setDate(d.getDate() + mondayOffset);
  d.setHours(0, 0, 0, 0);
  return d;
};

const addDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const formatWeekRangeLabel = (weekStart: Date) => {
  const weekEnd = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const sameYear = weekStart.getFullYear() === weekEnd.getFullYear();
  const startDay = weekStart.getDate();
  const endDay = weekEnd.getDate();
  const startMonth = MONTH_SHORT_ES[weekStart.getMonth()];
  const endMonth = MONTH_SHORT_ES[weekEnd.getMonth()];
  if (sameMonth && sameYear) {
    return `${startDay}–${endDay} ${startMonth} ${weekStart.getFullYear()}`;
  }
  if (sameYear) {
    return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${weekStart.getFullYear()}`;
  }
  return `${startDay} ${startMonth} ${weekStart.getFullYear()} – ${endDay} ${endMonth} ${weekEnd.getFullYear()}`;
};

const getViaticoDate = (v: { createdAt?: any; fecha?: any; updatedAt?: any }) => {
  const raw = v.createdAt || v.fecha || v.updatedAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isViaticoInWeek = (v: { createdAt?: any; fecha?: any; updatedAt?: any }, weekStart: Date) => {
  const date = getViaticoDate(v);
  if (!date) return false;
  const weekEnd = addDays(weekStart, 7);
  return date >= weekStart && date < weekEnd;
};

const isViaticoInExportPeriod = (
  v: { createdAt?: any; fecha?: any; updatedAt?: any },
  exportType: "day" | "week" | "month" | "general"
) => {
  if (exportType === "general") return true;
  const date = getViaticoDate(v);
  if (!date) return false;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = addDays(startOfToday, 1);

  if (exportType === "day") {
    return date >= startOfToday && date < endOfToday;
  }
  if (exportType === "week") {
    return isViaticoInWeek(v, getWeekStartMonday(now));
  }
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return date >= startOfMonth && date < endOfMonth;
};

const formatWeekSelectLabel = (weekStart: Date, currentWeekStart: Date) => {
  const range = formatWeekRangeLabel(weekStart);
  if (weekStart.getTime() === currentWeekStart.getTime()) {
    return `Esta semana · ${range}`;
  }
  return `Semana ${range}`;
};

const weekStartKey = (weekStart: Date) =>
  `${weekStart.getFullYear()}-${pad2(weekStart.getMonth() + 1)}-${pad2(weekStart.getDate())}`;

const buildWeekOptions = (center = new Date(), past = 16, future = 4) => {
  const current = getWeekStartMonday(center);
  const options: { label: string; value: string; start: Date }[] = [];
  for (let i = -past; i <= future; i++) {
    const start = addDays(current, i * 7);
    options.push({
      start,
      value: weekStartKey(start),
      label: formatWeekSelectLabel(start, current),
    });
  }
  return options;
};

export default function ViaticsPage() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [viewportWidth, setViewportWidth] = useState(() =>
    Platform.OS === "web" && typeof window !== "undefined"
      ? window.visualViewport?.width || window.innerWidth
      : width
  );
  const effectiveWidth = Math.min(width, viewportWidth || width);
  const isNarrowList = isMobile || effectiveWidth < 1024;

  const { currentUser } = useStore();
  const isAdmin = currentUser?.rol?.toLocaleLowerCase() === "admin";
  const [viaticos, setViaticos] = useState<Viatico[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingViatico, setEditingViatico] = useState<Viatico | null>(null);
  const [showForm, setShowForm] = useState(true);
  const [tripSheetVisible, setTripSheetVisible] = useState(false);

  const [tripId, setTripId] = useState("");
  const [conceptos, setConceptos] = useState<{ [key: string]: string }>(createEmptyConceptos);
  const [tag, setTag] = useState("");
  const [factura, setFactura] = useState<string | null>(null);
  const [facturaRemoved, setFacturaRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showFactura, setShowFactura] = useState(false);
  const [filter, setFilter] = useState<"day" | "week" | "month" | "general">("week");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [conductorFilter, setConductorFilter] = useState<string>("");
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => getWeekStartMonday());
  const [weekSheetVisible, setWeekSheetVisible] = useState(false);

  const [dieselCargas,setDieselCargas]=useState("");
  const [dieselCosto,setDieselCosto]=useState("");
  const [totalSDieselGlobal,setTotalDieselGlobal]=useState(0);
  const [viaticoSeleccionado,setViaticoSeleccionado]=useState<any>(null);

  //lista de costos extras
  const [costosExtrasList,setCostosExtrasList]=useState<{description:string,costo:string}[]>([]);
  //inpus
  const [extraDesc,setExtraDesc]=useState("");
  const [extraCosto,setExtraCosto]=useState("")

  interface CargaDiesel{
    cantidad:string;
    costo:string;
  }

  const [dieselHistorial,setDieselHistorial]=useState<CargaDiesel[]>([]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const syncViewport = () => {
      setViewportWidth(window.visualViewport?.width || window.innerWidth);
    };
    syncViewport();
    window.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("resize", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("resize", syncViewport);
    };
  }, []);

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

  const closeModal = useCallback(() => {
    setTripSheetVisible(false);
    setShowForm(true);
    setModalVisible(false);
  }, []);

  const calcularTotalDieselGlobal = (viaticosData: Viatico[]) => {
    let total = 0;
    viaticosData.forEach((v) => {
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

  const loadUsers = useCallback(async () => {
    try {
      const res = await api.get("/users");
      setUsers(
        (res.data || []).map((u: any) => ({
          id: u._id || u.id,
          nombre: u.nombre || "",
          apellido: u.apellido || "",
        }))
      );
    } catch (e) {
      console.error("Error cargando usuarios", e);
    }
  }, []);

  const loadTrips = useCallback(async () => {
    if (!currentUser) return;
    try {
      const res = await api.get("/trips");
      let tripsData = (res.data || []).map((t: any) => {
        const conductorId = toId(t.conductorId);
        return {
          ...t,
          id: t._id || t.id,
          conductorId,
          conductorNombre: resolveConductorNombre(t, users),
        } as Trip;
      });

      const rol = (currentUser?.rol || "").toLowerCase();
      if (rol === "operador" || rol === "chofer") {
        tripsData = tripsData.filter(
          (t: Trip) => String(t.conductorId) === String(currentUser.id || (currentUser as any)._id)
        );
      }

      setTrips(tripsData);
    } catch (e) {
      console.error(e);
      setLoadError("No se pudieron cargar los viajes.");
    }
  }, [currentUser, users]);

  const loadViaticos = useCallback(async () => {
    if (!isAdmin) {
      setViaticos([]);
      setListLoading(false);
      return;
    }
    setListLoading(true);
    setLoadError("");
    try {
      const res = await api.get("/viatics");

    let viaticosData = res.data.map((v: any) => ({
      ...v,
      id: v._id,

      facturaUrl: v.factura
        ? `${BASE_URL.replace("/api", "")}${v.factura}`
        : undefined,
    }));

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
          resolveConductorNombre(trip || v.tripId, users) ||
          v.conductorNombre ||
          "",
        acompananteNombre: resolveAcompananteNombre(trip || v.tripId, users),
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
}, [conductorFilter, trips, users, currentUser, isAdmin]);

  useEffect(() => {
    if (currentUser) void loadUsers();
  }, [currentUser, loadUsers]);

  useEffect(() => {
    if (currentUser) void loadTrips();
  }, [currentUser, loadTrips]);

  useEffect(() => {
    if (currentUser) void loadViaticos();
  }, [currentUser, loadViaticos]);

  const displayedViaticos = useMemo(
    () => viaticos.filter((v) => isViaticoInWeek(v, selectedWeekStart)),
    [viaticos, selectedWeekStart]
  );

  const weekOptions = useMemo(() => buildWeekOptions(), []);
  const weekLabel = useMemo(() => formatWeekRangeLabel(selectedWeekStart), [selectedWeekStart]);
  const weekSelectLabel = useMemo(() => {
    const current = getWeekStartMonday();
    return formatWeekSelectLabel(selectedWeekStart, current);
  }, [selectedWeekStart]);
  const selectedWeekValue = weekStartKey(selectedWeekStart);

  const openWeekSheet = () => setWeekSheetVisible(true);
  const closeWeekSheet = () => setWeekSheetVisible(false);

  const selectedTrip = useMemo(
    () => trips.find((t) => String(t.id) === String(tripId)) || null,
    [trips, tripId]
  );
  const selectedTripLabel = selectedTrip
    ? formatTripOptionLabel(selectedTrip)
    : "Selecciona un viaje";

  const calcularTotal = () => {
    let total = 0;

    // Comidas: cantidad × precio fijo
    total += Number(conceptos["Comidas Cantidad"] || 0) * preciosFijos.comidas;

    // Casetas efectivo + TAG (se suman)
    total += Number(conceptos["Casetas efectivo Costo"] || 0);
    total += Number(tag || 0);

    // Diesel: suma de costos del historial
    dieselHistorial.forEach((c) => {
      total += Number(c.costo || 0);
    });

    // Otros gastos: suma de costos
    costosExtrasList.forEach((e) => {
      total += Number(e.costo || 0);
    });

    // DEF solo cantidad (no suma a dinero)
    return total;
  };

  const totalCasetasYTag =
    Number(conceptos["Casetas efectivo Costo"] || 0) + Number(tag || 0);

  const totalDiesel =
    dieselHistorial.reduce((acc, item) => acc + Number(item.costo || 0), 0);

  const totalOtros =
    costosExtrasList.reduce((acc, item) => acc + Number(item.costo || 0), 0);

  //exportacion  excel 
const exportViaticosToExcel =async ()=>{
  try {
    // "Semana" respeta la semana elegida en el selector; "General" incluye todo.
    const exportRows = viaticos.filter((v) => {
      if (filter === "general") return true;
      if (filter === "week") return isViaticoInWeek(v, selectedWeekStart);
      return isViaticoInExportPeriod(v, filter);
    });
    if (!exportRows.length){
      const periodLabel = filterOptions.find((o) => o.value === filter)?.label || filter;
      if (Platform.OS === "web") {
        window.alert(`Aviso\nNo hay viáticos en el periodo "${periodLabel}".`);
      } else {
        Alert.alert("Aviso", `No hay viáticos en el periodo "${periodLabel}".`);
      }
      return;
    }
    const sorted=[...exportRows].sort( (a,b)=>
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
      const monthName =date.toLocaleString("es-MX",{
        month:"long",
        year:"numeric",
      });
      const weekNumber=Math.ceil(date.getDate()/7);
      const dayNumber=date.getDate();
      
      const trip=trips.find(t=>t.id === (typeof v.tripId === "object" ? (v.tripId as any)._id:v.tripId));
      const viajeNombre= v.viajeNombre || v.tripNombre || trip?.rutaAcubrir || trip?.destino || trip?.nombre || "N/A";
      const conductorNombre =
        resolveConductorNombre(trip || v.tripId, users) ||
        v.conductorNombre ||
        "—";
      const acompananteNombre =
        resolveAcompananteNombre(trip || v.tripId, users) || "Sin acompañante";
      const dieselTotal= Array.isArray((v as any).dieselHistorial)
        ?(v as any).dieselHistorial.reduce((acc:number,d:any)=>acc+Number (d.costo || 0),0)
        :Number(v.dieselCosto || (v as any).diselCosto || 0);

      const comidasCantidad = getConceptoValor(v.conceptos, "Comidas Cantidad");
      const comidasCosto =
        getConceptoValor(v.conceptos, "Comidas Costo") ||
        comidasCantidad * preciosFijos.comidas;
      const defCantidad = getConceptoValor(v.conceptos, "DEF Cantidad");
      const casetasCosto = getConceptoValor(v.conceptos, "Casetas efectivo Costo");
      const tagCosto = Number(v.tag || 0);
      const casetasYTag = casetasCosto + tagCosto;
      const otros = getOtrosGastosExport(v);
      const total = Number(v.total ?? 0) || (
        comidasCosto + casetasYTag + dieselTotal + otros.total
      );

      //cambio  de mes 
      if (monthName !== currentMonth){
        if (monthTotal > 0){
          ws_data.push([`Total Dia ${currentDay}: ${dayTotal}`]);
          ws_data.push([`Total Semana ${currentWeek}: ${weekTotal}`]);
          ws_data.push([`Total del mes ${currentMonth}: ${monthTotal}`]);
          ws_data.push([]);
        }
        ws_data.push([`Mes: ${monthName.toUpperCase()}`]);
        ws_data.push(excelHeaders);
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
          ws_data.push([`Total semana ${currentWeek}: ${weekTotal}`]);
          ws_data.push([]);
        }
        currentWeek=weekNumber;
        weekTotal=0;
      }

      // cambio de dia 
      if (dayNumber !== currentDay){
        if (currentDay !== 0){
          ws_data.push([`Total Dia ${currentDay}: ${dayTotal}`]);
        }
        currentDay=dayNumber;
        dayTotal=0;
      }

      ws_data.push([
        weekNumber,
        date.toLocaleDateString("es-MX"),
        viajeNombre,
        conductorNombre,
        acompananteNombre,
        comidasCantidad,
        comidasCosto,
        defCantidad,
        casetasCosto,
        tagCosto,
        casetasYTag,
        dieselTotal,
        otros.total,
        otros.detalle || "—",
        total,
      ]);
      monthTotal+=total;
      weekTotal+=total;
      dayTotal+=total;
    }
    if (monthTotal>0){
      ws_data.push([`Total Dia ${currentDay}: ${dayTotal}`]);
      ws_data.push([`Total Semana ${currentWeek}: ${weekTotal}`]);
      ws_data.push([`Total del Mes ${currentMonth}: ${monthTotal}`]);
    }
    if (ws_data.length === 0) {
      if (Platform.OS === "web") {
        window.alert("Aviso\nNo hay filas válidas para exportar");
      } else {
        Alert.alert("Aviso", "No hay filas válidas para exportar");
      }
      return;
    }
    const ws =XLSX.utils.aoa_to_sheet(ws_data);
    ws["!cols"] = excelHeaders.map((header) => ({
      wch: Math.max(12, Math.min(28, header.length + 2)),
    }));
    const wb =XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb,ws,"Viaticos");
    const stamp = new Date().toISOString().slice(0, 10);
    const periodLabelBase = filterOptions.find((o) => o.value === filter)?.label || filter;
    const periodDetail =
      filter === "week"
        ? `${periodLabelBase} ${formatWeekRangeLabel(selectedWeekStart)}`
        : periodLabelBase;
    const periodSlug = periodDetail.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
    const filename = `Viaticos_${periodSlug}_${stamp}.xlsx`;

    if (Platform.OS === "web"){
      const excelBuffer= XLSX.write(wb,{
        bookType:"xlsx",
        type:"array",
      });
      const blob=new Blob([excelBuffer],{
        type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      // En web de escritorio: descarga directa (más fiable que Web Share)
      const url=window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href=url;
      a.download=filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => window.URL.revokeObjectURL(url), 800);
      window.alert("Éxito\nReporte Excel descargado correctamente");
      return;
    }
    const base64=XLSX.write(wb,{
      bookType:"xlsx",
      type:"base64",
    });
    const fileUri=(FileSystem as any).documentDirectory + filename;
    await FileSystem.writeAsStringAsync(fileUri,base64,{
      encoding:"base64",
    });
    const canShare=await Sharing.isAvailableAsync();
    if (!canShare){
      Alert.alert("Error","No se puede compartir el archivo ");
      return;
    }
    await Sharing.shareAsync(fileUri, {
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      dialogTitle: "Compartir viáticos Excel",
      UTI: "com.microsoft.excel.xlsx",
    });
    Alert.alert("Exito","Reporte generado correctamente");
  }catch (error){
    console.error("Error exportando",error);
    if (Platform.OS === "web") {
      window.alert("Error\nNo se pudo generar el archivo Excel");
    } else {
      Alert.alert("Error","No se pudo generar el archivo");
    }
  }
};


const openModal = useCallback((viatico?: Viatico, opts?: { edit?: boolean }) => {
  if (viatico) {
    const normalized = normalizarViaticoParaEditar(viatico, conceptosBase);
    setEditingViatico(viatico);
    setTripId(toId((viatico as any).tripId));
    setConceptos(normalized.conceptos);
    setDieselHistorial(normalized.dieselHistorial);
    setTag(normalized.tag);
    setCostosExtrasList(normalized.costosExtras || []);
    setFactura(viatico.facturaUrl || null);
    // Ver detalles = hoja; Editar = formulario
    setShowForm(Boolean(opts?.edit));
  } else {
    setEditingViatico(null);
    setTripId("");
    setFactura(null);
    setConceptos(createEmptyConceptos());
    setDieselHistorial([]);
    setTag("");
    setDieselCargas("");
    setDieselCosto("");
    setCostosExtrasList([]);
    setExtraDesc("");
    setExtraCosto("");
    setShowForm(true);
  }
  setFacturaRemoved(false);
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

  const notify = (title: string, message: string) => {
    if (Platform.OS === "web") {
      window.alert(`${title}\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const getAuthToken = async () => {
    try {
      if (Platform.OS === "web") {
        return localStorage.getItem("token");
      }
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      return AsyncStorage.getItem("token");
    } catch {
      return null;
    }
  };

  const isLocalUploadUri = (uri?: string | null) => {
    if (!uri) return false;
    return (
      uri.startsWith("blob:") ||
      uri.startsWith("file:") ||
      uri.startsWith("content:") ||
      uri.startsWith("data:") ||
      (!uri.startsWith("http://") && !uri.startsWith("https://"))
    );
  };

  const saveViatico = async () => {
    if (!tripId) {
      notify("Falta información", "Selecciona un viaje antes de guardar.");
      return;
    }

    setSaving(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        notify("Sesión", "Tu sesión expiró. Vuelve a iniciar sesión.");
        return;
      }

      const formData = new FormData();
      formData.append("tripId", String(tripId));

      const conceptosFinal: any = {
        Comidas: {
          cantidad: Number(conceptos["Comidas Cantidad"] || 0),
          costo: Number(conceptos["Comidas Cantidad"] || 0) * preciosFijos.comidas,
        },
        "Casetas efectivo": {
          cantidad: Number(conceptos["Casetas efectivo Cantidad"] || 0),
          costo: Number(conceptos["Casetas efectivo Costo"] || 0),
        },
        DEF: {
          cantidad: Number(conceptos["DEF Cantidad"] || 0),
          costo: 0,
        },
        "Otros gastos": {
          cantidad: costosExtrasList.length,
          costo: costosExtrasList.reduce((acc, e) => acc + Number(e.costo || 0), 0),
          detalle: costosExtrasList.map((e) => ({
            description: e.description,
            costo: Number(e.costo || 0),
          })),
        },
      };

      formData.append("conceptos", JSON.stringify(conceptosFinal));
      formData.append(
        "costosExtras",
        JSON.stringify(
          costosExtrasList.map((e) => ({
            description: e.description,
            costo: Number(e.costo || 0),
          }))
        )
      );

      const dieselCargasTotal = dieselHistorial.reduce(
        (acc, d) => acc + Number(d.cantidad || 0),
        0
      );
      const dieselCostoTotal = dieselHistorial.reduce(
        (acc, d) => acc + Number(d.costo || 0),
        0
      );

      formData.append("dieselCargas", String(dieselCargasTotal));
      formData.append("dieselCosto", String(dieselCostoTotal));
      formData.append(
        "dieselHistorial",
        JSON.stringify(
          dieselHistorial.map((d) => ({
            cargas: Number(d.cantidad || 0),
            costo: Number(d.costo || 0),
          }))
        )
      );
      formData.append("tag", String(Number(tag || 0)));
      formData.append("total", String(calcularTotal()));

      if (factura && isLocalUploadUri(factura)) {
        if (Platform.OS === "web") {
          const response = await fetch(factura);
          const blob = await response.blob();
          const file = new File([blob], "factura.jpg", { type: blob.type || "image/jpeg" });
          formData.append("factura", file);
        } else {
          const uri = factura.startsWith("file://") ? factura : `file://${factura}`;
          const filename = uri.split("/").pop() || "factura.jpg";
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

      const res = await fetch(url, {
        method,
        body: formData,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        let message = "No se pudo guardar el gasto";
        try {
          const errBody = await res.json();
          message =
            errBody?.message ||
            (Array.isArray(errBody?.errors) ? errBody.errors.map((e: any) => e.msg).join("\n") : null) ||
            message;
        } catch {
          const text = await res.text().catch(() => "");
          if (text) message = text.slice(0, 240);
        }
        throw new Error(message);
      }

      await loadViaticos();
      closeModal();
      notify("Listo", editingViatico ? "Gasto actualizado." : "Gasto guardado.");
    } catch (error: any) {
      console.error(error);
      notify("Error", error?.message || "No se pudo guardar el gasto");
    } finally {
      setSaving(false);
    }
  };

  // Modal propio: Alert.alert / window.confirm fallan o no se ven bien en Expo web/móvil
  const deleteViatico = (id: string) => {
    if (!isAdmin) return;
    setDeleteConfirmId(String(id));
  };

  const proceedDeleteViatico = async () => {
    const id = deleteConfirmId;
    if (!id) return;
    setDeleteConfirmId(null);
    try {
      await api.delete(`/viatics/${id}`);
      setViaticos((prev) => prev.filter((v) => v.id !== id));
      notify("Listo", "Gasto eliminado correctamente.");
    } catch (e) {
      notify("Error", "No se pudo eliminar el gasto.");
    }
  };

  const closeDeleteConfirm = () => setDeleteConfirmId(null);

  const renderDeleteConfirmModal = () => {
    if (!deleteConfirmId) return null;

    const card = (
      <View
        style={[styles.confirmCard, isNarrowList && styles.confirmCardMobile]}
        {...(Platform.OS === "web" ? { onClick: (e: any) => e.stopPropagation() } : {})}
      >
        <View style={styles.confirmIconBadge}>
          <FontAwesome5 name="trash-alt" size={18} color="#ffffff" />
        </View>
        <Text style={styles.confirmTitle}>Eliminar gasto</Text>
        <Text style={styles.confirmMessage}>
          ¿Estás seguro de que deseas eliminar este gasto? Esta acción no se puede deshacer.
        </Text>
        <View style={styles.confirmActions}>
          <TouchableOpacity
            style={styles.confirmCancelBtn}
            onPress={closeDeleteConfirm}
            activeOpacity={0.85}
          >
            <Text style={styles.confirmCancelText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.confirmDeleteBtn}
            onPress={() => {
              void proceedDeleteViatico();
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.confirmDeleteText}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );

    const overlay = (
      <View
        style={[styles.confirmOverlay, styles.confirmOverlayWeb]}
        pointerEvents="box-none"
      >
        <Pressable style={styles.confirmBackdrop} onPress={closeDeleteConfirm} />
        {card}
      </View>
    );

    if (Platform.OS === "web") {
      return <Portal>{overlay}</Portal>;
    }

    return (
      <Modal visible transparent animationType="fade" onRequestClose={closeDeleteConfirm}>
        {overlay}
      </Modal>
    );
  };

  const formatTotal = (value: number | string | undefined) => {
    const num = Number(value || 0);
    return num.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
  };

  const getDieselTotal = (item: any) =>
    Array.isArray(item?.dieselHistorial)
      ? item.dieselHistorial.reduce((acc: number, d: any) => acc + Number(d.costo || 0), 0)
      : Number(item?.dieselCosto || item?.diselCosto || 0);

  const getCasetasTagTotal = (item: any) =>
    Number(item?.tag || 0) +
    Number(
      item?.conceptos?.["Casetas efectivo"]?.costo ??
        item?.conceptos?.["Casetas efectivo Costo"] ??
        0
    );

  const getComidasInfo = (item: any) => {
    const cantidad = Number(
      item?.conceptos?.["Comidas"]?.cantidad ?? item?.conceptos?.["Comidas Cantidad"] ?? 0
    );
    const costo = Number(
      item?.conceptos?.["Comidas"]?.costo ??
        item?.conceptos?.["Comidas Costo"] ??
        cantidad * preciosFijos.comidas
    );
    return { cantidad, costo };
  };

  const getDefCantidad = (item: any) =>
    Number(item?.conceptos?.["DEF"]?.cantidad ?? item?.conceptos?.["DEF Cantidad"] ?? 0);

  const renderViaticDetailSheet = (item: Viatico) => {
    const viajeNombre = item.tripNombre || item.tripviajeNombre || item.viajeNombre || "Sin viaje";
    const conductorNombre =
      item.conductorNombre && item.conductorNombre !== "Sin asignar"
        ? item.conductorNombre
        : "—";
    const acompananteNombre = String((item as any).acompananteNombre || "").trim();
    const comidas = getComidasInfo(item);
    const dieselTotal = getDieselTotal(item);
    const casetasTag = getCasetasTagTotal(item);
    const defCant = getDefCantidad(item);
    const extras = Array.isArray((item as any).costosExtras) ? (item as any).costosExtras : [];
    const dieselRows = Array.isArray((item as any).dieselHistorial)
      ? (item as any).dieselHistorial
      : [];

    return (
      <View style={[styles.sheetPaper, isMobile && styles.sheetPaperTouch]}>
        <View style={styles.sheetTopBar}>
          <View style={styles.sheetBrandMark}>
            <FontAwesome5 name="file-invoice-dollar" size={14} color="#ffffff" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.sheetDocLabel}>Hoja de viático</Text>
            <Text style={styles.sheetDocMeta}>Resumen de gastos del viaje</Text>
          </View>
          <View style={styles.sheetTotalPill}>
            <Text style={styles.sheetTotalPillText}>{formatTotal(item.total)}</Text>
          </View>
        </View>

        <View style={styles.sheetHero}>
          <Text style={styles.sheetHeroEyebrow}>Viaje</Text>
          <Text style={styles.sheetHeroTitle}>{viajeNombre}</Text>
          <View style={styles.sheetHeroDivider} />
          <Text style={styles.sheetHeroEyebrow}>Operador</Text>
          <Text style={styles.sheetHeroDestino}>{conductorNombre}</Text>
          <View style={styles.sheetHeroDivider} />
          <Text style={styles.sheetHeroEyebrow}>Acompañante</Text>
          <Text
            style={[styles.sheetHeroDestino, !acompananteNombre && { color: "#9ca3af" }]}
          >
            {acompananteNombre || "Sin acompañante"}
          </Text>
        </View>

        <View style={styles.sheetSection}>
          <Text style={styles.sheetSectionTitle}>Conceptos</Text>
          <View style={styles.sheetMetaGrid}>
            <View style={styles.sheetMetaItem}>
              <Text style={styles.sheetMetaLabel}>Comidas</Text>
              <Text style={styles.sheetMetaValue}>
                {comidas.cantidad > 0
                  ? `${comidas.cantidad} día${comidas.cantidad === 1 ? "" : "s"} · ${formatTotal(comidas.costo)}`
                  : "—"}
              </Text>
            </View>
            <View style={styles.sheetMetaItem}>
              <Text style={styles.sheetMetaLabel}>DEF</Text>
              <Text style={styles.sheetMetaValue}>
                {defCant > 0 ? String(defCant) : "—"}
              </Text>
            </View>
            <View style={styles.sheetMetaItem}>
              <Text style={styles.sheetMetaLabel}>Casetas + TAG</Text>
              <Text style={styles.sheetMetaValue}>{formatTotal(casetasTag)}</Text>
            </View>
            <View style={styles.sheetMetaItem}>
              <Text style={styles.sheetMetaLabel}>Diésel</Text>
              <Text style={styles.sheetMetaValue}>{formatTotal(dieselTotal)}</Text>
            </View>
            <View style={[styles.sheetMetaItem, styles.sheetMetaItemFull]}>
              <Text style={styles.sheetMetaLabel}>Factura</Text>
              <Text style={styles.sheetMetaValue}>
                {item.facturaUrl ? "Comprobante adjunto" : "Sin archivo"}
              </Text>
            </View>
          </View>
        </View>

        {dieselRows.length > 0 ? (
          <View style={styles.sheetSection}>
            <Text style={styles.sheetSectionTitle}>Cargas de diésel</Text>
            <View style={styles.sheetList}>
              {dieselRows.map((d: any, i: number) => (
                <View key={`d-${i}`} style={styles.sheetListRow}>
                  <Text style={styles.sheetListTitle}>Carga {i + 1}</Text>
                  <Text style={styles.sheetListValue}>
                    {Number(d.cargas ?? d.cantidad ?? 0).toLocaleString("es-MX")} ·{" "}
                    {formatTotal(d.costo)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {extras.length > 0 ? (
          <View style={styles.sheetSection}>
            <Text style={styles.sheetSectionTitle}>Otros gastos</Text>
            <View style={styles.sheetList}>
              {extras.map((e: any, i: number) => (
                <View key={`e-${i}`} style={styles.sheetListRow}>
                  <Text style={styles.sheetListTitle} numberOfLines={2}>
                    {e.description || e.descripcion || `Gasto ${i + 1}`}
                  </Text>
                  <Text style={styles.sheetListValue}>{formatTotal(e.costo)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  const renderItem = ({ item }: { item: Viatico }) => {
    const viajeNombre = item.tripNombre || item.tripviajeNombre || item.viajeNombre || "Sin viaje";
    const conductorNombre =
      item.conductorNombre && item.conductorNombre !== "Sin asignar"
        ? item.conductorNombre
        : "—";
    const acompananteNombre = String((item as any).acompananteNombre || "").trim();
    const dieselTotal = getDieselTotal(item);
    const casetasTag = getCasetasTagTotal(item);

    if (isMobile || isNarrowList) {
      return (
        <View style={styles.cardSlot}>
          <View style={[styles.card, styles.cardFullWidth, styles.cardMobileCompact]}>
            <View style={styles.cardBody}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, styles.cardTitleMobile]} numberOfLines={2}>
                  {viajeNombre}
                </Text>
                <View style={styles.totalBadge}>
                  <Text style={styles.totalBadgeText}>{formatTotal(item.total)}</Text>
                </View>
              </View>

              <View style={styles.mobileMetaBlock}>
                <Text style={styles.specLabel}>Operador</Text>
                <Text style={styles.mobileMetaValue} numberOfLines={1}>
                  {conductorNombre}
                </Text>
              </View>

              <View style={styles.mobileMetaBlock}>
                <Text style={styles.specLabel}>Acompañante</Text>
                <View style={styles.acompRow}>
                  <FontAwesome5
                    name={acompananteNombre ? "user-friends" : "user"}
                    size={12}
                    color={acompananteNombre ? "#2563eb" : "#9ca3af"}
                  />
                  <Text
                    style={[
                      styles.mobileMetaValue,
                      { color: acompananteNombre ? "#111111" : "#9ca3af" },
                    ]}
                    numberOfLines={1}
                  >
                    {acompananteNombre || "Sin acompañante"}
                  </Text>
                </View>
              </View>

              <View style={styles.mobileChipsRow}>
                <View style={styles.mobileChip}>
                  <Text style={styles.mobileChipLabel}>Diésel</Text>
                  <Text style={styles.mobileChipValue}>{formatTotal(dieselTotal)}</Text>
                </View>
                <View style={styles.mobileChip}>
                  <Text style={styles.mobileChipLabel}>Casetas</Text>
                  <Text style={styles.mobileChipValue}>{formatTotal(casetasTag)}</Text>
                </View>
              </View>

              <View style={styles.mobileCardActions}>
                <TouchableOpacity
                  style={styles.mobileDetailsBtn}
                  onPress={() => openModal(item)}
                  activeOpacity={0.85}
                >
                  <FontAwesome5 name="eye" size={13} color="#ffffff" />
                  <Text style={styles.mobileDetailsBtnText}>Ver detalles</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.mobileDeleteBtn}
                  onPress={() => deleteViatico(item.id)}
                  activeOpacity={0.85}
                >
                  <FontAwesome5 name="trash-alt" size={13} color="#dc2626" />
                  <Text style={styles.mobileDeleteBtnText}>Eliminar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.cardSlot}>
        <View style={[styles.card, styles.cardFullWidth]}>
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
                <Text style={styles.specLabel}>Acompañante</Text>
                <Text
                  style={[styles.specValue, !acompananteNombre && { color: "#9ca3af" }]}
                  numberOfLines={1}
                >
                  {acompananteNombre || "Sin acompañante"}
                </Text>
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Diesel</Text>
                <Text style={styles.specValue}>{formatTotal(dieselTotal)}</Text>
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Casetas + TAG</Text>
                <Text style={styles.specValue}>{formatTotal(casetasTag)}</Text>
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Factura</Text>
                <Text style={styles.specValue}>{item.facturaUrl ? "Adjunta" : "Sin archivo"}</Text>
              </View>
            </View>

            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.webDetailsBtn}
                onPress={() => openModal(item)}
                activeOpacity={0.85}
              >
                <FontAwesome5 name="eye" size={12} color="#ffffff" />
                <Text style={styles.webDetailsBtnText}>Ver detalles</Text>
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
      </View>
    );
  };

  const comidasCostoCalculado = (() => {
    const cantidad = Number(conceptos["Comidas Cantidad"] || 0);
    return cantidad > 0 ? String(cantidad * preciosFijos.comidas) : "";
  })();

  const modalInputProps = {
    mode: "flat" as const,
    underlineColor: "transparent",
    activeUnderlineColor: "transparent",
    dense: !isMobile,
    contentStyle: [styles.modalInputContent, isMobile && styles.modalInputContentMobile],
    style: [styles.modalInput, isMobile && styles.modalInputMobile],
    placeholderTextColor: "#9ca3af",
  };

  const renderModalField = (label: string, field: React.ReactNode) => (
    <View style={[styles.modalFieldGroup, isMobile && styles.modalFieldGroupMobile]}>
      <Text style={[styles.modalFieldLabel, isMobile && styles.modalFieldLabelMobile]}>{label}</Text>
      {field}
    </View>
  );

  const renderTripSelectField = () => {
    if (Platform.OS === "web") {
      return (
        <View style={[styles.tripSelectWrap, isMobile && styles.tripSelectWrapMobile]}>
          <select
            value={tripId}
            onChange={(e) => setTripId((e.target as HTMLSelectElement).value)}
            style={
              {
                width: "100%",
                maxWidth: "100%",
                height: isMobile ? 52 : 46,
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "#fafafa",
                color: "#111111",
                fontWeight: 600,
                fontSize: isMobile ? 15 : 14,
                paddingLeft: 14,
                paddingRight: 36,
                outline: "none",
                boxSizing: "border-box",
                cursor: "pointer",
              } as any
            }
          >
            <option value="">Selecciona un viaje</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {formatTripOptionLabel(t)}
              </option>
            ))}
          </select>
        </View>
      );
    }

    return (
      <Pressable
        style={({ pressed }) => [
          styles.tripSelectTrigger,
          isMobile && styles.tripSelectTriggerMobile,
          pressed && styles.tripSelectTriggerPressed,
        ]}
        onPress={() => {
          Keyboard.dismiss();
          setTripSheetVisible(true);
        }}
      >
        <Text
          style={[
            styles.tripSelectTriggerText,
            !tripId && styles.tripSelectPlaceholder,
          ]}
          numberOfLines={2}
        >
          {selectedTripLabel}
        </Text>
        <FontAwesome5 name="chevron-down" size={12} color="#6b7280" />
      </Pressable>
    );
  };

  const renderTripSelectSheet = () => {
    if (!tripSheetVisible || Platform.OS === "web") return null;
    return (
      <View style={styles.tripSheetOverlay} pointerEvents="box-none">
        <Pressable style={styles.tripSheetBackdrop} onPress={() => setTripSheetVisible(false)} />
        <View style={styles.tripSheetCard}>
          <View style={styles.tripSheetHandle} />
          <View style={styles.tripSheetHeader}>
            <Text style={styles.tripSheetTitle}>Seleccionar viaje</Text>
            <Pressable style={styles.tripSheetClose} onPress={() => setTripSheetVisible(false)}>
              <FontAwesome5 name="times" size={14} color="#6b7280" />
            </Pressable>
          </View>
          <ScrollView
            style={styles.tripSheetList}
            contentContainerStyle={styles.tripSheetListContent}
            keyboardShouldPersistTaps="always"
            showsVerticalScrollIndicator={false}
          >
            <Pressable
              style={({ pressed }) => [
                styles.tripSheetItem,
                !tripId && styles.tripSheetItemActive,
                pressed && styles.tripSheetItemPressed,
              ]}
              onPress={() => {
                setTripId("");
                setTripSheetVisible(false);
              }}
            >
              <Text style={[styles.tripSheetItemText, styles.tripSelectPlaceholder]}>
                Selecciona un viaje
              </Text>
            </Pressable>
            {trips.map((t) => {
              const active = String(t.id) === String(tripId);
              return (
                <Pressable
                  key={t.id}
                  style={({ pressed }) => [
                    styles.tripSheetItem,
                    active && styles.tripSheetItemActive,
                    pressed && styles.tripSheetItemPressed,
                  ]}
                  onPress={() => {
                    setTripId(t.id);
                    setTripSheetVisible(false);
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={[styles.tripSheetItemText, active && styles.tripSheetItemTextActive]}
                      numberOfLines={2}
                    >
                      {t.rutaAcubrir || t.destino || "Sin viaje"}
                    </Text>
                    {t.conductorNombre ? (
                      <Text style={styles.tripSheetItemMeta} numberOfLines={1}>
                        Operador: {t.conductorNombre}
                      </Text>
                    ) : null}
                  </View>
                  {active ? <FontAwesome5 name="check" size={12} color="#111111" /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    );
  };

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

  const renderMiniTotal = (label: string, value: number) => (
    <View style={styles.miniTotalRow}>
      <Text style={styles.miniTotalLabel}>{label}</Text>
      <Text style={styles.miniTotalValue}>{formatTotal(value)}</Text>
    </View>
  );

  function renderModalContent() {
    const isHojaOnly = Boolean(editingViatico) && !showForm;

    if (isHojaOnly && editingViatico) {
      return (
        <View
          style={[styles.modalCard, isMobile && styles.modalCardMobile, styles.hojaModalCard]}
          {...(Platform.OS === "web" ? { onClick: (e: any) => e.stopPropagation() } : {})}
        >
          <View style={styles.hojaModalTop}>
            <TouchableOpacity
              style={[styles.modalCloseButton, isMobile && styles.modalCloseButtonMobile]}
              onPress={closeModal}
              disabled={saving}
              activeOpacity={0.85}
            >
              <FontAwesome5 name="times" size={isMobile ? 16 : 14} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <View style={isMobile ? styles.modalBodyWrapMobile : styles.modalBodyWrap}>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={[
                styles.modalScrollContent,
                isMobile && styles.modalScrollContentMobile,
                styles.hojaScrollContent,
              ]}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="always"
              nestedScrollEnabled
              bounces
            >
              {renderViaticDetailSheet(editingViatico)}
            </ScrollView>
          </View>

          <View style={[styles.modalActions, styles.hojaModalActions, isMobile && styles.modalActionsMobile]}>
            <TouchableOpacity
              style={[styles.saveButton, styles.saveButtonMobile]}
              onPress={() => setShowForm(true)}
              activeOpacity={0.85}
            >
              <FontAwesome5 name="edit" size={13} color="#ffffff" />
              <Text style={[styles.saveButtonText, styles.actionButtonTextMobile]}>Editar gasto</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cancelButton, styles.cancelButtonMobile]}
              onPress={closeModal}
              activeOpacity={0.85}
            >
              <Text style={[styles.cancelButtonText, styles.actionButtonTextMobile]}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View
        style={[styles.modalCard, isMobile && styles.modalCardMobile]}
        {...(Platform.OS === "web" ? { onClick: (e: any) => e.stopPropagation() } : {})}
      >
        {isMobile ? <View style={styles.modalDragHandle} /> : null}
        <View style={[styles.modalHeader, isMobile && styles.modalHeaderMobile]}>
          <View style={styles.modalHeaderLeft}>
            <View style={[styles.modalIconBadge, isMobile && styles.modalIconBadgeMobile]}>
              <FontAwesome5 name="receipt" size={isMobile ? 18 : 16} color="#ffffff" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.modalTitle, isMobile && styles.modalTitleMobile]}>
                {editingViatico ? "Editar gasto" : "Añadir gasto"}
              </Text>
              <Text style={styles.modalSubtitle}>
                {editingViatico
                  ? "Actualiza los gastos del viaje"
                  : "Registra los gastos del viaje seleccionado"}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.modalCloseButton, isMobile && styles.modalCloseButtonMobile]}
            onPress={closeModal}
            disabled={saving}
            activeOpacity={0.85}
          >
            <FontAwesome5 name="times" size={isMobile ? 16 : 14} color="#6b7280" />
          </TouchableOpacity>
        </View>

        <View style={isMobile ? styles.modalBodyWrapMobile : styles.modalBodyWrap}>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={[styles.modalScrollContent, isMobile && styles.modalScrollContentMobile]}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="on-drag"
            nestedScrollEnabled
            bounces
          >
          {editingViatico ? (
            <TouchableOpacity
              style={styles.sheetBackToDocBtn}
              onPress={() => setShowForm(false)}
              activeOpacity={0.85}
            >
              <FontAwesome5 name="file-invoice-dollar" size={13} color="#111111" />
              <Text style={styles.sheetBackToDocBtnText}>Ver hoja de viático</Text>
            </TouchableOpacity>
          ) : null}

          <View style={[styles.formSection, isMobile && styles.formSectionMobile]}>
            <Text style={styles.formSectionTitle}>Viaje</Text>
            {renderModalField("Seleccionar viaje", renderTripSelectField())}
          </View>

          <View style={[styles.formSection, isMobile && styles.formSectionMobile]}>
            <Text style={styles.formSectionTitle}>Conceptos de gasto</Text>
          <View style={[styles.conceptGrid, isMobile && styles.conceptGridMobile]}>
            {/* Comidas */}
            <View style={[styles.conceptCard, isMobile && styles.conceptCardMobile]}>
              <Text style={styles.conceptTitle}>Comidas</Text>
              <View style={[styles.conceptInputRow, isMobile && styles.conceptInputRowMobile]}>
                <View style={styles.conceptInputHalf}>
                  <Text style={styles.conceptInputLabel}>Días</Text>
                  <TextInput
                    value={conceptos["Comidas Cantidad"]}
                    onChangeText={(t) => setConceptos({ ...conceptos, "Comidas Cantidad": t })}
                    keyboardType="numeric"
                    placeholder="0"
                    {...modalInputProps}
                  />
                </View>
                <View style={styles.conceptInputHalf}>
                  <Text style={styles.conceptInputLabel}>Costo ($400/día)</Text>
                  <TextInput value={comidasCostoCalculado} editable={false} placeholder="0" {...modalInputProps} />
                </View>
              </View>
            </View>

            {/* DEF solo cantidad */}
            <View style={[styles.conceptCard, styles.conceptCardDef, isMobile && styles.conceptCardMobile]}>
              <Text style={styles.conceptTitle}>DEF</Text>
              <Text style={styles.conceptHint}>Solo registra la cantidad</Text>
              <Text style={styles.conceptInputLabel}>Cantidad</Text>
              <TextInput
                value={conceptos["DEF Cantidad"]}
                onChangeText={(t) => setConceptos({ ...conceptos, "DEF Cantidad": t })}
                keyboardType="numeric"
                placeholder="0"
                selectTextOnFocus
                {...modalInputProps}
                style={[styles.modalInput, isMobile && styles.modalInputMobile, styles.defQuantityInput]}
              />
            </View>
          </View>
          </View>

          {/* Casetas + TAG (suma) */}
          <View style={[styles.modalSection, isMobile && styles.formSectionMobile]}>
            <View style={styles.modalSectionHeader}>
              <View style={styles.modalSectionHeaderLeft}>
                <FontAwesome5 name="road" size={14} color="#111111" />
                <Text style={styles.modalSectionTitle}>Casetas y TAG</Text>
              </View>
            </View>
            <Text style={styles.conceptHint}>Los montos de caseta efectivo y TAG se suman automáticamente</Text>
            <View style={[styles.conceptInputRow, isMobile && styles.conceptInputRowMobile]}>
              <View style={[styles.conceptInputHalf, isMobile && styles.conceptInputHalfMobile]}>
                <Text style={styles.conceptInputLabel}>Caseta efectivo</Text>
                <TextInput
                  value={conceptos["Casetas efectivo Costo"]}
                  onChangeText={(t) => setConceptos({ ...conceptos, "Casetas efectivo Costo": t })}
                  keyboardType="numeric"
                  placeholder="0"
                  {...modalInputProps}
                />
              </View>
              <View style={[styles.conceptInputHalf, isMobile && styles.conceptInputHalfMobile]}>
                <Text style={styles.conceptInputLabel}>TAG</Text>
                <TextInput value={tag} onChangeText={setTag} keyboardType="numeric" placeholder="0" {...modalInputProps} />
              </View>
            </View>
            {renderMiniTotal("Suma casetas + TAG", totalCasetasYTag)}
          </View>

          {/* Diesel - suma costos */}
          <View style={[styles.modalSection, isMobile && styles.formSectionMobile]}>
            <View style={styles.modalSectionHeader}>
              <View style={styles.modalSectionHeaderLeft}>
                <FontAwesome5 name="gas-pump" size={14} color="#111111" />
                <Text style={styles.modalSectionTitle}>Diesel</Text>
              </View>
              <TouchableOpacity style={styles.addDieselBtn} onPress={agregarCargaDiesel} activeOpacity={0.85}>
                <FontAwesome5 name="plus" size={12} color="#ffffff" />
              </TouchableOpacity>
            </View>
            <Text style={styles.conceptHint}>Agrega cada carga; el total suma automáticamente los costos</Text>

            <View style={[styles.conceptInputRow, isMobile && styles.conceptInputRowMobile]}>
              <View style={[styles.conceptInputHalf, isMobile && styles.conceptInputHalfMobile]}>
                <Text style={styles.conceptInputLabel}>Cargas</Text>
                <TextInput value={dieselCargas} onChangeText={setDieselCargas} keyboardType="numeric" placeholder="0" {...modalInputProps} />
              </View>
              <View style={[styles.conceptInputHalf, isMobile && styles.conceptInputHalfMobile]}>
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
            {renderMiniTotal("Total diesel", totalDiesel)}
          </View>

          {/* Otros gastos */}
          <View style={[styles.modalSection, isMobile && styles.formSectionMobile]}>
            <View style={styles.modalSectionHeader}>
              <View style={styles.modalSectionHeaderLeft}>
                <FontAwesome5 name="plus-circle" size={14} color="#111111" />
                <Text style={styles.modalSectionTitle}>Otros gastos</Text>
              </View>
              <TouchableOpacity
                style={styles.addDieselBtn}
                onPress={() => {
                  if (!extraDesc.trim() || !extraCosto) return;
                  setCostosExtrasList([...costosExtrasList, { description: extraDesc.trim(), costo: extraCosto }]);
                  setExtraDesc("");
                  setExtraCosto("");
                }}
                activeOpacity={0.85}
              >
                <FontAwesome5 name="plus" size={12} color="#ffffff" />
              </TouchableOpacity>
            </View>
            <Text style={styles.conceptHint}>Gastos adicionales aparte de los conceptos anteriores</Text>

            <View style={[styles.conceptInputRow, isMobile && styles.conceptInputRowMobile]}>
              <View style={[{ flex: 2, marginRight: isMobile ? 0 : 8 }, isMobile && styles.conceptInputHalfMobile]}>
                <Text style={styles.conceptInputLabel}>Descripción</Text>
                <TextInput placeholder="Ej. Estacionamiento" value={extraDesc} onChangeText={setExtraDesc} {...modalInputProps} />
              </View>
              <View style={[{ flex: 1 }, isMobile && styles.conceptInputHalfMobile]}>
                <Text style={styles.conceptInputLabel}>Costo</Text>
                <TextInput placeholder="0" value={extraCosto} onChangeText={setExtraCosto} keyboardType="numeric" {...modalInputProps} />
              </View>
            </View>

            {costosExtrasList.length > 0 && (
              <View style={styles.dieselList}>
                {costosExtrasList.map((item, index) => (
                  <View key={index} style={styles.dieselItem}>
                    <Text style={styles.dieselItemText}>{item.description} · {formatTotal(Number(item.costo))}</Text>
                    <TouchableOpacity
                      style={[styles.iconAction, styles.iconActionDanger]}
                      onPress={() => setCostosExtrasList(costosExtrasList.filter((_, i) => i !== index))}
                      activeOpacity={0.85}
                    >
                      <FontAwesome5 name="trash-alt" size={11} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            {renderMiniTotal("Total otros gastos", totalOtros)}
          </View>

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
          </ScrollView>
        </View>

        <View style={[styles.modalActions, isMobile && styles.modalActionsMobile]}>
          {isMobile ? (
            <>
              <TouchableOpacity
                style={[styles.saveButton, styles.saveButtonMobile, saving && styles.saveButtonDisabled]}
                onPress={() => {
                  void saveViatico();
                }}
                disabled={saving}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Guardar gasto"
                {...(Platform.OS === "web"
                  ? {
                      onClick: (e: any) => {
                        e?.stopPropagation?.();
                      },
                    }
                  : {})}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={[styles.saveButtonText, styles.actionButtonTextMobile]}>Guardar</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cancelButton, styles.cancelButtonMobile]}
                onPress={closeModal}
                disabled={saving}
                activeOpacity={0.85}
              >
                <Text style={[styles.cancelButtonText, styles.actionButtonTextMobile]}>Cancelar</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeModal}
                disabled={saving}
                activeOpacity={0.85}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={() => {
                  void saveViatico();
                }}
                disabled={saving}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Guardar gasto"
                {...(Platform.OS === "web"
                  ? {
                      onClick: (e: any) => {
                        e?.stopPropagation?.();
                      },
                    }
                  : {})}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.saveButtonText}>Guardar</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
        {renderTripSelectSheet()}
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f4f6f9", padding: 24 }}>
        <FontAwesome5 name="lock" size={28} color="#9ca3af" />
        <Text style={{ marginTop: 12, fontSize: 16, fontWeight: "700", color: "#111111", textAlign: "center" }}>
          Acceso restringido
        </Text>
        <Text style={{ marginTop: 6, fontSize: 13, color: "#6b7280", textAlign: "center" }}>
          Los operadores no pueden ver ni gestionar viáticos.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, isNarrowList && styles.containerNarrow]}>
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={[
          styles.pageScrollContent,
          isNarrowList && styles.pageScrollContentNarrow,
        ]}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        <View style={styles.pageHeader}>
          <View style={styles.pageHeaderText}>
            <Text style={[styles.pageTitle, isMobile && styles.pageTitleMobile]}>
              Gastos
            </Text>
            <Text style={styles.subtitle}>Gastos de viaje, diesel y comprobantes</Text>
          </View>
        </View>

        {isAdmin ? (
          <View style={styles.toolbarPanel}>
            <View style={[styles.toolbarActions, isNarrowList && styles.toolbarActionsMobile]}>
              <TouchableOpacity
                style={[styles.addButton, isNarrowList && styles.addButtonMobile]}
                onPress={() => openModal()}
                activeOpacity={0.85}
              >
                <FontAwesome5 name="plus" size={14} color="#ffffff" />
                <Text style={styles.addButtonText}>Añadir gasto</Text>
              </TouchableOpacity>
            </View>

            {!isNarrowList ? (
              <View style={styles.toolbarFiltersRow}>
                <View style={styles.filterBlock}>
                  <Text style={styles.toolbarLabel}>Periodo exportar</Text>
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

                <View style={styles.toolbarRightActions}>
                  <View style={styles.weekFilterInline}>
                    <Text style={styles.toolbarLabel}>Semana</Text>
                    <Pressable
                      style={({ pressed }) => [
                        styles.weekSelectTrigger,
                        styles.weekSelectTriggerCompact,
                        pressed && styles.weekSelectTriggerPressed,
                      ]}
                      onPress={openWeekSheet}
                    >
                      <View style={styles.weekSelectIconWrap}>
                        <FontAwesome5 name="calendar-week" size={14} color="#111111" />
                      </View>
                      <View style={styles.weekSelectTriggerTextWrap}>
                        <Text style={styles.weekSelectValue} numberOfLines={1}>
                          {weekSelectLabel}
                        </Text>
                      </View>
                      <FontAwesome5 name="chevron-down" size={11} color="#6b7280" />
                    </Pressable>
                  </View>

                  <TouchableOpacity style={styles.exportButton} onPress={exportViaticosToExcel} activeOpacity={0.85}>
                    <FontAwesome5 name="file-excel" size={13} color="#111111" />
                    <Text style={styles.exportButtonText}>Exportar Excel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.toolbarRightActionsMobile}>
                <View style={styles.filterBlock}>
                  <Text style={styles.toolbarLabel}>Periodo exportar</Text>
                  <View style={[styles.segmentedControl, styles.segmentedControlMobile]}>
                    {filterOptions.map((opt) => {
                      const isActive = filter === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={[styles.filterPill, styles.filterPillMobile, isActive && styles.filterPillActive]}
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
                <TouchableOpacity
                  style={[styles.exportButton, styles.exportButtonMobile]}
                  onPress={exportViaticosToExcel}
                  activeOpacity={0.85}
                >
                  <FontAwesome5 name="file-excel" size={13} color="#111111" />
                  <Text style={styles.exportButtonText}>Exportar Excel</Text>
                </TouchableOpacity>
                <Pressable
                  style={({ pressed }) => [
                    styles.weekSelectTrigger,
                    styles.weekSelectTriggerMobile,
                    pressed && styles.weekSelectTriggerPressed,
                  ]}
                  onPress={openWeekSheet}
                >
                  <View style={styles.weekSelectIconWrap}>
                    <FontAwesome5 name="calendar-week" size={14} color="#111111" />
                  </View>
                  <View style={styles.weekSelectTriggerTextWrap}>
                    <Text style={styles.weekSelectHint}>Semana</Text>
                    <Text style={styles.weekSelectValue} numberOfLines={1}>
                      {weekSelectLabel}
                    </Text>
                  </View>
                  <FontAwesome5 name="chevron-down" size={11} color="#6b7280" />
                </Pressable>
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.toolbarPanel, styles.listFilterPanel]}>
            <Text style={styles.toolbarLabel}>Semana</Text>
            <Pressable
              style={({ pressed }) => [
                styles.weekSelectTrigger,
                pressed && styles.weekSelectTriggerPressed,
              ]}
              onPress={openWeekSheet}
            >
              <View style={styles.weekSelectIconWrap}>
                <FontAwesome5 name="calendar-week" size={15} color="#111111" />
              </View>
              <View style={styles.weekSelectTriggerTextWrap}>
                <Text style={styles.weekSelectHint}>Lunes a domingo</Text>
                <Text style={styles.weekSelectValue} numberOfLines={1}>
                  {weekSelectLabel}
                </Text>
              </View>
              <View style={styles.weekSelectChevron}>
                <FontAwesome5 name="chevron-down" size={11} color="#6b7280" />
              </View>
            </Pressable>
          </View>
        )}

        <View style={[styles.listPanel, isNarrowList && styles.listPanelNarrow]}>
          {!listLoading && !loadError ? (
            <View style={[styles.listHeader, isNarrowList && styles.listHeaderMobile]}>
              <Text style={styles.listHeaderTitle}>
                {displayedViaticos.length} gasto{displayedViaticos.length === 1 ? "" : "s"}
              </Text>
              <Text style={[styles.listHeaderHint, isNarrowList && styles.listHeaderHintMobile]}>
                {weekLabel}
              </Text>
            </View>
          ) : null}

          {listLoading ? (
            <View style={styles.emptyState}>
              <FontAwesome5 name="spinner" size={20} color="#9ca3af" />
              <Text style={styles.emptyText}>Cargando gastos...</Text>
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
              <Text style={styles.emptyTitle}>No hay gastos registrados</Text>
              <Text style={styles.emptyText}>Pulsa "Añadir gasto" para crear el primero.</Text>
            </View>
          ) : displayedViaticos.length === 0 ? (
            <View style={styles.emptyState}>
              <FontAwesome5 name="calendar-week" size={22} color="#9ca3af" />
              <Text style={styles.emptyTitle}>Sin gastos esta semana</Text>
              <Text style={styles.emptyText}>
                Elige otra semana en el selector para ver más resultados.
              </Text>
            </View>
          ) : (
            <View style={[styles.viaticsStack, !isNarrowList && styles.viaticsGrid]}>
              {displayedViaticos.map((item) => (
                <View
                  key={item.id}
                  style={[styles.viaticStackItem, !isNarrowList && styles.viaticGridItem]}
                >
                  {renderItem({ item })}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {weekSheetVisible ? (
        <Portal>
          <View
            style={[
              styles.weekSheetOverlay,
              !(isNarrowList || Platform.OS !== "web") && styles.weekSheetOverlayDesktop,
            ]}
            pointerEvents="box-none"
          >
            <Pressable style={styles.weekSheetBackdrop} onPress={closeWeekSheet} />
            <View
              style={[
                styles.weekSheetCard,
                isNarrowList || Platform.OS !== "web"
                  ? styles.weekSheetCardMobile
                  : styles.weekSheetCardDesktop,
              ]}
              {...(Platform.OS === "web" ? { onClick: (e: any) => e.stopPropagation() } : {})}
            >
              {(isNarrowList || Platform.OS !== "web") ? <View style={styles.weekSheetHandle} /> : null}
              <View
                style={[
                  styles.weekSheetHeader,
                  !(isNarrowList || Platform.OS !== "web") && styles.weekSheetHeaderDesktop,
                ]}
              >
                <View style={styles.weekSheetHeaderText}>
                  <View style={styles.weekSheetIconBadge}>
                    <FontAwesome5 name="calendar-week" size={14} color="#ffffff" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.weekSheetTitle}>Seleccionar semana</Text>
                    <Text style={styles.weekSheetSubtitle}>Periodo de lunes a domingo</Text>
                  </View>
                </View>
                <Pressable
                  style={({ pressed }) => [styles.weekSheetClose, pressed && styles.weekSheetClosePressed]}
                  onPress={closeWeekSheet}
                >
                  <FontAwesome5 name="times" size={13} color="#6b7280" />
                </Pressable>
              </View>
              <ScrollView
                style={[
                  styles.weekSheetList,
                  !(isNarrowList || Platform.OS !== "web") && styles.weekSheetListDesktop,
                ]}
                contentContainerStyle={styles.weekSheetListContent}
                keyboardShouldPersistTaps="always"
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {weekOptions.map((opt) => {
                  const active = opt.value === selectedWeekValue;
                  const isCurrent = opt.start.getTime() === getWeekStartMonday().getTime();
                  const range = formatWeekRangeLabel(opt.start);
                  return (
                    <Pressable
                      key={opt.value}
                      style={({ pressed, hovered }: any) => [
                        styles.weekOptionRow,
                        (hovered || pressed) && styles.weekOptionRowHover,
                        active && styles.weekOptionRowActive,
                      ]}
                      onPress={() => {
                        setSelectedWeekStart(opt.start);
                        closeWeekSheet();
                      }}
                    >
                      <View style={[styles.weekOptionDot, active && styles.weekOptionDotActive]} />
                      <View style={styles.weekOptionTextWrap}>
                        <Text style={[styles.weekOptionTitle, active && styles.weekOptionTitleActive]}>
                          {range}
                        </Text>
                        <View style={styles.weekOptionMetaRow}>
                          <Text style={styles.weekOptionSub}>Lun – Dom</Text>
                          {isCurrent ? (
                            <View style={styles.weekOptionBadge}>
                              <Text style={styles.weekOptionBadgeText}>Actual</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      {active ? (
                        <View style={styles.weekOptionCheck}>
                          <FontAwesome5 name="check" size={11} color="#ffffff" />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Portal>
      ) : null}

      {Platform.OS === "web" && modalVisible ? (
        <Portal>
          <View
            style={[styles.webModalOverlay, isMobile && styles.webModalOverlayMobile]}
            {...(Platform.OS === "web" ? { onClick: closeModal } : {})}
          >
            {renderModalContent()}
          </View>
        </Portal>
      ) : (
        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent={!isMobile}
          presentationStyle={isMobile ? "fullScreen" : "pageSheet"}
          onRequestClose={closeModal}
        >
          <View style={[styles.modalContainer, isMobile && styles.modalContainerMobile]}>
            {renderModalContent()}
          </View>
        </Modal>
      )}

      {renderDeleteConfirmModal()}
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, paddingVertical: 4, backgroundColor: "transparent" },
  confirmOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  confirmOverlayWeb: {
    ...StyleSheet.absoluteFillObject,
    position: "fixed" as any,
    zIndex: 10050,
  },
  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
  },
  confirmCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 22,
    alignItems: "center",
    gap: 12,
    zIndex: 1,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 20px 48px rgba(0,0,0,0.18)" as any }
      : {
          shadowColor: "#000",
          shadowOpacity: 0.18,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 10 },
          elevation: 14,
        }),
  },
  confirmCardMobile: {
    maxWidth: "100%",
    padding: 18,
  },
  confirmIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111111",
    textAlign: "center",
  },
  confirmMessage: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
  },
  confirmActions: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    marginTop: 8,
  },
  confirmCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmCancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
  },
  confirmDeleteBtn: {
    flex: 1,
    height: 46,
    borderRadius: 999,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmDeleteText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#ffffff",
  },
  containerNarrow: { marginHorizontal: -6 },
  pageScroll: { flex: 1, minHeight: 0 },
  pageScrollContent: { paddingBottom: 28, flexGrow: 1 },
  pageScrollContentNarrow: { paddingBottom: 40 },
  pageHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  pageHeaderText: { flex: 1, paddingRight: 12 },
  pageTitle: { fontSize: 24, fontWeight: "800", color: "#111111", letterSpacing: 0.2 },
  pageTitleMobile: { fontSize: 22 },
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
    ...(Platform.OS === "web"
      ? { cursor: "pointer" as const, alignSelf: "flex-start" as const }
      : {}),
  },
  addButtonMobile: { width: "100%", alignSelf: "stretch" as const, paddingVertical: 14 },
  addButtonText: { color: "#ffffff", fontWeight: "700", fontSize: 14 },
  toolbarPanel: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    marginBottom: 14,
    gap: 12,
    ...(Platform.OS === "web" ? { boxShadow: "0 8px 24px rgba(0,0,0,0.04)" as any } : {}),
  },
  toolbarActions: { flexDirection: "row", alignItems: "center" },
  toolbarActionsMobile: { width: "100%" },
  toolbarFiltersRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    flexWrap: "wrap",
  },
  toolbarRightActions: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    flexShrink: 1,
    minWidth: 0,
  },
  toolbarRightActionsMobile: {
    gap: 10,
    width: "100%",
  },
  weekFilterInline: {
    minWidth: 220,
    maxWidth: 320,
    flex: 1,
  },
  weekSelectTriggerCompact: {
    minHeight: 42,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  weekSelectTriggerMobile: {
    width: "100%",
  },
  toolbarFiltersRowMobile: { flexDirection: "column", alignItems: "stretch" },
  filterBlock: { flex: 1, minWidth: 0 },
  toolbarLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  listFilterPanel: { marginBottom: 14 },
  weekSelectTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fafafa",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 56,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  weekSelectTriggerPressed: { backgroundColor: "#f3f4f6", borderColor: "#d1d5db" },
  weekSelectIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  weekSelectTriggerTextWrap: { flex: 1, minWidth: 0 },
  weekSelectHint: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  weekSelectValue: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: "800",
    color: "#111111",
  },
  weekSelectChevron: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  weekSheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1200,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  weekSheetOverlayDesktop: {
    justifyContent: "center",
    padding: 24,
  },
  weekSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  weekSheetCard: {
    width: "100%",
    backgroundColor: "#ffffff",
    overflow: "hidden",
    zIndex: 2,
  },
  weekSheetCardMobile: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "78%",
    paddingBottom: 10,
  },
  weekSheetCardDesktop: {
    width: 420,
    maxWidth: "100%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    maxHeight: 520,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 20px 48px rgba(0,0,0,0.16)" as any }
      : {}),
  },
  weekSheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#e5e7eb",
    marginTop: 10,
    marginBottom: 4,
  },
  weekSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  weekSheetHeaderDesktop: { paddingTop: 16 },
  weekSheetHeaderText: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 },
  weekSheetIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },
  weekSheetTitle: { fontSize: 16, fontWeight: "800", color: "#111111" },
  weekSheetSubtitle: { fontSize: 12, color: "#9ca3af", marginTop: 2, fontWeight: "600" },
  weekSheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  weekSheetClosePressed: { backgroundColor: "#e5e7eb" },
  weekSheetList: { maxHeight: 420 },
  weekSheetListDesktop: { maxHeight: 400 },
  weekSheetListContent: { padding: 10, paddingBottom: 18, gap: 6 },
  weekOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  weekOptionRowHover: { backgroundColor: "#f9fafb" },
  weekOptionRowActive: {
    backgroundColor: "#f8fafc",
    borderColor: "#e5e7eb",
  },
  weekOptionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#d1d5db",
  },
  weekOptionDotActive: { backgroundColor: "#111111" },
  weekOptionTextWrap: { flex: 1, minWidth: 0, gap: 4 },
  weekOptionTitle: { fontSize: 14, fontWeight: "700", color: "#111111" },
  weekOptionTitleActive: { fontWeight: "800" },
  weekOptionMetaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  weekOptionSub: { fontSize: 11, fontWeight: "600", color: "#9ca3af" },
  weekOptionBadge: {
    backgroundColor: "#111111",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  weekOptionBadgeText: { fontSize: 10, fontWeight: "700", color: "#ffffff" },
  weekOptionCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },
  segmentedControl: {
    flexDirection: "row",
    alignSelf: "flex-start",
    backgroundColor: "#f3f4f6",
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  segmentedControlMobile: { alignSelf: "stretch", justifyContent: "space-between" },
  filterPillMobile: { flex: 1, alignItems: "center", paddingHorizontal: 10, paddingVertical: 10 },
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
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#111111",
    backgroundColor: "#ffffff",
    flexShrink: 0,
    minHeight: 44,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  exportButtonMobile: { width: "100%" },
  exportButtonText: { color: "#111111", fontWeight: "700", fontSize: 14 },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  listHeaderMobile: { flexDirection: "column", alignItems: "flex-start", gap: 4 },
  listHeaderTitle: { fontSize: 14, fontWeight: "700", color: "#111111" },
  listHeaderHint: { fontSize: 12, color: "#9ca3af", fontWeight: "600" },
  listHeaderHintMobile: { textAlign: "right", maxWidth: "55%" },
  listPanel: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    width: "100%",
    alignSelf: "stretch",
    ...(Platform.OS === "web" ? { boxShadow: "0 8px 24px rgba(0,0,0,0.04)" as any } : {}),
  },
  listPanelNarrow: { paddingHorizontal: 10, paddingVertical: 12, borderRadius: 12 },
  listContent: { paddingBottom: 8, gap: 12 },
  listRow: { gap: 12 },
  viaticsStack: { width: "100%", gap: 12, paddingBottom: 8 },
  viaticsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  viaticStackItem: { width: "100%", alignSelf: "stretch" },
  viaticGridItem: {
    width: "48.5%" as any,
    maxWidth: "48.5%" as any,
    flexGrow: 1,
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#fafafa",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    gap: 12,
    width: "100%",
  },
  cardMobile: { width: "100%" },
  cardDesktop: { minWidth: 0 },
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
  specGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
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
  } as any,
  webModalOverlayMobile: {
    padding: 0,
    justifyContent: "flex-start",
    alignItems: "stretch",
    overflow: "hidden",
    height: "100dvh" as any,
    maxHeight: "100dvh" as any,
    display: "flex" as any,
    flexDirection: "column" as any,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 16,
  },
  modalContainerMobile: {
    justifyContent: "flex-start",
    padding: 0,
    backgroundColor: "#ffffff",
  },
  modalCard: {
    width: Platform.OS === "web" ? 720 : "96%",
    maxWidth: 720,
    maxHeight: Platform.OS === "web" ? ("90vh" as any) : "92%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "column",
    minWidth: 0,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 20px 50px rgba(0,0,0,0.18)" as any, display: "flex" as any, boxSizing: "border-box" as any }
      : {}),
  },
  modalCardMobile: {
    width: "100%",
    maxWidth: "100%",
    maxHeight: Platform.OS === "web" ? ("100%" as any) : "100%",
    height: Platform.OS === "web" ? ("100%" as any) : "100%",
    borderRadius: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: 0,
    flex: 1,
    alignSelf: "stretch",
    overflow: "hidden",
    minHeight: 0,
  },
  modalHeader: {flexDirection: "row",alignItems: "flex-start",justifyContent: "space-between",paddingHorizontal: 22,paddingTop: 22,paddingBottom: 16,borderBottomWidth: 1,borderBottomColor: "#f3f4f6",flexShrink: 0,},
  modalHeaderMobile: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  modalHeaderLeft: {flexDirection: "row", alignItems: "center", gap: 12, flex: 1, paddingRight: 12,},
  modalIconBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#111111", alignItems: "center", justifyContent: "center",},
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#111111" },
  modalSubtitle: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  modalCloseButton: {width: 32,height: 32,borderRadius: 16,backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center", ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  modalBodyWrap: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  modalBodyWrapMobile: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? {
          flexBasis: 0 as any,
          height: 0 as any,
          flexGrow: 1,
          flexShrink: 1,
        }
      : {}),
  },
  modalScroll: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    ...(Platform.OS === "web"
      ? ({ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overflowY: "auto" } as any)
      : {}),
  },
  modalScrollContent: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 24, flexGrow: 0 },
  modalScrollContentMobile: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 48, flexGrow: 0 },
  modalFieldGroup: { marginBottom: 14, width: "100%", maxWidth: "100%" },
  modalFieldGroupMobile: { marginBottom: 12 },
  modalFieldLabel: { fontSize: 12, fontWeight: "700", color: "#374151", marginBottom: 6, letterSpacing: 0.2, },
  modalFieldLabelMobile: { fontSize: 13 },
  tripSelectWrap: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  tripSelectWrapMobile: {
    maxWidth: "100%",
  },
  tripSelectTrigger: {
    width: "100%",
    maxWidth: "100%",
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fafafa",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tripSelectTriggerMobile: {
    minHeight: 52,
    borderRadius: 14,
  },
  tripSelectTriggerPressed: {
    backgroundColor: "#f3f4f6",
  },
  tripSelectTriggerText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "700",
    color: "#111111",
  },
  tripSelectPlaceholder: {
    color: "#9ca3af",
    fontWeight: "600",
  },
  tripSheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 40,
  },
  tripSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  tripSheetCard: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "72%",
    paddingBottom: 18,
    borderTopWidth: 1,
    borderColor: "#e5e7eb",
  },
  tripSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  tripSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  tripSheetTitle: { fontSize: 16, fontWeight: "800", color: "#111111" },
  tripSheetClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  tripSheetList: { maxHeight: 360 },
  tripSheetListContent: { padding: 12, gap: 8, paddingBottom: 24 },
  tripSheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fafafa",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tripSheetItemActive: {
    borderColor: "#111111",
    backgroundColor: "#ffffff",
  },
  tripSheetItemPressed: {
    backgroundColor: "#f3f4f6",
  },
  tripSheetItemText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111111",
  },
  tripSheetItemTextActive: {
    color: "#111111",
  },
  tripSheetItemMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },
  modalSectionTitle: {fontSize: 13,fontWeight: "800",color: "#111111",marginBottom: 12,marginTop: 4,letterSpacing: 0.2,},
  modalSection: { marginBottom: 16, padding: 14, backgroundColor: "#fafafa", borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb", },
  modalSectionHeader: { flexDirection: "row",
  alignItems: "center", justifyContent: "space-between",marginBottom: 12,},
  modalSectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  addDieselBtn: {width: 28,height: 28,borderRadius: 14,backgroundColor: "#111111",alignItems: "center",justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  conceptGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: 12,
    marginBottom: 8,
    width: "100%",
    maxWidth: "100%",
  },
  conceptGridMobile: {
    flexDirection: "column",
    flexWrap: "nowrap",
  },
  conceptColumn: { flex: 1, gap: 10 },
  conceptCard: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    maxWidth: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    marginBottom: 0,
    overflow: "hidden",
  },
  conceptCardDef: {
    minWidth: 0,
  },
  conceptCardMobile: {
    flexGrow: 0,
    flexBasis: "auto",
    width: "100%",
    alignSelf: "stretch",
    padding: 14,
    borderRadius: 14,
  },
  conceptTitle: { fontSize: 13, fontWeight: "700", color: "#111111", marginBottom: 10 },
  conceptHint: { fontSize: 12, color: "#6b7280", marginBottom: 10, lineHeight: 16 },
  conceptInputRow: { flexDirection: "row", gap: 8, width: "100%", maxWidth: "100%" },
  conceptInputRowMobile: { flexDirection: "column", gap: 10 },
  conceptInputHalf: { flex: 1, minWidth: 0, maxWidth: "100%" },
  conceptInputLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  defQuantityInput: {
    width: "100%",
    maxWidth: "100%",
  },
  modalInput: {
    width: "100%",
    maxWidth: "100%",
    height: 42,
    backgroundColor: "#fafafa",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  modalInputMobile: {
    height: 52,
    borderRadius: 12,
  },
  modalInputContent: { color: "#111111", fontWeight: "600", fontSize: 14 },
  modalInputContentMobile: { fontSize: 16, minHeight: 48 },
  miniTotalRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  miniTotalLabel: { fontSize: 12, fontWeight: "700", color: "#6b7280" },
  miniTotalValue: { fontSize: 14, fontWeight: "800", color: "#111111" },
  dieselList: { marginTop: 12, gap: 8 },
  dieselItem: {flexDirection: "row",alignItems: "center",justifyContent: "space-between",backgroundColor: "#ffffff",borderRadius: 10,borderWidth: 1,borderColor: "#e5e7eb",paddingHorizontal: 12,paddingVertical: 10,},
  dieselItemText: { flex: 1, fontSize: 13, fontWeight: "600", color: "#374151" },
  dieselItemActions: { flexDirection: "row", gap: 6 },
  totalSummary: { flexDirection: "row",alignItems: "center",justifyContent: "space-between",backgroundColor: "#111111",borderRadius: 12, paddingHorizontal: 18, paddingVertical: 14, marginBottom: 16,},
  totalSummaryLabel:{fontSize: 14, fontWeight: "600", color: "#d1d5db" },
  totalSummaryValue: {fontSize: 20, fontWeight: "800", color: "#ffffff" },
  uploadBlock: {alignItems: "center",gap: 10,padding: 16,backgroundColor: "#fafafa",borderRadius: 12,borderWidth: 1,borderColor: "#e5e7eb",borderStyle: "dashed",marginTop: 8,},
  uploadHint: { fontSize: 13, color: "#6b7280", textAlign: "center" },
  facturaPreview: {width: "100%",height: 180,resizeMode: "contain",borderRadius: 10,backgroundColor: "#f3f4f6",marginBottom: 8, },
  modalBtnRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 8 },
  modalBtn: {paddingVertical: 10,paddingHorizontal: 16,borderRadius: 999,borderWidth: 1.5,borderColor: "#111111",backgroundColor: "#ffffff",alignSelf: "flex-start",...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),},
  modalBtnPrimary: { backgroundColor: "#111111", borderColor: "#111111" },
  modalBtnDanger: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
  modalBtnText: { color: "#111111", fontWeight: "700", fontSize: 13 },
  modalBtnTextPrimary: { color: "#ffffff" },
  modalBtnTextDanger: { color: "#dc2626" },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "stretch",
    gap: 12,
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 22,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    flexShrink: 0,
    width: "100%",
  },
  modalActionsMobile: {
    flexDirection: "column",
    alignItems: "stretch",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: Platform.OS === "web" ? 24 : 18,
    gap: 10,
    backgroundColor: "#ffffff",
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#111111",
    minHeight: 48,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  cancelButtonMobile: {
    flex: 0,
    width: "100%",
    alignSelf: "stretch",
    borderRadius: 12,
    minHeight: 52,
    height: 52,
  },
  cancelButtonText: { color: "#111111", fontWeight: "800", fontSize: 14 },
  saveButton: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#111111",
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  saveButtonMobile: {
    flex: 0,
    width: "100%",
    alignSelf: "stretch",
    borderRadius: 12,
    minHeight: 52,
    height: 52,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: "#ffffff", fontWeight: "800", fontSize: 14 },
  actionButtonTextMobile: { fontSize: 15, fontWeight: "800" },
  cardSlot: { width: "100%", alignSelf: "stretch" },
  cardFullWidth: {
    width: "100%",
    maxWidth: "100%" as any,
    alignSelf: "stretch",
    flexGrow: 0,
  },
  cardMobileCompact: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
    flexGrow: 0,
    flexDirection: "column",
    padding: 14,
    backgroundColor: "#ffffff",
  },
  cardTitleMobile: { fontSize: 16, lineHeight: 22 },
  mobileMetaBlock: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  mobileMetaValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111111",
    marginTop: 2,
  },
  acompRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  mobileChipsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  mobileChip: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mobileChipLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  mobileChipValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111111",
    marginTop: 2,
  },
  mobileCardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  mobileDetailsBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#111111",
    borderRadius: 12,
    paddingVertical: 12,
    minHeight: 46,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  mobileDetailsBtnText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 14,
  },
  mobileDeleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 46,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  mobileDeleteBtnText: {
    color: "#dc2626",
    fontWeight: "700",
    fontSize: 13,
  },
  webDetailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#111111",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  webDetailsBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
  },
  formSection: {
    marginBottom: 16,
  },
  formSectionMobile: {
    backgroundColor: "#fafafa",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    marginBottom: 14,
  },
  formSectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111111",
    marginBottom: 10,
  },
  conceptInputHalfMobile: {
    flex: 0,
    width: "100%",
    maxWidth: "100%",
    marginRight: 0,
  },
  modalDragHandle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#d1d5db",
    marginTop: 10,
    marginBottom: 4,
  },
  modalIconBadgeMobile: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  modalTitleMobile: {
    fontSize: 17,
  },
  modalCloseButtonMobile: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  sheetPaper: {
    backgroundColor: "#fafafa",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
    marginBottom: 4,
  },
  sheetPaperTouch: {
    borderRadius: 18,
  },
  sheetTopBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#111111",
  },
  sheetBrandMark: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetDocLabel: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  sheetDocMeta: {
    color: "#a3a3a3",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  sheetTotalPill: {
    backgroundColor: "#2a2a2a",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sheetTotalPillText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 12,
  },
  sheetHero: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  sheetHeroEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 6,
  },
  sheetHeroTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111111",
    lineHeight: 26,
  },
  sheetHeroDivider: {
    height: 1,
    backgroundColor: "#ececec",
    marginVertical: 14,
  },
  sheetHeroDestino: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1f2937",
    lineHeight: 22,
  },
  sheetSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: "#fafafa",
  },
  sheetSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#374151",
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  sheetMetaGrid: {
    gap: 10,
    paddingBottom: 12,
  },
  sheetMetaItem: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sheetMetaItemFull: {
    width: "100%",
  },
  sheetMetaLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  sheetMetaValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111111",
  },
  sheetList: {
    gap: 8,
    paddingBottom: 12,
  },
  sheetListRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sheetListTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  sheetListValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111111",
  },
  sheetBackToDocBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#111111",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  sheetBackToDocBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111111",
  },
  hojaModalCard: {
    backgroundColor: "#f4f6f9",
  },
  hojaModalTop: {
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    flexShrink: 0,
    backgroundColor: "#f4f6f9",
  },
  hojaScrollContent: {
    paddingTop: 4,
  },
  hojaModalActions: {
    flexDirection: "column",
    gap: 10,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 18,
  },
});