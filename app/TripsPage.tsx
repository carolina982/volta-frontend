import { FontAwesome5 } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Portal, TextInput } from "react-native-paper";
import * as XLSX from "xlsx";
import { useStore } from "../context/Store";
import { api } from "../services/api";

const START_TRIP_CHECKLIST = [
  { id: "docs", label: "Documentos, licencia y permiso en regla" },
  { id: "tires", label: "Llantas en buen estado" },
  { id: "lights", label: "Luces funcionando (delanteras y traseras)" },
  { id: "tools", label: "Kit de herramientas" },
] as const;

type ChecklistId = (typeof START_TRIP_CHECKLIST)[number]["id"];

const emptyChecklistState = (): Record<ChecklistId, boolean> =>
  START_TRIP_CHECKLIST.reduce(
    (acc, item) => ({ ...acc, [item.id]: false }),
    {} as Record<ChecklistId, boolean>
  );

/** Checklist de entrega al finalizar (marcar solo lo que se entrega). */
const FINISH_TRIP_CHECKLIST = [
  { id: "montacargas", label: "Montacargas" },
  { id: "alineamientos", label: "Adlinamientos" },
  { id: "llaves", label: "Llaves de equipo" },
  { id: "extintores", label: "Extintores" },
  { id: "cargadores", label: "Cargadores" },
  { id: "manualesUso", label: "Manuales de uso" },
  { id: "manualGarantias", label: "Manual de garantías" },
  { id: "hojaRecepcion", label: "Hoja de recepción" },
] as const;

type FinishChecklistId = (typeof FINISH_TRIP_CHECKLIST)[number]["id"];

const emptyFinishChecklistState = (): Record<FinishChecklistId, boolean> =>
  FINISH_TRIP_CHECKLIST.reduce(
    (acc, item) => ({ ...acc, [item.id]: false }),
    {} as Record<FinishChecklistId, boolean>
  );

type ChecklistItemSaved = { id: string; label: string; checked: boolean };
type ChecklistSaved = {
  items: ChecklistItemSaved[];
  extras?: string;
  completadoEn?: string | null;
};

const buildChecklistPayload = (
  defs: readonly { id: string; label: string }[],
  checked: Record<string, boolean>,
  extras = ""
): ChecklistSaved => ({
  items: defs.map((d) => ({ id: d.id, label: d.label, checked: Boolean(checked[d.id]) })),
  extras: extras.trim(),
  completadoEn: new Date().toISOString(),
});

/** Serializa un checklist guardado a texto legible para el Excel. */
const formatChecklistForExcel = (checklist?: ChecklistSaved | null): string => {
  if (!checklist || !Array.isArray(checklist.items)) return "";
  const marcados = checklist.items
    .filter((it) => it.checked)
    .map((it) => it.label);
  const partes: string[] = [];
  if (marcados.length) partes.push(marcados.join(", "));
  if (checklist.extras && checklist.extras.trim()) {
    partes.push(`Extras: ${checklist.extras.trim()}`);
  }
  return partes.join(" | ");
};

interface KilometrajeRegistro {
  km: string;
  descripcion: string;
}

interface DestinoExtraTrip {
  destino?: string;
  fechaSalida?: string;
  fechaLlegada?: string;
  conductorId?: string | { _id: string };
  unidadId?: string;
  acompanante?: string | { _id: string } | null;
  kilometrajeSalida?: { numero: number; descripcion: string }[];
  kilometrajeLlegada?: { numero: number; descripcion: string }[];
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
  multidestino?: boolean;
  destinoExtra?: DestinoExtraTrip[] | DestinoExtraTrip | null;
  destinoActualIndex?: number;
  asignadoPor?: string | { _id: string; nombre?: string; apellido?: string } | null;
  checklistInicio?: ChecklistSaved | null;
  checklistRecepcion?: ChecklistSaved | null;
  checklistFin?: ChecklistSaved | null;
  checklistParadas?:
    | (ChecklistSaved & { index?: number; destino?: string; recepcion?: ChecklistSaved | null })[]
    | null;
  finalizadoEn?: string | null;
  
  kilometrajeSalida?: { numero: number; descripcion: string }[];
  kilometrajeLlegada?: { numero: number; descripcion: string }[];
  
  kmSalidaList?: KilometrajeRegistro[];
  kmLlegadaList?: KilometrajeRegistro[];
}

interface Unit {
  id: string;
  nombre: string;
  placa: string;
  tipoRemolque?: string;
  placaRemolque?: string;
  imagenUrl?: string;
}
interface User { id: string; nombre: string; apellido?: string; rol?: string }

const UNIDADES_CON_REMOLQUE = ["002", "007"];
const REMOLQUE_OPTIONS = [
  { label: "Lowboy", value: "Lowboy" },
  { label: "Caja Seca", value: "Caja Seca" },
];

const isUnidadConRemolque = (nombre?: string) =>
  Boolean(nombre && UNIDADES_CON_REMOLQUE.includes(String(nombre).trim()));

const formatUnitLabel = (u: Unit) => {
  const base = `${u.nombre} ${u.placa}`.trim();
  if (!isUnidadConRemolque(u.nombre)) return base;
  if (u.tipoRemolque) return `${base} · Tractor (${u.tipoRemolque})`;
  return `${base} · Tractor`;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

const formatDateDisplay = (d: Date) =>
  `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;

const formatTimeDisplay = (d: Date) =>
  `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

/** Convierte ISO → { date, time } para los inputs del formulario. */
function isoToFormDateTime(iso?: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  return { date: formatDateDisplay(d), time: formatTimeDisplay(d) };
}

const combineDateTime = (dateStr: string, timeStr: string): Date | null => {
  if (!dateStr?.trim()) return null;
  const [day, month, year] = dateStr.split("/").map(Number);
  if (!year || !month || !day) return null;
  let hours = 0;
  let minutes = 0;
  if (timeStr?.trim()) {
    const parts = timeStr.split(":").map(Number);
    hours = Number.isFinite(parts[0]) ? parts[0] : 0;
    minutes = Number.isFinite(parts[1]) ? parts[1] : 0;
  }
  const d = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const toInputDateValue = (dateStr: string) => {
  const d = combineDateTime(dateStr, "");
  if (!d) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const dismissKeyboard = () => {
  Keyboard.dismiss();
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const active = document.activeElement as HTMLElement | null;
    if (active && typeof active.blur === "function") active.blur();
  }
};

/** Alert.alert falla en web (Expo); usar window.alert ahí. */
const notify = (title: string, message?: string) => {
  const text = message ? `${title}\n\n${message}` : title;
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(text);
    return;
  }
  Alert.alert(title, message);
};

const formatApiError = (error: any, fallback = "No se pudo completar la operación") => {
  const data = error?.response?.data;
  if (!data) return error?.message || fallback;
  if (typeof data === "string") return data;
  if (Array.isArray(data.errors) && data.errors[0]?.msg) {
    return data.errors.map((e: any) => e.msg).filter(Boolean).join("\n");
  }
  return data.message || data.error || data.msg || fallback;
};

const formatDuration = (ms: number): string => {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
};

const emptyDestinoExtra = () => ({
  fechaSalida: "",
  horaSalida: "",
  fechaLlegada: "",
  horaLlegada: "",
  destino: "",
  unidadId: "",
  conductorId: "",
  acompanante: "",
  kmSalida: "",
  kmLlegada: "",
});

type DestinoExtraForm = ReturnType<typeof emptyDestinoExtra>;

const normalizeDestinosExtrasList = (value: any): DestinoExtraTrip[] => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
};

const getTripEstadoKey = (estado?: string) => (estado || "").toLowerCase().trim();

const getTotalDestinosCount = (trip: Pick<Trip, "multidestino" | "destinoExtra">) =>
  1 + (trip.multidestino ? normalizeDestinosExtrasList(trip.destinoExtra).length : 0);

const getOperadorLegInfo = (trip: Trip, index = trip.destinoActualIndex ?? 0) => {
  const extras = normalizeDestinosExtrasList(trip.destinoExtra);
  if (index <= 0) {
    return {
      destino: trip.destino || "—",
      fechaSalida: trip.fechaSalida,
      fechaLlegada: trip.fechaLlegada,
      unidadId: trip.unidadId,
      acompanante: trip.acompanante,
      label: "Destino principal",
    };
  }
  const extra = extras[index - 1];
  return {
    destino: extra?.destino || "—",
    fechaSalida: extra?.fechaSalida,
    fechaLlegada: extra?.fechaLlegada,
    unidadId: extra?.unidadId || trip.unidadId,
    acompanante: (extra?.acompanante as any) ?? trip.acompanante,
    label: `Destino #${index + 1}`,
  };
};

const formatDateTimeLabel = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
};

const formatKmLabel = (list?: { numero?: number | string }[] | null) => {
  const raw = list?.[0]?.numero;
  if (raw == null || raw === "") return "—";
  const n = Number(raw);
  if (Number.isNaN(n)) return "—";
  return `${n.toLocaleString("es-MX")} km`;
};

const formatExcelDateTime = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
};

const MONTH_SHORT_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

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

const isTripInWeek = (trip: { fechaSalida?: string }, weekStart: Date) => {
  if (!trip.fechaSalida) return false;
  const date = new Date(trip.fechaSalida);
  if (Number.isNaN(date.getTime())) return false;
  const weekEnd = addDays(weekStart, 7);
  return date >= weekStart && date < weekEnd;
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

const parseWeekStartKey = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** Genera opciones de semanas (pasadas y próximas) lun–dom. */
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

/** Filtra por día / semana (lun–dom) / mes actual según fecha de salida. */
const isTripInExportPeriod = (trip: { fechaSalida?: string }, exportType: string) => {
  if (exportType === "general") return true;
  if (!trip.fechaSalida) return false;
  const date = new Date(trip.fechaSalida);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  if (exportType === "dia") {
    return date >= startOfToday && date < endOfToday;
  }
  if (exportType === "semana") {
    return isTripInWeek(trip, getWeekStartMonday(now));
  }
  // mes
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return date >= startOfMonth && date < endOfMonth;
};

const downloadExcelFile = async (wb: XLSX.WorkBook, filename: string) => {
  if (Platform.OS === "web") {
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    // En móvil (Safari/Chrome) el <a download> falla a menudo; preferir compartir archivo.
    const nav = typeof navigator !== "undefined" ? (navigator as any) : null;
    if (nav?.share && typeof File !== "undefined") {
      try {
        const file = new File([blob], filename, { type: blob.type });
        if (!nav.canShare || nav.canShare({ files: [file] })) {
          await nav.share({ files: [file], title: filename });
          return;
        }
      } catch {
        // Usuario canceló o share no disponible → descarga clásica
      }
    }

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => window.URL.revokeObjectURL(url), 800);
    return;
  }

  const base64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" });
  const FileSystem = (await import("expo-file-system/legacy")).default;
  const Sharing = await import("expo-sharing");
  const fileUri = `${(FileSystem as any).documentDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: "base64" });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("sharing_unavailable");
  }
  await Sharing.shareAsync(fileUri, {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    dialogTitle: "Compartir reporte Excel",
    UTI: "com.microsoft.excel.xlsx",
  });
};

const buildTiempoTrayecto = (
  salida: Date | null,
  llegada: Date | null,
  liveElapsedMs: number
) => {
  if (!salida) {
    return { value: "—", hint: "Selecciona fecha y hora de salida", live: false };
  }
  if (!llegada) {
    return {
      value: formatDuration(liveElapsedMs),
      hint: "Viaje en curso — timer activo",
      live: true,
    };
  }
  const diff = llegada.getTime() - salida.getTime();
  if (diff < 0) {
    return { value: "—", hint: "La llegada no puede ser anterior a la salida", live: false };
  }
  return {
    value: formatDuration(diff),
    hint: "Tiempo estimado de llegada",
    live: false,
  };
};

const toId = (value: any) => {
  if (!value) return "";
  if (typeof value === "object") {
    if (value._id) return String(value._id);
    if (typeof value.toString === "function" && value.toString !== Object.prototype.toString) {
      const asStr = value.toString();
      if (asStr && asStr !== "[object Object]") return asStr;
    }
    return "";
  }
  return String(value);
};

const mapDestinoExtraFromTrip = (item: DestinoExtraTrip): DestinoExtraForm => {
  const multiSalida = isoToFormDateTime(item.fechaSalida);
  const multiLlegada = isoToFormDateTime(item.fechaLlegada);
  return {
    fechaSalida: multiSalida.date,
    horaSalida: multiSalida.time,
    fechaLlegada: multiLlegada.date,
    horaLlegada: multiLlegada.time,
    destino: item.destino || "",
    unidadId: item.unidadId || "",
    conductorId: toId(item.conductorId),
    acompanante: toId(item.acompanante) || "",
    kmSalida:
      item.kilometrajeSalida?.[0]?.numero != null ? String(item.kilometrajeSalida[0].numero) : "",
    kmLlegada:
      item.kilometrajeLlegada?.[0]?.numero != null ? String(item.kilometrajeLlegada[0].numero) : "",
  };
};

const exportOptions: { value: string; label: string }[] = [
  { value: "dia", label: "Día" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mes" },
  { value: "general", label: "General" },
];

/** Foto de unidad: muestra el camioncito si no hay foto o si la imagen falla/está subiendo. */
function UnitPhoto({ uri }: { uri?: string }) {
  const [failed, setFailed] = useState(false);
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={styles.unitDetailPhoto}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={styles.unitDetailPhotoPlaceholder}>
      <FontAwesome5 name="truck" size={18} color="#6b7280" />
    </View>
  );
}

export default function TripsPage() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [viewportWidth, setViewportWidth] = useState(() =>
    Platform.OS === "web" && typeof window !== "undefined"
      ? window.visualViewport?.width || window.innerWidth
      : width
  );
  // Ancho efectivo: en web el layout puede ser más estrecho que la ventana
  const effectiveWidth = Math.min(width, viewportWidth || width);
  // En web el preview/iframe a veces reporta ancho de desktop; compactamos por viewport real
  const isCompactModal = isMobile || effectiveWidth < 900;
  // Lista: una columna en móvil / tablet para que la tarjeta ocupe todo el ancho
  const isNarrowList = isMobile || effectiveWidth < 1024;
  const { currentUser } = useStore();

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const syncViewport = () => {
      setViewportWidth(window.visualViewport?.width || window.innerWidth || width);
    };
    syncViewport();
    window.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("resize", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("resize", syncViewport);
    };
  }, [width]);
  
  const [trips, setTrips] = useState<Trip[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [rutaAcubrir, setRutaAcubrir] = useState("");
  const [unidadId, setUnidadId] = useState("");
  const [conductorId, setConductorId] = useState("");
  const [fechaSalida, setFechaSalida] = useState("");
  const [horaSalida, setHoraSalida] = useState("");
  const [fechaLlegada, setFechaLlegada] = useState("");
  const [horaLlegada, setHoraLlegada] = useState("");
  const [destino, setDestino] = useState("");
  const [estado, setEstado] = useState("pendiente");
  const [kmSalidaManual, setKmSalidaManual] = useState("");
  const [kmLlegadaManual, setKmLlegadaManual] = useState("");
  const [acompanante, setAcompanante] = useState("");
  const [def, setDef] = useState("");
  const [exportType, setExportType] = useState("semana");
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => getWeekStartMonday());
  const [weekSheetVisible, setWeekSheetVisible] = useState(false);
  const [checklistTrip, setChecklistTrip] = useState<Trip | null>(null);
  const [checklistChecked, setChecklistChecked] = useState<Record<ChecklistId, boolean>>(emptyChecklistState);
  const [finishChecklistTrip, setFinishChecklistTrip] = useState<Trip | null>(null);
  const [finishMode, setFinishMode] = useState<
    "final" | "parada" | "recepcion" | "recepcion-parada"
  >("final");
  const [pendingParadaEntrega, setPendingParadaEntrega] = useState<ChecklistSaved | null>(null);
  const [finishChecklistChecked, setFinishChecklistChecked] = useState<Record<FinishChecklistId, boolean>>(
    emptyFinishChecklistState
  );
  const [finishExtras, setFinishExtras] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [llegadaTouched, setLlegadaTouched] = useState(false);
  const [adminShowForm, setAdminShowForm] = useState(true);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [unitPlaca, setUnitPlaca] = useState("");
  const [tipoRemolque, setTipoRemolque] = useState("");
  const [mostrarRemolque, setMostrarRemolque] = useState(false);
  const [placaRemolque, setPlacaRemolque] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const [multidestino, setMultidestino] = useState(false);
  const [destinosExtras, setDestinosExtras] = useState<DestinoExtraForm[]>([]);
  // Un solo picker activo (fecha u hora) para cualquier campo. En iOS se dibuja
  // como overlay a nivel del modal (Modal anidado queda oculto en iOS).
  const [activePicker, setActivePicker] = useState<{
    mode: "date" | "time";
    apply: (d: Date) => void;
    title: string;
  } | null>(null);
  const [pickerTemp, setPickerTemp] = useState<Date>(new Date());
  const [multiLiveTick, setMultiLiveTick] = useState(0);
  const [selectSheet, setSelectSheet] = useState<SelectSheetState | null>(null);

  const isAdmin = currentUser?.rol?.toLowerCase().trim() === "admin";
  const roleKey = (currentUser?.rol || "").toLowerCase().trim();
  const isAyudante = roleKey === "ayudante general" || roleKey === "ayudante";
  const isOperadorRole = roleKey === "operador" || roleKey === "chofer";
  const isOperador = !isAdmin;
  const myUserId = String(currentUser?._id || (currentUser as any)?.id || "").trim();

  /** Operador: solo viajes donde es conductor. Ayudante: donde es acompañante (o conductor). */
  const isTripAssignedToMe = useCallback(
    (t: any) => {
      if (!myUserId) return false;
      const asConductor =
        toId(t.conductorId) === myUserId ||
        (Array.isArray(t.destinoExtra) &&
          t.destinoExtra.some((extra: any) => toId(extra?.conductorId) === myUserId));
      const asCompanion =
        toId(t.acompanante) === myUserId ||
        (Array.isArray(t.destinoExtra) &&
          t.destinoExtra.some((extra: any) => toId(extra?.acompanante) === myUserId));

      if (isOperadorRole) return asConductor;
      if (isAyudante) return asCompanion || asConductor;
      return asConductor || asCompanion;
    },
    [myUserId, isOperadorRole, isAyudante]
  );

  const isCompanionOnTrip = useCallback((t: any) => {
    if (!myUserId) return false;
    if (toId(t.acompanante) === myUserId) return true;
    const extras = Array.isArray(t.destinoExtra) ? t.destinoExtra : [];
    return extras.some((extra: any) => toId(extra?.acompanante) === myUserId);
  }, [myUserId]);

  const operadores = useMemo(
    () => users.filter((u) => (u.rol || "").toLowerCase() === "operador"),
    [users]
  );

  const acompanantesOptions = useMemo(
    () =>
      users.filter((u) => {
        const r = (u.rol || "").toLowerCase();
        return r === "operador" || r === "ayudante general" || r === "ayudante" || r === "chofer";
      }),
    [users]
  );

  const salidaDateTime = useMemo(() => combineDateTime(fechaSalida, horaSalida), [fechaSalida, horaSalida]);
  const llegadaDateTime = useMemo(() => combineDateTime(fechaLlegada, horaLlegada), [fechaLlegada, horaLlegada]);

  const isTripLive = modalVisible && !!salidaDateTime && !llegadaDateTime;
  const hasMultiLive = modalVisible && multidestino && destinosExtras.some((d) => {
    const s = combineDateTime(d.fechaSalida, d.horaSalida);
    const l = combineDateTime(d.fechaLlegada, d.horaLlegada);
    return !!s && !l;
  });

  useEffect(() => {
    if (!isTripLive || !salidaDateTime) {
      setLiveElapsed(0);
      return;
    }
    const tick = () => setLiveElapsed(Date.now() - salidaDateTime.getTime());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isTripLive, salidaDateTime]);

  useEffect(() => {
    if (!hasMultiLive) {
      setMultiLiveTick(0);
      return;
    }
    const id = setInterval(() => setMultiLiveTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasMultiLive]);

  const tiempoTrayecto = useMemo(
    () => buildTiempoTrayecto(salidaDateTime, llegadaDateTime, liveElapsed),
    [salidaDateTime, llegadaDateTime, liveElapsed]
  );

  const updateDestinoExtraAt = (index: number, patch: Partial<DestinoExtraForm>) => {
    setDestinosExtras((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
  };

  const addDestinoExtra = () => {
    setDestinosExtras((prev) => [...prev, emptyDestinoExtra()]);
  };

  const removeDestinoExtra = (index: number) => {
    setDestinosExtras((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        setMultidestino(false);
        return [];
      }
      return next;
    });
  };

  const getTiempoExtra = (item: DestinoExtraForm) => {
    const s = combineDateTime(item.fechaSalida, item.horaSalida);
    const l = combineDateTime(item.fechaLlegada, item.horaLlegada);
    const elapsed = s && !l ? Date.now() - s.getTime() : 0;
    // multiLiveTick fuerza re-render del timer en curso
    void multiLiveTick;
    return buildTiempoTrayecto(s, l, elapsed);
  };

  const closeModal = useCallback(() => {
    setSelectSheet(null);
    setChecklistTrip(null);
    setChecklistChecked(emptyChecklistState());
    setFinishChecklistTrip(null);
    setFinishMode("final");
    setFinishChecklistChecked(emptyFinishChecklistState());
    setFinishExtras("");
    setActivePicker(null);
    setModalVisible(false);
  }, []);

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
        allTrips = allTrips.filter((t: any) => isTripAssignedToMe(t));
      }
      setTrips(allTrips);
    } catch (error: any) {
      console.error("Error cargando viajes:", error);
      setLoadError("No se pudieron cargar los viajes. Verifica la conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  }, [currentUser, isAdmin, isTripAssignedToMe]);

  const loadUnits = useCallback(async () => {
    try {
      const res = await api.get("/units");
      setUnits(res.data.map((u: any) => ({
        id: u._id || u.id,
        nombre: u.nombre,
        placa: u.placas ?? u.placa ?? "",
        tipoRemolque: u.tipoRemolque || "",
        placaRemolque: u.placaRemolque || "",
        imagenUrl: u.imagenUrl || "",
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

 const openModal = useCallback((trip?: Trip, opts?: { asRepeat?: boolean }) => {
    const fillUnit = (unidadIdValue: string) => {
      const unitFromTrip = units.find((u) => u.id === unidadIdValue) || null;
      setSelectedUnit(unitFromTrip);
      setUnitPlaca(unitFromTrip?.placa ?? "");
      if (unitFromTrip && isUnidadConRemolque(unitFromTrip.nombre)) {
        setMostrarRemolque(true);
        setTipoRemolque(unitFromTrip.tipoRemolque || "");
        setPlacaRemolque(unitFromTrip.placaRemolque || "");
      } else {
        setMostrarRemolque(false);
        setTipoRemolque("");
        setPlacaRemolque("");
      }
    };

    // Repetir viaje: crea uno NUEVO con los mismos datos base; el original queda en historial
    if (trip && opts?.asRepeat) {
      setEditingTrip(null);
      setAdminShowForm(true);
      setLlegadaTouched(false);
      setRutaAcubrir(trip.rutaAcubrir || "");
      setUnidadId(trip.unidadId || "");
      fillUnit(trip.unidadId || "");
      setConductorId(toId(trip.conductorId));
      setDestino(trip.destino || "");
      setEstado("pendiente");
      setAcompanante(toId(trip.acompanante) || "");
      setDef(trip.def || "");
      setKmSalidaManual("");
      setKmLlegadaManual("");
      setFechaSalida("");
      setHoraSalida("");
      setFechaLlegada("");
      setHoraLlegada("");
      setMultidestino(false);
      setDestinosExtras([]);
      setActivePicker(null);
      setModalVisible(true);
      return;
    }

    if (trip) {
      setEditingTrip(trip);
      // Ver detalles siempre abre la hoja; Editar muestra el formulario
      setAdminShowForm(false);
      setLlegadaTouched(Boolean(trip.fechaLlegada));
      setRutaAcubrir(trip.rutaAcubrir || "");
      setUnidadId(trip.unidadId || "");
      fillUnit(trip.unidadId || "");
      setConductorId(toId(trip.conductorId));

      const salida = isoToFormDateTime(trip.fechaSalida);
      setFechaSalida(salida.date);
      setHoraSalida(salida.time);

      const llegada = isoToFormDateTime(trip.fechaLlegada);
      setFechaLlegada(llegada.date);
      setHoraLlegada(llegada.time);

      setDestino(trip.destino || "");
      setEstado(trip.estado || "pendiente");
      setAcompanante(toId(trip.acompanante) || "");

      setDef(trip.def || "");
      setKmSalidaManual(
        trip.kilometrajeSalida?.[0]?.numero != null ? String(trip.kilometrajeSalida[0].numero) : ""
      );
      setKmLlegadaManual(
        trip.kilometrajeLlegada?.[0]?.numero != null ? String(trip.kilometrajeLlegada[0].numero) : ""
      );

      const extrasList = normalizeDestinosExtrasList(trip.destinoExtra);
      const hasMulti = Boolean(trip.multidestino && extrasList.length > 0);
      setMultidestino(hasMulti);
      setDestinosExtras(
        hasMulti ? extrasList.map((item) => mapDestinoExtraFromTrip(item)) : []
      );
    } else {
      setEditingTrip(null);
      setAdminShowForm(true);
      setLlegadaTouched(false);
      setRutaAcubrir("");
      setUnidadId("");
      setConductorId("");
      setFechaSalida("");
      setHoraSalida("");
      setFechaLlegada("");
      setHoraLlegada("");
      setDestino("");
      setEstado("pendiente");
      setAcompanante("");
      setDef("");
      setKmSalidaManual("");
      setKmLlegadaManual("");
      setSelectedUnit(null);
      setUnitPlaca("");
      setMostrarRemolque(false);
      setTipoRemolque("");
      setPlacaRemolque("");
      setMultidestino(false);
      setDestinosExtras([]);
    }
    setActivePicker(null);
    setModalVisible(true);
  }, [units]);

  const buildDeliveryStops = useCallback((trip: Trip) => {
    const currentIndex = trip.destinoActualIndex ?? 0;
    const estadoKey = getTripEstadoKey(trip.estado);
    const extras = normalizeDestinosExtrasList(trip.destinoExtra);
    const stops = [
      {
        key: "main",
        index: 0,
        title: "Entrega principal",
        destino: trip.destino || "—",
        fechaSalida: trip.fechaSalida,
        fechaLlegada: trip.fechaLlegada,
        kmSalida: formatKmLabel(trip.kilometrajeSalida),
        kmLlegada: formatKmLabel(trip.kilometrajeLlegada),
        defEntregado: trip.def?.trim() ? trip.def.trim() : "—",
        isCurrent: currentIndex === 0 && estadoKey !== "completado",
        isDone:
          Boolean(trip.fechaLlegada) ||
          (estadoKey === "completado" && currentIndex === 0) ||
          currentIndex > 0,
      },
      ...extras.map((extra, i) => {
        const idx = i + 1;
        return {
          key: `extra-${i}`,
          index: idx,
          title: `Punto de entrega ${idx + 1}`,
          destino: extra?.destino || "—",
          fechaSalida: extra?.fechaSalida,
          fechaLlegada: extra?.fechaLlegada,
          kmSalida: formatKmLabel(extra?.kilometrajeSalida),
          kmLlegada: formatKmLabel(extra?.kilometrajeLlegada),
          defEntregado: null as string | null,
          isCurrent: currentIndex === idx && estadoKey !== "completado",
          isDone:
            Boolean(extra?.fechaLlegada) ||
            (estadoKey === "completado" && currentIndex >= idx) ||
            currentIndex > idx,
        };
      }),
    ];
    return stops;
  }, []);

  const renderTripDetailSheet = (trip: Trip) => {
    const liveTrip = trips.find((t) => t.id === trip.id) || trip;
    const estadoStyle = getEstadoStyle(liveTrip.estado);
    const unitDetail = units.find((u) => u.id === liveTrip.unidadId);
    const unidadNombre = unitDetail ? formatUnitLabel(unitDetail) : liveTrip.unidadId || "—";
    const conductorIdVal =
      typeof liveTrip.conductorId === "object" ? liveTrip.conductorId._id : liveTrip.conductorId;
    const conductorNombre = resolveUserName(conductorIdVal) || "—";
    const acompananteId = toId(liveTrip.acompanante);
    const acompananteNombre =
      !acompananteId || acompananteId === "none"
        ? "Sin acompañante"
        : resolveUserName(acompananteId) || "Sin acompañante";
    const asignadoPorNombre = resolveAsignadoPorNombre(liveTrip);
    const stops = buildDeliveryStops(liveTrip);
    const currentStop =
      stops.find((s) => s.isCurrent) ||
      stops[Math.min(liveTrip.destinoActualIndex ?? 0, stops.length - 1)];

    return (
      <View style={[styles.sheetPaper, isCompactModal && styles.sheetPaperTouch]}>
        <View style={styles.sheetTopBar}>
          <View style={styles.sheetBrandMark}>
            <FontAwesome5 name="file-alt" size={14} color="#ffffff" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.sheetDocLabel}>Hoja de viaje</Text>
            <Text style={styles.sheetDocMeta}>
              {liveTrip.multidestino
                ? `Itinerario · ${stops.length} puntos de entrega`
                : "Entrega única"}
            </Text>
          </View>
          <View style={[styles.estadoBadge, estadoStyle.badge]}>
            <FontAwesome5 name={estadoStyle.icon} size={10} color={estadoStyle.iconColor} />
            <Text style={[styles.estadoText, estadoStyle.text]}>{liveTrip.estado}</Text>
          </View>
        </View>

        <View style={styles.sheetHero}>
          <Text style={styles.sheetHeroEyebrow}>Ruta</Text>
          <Text style={styles.sheetHeroTitle}>{liveTrip.rutaAcubrir || "Sin ruta"}</Text>
          <View style={styles.sheetHeroDivider} />
          <Text style={styles.sheetHeroEyebrow}>Destino de entrega</Text>
          <Text style={styles.sheetHeroDestino}>{currentStop?.destino || liveTrip.destino || "—"}</Text>
        </View>

        <View style={styles.sheetSection}>
          <Text style={styles.sheetSectionTitle}>Itinerario de entregas</Text>
          <View style={styles.sheetTimeline}>
            {stops.map((stop, idx) => {
              const isLast = idx === stops.length - 1;
              return (
                <View key={stop.key} style={styles.sheetTimelineItem}>
                  <View style={styles.sheetTimelineRail}>
                    <View
                      style={[
                        styles.sheetTimelineDot,
                        stop.isDone && styles.sheetTimelineDotDone,
                        stop.isCurrent && styles.sheetTimelineDotCurrent,
                      ]}
                    >
                      {stop.isDone ? (
                        <FontAwesome5 name="check" size={9} color="#ffffff" />
                      ) : (
                        <Text
                          style={[
                            styles.sheetTimelineDotNum,
                            stop.isCurrent && styles.sheetTimelineDotNumCurrent,
                          ]}
                        >
                          {idx + 1}
                        </Text>
                      )}
                    </View>
                    {!isLast ? (
                      <View
                        style={[
                          styles.sheetTimelineLine,
                          stop.isDone && styles.sheetTimelineLineDone,
                        ]}
                      />
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.sheetStopCard,
                      stop.isCurrent && styles.sheetStopCardCurrent,
                      stop.isDone && styles.sheetStopCardDone,
                    ]}
                  >
                    <View style={styles.sheetStopHeader}>
                      <Text style={styles.sheetStopTitle}>{stop.title}</Text>
                      {stop.isCurrent ? (
                        <View style={styles.sheetNowBadge}>
                          <Text style={styles.sheetNowBadgeText}>Actual</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.sheetStopDestino}>{stop.destino}</Text>
                    <View style={styles.sheetStopTimes}>
                      <View style={styles.sheetStopTimeBlock}>
                        <Text style={styles.sheetStopTimeLabel}>Salida</Text>
                        <Text style={styles.sheetStopTimeValue}>
                          {formatDateTimeLabel(stop.fechaSalida)}
                        </Text>
                      </View>
                      <View style={styles.sheetStopTimeBlock}>
                        <Text style={styles.sheetStopTimeLabel}>Llegada</Text>
                        <Text style={styles.sheetStopTimeValue}>
                          {formatDateTimeLabel(stop.fechaLlegada)}
                        </Text>
                      </View>
                    </View>
                    {isAdmin ? (
                      <View style={styles.sheetStopTimes}>
                        <View style={styles.sheetStopTimeBlock}>
                          <Text style={styles.sheetStopTimeLabel}>KM Salida</Text>
                          <Text style={styles.sheetStopTimeValue}>{stop.kmSalida}</Text>
                        </View>
                        <View style={styles.sheetStopTimeBlock}>
                          <Text style={styles.sheetStopTimeLabel}>KM Llegada</Text>
                          <Text style={styles.sheetStopTimeValue}>{stop.kmLlegada}</Text>
                        </View>
                      </View>
                    ) : null}
                    {stop.defEntregado ? (
                      <View style={styles.sheetStopDefRow}>
                        <FontAwesome5 name="gas-pump" size={11} color="#6b7280" />
                        <Text style={styles.sheetStopDefLabel}>DEF entregado</Text>
                        <Text style={styles.sheetStopDefValue}>{stop.defEntregado}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.sheetSection}>
          <Text style={styles.sheetSectionTitle}>Datos del servicio</Text>
          <View style={styles.sheetMetaGrid}>
            <View style={styles.sheetMetaItem}>
              <Text style={styles.sheetMetaLabel}>Operador</Text>
              <Text style={styles.sheetMetaValue}>{conductorNombre}</Text>
            </View>
            <View style={styles.sheetMetaItem}>
              <Text style={styles.sheetMetaLabel}>Acompañante</Text>
              <Text style={styles.sheetMetaValue}>{acompananteNombre}</Text>
            </View>
            <View style={[styles.sheetMetaItem, styles.sheetMetaItemFull]}>
              <Text style={styles.sheetMetaLabel}>Asignado por</Text>
              <Text style={styles.sheetMetaValue}>{asignadoPorNombre}</Text>
            </View>
            {getTripEstadoKey(liveTrip.estado) === "completado" && liveTrip.finalizadoEn ? (
              <View style={[styles.sheetMetaItem, styles.sheetMetaItemFull, styles.sheetMetaItemFinish]}>
                <View style={styles.sheetFinishLabelRow}>
                  <FontAwesome5 name="flag-checkered" size={11} color="#059669" />
                  <Text style={styles.sheetMetaLabel}>Viaje finalizado</Text>
                </View>
                <Text style={styles.sheetFinishValue}>
                  {formatDateTimeLabel(liveTrip.finalizadoEn)}
                </Text>
              </View>
            ) : null}
            <View style={[styles.sheetMetaItem, styles.sheetMetaItemFull]}>
              <Text style={styles.sheetMetaLabel}>Unidad</Text>
              <View style={styles.unitDetailRow}>
                <UnitPhoto uri={unitDetail?.imagenUrl} />
                <View style={styles.unitDetailText}>
                  <Text style={styles.unitDetailName}>{unidadNombre}</Text>
                  {unitDetail?.placa ? (
                    <Text style={styles.unitDetailPlaca}>Placa {unitDetail.placa}</Text>
                  ) : null}
                </View>
              </View>
            </View>
          </View>
        </View>

        {renderChecklistSummary(
          "Checklist de inicio",
          "clipboard-check",
          "#111111",
          liveTrip.checklistInicio,
          "El operador aún no ha iniciado el viaje."
        )}

        {renderChecklistSummary(
          "Checklist de recepción",
          "clipboard-check",
          "#2563eb",
          liveTrip.checklistRecepcion,
          "El operador aún no ha registrado la recepción."
        )}

        {(liveTrip.checklistParadas || []).map((cl, i) => {
          const paradaLabel = cl.destino
            ? ` · ${cl.destino}`
            : ` ${(cl.index ?? i) + 1}`;
          return (
            <React.Fragment key={`parada-${i}`}>
              {renderChecklistSummary(
                `Entrega en parada${paradaLabel}`,
                "map-marker-alt",
                "#2563eb",
                cl,
                "",
                `parada-entrega-${i}`
              )}
              {renderChecklistSummary(
                `Recepción en parada${paradaLabel}`,
                "clipboard-check",
                "#7c3aed",
                cl.recepcion,
                "",
                `parada-recepcion-${i}`
              )}
            </React.Fragment>
          );
        })}

        {renderChecklistSummary(
          "Checklist de entrega",
          "clipboard-list",
          "#dc2626",
          liveTrip.checklistFin,
          "El operador aún no ha finalizado el viaje."
        )}
      </View>
    );
  };

  /** Resumen de un checklist guardado (solo lectura, para admin en el detalle). */
  const renderChecklistSummary = (
    title: string,
    icon: string,
    color: string,
    checklist: ChecklistSaved | null | undefined,
    emptyLabel: string,
    key?: string
  ) => {
    const items = checklist?.items || [];
    const extras = (checklist?.extras || "").trim();
    const hasData = items.length > 0 || Boolean(extras);

    // Para paradas sin datos guardados, no mostrar nada.
    if (!emptyLabel && !hasData) return null;

    return (
      <View key={key} style={styles.sheetSection}>
        <View style={styles.checklistSummaryTitleRow}>
          <FontAwesome5 name={icon} size={13} color={color} />
          <Text style={styles.sheetSectionTitle}>{title}</Text>
          {checklist?.completadoEn ? (
            <Text style={styles.checklistSummaryDate}>
              {formatDateTimeLabel(checklist.completadoEn)}
            </Text>
          ) : null}
        </View>

        {!hasData ? (
          <Text style={styles.checklistSummaryEmpty}>{emptyLabel}</Text>
        ) : (
          <View style={styles.checklistSummaryList}>
            {items.map((it) => (
              <View key={it.id} style={styles.checklistSummaryRow}>
                <View
                  style={[
                    styles.checklistSummaryIcon,
                    it.checked
                      ? styles.checklistSummaryIconOk
                      : styles.checklistSummaryIconNo,
                  ]}
                >
                  <FontAwesome5
                    name={it.checked ? "check" : "times"}
                    size={10}
                    color="#ffffff"
                  />
                </View>
                <Text
                  style={[
                    styles.checklistSummaryLabel,
                    !it.checked && styles.checklistSummaryLabelOff,
                  ]}
                >
                  {it.label}
                </Text>
              </View>
            ))}

            {extras ? (
              <View style={styles.checklistSummaryExtras}>
                <Text style={styles.checklistSummaryExtrasLabel}>Extras</Text>
                <Text style={styles.checklistSummaryExtrasValue}>{extras}</Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
    );
  };

  const handleFechaSalidaChange = useCallback((value: string) => {
    setFechaSalida(value);
  }, []);

  const handleHoraSalidaChange = useCallback((value: string) => {
    setHoraSalida(value);
  }, []);

  const handleFechaLlegadaChange = useCallback((value: string) => {
    setLlegadaTouched(true);
    setFechaLlegada(value);
  }, []);

  const handleHoraLlegadaChange = useCallback((value: string) => {
    setLlegadaTouched(true);
    setHoraLlegada(value);
  }, []);

  const handleUnidadChange = (value: string) => {
    setUnidadId(value);
    const unidad = units.find((u) => u.id === value) || null;
    setSelectedUnit(unidad);
    setUnitPlaca(unidad?.placa ?? "");
    if (unidad && isUnidadConRemolque(unidad.nombre)) {
      setMostrarRemolque(true);
      setTipoRemolque(unidad.tipoRemolque || "");
      setPlacaRemolque(unidad.placaRemolque || "");
    } else {
      setMostrarRemolque(false);
      setTipoRemolque("");
      setPlacaRemolque("");
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadTrips();
      loadUnits();
      loadUsers();
    }
  }, [currentUser, loadTrips, loadUnits, loadUsers]);

  // Rastrea la altura del teclado para que no tape el campo de extras en móvil.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvt, (e: any) =>
      setKeyboardHeight(e?.endCoordinates?.height || 0)
    );
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (!currentUser) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f4f6f9" }}>
        <Text>Cargando usuario...</Text>
      </View>
    );
  }

const parseDate = (dateStr: string) => combineDateTime(dateStr, "");

  const buildDestinoExtraPayload = (extras: DestinoExtraTrip[]) =>
    extras.map((item) => ({
      destino: item.destino || "",
      unidadId: item.unidadId || "",
      conductorId: toId(item.conductorId) || null,
      acompanante: toId(item.acompanante) || null,
      kilometrajeSalida: item.kilometrajeSalida || [],
      kilometrajeLlegada: item.kilometrajeLlegada || [],
      fechaSalida: item.fechaSalida || null,
      fechaLlegada: item.fechaLlegada || null,
    }));

  /** Actualiza viaje desde operador. Sin helpers de fechas (compat. Hermes/móvil). */
  const updateTripAsOperador = async (
    trip: Trip,
    payload: Record<string, any>,
    successMessage: string
  ) => {
    const tripId = String(trip.id || (trip as any)._id || "").trim();
    if (!tripId) {
      notify("Error", "No se encontró el ID del viaje.");
      return;
    }

    console.log("[OP_START_V3] updateTripAsOperador", tripId, payload?.estado);

    // El checklist solo lo persiste la ruta /operador; no usar el atajo de solo-estado en ese caso.
    const hasChecklist = Boolean(
      payload.checklistInicio ||
        payload.checklistRecepcion ||
        payload.checklistFin ||
        payload.checklistParada
    );

    const attempts: Array<{ label: string; run: () => Promise<any> }> = [];

    if (!hasChecklist) {
      attempts.push({
        label: "PUT /trips/:id (estado)",
        run: () => api.put(`/trips/${tripId}`, { estado: payload.estado }, { timeout: 45000 }),
      });
    }

    attempts.push(
      {
        label: "PUT /trips/:id/operador",
        run: () => api.put(`/trips/${tripId}/operador`, payload, { timeout: 45000 }),
      },
      {
        label: "PATCH /trips/:id/operador",
        run: () => api.patch(`/trips/${tripId}/operador`, payload, { timeout: 45000 }),
      }
    );

    if (!hasChecklist) {
      attempts.push({
        label: "PUT /trips/:id (payload)",
        run: () => api.put(`/trips/${tripId}`, payload, { timeout: 45000 }),
      });
    }

    setSaving(true);
    let lastError: any = null;
    try {
      for (const attempt of attempts) {
        try {
          const resp = await attempt.run();
          notify("Éxito", successMessage);
          if (payload.estado) setEstado(String(payload.estado));

          const serverTrip = resp?.data?.trip
            ? { ...resp.data.trip, id: resp.data.trip._id || resp.data.trip.id || tripId }
            : null;

          // Actualiza al instante el detalle abierto (incluye checklists) sin esperar la recarga.
          setEditingTrip((prev) => {
            if (!prev || String(prev.id) !== tripId) return prev;
            if (serverTrip) return { ...prev, ...serverTrip, id: prev.id };
            return {
              ...prev,
              estado: payload.estado ?? prev.estado,
              destinoActualIndex: payload.destinoActualIndex ?? prev.destinoActualIndex,
              checklistInicio: payload.checklistInicio ?? prev.checklistInicio,
              checklistRecepcion: payload.checklistRecepcion ?? prev.checklistRecepcion,
              checklistFin: payload.checklistFin ?? prev.checklistFin,
            };
          });

          if (serverTrip) {
            setTrips((prev) =>
              prev.map((t) => (String(t.id) === tripId ? { ...t, ...serverTrip, id: t.id } : t))
            );
          }

          // Recarga en background: no debe tumbar el éxito en móvil
          void loadTrips().catch((e) => console.warn("[OP_START_V3] loadTrips:", e));
          return;
        } catch (err: any) {
          lastError = err;
          const status = err?.response?.status;
          console.warn(`[OP_START_V3] falló ${attempt.label}:`, status, err?.response?.data || err?.message);
          if (status === 401 || status === 403) break;
        }
      }

      console.error("[OP_START_V3] Error actualizando viaje:", lastError?.response?.data || lastError);
      const status = lastError?.response?.status;
      const detail = formatApiError(lastError, "No se pudo actualizar el viaje.");
      notify("Error", status ? `(${status}) ${detail}` : detail);
    } finally {
      setSaving(false);
    }
  };

  const iniciarViaje = async (trip: Trip, checklistInicio?: ChecklistSaved) => {
    console.log("[OP_START_V3] iniciarViaje", trip?.id, trip?.estado);
    const estado = getTripEstadoKey(trip.estado);
    if (estado !== "pendiente" && estado !== "en parada") {
      notify("No disponible", "Este viaje no se puede iniciar en su estado actual.");
      return;
    }

    const now = new Date().toISOString();
    const index = Number(trip.destinoActualIndex ?? 0) || 0;
    const extras = normalizeDestinosExtrasList(trip.destinoExtra).map((item) => ({ ...item }));

    if (estado === "pendiente" || index <= 0) {
      await updateTripAsOperador(
        trip,
        { estado: "en progreso", ...(checklistInicio ? { checklistInicio } : {}) },
        "Viaje iniciado"
      );
      return;
    }

    extras[index - 1] = {
      ...extras[index - 1],
      fechaSalida: extras[index - 1]?.fechaSalida || now,
      fechaLlegada: extras[index - 1]?.fechaLlegada || undefined,
    };

    await updateTripAsOperador(
      trip,
      {
        estado: "en progreso",
        destinoActualIndex: index,
        multidestino: true,
        destinoExtra: buildDestinoExtraPayload(extras),
        ...(checklistInicio ? { checklistInicio } : {}),
      },
      "Siguiente tramo iniciado"
    );
  };

  /** Abre el checklist de entrega de la parada solo si hay una parada siguiente. */
  const startFinalizarParada = (trip: Trip) => {
    const estado = getTripEstadoKey(trip.estado);
    if (estado !== "en progreso") {
      Alert.alert("No disponible", "Solo puedes finalizar parada con el viaje en progreso.");
      return;
    }
    const index = trip.destinoActualIndex ?? 0;
    const total = getTotalDestinosCount(trip);
    if (index + 1 >= total) {
      Alert.alert(
        "Sin más paradas",
        "Este es el último destino. Usa Finalizar viaje para completar el recorrido."
      );
      return;
    }
    openFinishChecklist(trip, "parada");
  };

  const finalizarParada = async (
    trip: Trip,
    checklist?: ChecklistSaved,
    recepcion?: ChecklistSaved
  ) => {
    const estado = getTripEstadoKey(trip.estado);
    if (estado !== "en progreso") {
      Alert.alert("No disponible", "Solo puedes finalizar parada con el viaje en progreso.");
      return;
    }

    const index = trip.destinoActualIndex ?? 0;
    const extras = normalizeDestinosExtrasList(trip.destinoExtra).map((item) => ({ ...item }));
    const total = getTotalDestinosCount(trip);
    const hasNext = index + 1 < total;

    if (!hasNext) {
      Alert.alert(
        "Sin más paradas",
        "Este es el último destino. Usa Finalizar viaje para completar el recorrido."
      );
      return;
    }

    // Guarda el checklist de entrega (y recepción) de ESTA parada, con su índice y destino.
    const stops = buildDeliveryStops(trip);
    const destinoParada = stops[index]?.destino || trip.destino || "";
    const checklistParada = checklist
      ? { ...checklist, index, destino: destinoParada, recepcion: recepcion ?? null }
      : undefined;

    if (index <= 0) {
      await updateTripAsOperador(
        trip,
        {
          estado: "en parada",
          destinoActualIndex: 1,
          ...(checklistParada ? { checklistParada } : {}),
        },
        "Parada finalizada."
      );
      return;
    }

    await updateTripAsOperador(
      trip,
      {
        estado: "en parada",
        destinoActualIndex: index + 1,
        multidestino: true,
        destinoExtra: buildDestinoExtraPayload(extras),
        ...(checklistParada ? { checklistParada } : {}),
      },
      "Parada finalizada."
    );
  };

  const finalizarViaje = async (trip: Trip, checklistFin?: ChecklistSaved) => {
    const estado = getTripEstadoKey(trip.estado);
    if (estado !== "en progreso" && estado !== "en parada") {
      Alert.alert("No disponible", "Solo puedes finalizar un viaje en progreso o en parada.");
      return;
    }

    const index = trip.destinoActualIndex ?? 0;

    // Solo cambia estado. Fecha/hora de llegada las captura quien edita el viaje (no el operador).
    await updateTripAsOperador(
      trip,
      {
        estado: "completado",
        destinoActualIndex: index,
        multidestino: Boolean(trip.multidestino),
        ...(checklistFin ? { checklistFin } : {}),
      },
      "Viaje finalizado."
    );
  };

const saveTrip = async () => {
  // La llegada es solo tiempo estimado: NUNCA marca el viaje como completado.
  // Completado solo lo pone el operador al finalizar, o un admin editando un viaje ya en curso.
  const estadoActual = editingTrip ? getTripEstadoKey(editingTrip.estado) : "pendiente";
  const estadoCalculado =
    estadoActual === "en progreso" || estadoActual === "en parada" || estadoActual === "completado"
      ? editingTrip!.estado
      : "pendiente";

  if (isAdmin && (!rutaAcubrir.trim() || !unidadId || !conductorId || !destino.trim())) {
    notify(
      "Falta información",
      "Completa ruta, unidad, operador y destino antes de guardar."
    );
    return;
  }

  if (isAdmin && !fechaSalida.trim()) {
    notify("Falta información", "Selecciona la fecha de salida.");
    return;
  }

  if (isAdmin && fechaSalida.trim() && !salidaDateTime) {
    notify(
      "Fecha inválida",
      "La fecha de salida no es válida. Vuelve a seleccionarla (y la hora)."
    );
    return;
  }

  if (salidaDateTime && llegadaDateTime && llegadaDateTime < salidaDateTime) {
    notify("Fechas inválidas", "La llegada no puede ser anterior a la salida.");
    return;
  }

  if (multidestino) {
    if (destinosExtras.length === 0) {
      notify("Multidestino incompleto", "Agrega al menos un destino adicional.");
      return;
    }
    for (let i = 0; i < destinosExtras.length; i++) {
      const extra = destinosExtras[i];
      if (!extra.destino.trim() || !extra.unidadId || !extra.conductorId || !extra.fechaSalida) {
        notify(
          "Multidestino incompleto",
          `Completa destino, unidad, operador y fecha de salida del destino adicional #${i + 1}.`
        );
        return;
      }
      const s = combineDateTime(extra.fechaSalida, extra.horaSalida);
      const l = combineDateTime(extra.fechaLlegada, extra.horaLlegada);
      if (s && l && l < s) {
        notify(
          "Fechas inválidas",
          `En el destino adicional #${i + 1}, la llegada no puede ser anterior a la salida.`
        );
        return;
      }
    }
  }

  const payload: any = {
    rutaAcubrir: rutaAcubrir.trim(),
    unidadId,
    conductorId: typeof conductorId === "object" ? (conductorId as any)._id : conductorId,
    destino: destino.trim(),
    estado: estadoCalculado,
    acompanante: acompanante === "none" || acompanante === "" ? null : acompanante,
    def: def || "",
    kilometrajeSalida: kmSalidaManual.trim()
      ? [{ numero: Number(kmSalidaManual), descripcion: "" }]
      : [],
    kilometrajeLlegada: kmLlegadaManual.trim()
      ? [{ numero: Number(kmLlegadaManual), descripcion: "" }]
      : [],
    multidestino: Boolean(multidestino),
  };

  if (!payload.acompanante) delete payload.acompanante;

  // Backend exige fechaSalida en ISO8601 al crear
  if (salidaDateTime) {
    payload.fechaSalida = salidaDateTime.toISOString();
  } else if (!editingTrip) {
    notify("Falta información", "Selecciona fecha y hora de salida.");
    return;
  }

  // Llegada manual (opcional): no se llena al finalizar el viaje.
  if (llegadaDateTime) {
    payload.fechaLlegada = llegadaDateTime.toISOString();
  } else if (!editingTrip) {
    payload.fechaLlegada = null;
  } else if (llegadaTouched) {
    // Se limpió la llegada a propósito
    payload.fechaLlegada = null;
  }
  // Si edita sin tocar llegada vacía, no enviamos el campo y el backend conserva el valor
  if (multidestino) {
    payload.destinoExtra = destinosExtras.map((extra) => {
      const s = combineDateTime(extra.fechaSalida, extra.horaSalida);
      const l = combineDateTime(extra.fechaLlegada, extra.horaLlegada);
      return {
        destino: extra.destino.trim(),
        unidadId: extra.unidadId,
        conductorId: extra.conductorId,
        acompanante:
          extra.acompanante === "none" || extra.acompanante === "" ? null : extra.acompanante,
        kilometrajeSalida: extra.kmSalida.trim()
          ? [{ numero: Number(extra.kmSalida), descripcion: "" }]
          : [],
        kilometrajeLlegada: extra.kmLlegada.trim()
          ? [{ numero: Number(extra.kmLlegada), descripcion: "" }]
          : [],
        fechaSalida: s ? s.toISOString() : null,
        fechaLlegada: l ? l.toISOString() : null,
      };
    });
  } else {
    payload.destinoExtra = [];
  }

  if (mostrarRemolque && tipoRemolque) {
    payload.tipoRemolque = tipoRemolque;
    if (placaRemolque.trim()) payload.placaRemolque = placaRemolque.trim();
  }

  try {
    setSaving(true);
    if (editingTrip) {
      await api.put(`/trips/${editingTrip.id}`, payload);
    } else {
      await api.post("/trips", payload);
    }
    notify("Éxito", "Viaje guardado correctamente");
    await loadTrips();
    closeModal();
  } catch (error: any) {
    console.error("Error al guardar:", error?.response?.data || error);
    notify("Error al guardar", formatApiError(error, "No se pudo guardar el viaje. Revisa los datos."));
  } finally {
    setSaving(false);
  }
};
  


const deleteTrip = (id: string) => {
  if (!isAdmin) return;
  // Modal propio: Alert.alert / window.confirm fallan o no se ven en Expo web/móvil
  setDeleteConfirmId(String(id));
};

const proceedDeleteTrip = async () => {
  const id = deleteConfirmId;
  if (!id) return;
  setDeleteConfirmId(null);
  try {
    await api.delete(`/trips/${id}`);
    setTrips((prev) => prev.filter((t) => t.id !== id));
    if (editingTrip && String(editingTrip.id) === id) {
      closeModal();
    }
    notify("Éxito", "Viaje eliminado correctamente");
  } catch (error) {
    console.error("Error eliminando viaje", error);
    notify("Error", "No se pudo eliminar el viaje");
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
      <Text style={styles.confirmTitle}>Eliminar viaje</Text>
      <Text style={styles.confirmMessage}>
        ¿Estás seguro de que deseas eliminar este viaje? Esta acción no se puede deshacer.
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
            void proceedDeleteTrip();
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.confirmDeleteText}>Eliminar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const overlay = (
    <View style={[styles.checklistOverlay, styles.checklistOverlayWeb]} pointerEvents="box-none">
      <Pressable style={styles.checklistBackdrop} onPress={closeDeleteConfirm} />
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

  const resolveUserName = useCallback(
    (rawId: any) => {
      const sid = String(typeof rawId === "object" && rawId ? rawId._id : rawId || "");
      if (!sid || sid === "none") return "";
      const user = users.find((u) => String(u.id) === sid);
      if (!user) return "";
      return [user.nombre, user.apellido].filter(Boolean).join(" ").trim();
    },
    [users]
  );

  const resolveAsignadoPorNombre = useCallback(
    (trip: Trip) => {
      const raw = trip.asignadoPor;
      if (!raw) return "—";
      if (typeof raw === "object") {
        const fromPopulate = [raw.nombre, raw.apellido].filter(Boolean).join(" ").trim();
        if (fromPopulate) return fromPopulate;
        return resolveUserName(raw._id) || "—";
      }
      return resolveUserName(raw) || "—";
    },
    [resolveUserName]
  );

  const exportToExcel = async () => {
    // La exportación por "semana" respeta la semana elegida en el selector.
    const matchesPeriod = (t: Trip) => {
      if (exportType === "general") return true;
      if (exportType === "semana") return isTripInWeek(t, selectedWeekStart);
      return isTripInExportPeriod(t, exportType);
    };

    const periodTrips = trips.filter(matchesPeriod);
    const periodLabel = exportOptions.find((o) => o.value === exportType)?.label || exportType;
    const periodDetail =
      exportType === "semana"
        ? `${periodLabel} (${formatWeekRangeLabel(selectedWeekStart)})`
        : periodLabel;

    if (periodTrips.length === 0) {
      Alert.alert("Sin datos", `No hay viajes para "${periodDetail}".`);
      return;
    }

    try {
      const rows = periodTrips.map((t) => {
        const conductorIdVal =
          typeof t.conductorId === "object" ? t.conductorId._id : t.conductorId;
        const extras = normalizeDestinosExtrasList(t.destinoExtra);
        const unit = units.find((u) => String(u.id) === String(t.unidadId));
        return {
          Ruta: t.rutaAcubrir ?? "",
          Destino: t.destino ?? "",
          Salida: formatExcelDateTime(t.fechaSalida),
          "Llegada estimada": formatExcelDateTime(t.fechaLlegada),
          "Finalizado (real)": t.finalizadoEn ? formatExcelDateTime(t.finalizadoEn) : "",
          Estado: t.estado ?? "",
          Operador: resolveUserName(conductorIdVal),
          Acompañante: resolveUserName(t.acompanante) || "Sin acompañante",
          Multidestino: t.multidestino ? "Sí" : "No",
          "Destinos extras": extras.map((d) => d.destino || "Sin nombre").join(" | "),
          Unidad: unit ? formatUnitLabel(unit) : t.unidadId || "",
          "KM Salida": formatKmLabel(t.kilometrajeSalida),
          "KM Llegada": formatKmLabel(t.kilometrajeLlegada),
          "DEF entregado": t.def?.trim() ? t.def.trim() : "",
          "Checklist inicio": formatChecklistForExcel(t.checklistInicio),
          "Checklist recepción": formatChecklistForExcel(t.checklistRecepcion),
          "Checklist entrega": formatChecklistForExcel(t.checklistFin),
        };
      });

      const headers = Object.keys(rows[0]);
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = headers.map((key) => {
        const maxCell = Math.max(
          key.length,
          ...rows.map((r) => String((r as any)[key] ?? "").length)
        );
        return { wch: Math.max(12, Math.min(42, maxCell + 2)) };
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Viajes");

      const slug = periodDetail.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadExcelFile(wb, `Reporte_Viajes_${slug}_${stamp}.xlsx`);

      Alert.alert(
        "Éxito",
        `Excel generado: ${periodDetail} (${periodTrips.length} viaje${periodTrips.length === 1 ? "" : "s"}).`
      );
    } catch (error: any) {
      console.error("Error exportando Excel", error);
      if (error?.message === "sharing_unavailable") {
        Alert.alert("Error", "No se puede compartir el archivo en este dispositivo");
      } else {
        Alert.alert("Error", "No se pudo generar el archivo Excel");
      }
    }
  };

  const getEstadoStyle = (estado: string) => {
    const key = getTripEstadoKey(estado);
    if (key === "completado") {
      return { badge: styles.estadoCompletado, text: styles.estadoTextCompletado, icon: "check-circle" as const, iconColor: "#059669" };
    }
    if (key === "en progreso") {
      return { badge: styles.estadoProgreso, text: styles.estadoTextProgreso, icon: "truck" as const, iconColor: "#2563eb" };
    }
    if (key === "en parada") {
      return { badge: styles.estadoParada, text: styles.estadoTextParada, icon: "pause-circle" as const, iconColor: "#7c3aed" };
    }
    return { badge: styles.estadoPendiente, text: styles.estadoTextPendiente, icon: "clock" as const, iconColor: "#d97706" };
  };

  const openStartChecklist = (trip: Trip) => {
    setChecklistTrip(trip);
    setChecklistChecked(emptyChecklistState());
  };

  const closeStartChecklist = () => {
    setChecklistTrip(null);
    setChecklistChecked(emptyChecklistState());
  };

  const toggleChecklistItem = (id: ChecklistId) => {
    setChecklistChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const checklistAllDone = START_TRIP_CHECKLIST.every((item) => checklistChecked[item.id]);

  const confirmStartFromChecklist = async () => {
    if (!checklistTrip) return;
    if (!checklistAllDone) {
      notify("Checklist incompleto", "Marca todos los puntos antes de iniciar el viaje.");
      return;
    }
    console.log("[OP_START_V3] checklist confirm", checklistTrip.id);
    const tripToStart = checklistTrip;
    const payload = buildChecklistPayload(START_TRIP_CHECKLIST, checklistChecked);
    closeStartChecklist();
    await iniciarViaje(tripToStart, payload);
  };

  const openFinishChecklist = (
    trip: Trip,
    mode: "final" | "parada" | "recepcion" | "recepcion-parada" = "final"
  ) => {
    setFinishChecklistTrip(trip);
    setFinishMode(mode);
    setFinishChecklistChecked(emptyFinishChecklistState());
    setFinishExtras("");
  };

  const closeFinishChecklist = () => {
    setFinishChecklistTrip(null);
    setFinishMode("final");
    setFinishChecklistChecked(emptyFinishChecklistState());
    setFinishExtras("");
    setPendingParadaEntrega(null);
  };

  const toggleFinishItem = (id: FinishChecklistId) => {
    setFinishChecklistChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const confirmFinishFromChecklist = async () => {
    if (!finishChecklistTrip) return;
    const tripToFinish = finishChecklistTrip;
    const mode = finishMode;
    const payload = buildChecklistPayload(
      FINISH_TRIP_CHECKLIST,
      finishChecklistChecked,
      finishExtras
    );

    // Finalizar parada = 2 pasos: primero entrega, luego recepción de esa parada.
    if (mode === "parada") {
      setPendingParadaEntrega(payload);
      setFinishMode("recepcion-parada");
      setFinishChecklistChecked(emptyFinishChecklistState());
      setFinishExtras("");
      return;
    }

    if (mode === "recepcion-parada") {
      const entrega = pendingParadaEntrega;
      closeFinishChecklist();
      await finalizarParada(tripToFinish, entrega ?? undefined, payload);
      return;
    }

    closeFinishChecklist();
    if (mode === "recepcion") {
      await guardarRecepcion(tripToFinish, payload);
    } else {
      await finalizarViaje(tripToFinish, payload);
    }
  };

  const guardarRecepcion = async (trip: Trip, checklistRecepcion: ChecklistSaved) => {
    await updateTripAsOperador(trip, { checklistRecepcion }, "Recepción guardada.");
  };

  /** UI del checklist (sin Modal propio). En móvil se embebe sobre el detalle del viaje. */
  const renderChecklistOverlay = (embedded = false) => {
    if (!checklistTrip) return null;

    const card = (
      <View
        style={[styles.checklistCard, isNarrowList && styles.checklistCardMobile]}
        {...(Platform.OS === "web" ? { onClick: (e: any) => e.stopPropagation() } : {})}
      >
        <View style={styles.checklistHeader}>
          <View style={styles.checklistIconBadge}>
            <FontAwesome5 name="clipboard-check" size={16} color="#ffffff" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.checklistTitle}>Checklist antes de iniciar</Text>
            <Text style={styles.checklistSubtitle} numberOfLines={2}>
              {checklistTrip.rutaAcubrir} → {checklistTrip.destino}
            </Text>
          </View>
          <Pressable style={styles.checklistClose} onPress={closeStartChecklist}>
            <FontAwesome5 name="times" size={13} color="#6b7280" />
          </Pressable>
        </View>

        <Text style={styles.checklistIntro}>
          Confirma que todo va en orden. Debes marcar todos los puntos para continuar.
        </Text>

        <View style={styles.checklistList}>
          {START_TRIP_CHECKLIST.map((item) => {
            const active = checklistChecked[item.id];
            return (
              <Pressable
                key={item.id}
                style={({ pressed }) => [
                  styles.checklistRow,
                  active && styles.checklistRowActive,
                  pressed && styles.checklistRowPressed,
                ]}
                onPress={() => toggleChecklistItem(item.id)}
              >
                <View style={[styles.checklistBox, active && styles.checklistBoxActive]}>
                  {active ? <FontAwesome5 name="check" size={11} color="#ffffff" /> : null}
                </View>
                <Text style={[styles.checklistLabel, active && styles.checklistLabelActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.checklistActions}>
          <TouchableOpacity
            style={styles.checklistCancelBtn}
            onPress={closeStartChecklist}
            activeOpacity={0.85}
          >
            <Text style={styles.checklistCancelText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.checklistConfirmBtn,
              (!checklistAllDone || saving) && styles.checklistConfirmBtnDisabled,
            ]}
            onPress={() => {
              void confirmStartFromChecklist();
            }}
            disabled={!checklistAllDone || saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <FontAwesome5 name="play" size={13} color="#ffffff" />
                <Text style={styles.checklistConfirmText}>Iniciar viaje</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );

    return (
      <View
        style={[
          styles.checklistOverlay,
          embedded ? styles.checklistOverlayEmbedded : null,
          Platform.OS === "web" ? styles.checklistOverlayWeb : null,
        ]}
        pointerEvents="box-none"
      >
        <Pressable style={styles.checklistBackdrop} onPress={closeStartChecklist} />
        {card}
      </View>
    );
  };

  const renderStartChecklistModal = () => {
    if (!checklistTrip) return null;

    // iOS: no abrir un segundo Modal si el detalle del viaje ya está abierto
    if (Platform.OS !== "web" && modalVisible) return null;

    if (Platform.OS === "web") {
      return <Portal>{renderChecklistOverlay(false)}</Portal>;
    }

    return (
      <Modal visible transparent animationType="fade" onRequestClose={closeStartChecklist}>
        {renderChecklistOverlay(false)}
      </Modal>
    );
  };

  /** Checklist de entrega al finalizar. Items opcionales + extras manual. */
  const renderFinishChecklistOverlay = (embedded = false) => {
    if (!finishChecklistTrip) return null;

    const card = (
      <View
        style={[styles.checklistCard, isNarrowList && styles.checklistCardMobile]}
        {...(Platform.OS === "web" ? { onClick: (e: any) => e.stopPropagation() } : {})}
      >
        <View style={styles.checklistHeader}>
          <View style={[styles.checklistIconBadge, styles.checklistIconBadgeFinish]}>
            <FontAwesome5 name="clipboard-list" size={16} color="#ffffff" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.checklistTitle}>
              {finishMode === "parada"
                ? "Entrega de parada (1/2)"
                : finishMode === "recepcion-parada"
                ? "Recepción de parada (2/2)"
                : finishMode === "recepcion"
                ? "Checklist de recepción"
                : "Checklist de entrega"}
            </Text>
            <Text style={styles.checklistSubtitle} numberOfLines={2}>
              {finishChecklistTrip.rutaAcubrir} → {finishChecklistTrip.destino}
            </Text>
          </View>
          <Pressable style={styles.checklistClose} onPress={closeFinishChecklist}>
            <FontAwesome5 name="times" size={13} color="#6b7280" />
          </Pressable>
        </View>

        <Text style={styles.checklistIntro}>
          {finishMode === "recepcion" || finishMode === "recepcion-parada"
            ? "Marca lo que se recibió."
            : "Marca lo que se entregó."}
        </Text>

        <ScrollView
          style={[
            styles.finishChecklistScroll,
            Platform.OS !== "web" && keyboardHeight > 0 ? { maxHeight: 150 } : null,
          ]}
          contentContainerStyle={styles.checklistList}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          {FINISH_TRIP_CHECKLIST.map((item) => {
            const active = finishChecklistChecked[item.id];
            return (
              <Pressable
                key={item.id}
                style={({ pressed }) => [
                  styles.checklistRow,
                  active && styles.checklistRowActive,
                  pressed && styles.checklistRowPressed,
                ]}
                onPress={() => toggleFinishItem(item.id)}
              >
                <View style={[styles.checklistBox, active && styles.checklistBoxActive]}>
                  {active ? <FontAwesome5 name="check" size={11} color="#ffffff" /> : null}
                </View>
                <Text style={[styles.checklistLabel, active && styles.checklistLabelActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.finishExtrasGroup}>
          <Text style={styles.finishExtrasLabel}>Extras</Text>
          <TextInput
            placeholder={
              finishMode === "recepcion" || finishMode === "recepcion-parada"
                ? "Escribe otros elementos recibidos…"
                : "Escribe otros elementos entregados…"
            }
            value={finishExtras}
            onChangeText={setFinishExtras}
            mode="outlined"
            dense
            multiline
            outlineColor="#e5e7eb"
            activeOutlineColor="#111111"
            style={styles.finishExtrasInput}
            contentStyle={styles.finishExtrasInputContent}
          />
        </View>

        <View style={styles.checklistActions}>
          <TouchableOpacity
            style={styles.checklistCancelBtn}
            onPress={closeFinishChecklist}
            activeOpacity={0.85}
          >
            <Text style={styles.checklistCancelText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.checklistConfirmBtn, saving && styles.checklistConfirmBtnDisabled]}
            onPress={() => {
              void confirmFinishFromChecklist();
            }}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <FontAwesome5
                  name={
                    finishMode === "parada"
                      ? "arrow-right"
                      : finishMode === "recepcion-parada"
                      ? "map-marker-alt"
                      : finishMode === "recepcion"
                      ? "clipboard-check"
                      : "flag-checkered"
                  }
                  size={13}
                  color="#ffffff"
                />
                <Text style={styles.checklistConfirmText}>
                  {finishMode === "parada"
                    ? "Siguiente: recepción"
                    : finishMode === "recepcion-parada"
                    ? "Finalizar parada"
                    : finishMode === "recepcion"
                    ? "Guardar recepción"
                    : "Finalizar viaje"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );

    return (
      <View
        style={[
          styles.checklistOverlay,
          embedded ? styles.checklistOverlayEmbedded : null,
          Platform.OS === "web" ? styles.checklistOverlayWeb : null,
        ]}
        pointerEvents="box-none"
      >
        <Pressable style={styles.checklistBackdrop} onPress={closeFinishChecklist} />
        <View
          style={[
            styles.checklistKav,
            Platform.OS !== "web" && keyboardHeight > 0
              ? { paddingBottom: keyboardHeight, justifyContent: "flex-start", paddingTop: 12 }
              : null,
          ]}
          pointerEvents="box-none"
        >
          {card}
        </View>
      </View>
    );
  };

  const renderFinishChecklistModal = () => {
    if (!finishChecklistTrip) return null;
    if (Platform.OS !== "web" && modalVisible) return null;

    if (Platform.OS === "web") {
      return <Portal>{renderFinishChecklistOverlay(false)}</Portal>;
    }

    return (
      <Modal visible transparent animationType="fade" onRequestClose={closeFinishChecklist}>
        {renderFinishChecklistOverlay(false)}
      </Modal>
    );
  };

  const renderOperadorActions = (trip: Trip, compact = false) => {
    const liveTrip = trips.find((t) => t.id === trip.id) || trip;
    const estado = getTripEstadoKey(liveTrip.estado);
    const canIniciar = estado === "pendiente" || estado === "en parada";
    // "Finalizar parada" solo aplica a viajes multidestino (hay más de un destino).
    const esMultidestino =
      Boolean(liveTrip.multidestino) || getTotalDestinosCount(liveTrip) > 1;
    const canParada = estado === "en progreso" && esMultidestino;
    const canFinalizar = estado === "en progreso" || estado === "en parada";
    const canRecepcion = estado === "en progreso" || estado === "en parada";

    if (estado === "completado") {
      return (
        <View style={styles.operadorDoneBox}>
          <FontAwesome5 name="check-circle" size={14} color="#059669" />
          <Text style={styles.operadorDoneHint}>Viaje completado</Text>
        </View>
      );
    }

    return (
      <View
        style={[
          styles.operadorActionsRow,
          styles.operadorActionsRowSticky,
          compact && styles.operadorActionsRowCompact,
        ]}
      >
        {canIniciar && (
          <TouchableOpacity
            style={[styles.operadorActionBtn, styles.operadorActionPrimary, styles.operadorActionBtnFixed]}
            onPress={() => openStartChecklist(liveTrip)}
            disabled={saving}
            activeOpacity={0.85}
          >
            <FontAwesome5 name="play" size={13} color="#ffffff" />
            <Text style={styles.operadorActionTextPrimary}>Iniciar viaje</Text>
          </TouchableOpacity>
        )}
        {canParada && (
          <TouchableOpacity
            style={[styles.operadorActionBtn, styles.operadorActionSecondary, styles.operadorActionBtnFixed]}
            onPress={() => startFinalizarParada(liveTrip)}
            disabled={saving}
            activeOpacity={0.85}
          >
            <FontAwesome5 name="map-marker-alt" size={13} color="#111111" />
            <Text style={styles.operadorActionText}>Finalizar parada</Text>
          </TouchableOpacity>
        )}
        {canRecepcion && (
          <TouchableOpacity
            style={[styles.operadorActionBtn, styles.operadorActionSecondary, styles.operadorActionBtnFixed]}
            onPress={() => openFinishChecklist(liveTrip, "recepcion")}
            disabled={saving}
            activeOpacity={0.85}
          >
            <FontAwesome5 name="clipboard-check" size={13} color="#111111" />
            <Text style={styles.operadorActionText}>Recepción</Text>
          </TouchableOpacity>
        )}
        {canFinalizar && (
          <TouchableOpacity
            style={[styles.operadorActionBtn, styles.operadorActionDanger, styles.operadorActionBtnFixed]}
            onPress={() => openFinishChecklist(liveTrip)}
            disabled={saving}
            activeOpacity={0.85}
          >
            <FontAwesome5 name="flag-checkered" size={13} color="#dc2626" />
            <Text style={styles.operadorActionTextDanger}>Finalizar viaje</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderItem = ({ item }: { item: Trip }) => {
    const leg = getOperadorLegInfo(item);
    const unitObj = units.find((u) => u.id === (isOperador ? leg.unidadId : item.unidadId));
    const unidadNombre =
      unitObj?.nombre || (isOperador ? leg.unidadId : item.unidadId);
    const conductorIdVal = typeof item.conductorId === "object" ? item.conductorId._id : item.conductorId;
    const conductorNombre = resolveUserName(conductorIdVal) || "N/A";
    const acompananteId = toId(isOperador ? leg.acompanante : item.acompanante);
    const acompananteNombre =
      !acompananteId || acompananteId === "none"
        ? "Sin acompañante"
        : resolveUserName(acompananteId) || "Sin acompañante";
    const asignadoPorNombre = resolveAsignadoPorNombre(item);
    const asCompanion = !isAdmin && isCompanionOnTrip(item) && toId(conductorIdVal) !== myUserId;
    const canEdit = isAdmin || toId(conductorIdVal) === myUserId;
    const canView = isAdmin || isTripAssignedToMe(item);
    const canDelete = isAdmin;
    const estado = getEstadoStyle(item.estado);
    const destinoLabel = leg.destino || item.destino || "—";
    const rutaLabel = item.rutaAcubrir || leg.destino || "Sin ruta";

    // Móvil: card compacta — solo ruta, destino, ver detalles y eliminar
    if (isMobile || isNarrowList) {
      return (
        <View style={styles.cardSlot}>
          <View
            style={[
              styles.card,
              styles.cardFullWidth,
              styles.cardMobileCompact,
              isOperador && styles.cardFieldStaff,
              asCompanion && styles.cardCompanion,
            ]}
          >
            <View style={styles.cardBody}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, styles.cardTitleMobileCompact]} numberOfLines={2}>
                  {rutaLabel}
                </Text>
                <View style={[styles.estadoBadge, estado.badge]}>
                  <FontAwesome5 name={estado.icon} size={10} color={estado.iconColor} />
                  <Text style={[styles.estadoText, estado.text]}>{item.estado}</Text>
                </View>
              </View>

              {asCompanion ? (
                <View style={styles.roleTripBadge}>
                  <FontAwesome5 name="user-friends" size={10} color="#0f766e" />
                  <Text style={styles.roleTripBadgeText}>Vas como acompañante</Text>
                </View>
              ) : isOperador ? (
                <View style={[styles.roleTripBadge, styles.roleTripBadgeOperador]}>
                  <FontAwesome5 name="truck" size={10} color="#1d4ed8" />
                  <Text style={[styles.roleTripBadgeText, styles.roleTripBadgeTextOperador]}>
                    Tu viaje asignado
                  </Text>
                </View>
              ) : null}

              <View style={styles.mobileDestinoBlock}>
                <Text style={styles.specLabel}>Destino</Text>
                <Text style={styles.mobileDestinoValue} numberOfLines={2}>
                  {destinoLabel}
                </Text>
              </View>

              {asCompanion ? (
                <View style={styles.mobileDestinoBlock}>
                  <Text style={styles.specLabel}>Operador</Text>
                  <Text style={styles.mobileDestinoValue} numberOfLines={1}>
                    {conductorNombre}
                  </Text>
                </View>
              ) : null}

              <View style={styles.mobileDestinoBlock}>
                <Text style={styles.specLabel}>Asignado por</Text>
                <Text style={styles.mobileDestinoValue} numberOfLines={1}>
                  {asignadoPorNombre}
                </Text>
              </View>

              {item.multidestino && normalizeDestinosExtrasList(item.destinoExtra).length > 0 ? (
                <View style={styles.mobileStopsChips}>
                  <View style={styles.mobileStopChipMain}>
                    <Text style={styles.mobileStopChipIndexLight}>1</Text>
                    <Text style={styles.mobileStopChipTextLight} numberOfLines={1}>
                      {item.destino || "Entrega"}
                    </Text>
                  </View>
                  {normalizeDestinosExtrasList(item.destinoExtra).map((extra, i) => (
                    <View key={`chip-${item.id}-${i}`} style={styles.mobileStopChip}>
                      <Text style={styles.mobileStopChipIndex}>{i + 2}</Text>
                      <Text style={styles.mobileStopChipText} numberOfLines={1}>
                        {extra?.destino || `Punto ${i + 2}`}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.mobileCardActions}>
                {canView ? (
                  <TouchableOpacity
                    style={styles.mobileDetailsBtn}
                    onPress={() => openModal(item)}
                    activeOpacity={0.85}
                  >
                    <FontAwesome5 name="eye" size={13} color="#ffffff" />
                    <Text style={styles.mobileDetailsBtnText}>Ver detalles</Text>
                  </TouchableOpacity>
                ) : null}
                {canDelete ? (
                  <TouchableOpacity
                    style={styles.mobileDeleteBtn}
                    onPress={() => deleteTrip(item.id)}
                    activeOpacity={0.85}
                  >
                    <FontAwesome5 name="trash-alt" size={13} color="#dc2626" />
                    <Text style={styles.mobileDeleteBtnText}>Eliminar</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.cardSlot}>
        <View
          style={[
            styles.card,
            styles.cardFullWidth,
            isOperador && styles.cardOperadorMobile,
            asCompanion && styles.cardCompanion,
          ]}
        >
          <View style={styles.cardIconWrap}>
            <FontAwesome5 name={asCompanion ? "user-friends" : "route"} size={20} color="#111111" />
          </View>

        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, isOperador && styles.cardTitleOperador]} numberOfLines={2}>
              {isOperador ? leg.destino : item.rutaAcubrir}
            </Text>
            <View style={[styles.estadoBadge, estado.badge]}>
              <FontAwesome5 name={estado.icon} size={10} color={estado.iconColor} />
              <Text style={[styles.estadoText, estado.text]}>{item.estado}</Text>
            </View>
          </View>
          {asCompanion ? (
            <View style={styles.roleTripBadge}>
              <FontAwesome5 name="user-friends" size={10} color="#0f766e" />
              <Text style={styles.roleTripBadgeText}>Vas como acompañante</Text>
            </View>
          ) : null}
          {item.multidestino ? (
            <View style={styles.multiBadge}>
              <Text style={styles.multiBadgeText}>
                Multidestino · {leg.label}
              </Text>
            </View>
          ) : null}

          <View style={styles.specGrid}>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Unidad</Text>
              <Text style={styles.specValue}>{unidadNombre || "—"}</Text>
            </View>
            {(!isOperador || asCompanion) && (
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Conductor</Text>
                <Text style={styles.specValue} numberOfLines={1}>{conductorNombre}</Text>
              </View>
            )}
            <View style={[styles.specItem, styles.specItemFull]}>
              <Text style={styles.specLabel}>Destino</Text>
              <Text style={styles.specValue} numberOfLines={2}>{destinoLabel}</Text>
            </View>
            {!isOperador && item.multidestino && normalizeDestinosExtrasList(item.destinoExtra).length > 0 ? (
              <View style={[styles.specItem, styles.specItemFull]}>
                <Text style={styles.specLabel}>Extras</Text>
                <Text style={styles.specValue} numberOfLines={2}>
                  {normalizeDestinosExtrasList(item.destinoExtra)
                    .map((d) => d.destino || "Sin nombre")
                    .join(" · ")}
                </Text>
              </View>
            ) : null}
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Salida</Text>
              <Text style={styles.specValue}>{formatDateTimeLabel(leg.fechaSalida || item.fechaSalida)}</Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>
                {getTripEstadoKey(item.estado) === "completado" ? "Llegada" : "Llegada estimada"}
              </Text>
              <Text style={styles.specValue}>{formatDateTimeLabel(leg.fechaLlegada || item.fechaLlegada)}</Text>
            </View>
            {!asCompanion ? (
              <View style={[styles.specItem, styles.specItemFull]}>
                <Text style={styles.specLabel}>Acompañante</Text>
                <Text style={styles.specValue} numberOfLines={1}>{acompananteNombre}</Text>
              </View>
            ) : null}
            <View style={[styles.specItem, styles.specItemFull]}>
              <Text style={styles.specLabel}>Asignado por</Text>
              <Text style={styles.specValue} numberOfLines={1}>{asignadoPorNombre}</Text>
            </View>
          </View>

          {isOperador ? (
            <View style={styles.operadorCardFooter}>
              {canEdit ? renderOperadorActions(item, true) : (
                <Text style={styles.companionHint}>Solo lectura · acompañante</Text>
              )}
              {canView ? (
                <TouchableOpacity
                  style={styles.iconAction}
                  onPress={() => openModal(item)}
                  activeOpacity={0.85}
                >
                  <FontAwesome5 name="eye" size={14} color="#111111" />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
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
          )}
        </View>
      </View>
      </View>
    );
  };

  const displayedTrips = useMemo(() => {
    if (!isAdmin) return trips;
    return trips.filter((t) => isTripInWeek(t, selectedWeekStart));
  }, [trips, selectedWeekStart, isAdmin]);

  const tripsCountByWeek = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const trip of trips) {
      if (!trip.fechaSalida) continue;
      const date = new Date(trip.fechaSalida);
      if (Number.isNaN(date.getTime())) continue;
      const key = weekStartKey(getWeekStartMonday(date));
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [trips]);

  const weekOptions = useMemo(() => {
    return buildWeekOptions().map((opt) => ({
      ...opt,
      tripCount: tripsCountByWeek[opt.value] || 0,
    }));
  }, [tripsCountByWeek]);

  const selectedWeekTripCount = tripsCountByWeek[weekStartKey(selectedWeekStart)] || 0;

  const weekLabel = useMemo(() => formatWeekRangeLabel(selectedWeekStart), [selectedWeekStart]);
  const weekSelectLabel = useMemo(() => {
    const current = getWeekStartMonday();
    const base = formatWeekSelectLabel(selectedWeekStart, current);
    const n = selectedWeekTripCount;
    return `${base} · ${n} viaje${n === 1 ? "" : "s"}`;
  }, [selectedWeekStart, selectedWeekTripCount]);
  const selectedWeekValue = weekStartKey(selectedWeekStart);

  const openWeekSheet = () => setWeekSheetVisible(true);
  const closeWeekSheet = () => setWeekSheetVisible(false);

  const renderWeekSelectSheet = () => {
    if (!weekSheetVisible) return null;
    const currentMonday = getWeekStartMonday();
    // Web ancho: modal centrado. Móvil / vista estrecha: bottom sheet.
    const useBottomSheet = isNarrowList || Platform.OS !== "web";

    const sheetBody = (
      <View
        style={[styles.weekSheetOverlay, !useBottomSheet && styles.weekSheetOverlayDesktop]}
        pointerEvents="box-none"
      >
        <Pressable style={styles.weekSheetBackdrop} onPress={closeWeekSheet} />
        <View
          style={[
            styles.weekSheetCard,
            useBottomSheet ? styles.weekSheetCardMobile : styles.weekSheetCardDesktop,
          ]}
          {...(Platform.OS === "web" ? { onClick: (e: any) => e.stopPropagation() } : {})}
        >
          {useBottomSheet ? <View style={styles.weekSheetHandle} /> : null}

          <View style={[styles.weekSheetHeader, !useBottomSheet && styles.weekSheetHeaderDesktop]}>
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
              accessibilityLabel="Cerrar"
            >
              <FontAwesome5 name="times" size={13} color="#6b7280" />
            </Pressable>
          </View>

          <ScrollView
            style={[styles.weekSheetList, !useBottomSheet && styles.weekSheetListDesktop]}
            contentContainerStyle={styles.weekSheetListContent}
            keyboardShouldPersistTaps="always"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {weekOptions.map((opt) => {
              const active = opt.value === selectedWeekValue;
              const isCurrent = opt.start.getTime() === currentMonday.getTime();
              const range = formatWeekRangeLabel(opt.start);
              const count = opt.tripCount;
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
                      <View
                        style={[
                          styles.weekOptionCountBadge,
                          count > 0 && styles.weekOptionCountBadgeFilled,
                          active && styles.weekOptionCountBadgeActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.weekOptionCountText,
                            count > 0 && styles.weekOptionCountTextFilled,
                            active && styles.weekOptionCountTextActive,
                          ]}
                        >
                          {count} viaje{count === 1 ? "" : "s"}
                        </Text>
                      </View>
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
                  ) : (
                    <FontAwesome5 name="chevron-right" size={11} color="#d1d5db" />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    );

    if (Platform.OS === "web") {
      return <Portal>{sheetBody}</Portal>;
    }

    return (
      <Modal visible transparent animationType="fade" onRequestClose={closeWeekSheet}>
        {sheetBody}
      </Modal>
    );
  };

  const modalInputProps = {
    mode: "flat" as const,
    underlineColor: "transparent",
    activeUnderlineColor: "transparent",
    dense: !isCompactModal,
    contentStyle: [styles.modalInputContent, isCompactModal && styles.modalInputContentTouch],
    style: [styles.modalInput, isCompactModal && styles.modalInputTouch],
    placeholderTextColor: "#9ca3af",
    blurOnSubmit: true,
    returnKeyType: "done" as const,
    onSubmitEditing: () => dismissKeyboard(),
  };

  const renderFormSection = (title: string, children: React.ReactNode) => (
    <View style={[styles.formSection, isCompactModal && styles.formSectionTouch]}>
      <Text style={[styles.formSectionTitle, isCompactModal && styles.formSectionTitleMobile]}>{title}</Text>
      {children}
    </View>
  );

  const renderModalField = (label: string, field: React.ReactNode) => (
    <View style={[styles.modalFieldGroup, isCompactModal && styles.modalFieldGroupMobile]}>
      <Text style={[styles.modalFieldLabel, isCompactModal && styles.modalFieldLabelMobile]}>{label}</Text>
      {field}
    </View>
  );

  const renderFieldRow = (children: React.ReactNode) => (
    <View style={[styles.modalFieldRow, isCompactModal && styles.modalFieldRowStack]}>{children}</View>
  );

  const renderFieldHalf = (children: React.ReactNode) => (
    <View style={[styles.modalFieldHalf, isCompactModal && styles.modalFieldFull]}>{children}</View>
  );

  const webControlStyle = (extra?: Record<string, any>) =>
    ({
      padding: isCompactModal ? 12 : 10,
      borderRadius: isCompactModal ? 12 : 10,
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "#e5e7eb",
      backgroundColor: "#ffffff",
      width: "100%",
      maxWidth: "100%",
      fontSize: isCompactModal ? 16 : 14,
      fontWeight: "600",
      color: "#111111",
      height: isCompactModal ? 48 : 42,
      boxSizing: "border-box",
      outline: "none",
      ...extra,
    }) as any;

  const openSelectSheet = (
    title: string,
    value: string,
    options: SelectOption[],
    onChange: (value: string) => void,
    placeholder = "Seleccionar"
  ) => {
    dismissKeyboard();
    // Esperar a que el teclado baje antes de montar la hoja (móvil web/nativo)
    setTimeout(() => {
      setSelectSheet({ title, value, options, onChange, placeholder });
    }, Platform.OS === "web" ? 50 : 120);
  };

  const closeSelectSheet = () => setSelectSheet(null);

  const renderSelectField = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: SelectOption[],
    placeholder = "Seleccionar"
  ) => {
    const selectedLabel =
      options.find((opt) => opt.value === value)?.label || placeholder;
    // En escritorio web usamos <select>; en móvil siempre lista tippable
    const useNativeSelect = Platform.OS === "web" && !isCompactModal;

    return renderModalField(
      label,
      useNativeSelect ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          style={{
            ...webControlStyle(),
            appearance: "auto" as any,
            WebkitAppearance: "menulist" as any,
            MozAppearance: "menulist" as any,
          }}
        >
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <Pressable
          style={({ pressed }) => [
            styles.selectTrigger,
            isCompactModal && styles.selectTriggerTouch,
            pressed && styles.selectTriggerPressed,
          ]}
          onPress={() => {
            openSelectSheet(label, value, options, onChange, placeholder);
          }}
        >
          <Text
            style={[
              styles.selectTriggerText,
              isCompactModal && styles.selectTriggerTextTouch,
              !value && styles.selectTriggerPlaceholder,
            ]}
            numberOfLines={1}
          >
            {selectedLabel}
          </Text>
          <FontAwesome5 name="chevron-down" size={12} color="#6b7280" />
        </Pressable>
      )
    );
  };

  const renderInModalSelectSheet = () => {
    if (!selectSheet) return null;
    const items: SelectOption[] = [
      { label: selectSheet.placeholder, value: "" },
      ...selectSheet.options,
    ];

    return (
      <View style={styles.selectSheetOverlay} pointerEvents="box-none">
        <Pressable style={styles.selectSheetBackdrop} onPress={closeSelectSheet} />
        <View style={[styles.selectSheetCard, isCompactModal && styles.selectSheetCardTouch]}>
          <View style={styles.selectSheetHeader}>
            <Text style={styles.selectSheetTitle}>{selectSheet.title}</Text>
            <Pressable style={styles.selectSheetClose} onPress={closeSelectSheet}>
              <FontAwesome5 name="times" size={14} color="#6b7280" />
            </Pressable>
          </View>
          <ScrollView
            style={styles.selectSheetList}
            contentContainerStyle={styles.selectSheetListContent}
            keyboardShouldPersistTaps="always"
            nestedScrollEnabled
          >
            {items.map((item, index) => {
              const active = item.value === selectSheet.value;
              return (
                <Pressable
                  key={`${item.value || "empty"}-${index}`}
                  style={({ pressed }) => [
                    styles.selectSheetItem,
                    active && styles.selectSheetItemActive,
                    pressed && styles.selectSheetItemPressed,
                  ]}
                  onPress={() => {
                    selectSheet.onChange(item.value);
                    closeSelectSheet();
                  }}
                >
                  <Text
                    style={[
                      styles.selectSheetItemText,
                      active && styles.selectSheetItemTextActive,
                      !item.value && styles.selectTriggerPlaceholder,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {active ? <FontAwesome5 name="check" size={12} color="#111111" /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    );
  };

  const openPicker = (cfg: {
    mode: "date" | "time";
    initial: Date;
    apply: (d: Date) => void;
    title: string;
  }) => {
    dismissKeyboard();
    setPickerTemp(cfg.initial);
    setActivePicker({ mode: cfg.mode, apply: cfg.apply, title: cfg.title });
  };

  const renderPickerOverlay = () => {
    if (!activePicker || Platform.OS === "web") return null;
    const close = () => setActivePicker(null);

    // Android: el diálogo nativo se muestra y cierra solo.
    if (Platform.OS === "android") {
      return (
        <DateTimePicker
          value={pickerTemp}
          mode={activePicker.mode}
          display="default"
          is24Hour
          onChange={(event: any, d?: Date) => {
            close();
            if (event?.type === "dismissed") return;
            if (d) activePicker.apply(d);
          }}
        />
      );
    }

    // iOS: overlay propio (un Modal anidado quedaría oculto detrás del modal del viaje).
    return (
      <View style={styles.pickerOverlay}>
        <Pressable style={styles.pickerBackdrop} onPress={close} />
        <View style={styles.pickerCard}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle} numberOfLines={1}>
              {activePicker.title}
            </Text>
            <Pressable
              style={styles.iosPickerDone}
              onPress={() => {
                activePicker.apply(pickerTemp);
                close();
              }}
            >
              <Text style={styles.iosPickerDoneText}>Listo</Text>
            </Pressable>
          </View>
          <DateTimePicker
            value={pickerTemp}
            mode={activePicker.mode}
            display="spinner"
            is24Hour
            themeVariant="light"
            textColor="#111111"
            style={styles.iosPicker}
            onChange={(_event: any, d?: Date) => {
              if (d) setPickerTemp(d);
            }}
          />
        </View>
      </View>
    );
  };

  const renderDateTimeField = (
    label: string,
    dateValue: string,
    timeValue: string,
    onDateChange: (formatted: string) => void,
    onTimeChange: (formatted: string) => void
  ) => {
    const touchLike = isCompactModal || isNarrowList || isMobile;

    const openNativePicker = (el: HTMLInputElement | null) => {
      if (!el) return;
      try {
        // Chrome / Safari moderno
        (el as any).showPicker?.();
      } catch {
        el.focus();
        el.click();
      }
    };

    // Web: siempre UI custom (botón a 100%). El input nativo va transparente
    // encima; así la hora no se corta como con <input type="time"> visible.
    if (Platform.OS === "web") {
      return renderModalField(
        label,
        <View
          style={styles.dateTimeStackWeb}
          {...{
            onClick: (e: any) => e.stopPropagation(),
            onMouseDown: (e: any) => e.stopPropagation(),
          }}
        >
          <View style={styles.webDateTimeFieldStacked}>
            <Text style={styles.webDateTimeHint}>Fecha</Text>
            <View
              style={[
                styles.dateTimeHitBox,
                touchLike && styles.dateTimeHitBoxTouch,
              ]}
            >
              <FontAwesome5 name="calendar-alt" size={15} color="#6b7280" />
              <Text
                style={[
                  styles.dateTimeHitText,
                  !dateValue && styles.selectTriggerPlaceholder,
                ]}
                numberOfLines={1}
              >
                {dateValue || "Seleccionar fecha"}
              </Text>
              <input
                type="date"
                value={toInputDateValue(dateValue)}
                onChange={(e) => {
                  if (!e.target.value) {
                    onDateChange("");
                    return;
                  }
                  const [year, month, day] = e.target.value.split("-");
                  onDateChange(`${day}/${month}/${year}`);
                }}
                onFocus={() => dismissKeyboard()}
                onClick={(e) => {
                  e.stopPropagation();
                  dismissKeyboard();
                  openNativePicker(e.currentTarget);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                style={styles.webNativePickerOverlay as any}
                aria-label={`${label} fecha`}
              />
            </View>
          </View>

          <View style={styles.webDateTimeFieldStacked}>
            <Text style={styles.webDateTimeHint}>Hora</Text>
            <View
              style={[
                styles.dateTimeHitBox,
                touchLike && styles.dateTimeHitBoxTouch,
              ]}
            >
              <FontAwesome5 name="clock" size={15} color="#6b7280" />
              <Text
                style={[
                  styles.dateTimeHitText,
                  !timeValue && styles.selectTriggerPlaceholder,
                ]}
                numberOfLines={1}
              >
                {timeValue || "Seleccionar hora"}
              </Text>
              <input
                type="time"
                value={timeValue || ""}
                onChange={(e) => {
                  const raw = e.target.value || "";
                  onTimeChange(raw.slice(0, 5));
                }}
                onFocus={() => dismissKeyboard()}
                onClick={(e) => {
                  e.stopPropagation();
                  dismissKeyboard();
                  openNativePicker(e.currentTarget);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                style={styles.webNativePickerOverlay as any}
                aria-label={`${label} hora`}
              />
            </View>
          </View>
        </View>
      );
    }

    return renderModalField(
      label,
      <View style={styles.dateTimeStackWeb}>
        <Pressable
          style={[styles.dateTimeHitBox, touchLike && styles.dateTimeHitBoxTouch]}
          onPress={() =>
            openPicker({
              mode: "date",
              initial: parseDate(dateValue) || new Date(),
              apply: (d) => onDateChange(formatDateDisplay(d)),
              title: `${label} · fecha`,
            })
          }
        >
          <FontAwesome5 name="calendar-alt" size={15} color="#6b7280" />
          <Text
            style={[styles.dateTimeHitText, !dateValue && styles.selectTriggerPlaceholder]}
            numberOfLines={1}
          >
            {dateValue || "Seleccionar fecha"}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.dateTimeHitBox, touchLike && styles.dateTimeHitBoxTouch]}
          onPress={() =>
            openPicker({
              mode: "time",
              initial: timeValue
                ? combineDateTime(dateValue || formatDateDisplay(new Date()), timeValue) ||
                  new Date()
                : new Date(),
              apply: (d) => onTimeChange(formatTimeDisplay(d)),
              title: `${label} · hora`,
            })
          }
        >
          <FontAwesome5 name="clock" size={15} color="#6b7280" />
          <Text
            style={[styles.dateTimeHitText, !timeValue && styles.selectTriggerPlaceholder]}
            numberOfLines={1}
          >
            {timeValue || "Seleccionar hora"}
          </Text>
        </Pressable>
      </View>
    );
  };

  const renderTravelTimeCard = (tiempo = tiempoTrayecto) => (
    <View style={[styles.travelTimeCard, isCompactModal && styles.travelTimeCardTouch, tiempo.live && styles.travelTimeCardLive]}>
      <View style={styles.travelTimeHeader}>
        <View style={styles.travelTimeHeaderLeft}>
          <FontAwesome5 name="stopwatch" size={isCompactModal ? 16 : 14} color={tiempo.live ? "#059669" : "#111111"} />
          <Text style={styles.travelTimeTitle}>Tiempo estimado</Text>
        </View>
        {tiempo.live && <View style={styles.liveDot} />}
      </View>
      <Text style={[styles.travelTimeValue, isCompactModal && styles.travelTimeValueTouch, tiempo.live && styles.travelTimeValueLive]}>
        {tiempo.value}
      </Text>
      <Text style={styles.travelTimeHint}>{tiempo.hint}</Text>
    </View>
  );

  const renderYesNoToggle = (
    label: string,
    value: boolean,
    onChange: (next: boolean) => void
  ) =>
    renderModalField(
      label,
      <View style={styles.yesNoRow}>
        {[
          { label: "No", active: !value, next: false },
          { label: "Sí", active: value, next: true },
        ].map((opt) => (
          <TouchableOpacity
            key={opt.label}
            style={[styles.yesNoOption, opt.active && styles.yesNoOptionActive]}
            onPress={() => {
              onChange(opt.next);
              if (opt.next) {
                setDestinosExtras((prev) => (prev.length > 0 ? prev : [emptyDestinoExtra()]));
              } else {
                setDestinosExtras([]);
                setActivePicker(null);
              }
            }}
            activeOpacity={0.85}
          >
            <Text style={[styles.yesNoOptionText, opt.active && styles.yesNoOptionTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );

  function renderModalContent() {
    const isHojaOnly =
      Boolean(editingTrip) && (!isAdmin || !adminShowForm);

    if (isHojaOnly && editingTrip) {
      const hojaBody = (
        <View
          style={[styles.modalCard, isCompactModal && styles.modalCardTouch, styles.hojaModalCard]}
          {...(Platform.OS === "web" ? { onClick: (e: any) => e.stopPropagation() } : {})}
        >
          <View style={styles.hojaModalTop}>
            <TouchableOpacity
              style={[styles.modalCloseButton, isCompactModal && styles.modalCloseButtonTouch]}
              onPress={closeModal}
              disabled={saving}
              activeOpacity={0.85}
            >
              <FontAwesome5 name="times" size={isCompactModal ? 16 : 14} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <View style={isCompactModal ? styles.modalBodyWrapTouch : styles.modalBodyWrap}>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={[
                styles.modalScrollContent,
                isCompactModal && styles.modalScrollContentTouch,
                styles.hojaScrollContent,
              ]}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="always"
              nestedScrollEnabled
              bounces
            >
              {renderTripDetailSheet(editingTrip)}
            </ScrollView>
          </View>

          <View style={[styles.modalActions, styles.hojaModalActions, isCompactModal && styles.modalActionsTouch]}>
            {!isAdmin ? (
              <>
                {editingTrip && toId(editingTrip.conductorId) === myUserId ? (
                  <View style={styles.operadorStickyActions}>
                    {renderOperadorActions(editingTrip)}
                  </View>
                ) : (
                  <Text style={styles.companionHintModal}>
                    {editingTrip && isCompanionOnTrip(editingTrip)
                      ? "Vas como acompañante · solo puedes consultar el viaje"
                      : "Solo lectura"}
                  </Text>
                )}
                <Pressable
                  style={({ pressed }) => [
                    styles.hojaSecondaryBtn,
                    pressed && styles.actionButtonPressed,
                  ]}
                  onPress={closeModal}
                  disabled={saving}
                >
                  <Text style={styles.hojaSecondaryBtnText}>Cerrar</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  style={({ pressed }) => [
                    styles.hojaPrimaryBtn,
                    pressed && styles.actionButtonPressed,
                  ]}
                  onPress={() => setAdminShowForm(true)}
                >
                  <FontAwesome5 name="edit" size={13} color="#ffffff" />
                  <Text style={styles.hojaPrimaryBtnText}>Editar viaje</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.hojaSecondaryBtn,
                    pressed && styles.actionButtonPressed,
                  ]}
                  onPress={closeModal}
                  disabled={saving}
                >
                  <Text style={styles.hojaSecondaryBtnText}>Cerrar</Text>
                </Pressable>
              </>
            )}
          </View>
          {renderInModalSelectSheet()}
        </View>
      );

      if (isCompactModal) {
        return (
          <SafeAreaView style={styles.modalSafeArea} edges={["top", "bottom"]}>
            {hojaBody}
          </SafeAreaView>
        );
      }
      return hojaBody;
    }

    const modalBody = (
      <View
        style={[styles.modalCard, isCompactModal && styles.modalCardTouch]}
        {...(Platform.OS === "web" ? { onClick: (e: any) => e.stopPropagation() } : {})}
      >
        {isCompactModal && <View style={styles.modalDragHandle} />}

        <View style={[styles.modalHeader, isCompactModal && styles.modalHeaderTouch]}>
          <View style={styles.modalHeaderLeft}>
            <View style={[styles.modalIconBadge, isCompactModal && styles.modalIconBadgeTouch]}>
              <FontAwesome5 name="route" size={isCompactModal ? 18 : 16} color="#ffffff" />
            </View>
            <View style={styles.modalHeaderTextWrap}>
              <Text style={[styles.modalTitle, isCompactModal && styles.modalTitleTouch]}>
                {isAdmin
                  ? editingTrip
                    ? "Editar Viaje"
                    : "Nuevo Viaje"
                  : "Detalle del viaje"}
              </Text>
              <Text style={styles.modalSubtitle}>
                {isAdmin
                  ? editingTrip
                    ? "Actualiza la información del viaje"
                    : "Completa los datos para registrar el viaje"
                  : "Consulta la información del viaje"}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.modalCloseButton, isCompactModal && styles.modalCloseButtonTouch]}
            onPress={closeModal}
            disabled={saving}
            activeOpacity={0.85}
          >
            <FontAwesome5 name="times" size={isCompactModal ? 16 : 14} color="#6b7280" />
          </TouchableOpacity>
        </View>

        <View style={isCompactModal ? styles.modalBodyWrapTouch : styles.modalBodyWrap}>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={[
              styles.modalScrollContent,
              isCompactModal && styles.modalScrollContentTouch,
            ]}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="on-drag"
            nestedScrollEnabled
            bounces
          >
            {isAdmin ? (
              <>
                {editingTrip && adminShowForm ? (
                  <TouchableOpacity
                    style={styles.sheetBackToDocBtn}
                    onPress={() => setAdminShowForm(false)}
                    activeOpacity={0.85}
                  >
                    <FontAwesome5 name="file-alt" size={13} color="#111111" />
                    <Text style={styles.sheetBackToDocBtnText}>Ver hoja de viaje</Text>
                  </TouchableOpacity>
                ) : null}

                {renderFormSection(
                  "Información general",
                  <>
                    {renderModalField(
                      "Ruta a cubrir",
                      <TextInput value={rutaAcubrir} onChangeText={setRutaAcubrir} placeholder="Ej. CDMX - Guadalajara" {...modalInputProps} />
                    )}
                    {renderSelectField(
                      "Unidad",
                      unidadId,
                      handleUnidadChange,
                      units.map((u) => ({ label: formatUnitLabel(u), value: u.id })),
                      "Seleccionar unidad"
                    )}
                    {editingTrip && selectedUnit ? (
                      <View style={styles.unitDetailRow}>
                        <UnitPhoto uri={selectedUnit.imagenUrl} />
                        <View style={styles.unitDetailText}>
                          <Text style={styles.unitDetailName}>
                            {formatUnitLabel(selectedUnit)}
                          </Text>
                          <Text style={styles.unitDetailPlaca}>Vista de la unidad</Text>
                        </View>
                      </View>
                    ) : null}
                    {mostrarRemolque && (
                      <View style={styles.remolqueBox}>
                        <Text style={styles.remolqueHint}>
                          Tractor {selectedUnit?.nombre || ""} — selecciona el remolque (Lowboy o Caja Seca) y su placa
                        </Text>
                        {renderFieldRow(
                          <>
                            {renderFieldHalf(
                              renderSelectField(
                                "Tipo remolque",
                                tipoRemolque,
                                (value) => {
                                  setTipoRemolque(value);
                                  if (!value) setPlacaRemolque("");
                                },
                                REMOLQUE_OPTIONS,
                                "Seleccionar Lowboy / Caja Seca"
                              )
                            )}
                            {(tipoRemolque === "Lowboy" || tipoRemolque === "Caja Seca") &&
                              renderFieldHalf(
                                renderModalField(
                                  "Placa del remolque",
                                  <TextInput
                                    value={placaRemolque}
                                    onChangeText={setPlacaRemolque}
                                    placeholder="Placa remolque"
                                    {...modalInputProps}
                                  />
                                )
                              )}
                          </>
                        )}
                      </View>
                    )}
                    {renderFieldRow(
                      <>
                        {renderFieldHalf(
                          renderSelectField(
                            "Operador",
                            conductorId,
                            setConductorId,
                            (operadores.length > 0 ? operadores : users).map((u) => ({
                              label: `${u.nombre}${u.apellido ? ` ${u.apellido}` : ""}`.trim(),
                              value: u.id,
                            })),
                            "Selecciona operador"
                          )
                        )}
                        {renderFieldHalf(
                          renderSelectField(
                            "Acompañante",
                            acompanante,
                            setAcompanante,
                            [
                              { label: "Sin acompañante", value: "none" },
                              ...acompanantesOptions.map((u) => ({
                                label: `${u.nombre}${u.apellido ? ` ${u.apellido}` : ""}`.trim(),
                                value: u.id,
                              })),
                            ],
                            "Selecciona acompañante"
                          )
                        )}
                      </>
                    )}
                  </>
                )}

                {renderFormSection(
                  "Destino y carga",
                  <>
                    {renderFieldRow(
                      <>
                        {renderFieldHalf(
                          renderModalField(
                            "DEF entregado",
                            <TextInput value={def} onChangeText={setDef} placeholder="0" keyboardType="numeric" {...modalInputProps} />
                          )
                        )}
                        {renderFieldHalf(
                          renderModalField(
                            "Destino",
                            <TextInput
                              value={destino}
                              onChangeText={setDestino}
                              placeholder="Ej. Guadalajara, CDMX..."
                              {...modalInputProps}
                            />
                          )
                        )}
                      </>
                    )}
                  </>
                )}

                {renderFormSection(
                  "Kilometraje",
                  renderFieldRow(
                    <>
                      {renderFieldHalf(
                        renderModalField(
                          "KM Salida",
                          <TextInput
                            value={kmSalidaManual}
                            onChangeText={setKmSalidaManual}
                            placeholder="0"
                            keyboardType="numeric"
                            left={<TextInput.Icon icon="speedometer" />}
                            {...modalInputProps}
                          />
                        )
                      )}
                      {renderFieldHalf(
                        renderModalField(
                          "KM Llegada",
                          <TextInput
                            value={kmLlegadaManual}
                            onChangeText={setKmLlegadaManual}
                            placeholder="0"
                            keyboardType="numeric"
                            left={<TextInput.Icon icon="speedometer" />}
                            {...modalInputProps}
                          />
                        )
                      )}
                    </>
                  )
                )}

                {renderFormSection(
                  "Fechas y tiempo",
                  <View style={styles.fechasSection}>
                    <View style={styles.fechaBlock}>
                      {renderDateTimeField(
                        "Fecha y hora de salida",
                        fechaSalida,
                        horaSalida,
                        handleFechaSalidaChange,
                        handleHoraSalidaChange
                      )}
                    </View>
                    <View style={styles.fechaBlock}>
                      {renderDateTimeField(
                        "Tiempo estimado de llegada (opcional)",
                        fechaLlegada,
                        horaLlegada,
                        handleFechaLlegadaChange,
                        handleHoraLlegadaChange
                      )}
                      <Text style={styles.fechaAutoHint}>
                        Solo estimado. El viaje queda pendiente para el operador; no se marca como completado.
                      </Text>
                    </View>
                    {renderTravelTimeCard()}
                    {renderYesNoToggle("¿Multidestino?", multidestino, setMultidestino)}
                  </View>
                )}

                {multidestino &&
                  renderFormSection(
                    "Destinos adicionales",
                    <>
                      {destinosExtras.map((extra, index) => (
                        <View key={`destino-extra-${index}`} style={styles.destinoExtraCard}>
                          <View style={styles.destinoExtraHeader}>
                            <Text style={styles.destinoExtraTitle}>Destino #{index + 1}</Text>
                            {destinosExtras.length > 1 && (
                              <TouchableOpacity
                                style={styles.removeDestinoBtn}
                                onPress={() => removeDestinoExtra(index)}
                                activeOpacity={0.85}
                              >
                                <FontAwesome5 name="trash-alt" size={12} color="#dc2626" />
                              </TouchableOpacity>
                            )}
                          </View>

                          {renderDateTimeField(
                            "Fecha y hora de salida",
                            extra.fechaSalida,
                            extra.horaSalida,
                            (v) => updateDestinoExtraAt(index, { fechaSalida: v }),
                            (v) => updateDestinoExtraAt(index, { horaSalida: v })
                          )}
                          {renderDateTimeField(
                            "Llegada estimada (opcional)",
                            extra.fechaLlegada,
                            extra.horaLlegada,
                            (v) => updateDestinoExtraAt(index, { fechaLlegada: v }),
                            (v) => updateDestinoExtraAt(index, { horaLlegada: v })
                          )}

                          {renderModalField(
                            "Destino",
                            <TextInput
                              value={extra.destino}
                              onChangeText={(v) => updateDestinoExtraAt(index, { destino: v })}
                              placeholder="Ej. Monterrey, Querétaro..."
                              {...modalInputProps}
                            />
                          )}

                          {renderFieldRow(
                            <>
                              {renderFieldHalf(
                                renderSelectField(
                                  "Operador",
                                  extra.conductorId,
                                  (v) => updateDestinoExtraAt(index, { conductorId: v }),
                                  (operadores.length > 0 ? operadores : users).map((u) => ({
                                    label: `${u.nombre}${u.apellido ? ` ${u.apellido}` : ""}`.trim(),
                                    value: u.id,
                                  })),
                                  "Selecciona operador"
                                )
                              )}
                              {renderFieldHalf(
                                renderSelectField(
                                  "Acompañante",
                                  extra.acompanante,
                                  (v) => updateDestinoExtraAt(index, { acompanante: v }),
                                  [
                                    { label: "Sin acompañante", value: "none" },
                                    ...acompanantesOptions.map((u) => ({
                                      label: `${u.nombre}${u.apellido ? ` ${u.apellido}` : ""}`.trim(),
                                      value: u.id,
                                    })),
                                  ],
                                  "Selecciona acompañante"
                                )
                              )}
                            </>
                          )}

                          {renderSelectField(
                            "Unidad",
                            extra.unidadId,
                            (v) => updateDestinoExtraAt(index, { unidadId: v }),
                            units.map((u) => ({ label: formatUnitLabel(u), value: u.id })),
                            "Seleccionar unidad"
                          )}

                          {renderFieldRow(
                            <>
                              {renderFieldHalf(
                                renderModalField(
                                  "KM Salida",
                                  <TextInput
                                    value={extra.kmSalida}
                                    onChangeText={(v) => updateDestinoExtraAt(index, { kmSalida: v })}
                                    placeholder="0"
                                    keyboardType="numeric"
                                    left={<TextInput.Icon icon="speedometer" />}
                                    {...modalInputProps}
                                  />
                                )
                              )}
                              {renderFieldHalf(
                                renderModalField(
                                  "KM Llegada",
                                  <TextInput
                                    value={extra.kmLlegada}
                                    onChangeText={(v) => updateDestinoExtraAt(index, { kmLlegada: v })}
                                    placeholder="0"
                                    keyboardType="numeric"
                                    left={<TextInput.Icon icon="speedometer" />}
                                    {...modalInputProps}
                                  />
                                )
                              )}
                            </>
                          )}

                          {renderTravelTimeCard(getTiempoExtra(extra))}
                        </View>
                      ))}

                      <TouchableOpacity
                        style={styles.addDestinoBtn}
                        onPress={addDestinoExtra}
                        activeOpacity={0.85}
                      >
                        <FontAwesome5 name="plus" size={12} color="#ffffff" />
                        <Text style={styles.addDestinoBtnText}>Agregar otro destino</Text>
                      </TouchableOpacity>
                    </>
                  )}
              </>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Completa el formulario para registrar el viaje.</Text>
              </View>
            )}
          </ScrollView>
        </View>

        <View style={[styles.modalActions, isCompactModal && styles.modalActionsTouch]}>
          {isCompactModal ? (
            <>
              <Pressable
                style={({ pressed }) => [
                  styles.hojaPrimaryBtn,
                  saving && styles.saveButtonDisabled,
                  pressed && styles.actionButtonPressed,
                ]}
                onPress={() => {
                  void saveTrip();
                }}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.hojaPrimaryBtnText}>Guardar</Text>
                )}
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.hojaSecondaryBtn,
                  pressed && styles.actionButtonPressed,
                ]}
                onPress={closeModal}
                disabled={saving}
              >
                <Text style={styles.hojaSecondaryBtnText}>Cancelar</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                style={({ pressed }) => [
                  styles.cancelButton,
                  pressed && styles.actionButtonPressed,
                ]}
                onPress={closeModal}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </Pressable>
              {isAdmin && (
                <Pressable
                  style={({ pressed }) => [
                    styles.saveButton,
                    saving && styles.saveButtonDisabled,
                    pressed && styles.actionButtonPressed,
                  ]}
                  onPress={() => {
                    void saveTrip();
                  }}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel="Guardar viaje"
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
                </Pressable>
              )}
            </>
          )}
        </View>
        {renderInModalSelectSheet()}
      </View>
    );

    if (isCompactModal) {
      return (
        <SafeAreaView style={styles.modalSafeArea} edges={["top", "bottom"]}>
          {modalBody}
        </SafeAreaView>
      );
    }

    return modalBody;
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
            {isOperador ? (isAyudante ? "Mis viajes (acompañante)" : "Mis viajes") : "Viajes Registrados"}
          </Text>
          <Text style={styles.subtitle}>
            {isOperador
              ? isAyudante
                ? "Viajes donde vas asignado como acompañante"
                : "Solo tus viajes asignados como operador"
              : "Rutas, conductores y estado de cada viaje"}
          </Text>
        </View>
      </View>

      {isAdmin ? (
        <View style={styles.toolbarPanel}>
          <View style={styles.toolbarActions}>
            <TouchableOpacity style={[styles.addButton, isNarrowList && styles.addButtonMobile]} onPress={() => openModal()} activeOpacity={0.85}>
              <FontAwesome5 name="plus" size={14} color="#ffffff" />
              <Text style={styles.addButtonText}>Nuevo Viaje</Text>
            </TouchableOpacity>
          </View>

          {!isNarrowList ? (
            <View style={styles.toolbarFiltersRow}>
              <View style={styles.filterBlock}>
                <Text style={styles.toolbarLabel}>Periodo exportar</Text>
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

                <TouchableOpacity style={styles.exportButton} onPress={exportToExcel} activeOpacity={0.85}>
                  <FontAwesome5 name="file-excel" size={14} color="#111111" />
                  <Text style={styles.exportButtonText}>Exportar Excel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.toolbarRightActionsMobile}>
              <View style={styles.filterBlock}>
                <Text style={styles.toolbarLabel}>Periodo exportar</Text>
                <View style={[styles.segmentedControl, styles.segmentedControlMobile]}>
                  {exportOptions.map((opt) => {
                    const isActive = exportType === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[styles.filterPill, styles.filterPillMobile, isActive && styles.filterPillActive]}
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
              <TouchableOpacity style={[styles.exportButton, styles.exportButtonMobile]} onPress={exportToExcel} activeOpacity={0.85}>
                <FontAwesome5 name="file-excel" size={14} color="#111111" />
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
      ) : null}

      <View style={[styles.listPanel, isNarrowList && styles.listPanelNarrow]}>
        {!loading && !loadError && (
          <View style={[styles.listHeader, isNarrowList && styles.listHeaderMobile]}>
            <Text style={styles.listHeaderTitle}>
              {displayedTrips.length} viaje{displayedTrips.length === 1 ? "" : "s"}
            </Text>
            <Text style={[styles.listHeaderHint, isNarrowList && styles.listHeaderHintMobile]}>
              {isAdmin ? weekLabel : "Tus viajes asignados"}
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
        ) : displayedTrips.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome5 name="calendar-week" size={22} color="#9ca3af" />
            <Text style={styles.emptyTitle}>Sin viajes esta semana</Text>
            <Text style={styles.emptyText}>
              Elige otra semana en el selector para ver más resultados.
            </Text>
          </View>
        ) : (
          <View style={styles.tripsStack}>
            {displayedTrips.map((item) => (
              <View key={item.id} style={styles.tripStackItem}>
                {renderItem({ item })}
              </View>
            ))}
          </View>
        )}
      </View>
      </ScrollView>

      {isAdmin ? renderWeekSelectSheet() : null}
      {renderStartChecklistModal()}
      {renderFinishChecklistModal()}
      {renderDeleteConfirmModal()}

      {Platform.OS === "web" && modalVisible ? (
        <Portal>
          <View
            style={[styles.webModalOverlay, isCompactModal && styles.webModalOverlayTouch]}
            {...(Platform.OS === "web" ? { onClick: closeModal } : {})}
          >
            {renderModalContent()}
          </View>
        </Portal>
      ) : (
        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent={!isCompactModal}
          presentationStyle={isCompactModal ? "fullScreen" : "pageSheet"}
          onRequestClose={closeModal}
        >
          <View style={[styles.modalContainer, isCompactModal && styles.modalContainerTouch]}>
            {renderModalContent()}
            {/* Checklist sobre el detalle: evita Modal anidado que en iOS queda oculto */}
            {checklistTrip ? renderChecklistOverlay(true) : null}
            {finishChecklistTrip ? renderFinishChecklistOverlay(true) : null}
            {/* Selector de fecha/hora: overlay a nivel del modal (Modal anidado se oculta en iOS) */}
            {renderPickerOverlay()}
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1,paddingVertical: 4,backgroundColor: "transparent",},
  containerNarrow: { marginHorizontal: -6 },
  pageScroll: { flex: 1, minHeight: 0 },
  pageScrollContent: { paddingBottom: 28, flexGrow: 1 },
  pageScrollContentNarrow: { paddingBottom: 40 },
  pageHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16,},
  pageHeaderText: { flex: 1, paddingRight: 12 },
  pageTitle: { fontSize: 24, fontWeight: "800", color: "#111111", letterSpacing: 0.2 },
  pageTitleMobile: { fontSize: 22 },
  subtitle: { fontSize: 13, color: "#6b7280", marginTop: 4 },
  toolbarPanel: {backgroundColor: "#ffffff",borderRadius: 14,borderWidth: 1,borderColor: "#e5e7eb",padding: 14,marginBottom: 14,gap: 12,...(Platform.OS === "web"  ? { boxShadow: "0 8px 24px rgba(0,0,0,0.04)" as any } : {}),},
  toolbarActions: { flexDirection: "row", alignItems: "center" },
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
  toolbarFiltersRowOperador: { borderTopWidth: 0, paddingTop: 0 },
  filterBlock: { flex: 1, minWidth: 0 },
  toolbarLabel: {fontSize: 11, fontWeight: "700",color: "#9ca3af",textTransform: "uppercase",letterSpacing: 0.5,marginBottom: 8,},
  segmentedControl: {flexDirection: "row",alignSelf: "flex-start",backgroundColor: "#f3f4f6",borderRadius: 999,padding: 4,gap: 4,},
  segmentedControlMobile: { alignSelf: "stretch", justifyContent: "space-between" },
  filterPill: {paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999, ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),},
  filterPillMobile: { flex: 1, alignItems: "center", paddingHorizontal: 10, paddingVertical: 10 },
  filterPillActive: { backgroundColor: "#111111" },
  filterPillText: { fontSize: 12, fontWeight: "700", color: "#6b7280" },
  filterPillTextActive: { color: "#ffffff" },
  addButton: {flexDirection: "row",alignItems: "center",justifyContent: "center",gap: 8,backgroundColor: "#111111",paddingVertical: 12,paddingHorizontal: 18,borderRadius: 999,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const, alignSelf: "flex-start" as const } : {}),
  },
  addButtonMobile: { width: "100%", alignSelf: "stretch" as const, paddingVertical: 14 },
  addButtonText:{color: "#ffffff", fontWeight: "700", fontSize: 14 },
  exportButton:{flexDirection: "row",alignItems: "center",justifyContent: "center",gap: 8,paddingVertical: 12,paddingHorizontal: 16, borderRadius: 999,borderWidth: 1.5,borderColor: "#111111",backgroundColor: "#ffffff",flexShrink: 0,minHeight: 44,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  exportButtonMobile: { width: "100%" },
  exportButtonText: { color: "#111111", fontWeight: "700", fontSize: 14 },
  listPanel: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    width: "100%",
    alignSelf: "stretch",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 8px 24px rgba(0,0,0,0.04)" as any }
      : {}),
  },
  listPanelNarrow: { paddingHorizontal: 10, paddingVertical: 12, borderRadius: 12 },
  listHeader: {flexDirection: "row",alignItems: "center",justifyContent: "space-between",paddingBottom: 12,marginBottom: 12,borderBottomWidth: 1,borderBottomColor: "#f3f4f6", },
  listHeaderMobile: { flexDirection: "column", alignItems: "flex-start", gap: 4 },
  listHeaderTitle: { fontSize: 14, fontWeight: "700", color: "#111111" },
  listHeaderHint: { fontSize: 12, color: "#9ca3af", fontWeight: "600" },
  listHeaderHintMobile: { fontSize: 12 },
  tripsStack: { width: "100%", gap: 12, paddingBottom: 8 },
  tripStackItem: { width: "100%", alignSelf: "stretch" },
  emptyState: { paddingVertical: 48,paddingHorizontal: 20,alignItems: "center",gap: 8,},
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#111111" },
  emptyText: { fontSize: 14, color: "#64748b", textAlign: "center" },
  retryButton: {marginTop: 8,backgroundColor: "#111111",paddingHorizontal: 16,paddingVertical: 10,borderRadius: 999,   ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}), },
  retryButtonText: { color: "#fff", fontWeight: "700" },
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
  cardSlot: { width: "100%", alignSelf: "stretch" },
  cardFullWidth: {
    width: "100%",
    maxWidth: "100%" as any,
    alignSelf: "stretch",
    flexGrow: 0,
  },
  cardMobileCompact: {
    padding: 14,
    backgroundColor: "#ffffff",
  },
  cardTitleMobileCompact: {
    fontSize: 16,
    lineHeight: 22,
  },
  mobileDestinoBlock: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  mobileDestinoValue: {
    fontSize: 15,
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
  mobileRepeatBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#111111",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 46,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  mobileRepeatBtnText: {
    color: "#111111",
    fontWeight: "700",
    fontSize: 13,
  },
  fechaAutoHint: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "600",
    color: "#9ca3af",
  },
  unitDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  unitDetailPhoto: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
  },
  unitDetailPhotoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  unitDetailText: { flex: 1, minWidth: 0 },
  unitDetailName: { fontSize: 14, fontWeight: "800", color: "#111111" },
  unitDetailPlaca: { fontSize: 12, fontWeight: "600", color: "#6b7280", marginTop: 2 },
  cardOperadorMobile: { padding: 14 },
  cardFieldStaff: {
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  cardCompanion: {
    borderColor: "#99f6e4",
    backgroundColor: "#f0fdfa",
  },
  roleTripBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ccfbf1",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  roleTripBadgeOperador: {
    backgroundColor: "#dbeafe",
  },
  roleTripBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0f766e",
  },
  roleTripBadgeTextOperador: {
    color: "#1d4ed8",
  },
  companionHint: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#0f766e",
  },
  companionHintModal: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0f766e",
    textAlign: "center",
    paddingVertical: 8,
  },
  cardIconWrap: {width: 44,height: 44,borderRadius: 12,backgroundColor: "#ffffff",borderWidth: 1,borderColor: "#e5e7eb",alignItems: "center",justifyContent: "center",},
  cardBody: { flex: 1, minWidth: 0 },
  cardHeader: {flexDirection: "row",alignItems: "center",justifyContent: "space-between",gap: 8,marginBottom: 10,},
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#111111", flex: 1 },
  cardTitleOperador: { fontSize: 17, lineHeight: 22 },
  estadoBadge: {flexDirection: "row",alignItems: "center",gap: 5,paddingHorizontal: 10,paddingVertical: 5,borderRadius: 999, },
  estadoPendiente: { backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fde68a" },
  estadoProgreso: { backgroundColor: "#eff6ff", borderWidth: 1, borderColor: "#bfdbfe" },
  estadoParada: { backgroundColor: "#f5f3ff", borderWidth: 1, borderColor: "#ddd6fe" },
  estadoCompletado: { backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#a7f3d0" },
  estadoText: { fontSize: 11, fontWeight: "700" },
  estadoTextPendiente: { color: "#d97706" },
  estadoTextProgreso: { color: "#2563eb" },
  estadoTextParada: { color: "#7c3aed" },
  estadoTextCompletado: { color: "#059669" },
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
    letterSpacing: 0.45,
    marginBottom: 2,
  },
  weekSelectValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111111",
  },
  weekSelectChevron: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  weekSheetOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 90,
    justifyContent: "flex-end",
    alignItems: "stretch",
    ...(Platform.OS === "web"
      ? {
          position: "fixed" as any,
          width: "100vw" as any,
          height: "100dvh" as any,
        }
      : {}),
  },
  weekSheetOverlayDesktop: {
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  weekSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(17, 24, 39, 0.45)",
    ...(Platform.OS === "web" ? { backdropFilter: "blur(2px)" as any } : {}),
  },
  weekSheetCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
    zIndex: 91,
  },
  weekSheetCardMobile: {
    width: "100%",
    maxHeight: "78%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
    paddingBottom: Platform.OS === "ios" ? 10 : 6,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 -12px 40px rgba(0,0,0,0.16)" as any }
      : {
          shadowColor: "#000",
          shadowOpacity: 0.18,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: -6 },
          elevation: 16,
        }),
  },
  weekSheetCardDesktop: {
    width: "100%",
    maxWidth: 420,
    maxHeight: 520,
    borderRadius: 18,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 24px 60px rgba(0,0,0,0.22)" as any }
      : {
          shadowColor: "#000",
          shadowOpacity: 0.2,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 12 },
          elevation: 20,
        }),
  },
  weekSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  weekSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  weekSheetHeaderDesktop: {
    paddingTop: 16,
    paddingHorizontal: 18,
  },
  weekSheetHeaderText: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  weekSheetIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },
  weekSheetTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111111",
    letterSpacing: 0.1,
  },
  weekSheetSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9ca3af",
    marginTop: 1,
  },
  weekSheetClose: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
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
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "transparent",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  weekOptionRowHover: { backgroundColor: "#f9fafb" },
  weekOptionRowActive: {
    backgroundColor: "#f3f4f6",
    borderColor: "#e5e7eb",
  },
  weekOptionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#e5e7eb",
  },
  weekOptionDotActive: { backgroundColor: "#111111" },
  weekOptionTextWrap: { flex: 1, minWidth: 0, gap: 4 },
  weekOptionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111111",
  },
  weekOptionTitleActive: { fontWeight: "800" },
  weekOptionMetaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  weekOptionSub: { fontSize: 11, fontWeight: "600", color: "#9ca3af" },
  weekOptionCountBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  weekOptionCountBadgeFilled: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
  },
  weekOptionCountBadgeActive: {
    backgroundColor: "#111111",
    borderColor: "#111111",
  },
  weekOptionCountText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9ca3af",
  },
  weekOptionCountTextFilled: {
    color: "#047857",
  },
  weekOptionCountTextActive: {
    color: "#ffffff",
  },
  weekOptionBadge: {
    backgroundColor: "#111111",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  weekOptionBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.3,
  },
  weekOptionCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },
  specGridOperador: { gap: 10 },
  specItemOperador: { minWidth: "100%", flexBasis: "100%" },
  specItemHalf: { minWidth: "47%", flexGrow: 1, flexBasis: "47%" },
  specItemFull: { minWidth: "100%", flexBasis: "100%" },
  specGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  specItem: {minWidth: "46%",flexGrow: 1,backgroundColor: "#ffffff",borderRadius: 10,borderWidth: 1,borderColor: "#e5e7eb",paddingHorizontal: 10,paddingVertical: 8,},
  webDateTimeField: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    maxWidth: "100%",
    gap: 6,
  },
  webDateTimeFieldStacked: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
    gap: 6,
  },
  webDateTimeHint: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  dateTimeStackWeb: {
    width: "100%",
    maxWidth: "100%",
    gap: 12,
    alignSelf: "stretch",
  },
  dateTimeHitBox: {
    position: "relative",
    width: "100%",
    maxWidth: "100%",
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    overflow: "hidden",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const, boxSizing: "border-box" as any } : {}),
  },
  dateTimeHitBoxTouch: {
    minHeight: 54,
    paddingVertical: 14,
    borderRadius: 14,
  },
  dateTimeHitText: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "700",
    color: "#111111",
  },
  webNativePickerOverlay: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
    // opacity 0 a veces no recibe clics en Chrome; 0.01 sí
    opacity: 0.01,
    borderWidth: 0,
    backgroundColor: "transparent",
    zIndex: 6,
    fontSize: 16,
    cursor: "pointer",
    color: "transparent",
    ...(Platform.OS === "web"
      ? {
          WebkitAppearance: "none",
          appearance: "none",
          margin: 0,
          padding: 0,
          pointerEvents: "auto",
        }
      : {}),
  } as any,
  dateTimeInputStacked: {
    width: "100%",
    alignSelf: "stretch",
    flexGrow: 0,
  },
  webPickerHit: {
    position: "relative",
    overflow: "hidden",
    width: "100%",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  operadorCardFooter: {
    marginTop: 4,
    gap: 10,
  },
  operadorCardFooterMobile: {
    marginTop: 8,
    gap: 12,
  },
  operadorActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  operadorActionsRowSticky: {
    flexDirection: "column",
    flexWrap: "nowrap",
    width: "100%",
    gap: 10,
  },
  operadorActionsRowCompact: {
    marginBottom: 4,
  },
  operadorActionsRowMobile: {
    flexDirection: "column",
    flexWrap: "nowrap",
    gap: 10,
  },
  operadorActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1.5,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  operadorActionBtnMobile: {
    width: "100%",
    justifyContent: "center",
    minHeight: 48,
    borderRadius: 14,
    paddingVertical: 14,
  },
  operadorActionBtnFixed: {
    width: "100%",
    justifyContent: "center",
    minHeight: 52,
    borderRadius: 14,
    paddingVertical: 15,
    gap: 10,
  },
  operadorActionPrimary: {
    backgroundColor: "#111111",
    borderColor: "#111111",
  },
  operadorActionSecondary: {
    backgroundColor: "#ffffff",
    borderColor: "#111111",
  },
  operadorActionDanger: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  operadorActionText: {
    color: "#111111",
    fontWeight: "800",
    fontSize: 15,
  },
  operadorActionTextPrimary: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 15,
  },
  operadorActionTextDanger: {
    color: "#dc2626",
    fontWeight: "800",
    fontSize: 15,
  },
  operadorStickyActions: {
    width: "100%",
    gap: 10,
  },
  opDetailStack: {
    gap: 10,
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
    fontSize: 22,
    fontWeight: "800",
    color: "#111111",
    lineHeight: 28,
  },
  sheetHeroDivider: {
    height: 1,
    backgroundColor: "#ececec",
    marginVertical: 14,
  },
  sheetHeroDestino: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1f2937",
    lineHeight: 24,
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
  sheetTimeline: {
    gap: 0,
  },
  sheetTimelineItem: {
    flexDirection: "row",
    gap: 12,
    minHeight: 88,
  },
  sheetTimelineRail: {
    width: 28,
    alignItems: "center",
  },
  sheetTimelineDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#d1d5db",
  },
  sheetTimelineDotDone: {
    backgroundColor: "#059669",
    borderColor: "#047857",
  },
  sheetTimelineDotCurrent: {
    backgroundColor: "#111111",
    borderColor: "#111111",
  },
  sheetTimelineDotNum: {
    fontSize: 11,
    fontWeight: "800",
    color: "#4b5563",
  },
  sheetTimelineDotNumCurrent: {
    color: "#ffffff",
  },
  sheetTimelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: "#e5e7eb",
    marginTop: 4,
    marginBottom: 4,
    minHeight: 24,
  },
  sheetTimelineLineDone: {
    backgroundColor: "#6ee7b7",
  },
  sheetStopCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    marginBottom: 12,
  },
  sheetStopCardCurrent: {
    borderColor: "#111111",
    borderWidth: 1.5,
    backgroundColor: "#ffffff",
  },
  sheetStopCardDone: {
    borderColor: "#a7f3d0",
    backgroundColor: "#f0fdf4",
  },
  sheetStopHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  sheetStopTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sheetNowBadge: {
    backgroundColor: "#111111",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sheetNowBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  sheetStopDestino: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111111",
    marginBottom: 10,
    lineHeight: 21,
  },
  sheetStopTimes: {
    flexDirection: "row",
    gap: 10,
  },
  sheetStopTimeBlock: {
    flex: 1,
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sheetStopTimeLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  sheetStopTimeValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1f2937",
  },
  sheetStopDefRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sheetStopDefLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#6b7280",
  },
  sheetStopDefValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111111",
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
  sheetMetaItemFinish: {
    marginTop: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  sheetFinishLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  sheetFinishValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#047857",
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
    marginBottom: 8,
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
  hojaPrimaryBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#111111",
    borderRadius: 12,
    paddingVertical: 14,
    minHeight: 52,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  hojaPrimaryBtnText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 15,
  },
  hojaSecondaryBtn: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#111111",
    paddingVertical: 14,
    minHeight: 52,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  hojaSecondaryBtnText: {
    color: "#111111",
    fontWeight: "800",
    fontSize: 15,
  },
  mobileStopsChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  mobileStopChipMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#111111",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    maxWidth: "100%",
  },
  mobileStopChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f3f4f6",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    maxWidth: "100%",
  },
  mobileStopChipIndex: {
    fontSize: 11,
    fontWeight: "800",
    color: "#ffffff",
    backgroundColor: "#374151",
    width: 18,
    height: 18,
    borderRadius: 9,
    textAlign: "center",
    lineHeight: 18,
    overflow: "hidden",
  },
  mobileStopChipIndexLight: {
    fontSize: 11,
    fontWeight: "800",
    color: "#111111",
    backgroundColor: "#ffffff",
    width: 18,
    height: 18,
    borderRadius: 9,
    textAlign: "center",
    lineHeight: 18,
    overflow: "hidden",
  },
  mobileStopChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111111",
    maxWidth: 140,
  },
  mobileStopChipTextLight: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
    maxWidth: 140,
  },
  opDetailField: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  opDetailFieldUnit: {
    paddingBottom: 12,
  },
  opDetailLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  opDetailValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111111",
    lineHeight: 22,
  },
  fechaBlock: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    overflow: "hidden",
    gap: 4,
  },
  fechasSection: {
    gap: 14,
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  checklistOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  checklistOverlayEmbedded: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    elevation: 30,
  },
  checklistOverlayWeb: {
    ...StyleSheet.absoluteFillObject,
    position: "fixed" as any,
    zIndex: 10050,
  },
  checklistKav: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  checklistBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
  },
  checklistCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 18,
    gap: 14,
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
  checklistCardMobile: {
    maxWidth: "100%",
    padding: 16,
  },
  checklistHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  checklistIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },
  checklistIconBadgeFinish: {
    backgroundColor: "#dc2626",
  },
  checklistSummaryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 10,
  },
  checklistSummaryDate: {
    marginLeft: "auto",
    fontSize: 11,
    fontWeight: "600",
    color: "#94a3b8",
  },
  checklistSummaryEmpty: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94a3b8",
    fontStyle: "italic",
  },
  checklistSummaryList: { gap: 8 },
  checklistSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checklistSummaryIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  checklistSummaryIconOk: { backgroundColor: "#16a34a" },
  checklistSummaryIconNo: { backgroundColor: "#cbd5e1" },
  checklistSummaryLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#111111",
  },
  checklistSummaryLabelOff: {
    color: "#94a3b8",
    textDecorationLine: "line-through",
  },
  checklistSummaryExtras: {
    marginTop: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 4,
  },
  checklistSummaryExtrasLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  checklistSummaryExtrasValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111111",
    lineHeight: 19,
  },
  finishChecklistScroll: {
    maxHeight: 340,
    marginTop: 4,
  },
  finishExtrasGroup: {
    marginTop: 6,
    gap: 6,
  },
  finishExtrasLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
  },
  finishExtrasInput: {
    backgroundColor: "#ffffff",
    fontSize: 14,
  },
  finishExtrasInputContent: {
    minHeight: 56,
    paddingTop: 8,
  },
  checklistTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111111",
  },
  checklistSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },
  checklistClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  checklistIntro: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
    lineHeight: 18,
  },
  checklistList: { gap: 8 },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fafafa",
  },
  checklistRowActive: {
    borderColor: "#111111",
    backgroundColor: "#f8fafc",
  },
  checklistRowPressed: { opacity: 0.88 },
  checklistBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  checklistBoxActive: {
    backgroundColor: "#111111",
    borderColor: "#111111",
  },
  checklistLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    lineHeight: 19,
  },
  checklistLabelActive: {
    color: "#111111",
    fontWeight: "700",
  },
  checklistActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  checklistCancelBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  checklistCancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6b7280",
  },
  checklistConfirmBtn: {
    flex: 1.2,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: "#111111",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  checklistConfirmBtnDisabled: { opacity: 0.45 },
  checklistConfirmText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#ffffff",
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
  operadorDoneBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    justifyContent: "center",
  },
  operadorDoneHint: {
    fontSize: 13,
    fontWeight: "700",
    color: "#059669",
  },
  iconActionOperador: {
    width: "100%" as any,
    height: 44,
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
  },
  iconActionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111111",
  },
  operadorLegHint: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },
  specLabel: {fontSize: 10,fontWeight: "700",color: "#9ca3af",textTransform: "uppercase",letterSpacing: 0.4,},
  specValue: { fontSize: 13, fontWeight: "600", color: "#111111", marginTop: 2 },
  cardActions: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  iconAction: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center", justifyContent: "center", ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),},
  iconActionDanger: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
  webModalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "stretch",
    zIndex: 9999,
    padding: 12,
    width: "100%",
    maxWidth: "100vw" as any,
    boxSizing: "border-box" as any,
    ...(Platform.OS === "web" ? { cursor: "default", overflow: "auto" } : {}),
  } as any,
  webModalOverlayTouch: {
    padding: 0,
    justifyContent: "flex-start",
    alignItems: "stretch",
    overflow: "hidden",
    height: "100dvh" as any,
    maxHeight: "100dvh" as any,
    display: "flex" as any,
    flexDirection: "column" as any,
  } as any,
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 16,
    position: "relative",
  },
  modalContainerTouch: {
    padding: 0,
    justifyContent: "flex-start",
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: "#ffffff",
    width: "100%",
    ...(Platform.OS === "web"
      ? {
          height: "100%" as any,
          maxHeight: "100dvh" as any,
          display: "flex" as any,
          flexDirection: "column" as any,
          minHeight: 0,
        }
      : {}),
  },
  modalCard: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    maxHeight: Platform.OS === "web" ? ("90vh" as any) : "92%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "column",
    minWidth: 0,
    position: "relative",
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0 20px 50px rgba(0,0,0,0.18)" as any,
          display: "flex" as any,
          boxSizing: "border-box" as any,
        }
      : {}),
  },
  modalCardTouch: {
    width: "100%",
    maxWidth: "100%",
    maxHeight: Platform.OS === "web" ? ("100%" as any) : "100%",
    height: Platform.OS === "web" ? ("100%" as any) : "100%",
    borderRadius: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderWidth: 0,
    flex: 1,
    alignSelf: "stretch",
    overflow: "hidden",
    minHeight: 0,
  },
  modalDragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
    flexShrink: 0,
  },
  modalHeader:{flexDirection: "row",alignItems: "flex-start",justifyContent: "space-between",paddingHorizontal: 22,paddingTop: 22,paddingBottom: 16,borderBottomWidth: 1,borderBottomColor: "#f3f4f6",flexShrink: 0,},
  modalHeaderTouch: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  modalHeaderLeft:{flexDirection: "row",alignItems: "center",gap: 12,flex: 1,paddingRight: 12,minWidth: 0,},
  modalHeaderTextWrap: { flex: 1, minWidth: 0 },
  modalIconBadge:{width: 40,height: 40,borderRadius: 20,backgroundColor: "#111111",alignItems: "center",justifyContent: "center",},
  modalIconBadgeTouch: { width: 44, height: 44, borderRadius: 22 },
  modalTitle:{fontSize: 18, fontWeight: "800", color: "#111111" },
  modalTitleTouch: { fontSize: 20 },
  modalSubtitle:{fontSize: 12, color: "#6b7280", marginTop: 2 },
  modalCloseButton:{width: 32,height: 32,borderRadius: 16,backgroundColor: "#f3f4f6",alignItems: "center", justifyContent: "center", ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  modalCloseButtonTouch: { width: 40, height: 40, borderRadius: 20 },
  modalBodyWrap:{
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  modalBodyWrapTouch: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? {
          // Trick CSS: flex child scroll area needs a bounded height
          flexBasis: 0 as any,
          height: 0 as any,
          flexGrow: 1,
          flexShrink: 1,
        }
      : {}),
  },
  modalScroll:{
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    ...(Platform.OS === "web" ? ({ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overflowY: "auto" } as any) : {}),
  },
  modalScrollContent:{
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 24,
    flexGrow: 0,
  },
  modalScrollContentTouch: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 56,
    flexGrow: 0,
  },
  formSection: {
    backgroundColor: "#fafafa",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    marginBottom: 14,
    minWidth: 0,
    maxWidth: "100%",
  },
  formSectionTouch: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  formSectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#111111",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  formSectionTitleMobile: { fontSize: 13, marginBottom: 14 },
  remolqueBox: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    marginBottom: 12,
  },
  remolqueHint: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "600",
    marginBottom: 10,
  },
  yesNoRow: { flexDirection: "row", gap: 8 },
  yesNoOption: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  yesNoOptionActive: {
    backgroundColor: "#111111",
    borderColor: "#111111",
  },
  yesNoOptionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6b7280",
  },
  yesNoOptionTextActive: {
    color: "#ffffff",
  },
  destinoExtraCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    marginBottom: 12,
  },
  destinoExtraHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  destinoExtraTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111111",
  },
  removeDestinoBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  addDestinoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#111111",
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 16,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  addDestinoBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
  },
  multiBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#111111",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  multiBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 0.3,
  },
  modalFieldGroup:{marginBottom: 12, minWidth: 0, maxWidth: "100%" },
  modalFieldGroupMobile: { marginBottom: 14 },
  modalFieldLabel:{fontSize: 12,fontWeight: "700",color: "#374151",marginBottom: 6,letterSpacing: 0.2, },
  modalFieldLabelMobile: { fontSize: 13, marginBottom: 8 },
  modalFieldRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  modalFieldRowStack: { flexDirection: "column", flexWrap: "nowrap", gap: 0 },
  modalFieldHalf: { flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 0, maxWidth: "100%" },
  modalFieldFull: { flexGrow: 1, flexBasis: "100%", width: "100%", maxWidth: "100%", minWidth: 0 },
  modalInput: {width: "100%",maxWidth: "100%",height: 42,backgroundColor: "#ffffff",borderRadius: 10,borderWidth: 1,borderColor: "#e5e7eb",},
  modalInputTouch: { height: 52, borderRadius: 12, marginBottom: 2 },
  modalInputContent: { color: "#111111", fontWeight: "600", fontSize: 14 },
  modalInputContentTouch: { fontSize: 16, lineHeight: 22, paddingVertical: 4 },
  pickerWrap: { backgroundColor: "#ffffff", borderRadius: 10, borderWidth: 1, borderColor: "#e5e7eb", overflow: "hidden", width: "100%", maxWidth: "100%"},
  pickerWrapTouch: { borderRadius: 12, minHeight: 48, justifyContent: "center" },
  picker: { width: "100%", color: "#111111" },
  pickerTouch: { height: 48 },
  selectTrigger: {
    width: "100%",
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  selectTriggerTouch: {
    minHeight: 52,
    borderRadius: 12,
    paddingVertical: 14,
  },
  selectTriggerPressed: {
    backgroundColor: "#f3f4f6",
  },
  selectTriggerText: {
    flex: 1,
    color: "#111111",
    fontWeight: "600",
    fontSize: 14,
  },
  selectTriggerTextTouch: {
    fontSize: 16,
  },
  selectTriggerPlaceholder: {
    color: "#9ca3af",
  },
  selectSheetOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    justifyContent: "flex-end",
  },
  selectSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  selectSheetCard: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: "78%",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    zIndex: 51,
  },
  selectSheetCardTouch: {
    maxHeight: "82%",
  },
  selectSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  selectSheetTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111111",
  },
  selectSheetClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  selectSheetList: {
    maxHeight: 420,
  },
  selectSheetListContent: {
    paddingBottom: 24,
  },
  selectSheetItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    backgroundColor: "#ffffff",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  selectSheetItemActive: {
    backgroundColor: "#f3f4f6",
  },
  selectSheetItemPressed: {
    backgroundColor: "#e5e7eb",
  },
  selectSheetItemText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#111111",
  },
  selectSheetItemTextActive: {
    fontWeight: "800",
  },
  iosPickerDone: {
    backgroundColor: "#111111",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  iosPickerDoneText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 10060,
    elevation: 40,
  },
  pickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
  },
  pickerCard: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderColor: "#e5e7eb",
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 4,
  },
  pickerTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    color: "#111111",
  },
  iosPicker: {
    alignSelf: "stretch",
  },
  modalSectionTitle: { fontSize: 13, fontWeight: "800", color: "#111111", marginBottom: 10, marginTop: 4, letterSpacing: 0.2,},
  modalSectionTitleMobile: { fontSize: 14, marginBottom: 12, marginTop: 8 },
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
  webDatePicker: { padding: 10, borderRadius: 10, marginBottom: 0,borderWidth: 1,borderColor: "#e5e7eb",backgroundColor: "#ffffff",width: "100%",fontSize: 14,fontWeight: "600",color: "#111111",},
  webDatePickerTouch: { height: 48, borderRadius: 12, fontSize: 16, padding: 12 },
  webSelect: { padding: 10, borderRadius: 10, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#ffffff", width: "100%", fontSize: 14, fontWeight: "600", color: "#111111", height: 42 },
  webSelectTouch: { height: 48, borderRadius: 12, fontSize: 16, padding: 12 },
  dateTimeRow: { flexDirection: "column", gap: 10, alignItems: "stretch", width: "100%", maxWidth: "100%" },
  dateTimeRowStack: { flexDirection: "column", alignItems: "stretch", gap: 10, width: "100%" },
  dateTimeInput: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 48,
    alignSelf: "stretch",
  },
  dateTimeInputTouch: { width: "100%", minHeight: 52, borderRadius: 12, paddingVertical: 14 },
  dateTimeText: { fontSize: 14, fontWeight: "600", color: "#111111", flex: 1, minWidth: 0 },
  travelTimeCard: { backgroundColor: "#f9fafb", borderRadius: 14, borderWidth: 1, borderColor: "#e5e7eb", padding: 16, marginTop: 2 },
  travelTimeCardTouch: { padding: 18, borderRadius: 14, marginTop: 4 },
  travelTimeCardLive: { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0" },
  travelTimeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  travelTimeHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  travelTimeTitle: { fontSize: 13, fontWeight: "800", color: "#111111" },
  travelTimeValue: { fontSize: 28, fontWeight: "800", color: "#111111", letterSpacing: 0.5 },
  travelTimeValueTouch: { fontSize: 32 },
  travelTimeValueLive: { color: "#059669" },
  travelTimeHint: { fontSize: 12, color: "#6b7280", marginTop: 4 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#059669" },
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
    backgroundColor: "#ffffff",
  },
  modalActionsOperador: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
  },
  modalActionsTouch: {
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
  },
  modalActionTouch: {
    minHeight: 52,
    borderRadius: 14,
    paddingVertical: 14,
  },
  actionButtonPressed: {
    opacity: 0.88,
  },
  actionButtonTextTouch: {
    fontSize: 16,
    lineHeight: 22,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#111111",
    minHeight: 48,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  cancelButtonFull: { flex: 1 },
  cancelButtonText: {
    color: "#111111",
    fontWeight: "800",
    fontSize: 15,
    textAlign: "center",
  },
  saveButton: {
    flex: 1,
    backgroundColor: "#111111",
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 15,
    textAlign: "center",
  },
});
