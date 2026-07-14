import { FontAwesome5 } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from '@react-native-picker/picker';
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Portal, TextInput } from "react-native-paper";
import * as XLSX from "xlsx";
import { useStore } from "../context/Store";
import { api } from "../services/api";

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
  if (u.tipoRemolque) return `${base} · ${u.tipoRemolque}`;
  return `${base} · Remolque`;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

const formatDateDisplay = (d: Date) =>
  `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;

const formatTimeDisplay = (d: Date) =>
  `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

const combineDateTime = (dateStr: string, timeStr: string): Date | null => {
  if (!dateStr?.trim()) return null;
  const [day, month, year] = dateStr.split("/").map(Number);
  if (!year || !month || !day) return null;
  let hours = 0;
  let minutes = 0;
  if (timeStr?.trim()) {
    const [h, m] = timeStr.split(":").map(Number);
    hours = Number.isFinite(h) ? h : 0;
    minutes = Number.isFinite(m) ? m : 0;
  }
  return new Date(year, month - 1, day, hours, minutes, 0);
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
    hint: "Tiempo total del trayecto",
    live: false,
  };
};

const toId = (value: any) => {
  if (!value) return "";
  if (typeof value === "object") return String(value._id || "");
  return String(value);
};

const mapDestinoExtraFromTrip = (
  item: DestinoExtraTrip,
  applyDateTime: (iso?: string) => { date: string; time: string }
): DestinoExtraForm => {
  const multiSalida = applyDateTime(item.fechaSalida);
  const multiLlegada = applyDateTime(item.fechaLlegada);
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
  const [horaSalida, setHoraSalida] = useState("");
  const [fechaLlegada, setFechaLlegada] = useState("");
  const [horaLlegada, setHoraLlegada] = useState("");
  const [destino, setDestino] = useState("");
  const [estado, setEstado] = useState("pendiente");
  const [kmSalidaManual, setKmSalidaManual] = useState("");
  const [kmLlegadaManual, setKmLlegadaManual] = useState("");
  const [acompanante, setAcompanante] = useState("");
  const [def, setDef] = useState("");
  const [exportType, setExportType] = useState("dia");
  const [showLlegadaPicker, setShowLlegadaPicker] = useState(false);
  const [showSalidaPicker, setShowSalidaPicker] = useState(false);
  const [showSalidaTimePicker, setShowSalidaTimePicker] = useState(false);
  const [showLlegadaTimePicker, setShowLlegadaTimePicker] = useState(false);
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
  const [multiPicker, setMultiPicker] = useState<{
    index: number;
    field: "salidaDate" | "salidaTime" | "llegadaDate" | "llegadaTime";
  } | null>(null);
  const [multiLiveTick, setMultiLiveTick] = useState(0);

  const isAdmin = currentUser?.rol?.toLowerCase() === "admin";
  const isOperador = !isAdmin;

  const operadores = useMemo(
    () => users.filter((u) => (u.rol || "").toLowerCase() === "operador"),
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
        id: u._id || u.id,
        nombre: u.nombre,
        placa: u.placas ?? u.placa ?? "",
        tipoRemolque: u.tipoRemolque || "",
        placaRemolque: u.placaRemolque || "",
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
    const applyDateTime = (iso?: string) => {
      if (!iso) return { date: "", time: "" };
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return { date: "", time: "" };
      return { date: formatDateDisplay(d), time: formatTimeDisplay(d) };
    };

    if (trip) {
      setEditingTrip(trip);
      setRutaAcubrir(trip.rutaAcubrir || "");
      setUnidadId(trip.unidadId || "");

      const unitFromTrip = units.find((u) => u.id === trip.unidadId) || null;
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

      setConductorId(toId(trip.conductorId));

      const salida = applyDateTime(trip.fechaSalida);
      setFechaSalida(salida.date);
      setHoraSalida(salida.time);

      const llegada = applyDateTime(trip.fechaLlegada);
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
        hasMulti
          ? extrasList.map((item) => mapDestinoExtraFromTrip(item, applyDateTime))
          : []
      );
    } else {
      setEditingTrip(null);
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
    setMultiPicker(null);
    setModalVisible(true);
  }, [units]);

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

  const patchTripForOperador = async (trip: Trip, payload: Record<string, any>, successMessage: string) => {
    try {
      setSaving(true);
      await api.put(`/trips/${trip.id}`, payload);
      Alert.alert("Éxito", successMessage);
      await loadTrips();
      if (editingTrip?.id === trip.id) {
        closeModal();
      }
    } catch (error: any) {
      console.error("Error actualizando viaje (operador):", error?.response?.data || error);
      Alert.alert("Error", "No se pudo actualizar el viaje.");
    } finally {
      setSaving(false);
    }
  };

  const iniciarViaje = async (trip: Trip) => {
    const estado = getTripEstadoKey(trip.estado);
    if (estado !== "pendiente" && estado !== "en parada") {
      Alert.alert("No disponible", "Este viaje no se puede iniciar en su estado actual.");
      return;
    }

    const now = new Date().toISOString();
    const index = trip.destinoActualIndex ?? 0;
    const extras = normalizeDestinosExtrasList(trip.destinoExtra).map((item) => ({ ...item }));

    if (estado === "pendiente" || index <= 0) {
      await patchTripForOperador(
        trip,
        {
          estado: "en progreso",
          destinoActualIndex: 0,
          fechaSalida: now,
        },
        "Viaje iniciado"
      );
      return;
    }

    extras[index - 1] = {
      ...extras[index - 1],
      fechaSalida: now,
      fechaLlegada: extras[index - 1]?.fechaLlegada || undefined,
    };

    await patchTripForOperador(
      trip,
      {
        estado: "en progreso",
        destinoActualIndex: index,
        multidestino: true,
        destinoExtra: buildDestinoExtraPayload(extras),
      },
      "Siguiente tramo iniciado"
    );
  };

  const finalizarParada = async (trip: Trip) => {
    const estado = getTripEstadoKey(trip.estado);
    if (estado !== "en progreso") {
      Alert.alert("No disponible", "Solo puedes finalizar parada con el viaje en progreso.");
      return;
    }

    const now = new Date().toISOString();
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

    if (index <= 0) {
      await patchTripForOperador(
        trip,
        {
          fechaLlegada: now,
          estado: "en parada",
          destinoActualIndex: 1,
        },
        "Parada finalizada. Puedes iniciar el siguiente destino."
      );
      return;
    }

    extras[index - 1] = {
      ...extras[index - 1],
      fechaLlegada: now,
    };

    await patchTripForOperador(
      trip,
      {
        estado: "en parada",
        destinoActualIndex: index + 1,
        multidestino: true,
        destinoExtra: buildDestinoExtraPayload(extras),
      },
      "Parada finalizada. Puedes iniciar el siguiente destino."
    );
  };

  const finalizarViaje = async (trip: Trip) => {
    const estado = getTripEstadoKey(trip.estado);
    if (estado !== "en progreso" && estado !== "en parada") {
      Alert.alert("No disponible", "Solo puedes finalizar un viaje en progreso o en parada.");
      return;
    }

    const now = new Date().toISOString();
    const index = trip.destinoActualIndex ?? 0;
    const extras = normalizeDestinosExtrasList(trip.destinoExtra).map((item) => ({ ...item }));

    if (index <= 0) {
      await patchTripForOperador(
        trip,
        {
          fechaLlegada: now,
          estado: "completado",
          destinoActualIndex: index,
        },
        "Viaje finalizado"
      );
      return;
    }

    extras[index - 1] = {
      ...extras[index - 1],
      fechaLlegada: now,
      fechaSalida: extras[index - 1]?.fechaSalida || now,
    };

    await patchTripForOperador(
      trip,
      {
        fechaLlegada: trip.fechaLlegada || now,
        estado: "completado",
        destinoActualIndex: index,
        multidestino: Boolean(trip.multidestino),
        destinoExtra: buildDestinoExtraPayload(extras),
      },
      "Viaje finalizado"
    );
  };

const saveTrip = async () => {
  const estadoCalculado =
    editingTrip && getTripEstadoKey(editingTrip.estado) !== "pendiente" && getTripEstadoKey(editingTrip.estado) !== "completado"
      ? editingTrip.estado
      : llegadaDateTime
        ? "completado"
        : editingTrip?.estado || "pendiente";

  if (isAdmin && (!rutaAcubrir || !unidadId || !conductorId || !fechaSalida || !destino.trim())) {
    Alert.alert("Falta información", "Ruta, unidad, operador, destino y fecha de salida son obligatorios.");
    return;
  }

  if (salidaDateTime && llegadaDateTime && llegadaDateTime < salidaDateTime) {
    Alert.alert("Fechas inválidas", "La fecha y hora de llegada no puede ser anterior a la salida.");
    return;
  }

  if (multidestino) {
    if (destinosExtras.length === 0) {
      Alert.alert("Multidestino incompleto", "Agrega al menos un destino adicional.");
      return;
    }
    for (let i = 0; i < destinosExtras.length; i++) {
      const extra = destinosExtras[i];
      if (!extra.destino.trim() || !extra.unidadId || !extra.conductorId || !extra.fechaSalida) {
        Alert.alert(
          "Multidestino incompleto",
          `Completa destino, unidad, operador y fecha de salida del destino adicional #${i + 1}.`
        );
        return;
      }
      const s = combineDateTime(extra.fechaSalida, extra.horaSalida);
      const l = combineDateTime(extra.fechaLlegada, extra.horaLlegada);
      if (s && l && l < s) {
        Alert.alert(
          "Fechas inválidas",
          `En el destino adicional #${i + 1}, la llegada no puede ser anterior a la salida.`
        );
        return;
      }
    }
  }

  const payload: any = {
    rutaAcubrir,
    unidadId,
    conductorId: typeof conductorId === "object" ? (conductorId as any)._id : conductorId,
    destino: destino.trim(),
    estado: estadoCalculado,
    acompanante: (acompanante === "none" || acompanante === "") ? null : acompanante,
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
  if (!payload.def) payload.def = "";

  if (salidaDateTime) payload.fechaSalida = salidaDateTime.toISOString();
  if (llegadaDateTime) {
    payload.fechaLlegada = llegadaDateTime.toISOString();
  } else {
    delete payload.fechaLlegada;
  }

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
  


const deleteTrip = async (id: string) => {
  if (!isAdmin) return;
  
  const proceedWithDelete = async () => {
    try {
      await api.delete(`/trips/${id}`); 
      
      setTrips((prev) => prev.filter((t) => t.id !== id));
      Alert.alert("Éxito", "Viaje eliminado correctamente");
    } catch (error) {
      console.error("Error eliminando viaje", error);
      Alert.alert("Error", "No se pudo eliminar el viaje");
    }
  };

  if (Platform.OS === "web") {
    const confirmed = window.confirm("¿Estás seguro de que deseas eliminar este viaje?");
    if (confirmed) await proceedWithDelete(); // Agregué await por seguridad
  } else {
    Alert.alert("Confirmar eliminación", "¿Estás seguro de que deseas eliminar este viaje?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: proceedWithDelete }
    ]);
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

  const renderOperadorActions = (trip: Trip, compact = false) => {
    const estado = getTripEstadoKey(trip.estado);
    const canIniciar = estado === "pendiente" || estado === "en parada";
    const canParada = estado === "en progreso" && getTotalDestinosCount(trip) > (trip.destinoActualIndex ?? 0) + 1;
    const canFinalizar = estado === "en progreso" || estado === "en parada";

    if (estado === "completado") {
      return (
        <Text style={styles.operadorDoneHint}>Viaje completado</Text>
      );
    }

    return (
      <View style={[styles.operadorActionsRow, compact && styles.operadorActionsRowCompact]}>
        {canIniciar && (
          <TouchableOpacity
            style={[styles.operadorActionBtn, styles.operadorActionPrimary]}
            onPress={() => iniciarViaje(trip)}
            disabled={saving}
            activeOpacity={0.85}
          >
            <FontAwesome5 name="play" size={11} color="#ffffff" />
            <Text style={styles.operadorActionTextPrimary}>Iniciar viaje</Text>
          </TouchableOpacity>
        )}
        {canParada && (
          <TouchableOpacity
            style={[styles.operadorActionBtn, styles.operadorActionSecondary]}
            onPress={() => finalizarParada(trip)}
            disabled={saving}
            activeOpacity={0.85}
          >
            <FontAwesome5 name="map-marker-alt" size={11} color="#111111" />
            <Text style={styles.operadorActionText}>Finalizar parada</Text>
          </TouchableOpacity>
        )}
        {canFinalizar && (
          <TouchableOpacity
            style={[styles.operadorActionBtn, styles.operadorActionDanger]}
            onPress={() => finalizarViaje(trip)}
            disabled={saving}
            activeOpacity={0.85}
          >
            <FontAwesome5 name="flag-checkered" size={11} color="#dc2626" />
            <Text style={styles.operadorActionTextDanger}>Finalizar viaje</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderItem = ({ item }: { item: Trip }) => {
    const leg = getOperadorLegInfo(item);
    const unidadNombre =
      units.find((u) => u.id === (isOperador ? leg.unidadId : item.unidadId))?.nombre ||
      (isOperador ? leg.unidadId : item.unidadId);
    const conductorIdVal = typeof item.conductorId === "object" ? item.conductorId._id : item.conductorId;
    const conductorNombre = users.find((u) => u.id === conductorIdVal)?.nombre || "N/A";
    const acompananteId = toId(isOperador ? leg.acompanante : item.acompanante);
    const acompananteNombre =
      !acompananteId || acompananteId === "none"
        ? "Sin acompañante"
        : users.find((u) => u.id === acompananteId)?.nombre ?? "Sin acompañante";
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
            <Text style={styles.cardTitle} numberOfLines={1}>
              {isOperador ? leg.destino : item.rutaAcubrir}
            </Text>
            <View style={[styles.estadoBadge, estado.badge]}>
              <FontAwesome5 name={estado.icon} size={10} color={estado.iconColor} />
              <Text style={[styles.estadoText, estado.text]}>{item.estado}</Text>
            </View>
          </View>
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
            {!isOperador && (
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Conductor</Text>
                <Text style={styles.specValue} numberOfLines={1}>{conductorNombre}</Text>
              </View>
            )}
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Destino</Text>
              <Text style={styles.specValue} numberOfLines={1}>{leg.destino || item.destino || "—"}</Text>
            </View>
            {!isOperador && item.multidestino && normalizeDestinosExtrasList(item.destinoExtra).length > 0 ? (
              <View style={styles.specItem}>
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
              <Text style={styles.specLabel}>Llegada</Text>
              <Text style={styles.specValue}>{formatDateTimeLabel(leg.fechaLlegada || item.fechaLlegada)}</Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Acompañante</Text>
              <Text style={styles.specValue} numberOfLines={1}>{acompananteNombre}</Text>
            </View>
          </View>

          {isOperador ? (
            <View style={styles.operadorCardFooter}>
              {renderOperadorActions(item, true)}
              {canEdit && getTripEstadoKey(item.estado) !== "completado" && (
                <TouchableOpacity style={styles.iconAction} onPress={() => openModal(item)} activeOpacity={0.85}>
                  <FontAwesome5 name="eye" size={13} color="#111111" />
                </TouchableOpacity>
              )}
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
    );
  };

  const modalInputProps = {
    mode: "flat" as const,
    underlineColor: "transparent",
    activeUnderlineColor: "transparent",
    dense: !isMobile,
    contentStyle: [styles.modalInputContent, isMobile && styles.modalInputContentTouch],
    style: [styles.modalInput, isMobile && styles.modalInputTouch],
    placeholderTextColor: "#9ca3af",
  };

  const renderFormSection = (title: string, children: React.ReactNode) => (
    <View style={styles.formSection}>
      <Text style={[styles.formSectionTitle, isMobile && styles.formSectionTitleMobile]}>{title}</Text>
      {children}
    </View>
  );

  const renderModalField = (label: string, field: React.ReactNode) => (
    <View style={[styles.modalFieldGroup, isMobile && styles.modalFieldGroupMobile]}>
      <Text style={[styles.modalFieldLabel, isMobile && styles.modalFieldLabelMobile]}>{label}</Text>
      {field}
    </View>
  );

  const renderFieldRow = (children: React.ReactNode) => (
    <View style={[styles.modalFieldRow, isMobile && styles.modalFieldRowStack]}>{children}</View>
  );

  const renderFieldHalf = (children: React.ReactNode) => (
    <View style={[styles.modalFieldHalf, isMobile && styles.modalFieldFull]}>{children}</View>
  );

  const webControlStyle = (extra?: Record<string, any>) =>
    ({
      padding: isMobile ? 12 : 10,
      borderRadius: isMobile ? 12 : 10,
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: "#e5e7eb",
      backgroundColor: "#ffffff",
      width: "100%",
      fontSize: isMobile ? 16 : 14,
      fontWeight: "600",
      color: "#111111",
      height: isMobile ? 48 : 42,
      boxSizing: "border-box",
      outline: "none",
      ...extra,
    }) as any;

  const renderSelectField = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: { label: string; value: string }[],
    placeholder = "Seleccionar"
  ) =>
    renderModalField(
      label,
      Platform.OS === "web" ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={webControlStyle()}
        >
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <View style={[styles.pickerWrap, isMobile && styles.pickerWrapTouch]}>
          <Picker selectedValue={value} onValueChange={onChange} style={[styles.picker, isMobile && styles.pickerTouch]}>
            <Picker.Item label={placeholder} value="" />
            {options.map((opt) => (
              <Picker.Item key={opt.value} label={opt.label} value={opt.value} />
            ))}
          </Picker>
        </View>
      )
    );

  const renderDateTimeField = (
    label: string,
    dateValue: string,
    timeValue: string,
    onDateChange: (formatted: string) => void,
    onTimeChange: (formatted: string) => void,
    showDatePicker: boolean,
    setShowDatePicker: (v: boolean) => void,
    showTimePicker: boolean,
    setShowTimePicker: (v: boolean) => void
  ) =>
    renderModalField(
      label,
      <View style={[styles.dateTimeRow, isMobile && styles.dateTimeRowStack]}>
        {Platform.OS === "web" ? (
          <>
            <input
              type="date"
              value={dateValue && parseDate(dateValue) ? new Date(parseDate(dateValue) as Date).toISOString().split("T")[0] : ""}
              onChange={(e) => {
                if (!e.target.value) {
                  onDateChange("");
                  return;
                }
                const [year, month, day] = e.target.value.split("-");
                onDateChange(`${day}/${month}/${year}`);
              }}
              style={webControlStyle(isMobile ? undefined : { flex: 1.2 })}
            />
            <input
              type="time"
              value={timeValue || ""}
              onChange={(e) => onTimeChange(e.target.value)}
              style={webControlStyle(isMobile ? undefined : { flex: 0.8 })}
            />
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.dateTimeInput, isMobile && styles.dateTimeInputTouch]}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.85}
            >
              <FontAwesome5 name="calendar-alt" size={14} color="#6b7280" />
              <Text style={styles.dateTimeText}>{dateValue || "Seleccionar fecha"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dateTimeInput, isMobile && styles.dateTimeInputTouch]}
              onPress={() => setShowTimePicker(true)}
              activeOpacity={0.85}
            >
              <FontAwesome5 name="clock" size={14} color="#6b7280" />
              <Text style={styles.dateTimeText}>{timeValue || "Seleccionar hora"}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={parseDate(dateValue) || new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_event, date) => {
                  setShowDatePicker(false);
                  if (date) onDateChange(formatDateDisplay(date));
                }}
              />
            )}
            {showTimePicker && (
              <DateTimePicker
                value={combineDateTime(dateValue, timeValue) || new Date()}
                mode="time"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_event, date) => {
                  setShowTimePicker(false);
                  if (date) onTimeChange(formatTimeDisplay(date));
                }}
              />
            )}
          </>
        )}
      </View>
    );

  const renderTravelTimeCard = (tiempo = tiempoTrayecto) => (
    <View style={[styles.travelTimeCard, isMobile && styles.travelTimeCardTouch, tiempo.live && styles.travelTimeCardLive]}>
      <View style={styles.travelTimeHeader}>
        <View style={styles.travelTimeHeaderLeft}>
          <FontAwesome5 name="stopwatch" size={isMobile ? 16 : 14} color={tiempo.live ? "#059669" : "#111111"} />
          <Text style={styles.travelTimeTitle}>Tiempo de trayecto</Text>
        </View>
        {tiempo.live && <View style={styles.liveDot} />}
      </View>
      <Text style={[styles.travelTimeValue, isMobile && styles.travelTimeValueTouch, tiempo.live && styles.travelTimeValueLive]}>
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
                setMultiPicker(null);
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
    const modalBody = (
      <View
        style={[styles.modalCard, isMobile && styles.modalCardTouch]}
        onStartShouldSetResponder={() => true}
        {...(Platform.OS === "web" ? { onClick: (e: any) => e.stopPropagation() } : {})}
      >
        {isMobile && <View style={styles.modalDragHandle} />}

        <View style={[styles.modalHeader, isMobile && styles.modalHeaderTouch]}>
          <View style={styles.modalHeaderLeft}>
            <View style={[styles.modalIconBadge, isMobile && styles.modalIconBadgeTouch]}>
              <FontAwesome5 name="route" size={isMobile ? 18 : 16} color="#ffffff" />
            </View>
            <View style={styles.modalHeaderTextWrap}>
              <Text style={[styles.modalTitle, isMobile && styles.modalTitleTouch]}>
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
                  : "Consulta la información y controla el estado del viaje"}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.modalCloseButton, isMobile && styles.modalCloseButtonTouch]}
            onPress={closeModal}
            disabled={saving}
            activeOpacity={0.85}
          >
            <FontAwesome5 name="times" size={isMobile ? 16 : 14} color="#6b7280" />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={styles.modalBodyWrap}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={isMobile ? 12 : 0}
        >
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={[styles.modalScrollContent, isMobile && styles.modalScrollContentTouch]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {isAdmin ? (
              <>
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
                    {mostrarRemolque && (
                      <View style={styles.remolqueBox}>
                        <Text style={styles.remolqueHint}>
                          Unidad {selectedUnit?.nombre || ""} — selecciona si lleva Lowboy o Caja Seca
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
                              ...users.map((u) => ({
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
                  <>
                    {renderFieldRow(
                      <>
                        {renderFieldHalf(
                          renderDateTimeField(
                            "Fecha y hora de salida",
                            fechaSalida,
                            horaSalida,
                            setFechaSalida,
                            setHoraSalida,
                            showSalidaPicker,
                            setShowSalidaPicker,
                            showSalidaTimePicker,
                            setShowSalidaTimePicker
                          )
                        )}
                        {renderFieldHalf(
                          renderDateTimeField(
                            "Fecha y hora de llegada",
                            fechaLlegada,
                            horaLlegada,
                            setFechaLlegada,
                            setHoraLlegada,
                            showLlegadaPicker,
                            setShowLlegadaPicker,
                            showLlegadaTimePicker,
                            setShowLlegadaTimePicker
                          )
                        )}
                      </>
                    )}
                    {renderTravelTimeCard()}
                    {renderYesNoToggle("¿Multidestino?", multidestino, setMultidestino)}
                  </>
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

                          {renderFieldRow(
                            <>
                              {renderFieldHalf(
                                renderDateTimeField(
                                  "Fecha y hora de salida",
                                  extra.fechaSalida,
                                  extra.horaSalida,
                                  (v) => updateDestinoExtraAt(index, { fechaSalida: v }),
                                  (v) => updateDestinoExtraAt(index, { horaSalida: v }),
                                  multiPicker?.index === index && multiPicker.field === "salidaDate",
                                  (v) =>
                                    setMultiPicker(
                                      v ? { index, field: "salidaDate" } : null
                                    ),
                                  multiPicker?.index === index && multiPicker.field === "salidaTime",
                                  (v) =>
                                    setMultiPicker(
                                      v ? { index, field: "salidaTime" } : null
                                    )
                                )
                              )}
                              {renderFieldHalf(
                                renderDateTimeField(
                                  "Fecha y hora de llegada",
                                  extra.fechaLlegada,
                                  extra.horaLlegada,
                                  (v) => updateDestinoExtraAt(index, { fechaLlegada: v }),
                                  (v) => updateDestinoExtraAt(index, { horaLlegada: v }),
                                  multiPicker?.index === index && multiPicker.field === "llegadaDate",
                                  (v) =>
                                    setMultiPicker(
                                      v ? { index, field: "llegadaDate" } : null
                                    ),
                                  multiPicker?.index === index && multiPicker.field === "llegadaTime",
                                  (v) =>
                                    setMultiPicker(
                                      v ? { index, field: "llegadaTime" } : null
                                    )
                                )
                              )}
                            </>
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
                                    ...users.map((u) => ({
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
              (() => {
                const trip = editingTrip;
                if (!trip) {
                  return (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyText}>Selecciona un viaje para ver el detalle.</Text>
                    </View>
                  );
                }
                const leg = getOperadorLegInfo(trip);
                const unidadNombre = units.find((u) => u.id === leg.unidadId)?.nombre || leg.unidadId || "—";
                const acompananteId = toId(leg.acompanante);
                const acompananteNombre =
                  !acompananteId || acompananteId === "none"
                    ? "Sin acompañante"
                    : users.find((u) => u.id === acompananteId)?.nombre ?? "Sin acompañante";

                return (
                  <>
                    {renderFormSection(
                      "Información del viaje",
                      <>
                        <View style={styles.specGrid}>
                          <View style={styles.specItem}>
                            <Text style={styles.specLabel}>Fecha y hora de salida</Text>
                            <Text style={styles.specValue}>{formatDateTimeLabel(leg.fechaSalida)}</Text>
                          </View>
                          <View style={styles.specItem}>
                            <Text style={styles.specLabel}>Fecha de llegada</Text>
                            <Text style={styles.specValue}>{formatDateTimeLabel(leg.fechaLlegada)}</Text>
                          </View>
                          <View style={styles.specItem}>
                            <Text style={styles.specLabel}>Destino</Text>
                            <Text style={styles.specValue}>{leg.destino}</Text>
                          </View>
                          <View style={styles.specItem}>
                            <Text style={styles.specLabel}>Acompañante</Text>
                            <Text style={styles.specValue}>{acompananteNombre}</Text>
                          </View>
                          <View style={styles.specItem}>
                            <Text style={styles.specLabel}>Unidad</Text>
                            <Text style={styles.specValue}>{unidadNombre}</Text>
                          </View>
                          <View style={styles.specItem}>
                            <Text style={styles.specLabel}>Estado</Text>
                            <Text style={styles.specValue}>{trip.estado}</Text>
                          </View>
                        </View>
                        {trip.multidestino ? (
                          <Text style={styles.operadorLegHint}>
                            {leg.label} · tramo {(trip.destinoActualIndex ?? 0) + 1} de {getTotalDestinosCount(trip)}
                          </Text>
                        ) : null}
                      </>
                    )}
                    {renderFormSection("Acciones", renderOperadorActions(trip))}
                  </>
                );
              })()
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        <View style={[styles.modalActions, isMobile && styles.modalActionsTouch]}>
          <TouchableOpacity
            style={[styles.cancelButton, isMobile && styles.modalActionTouch, !isAdmin && styles.cancelButtonFull]}
            onPress={closeModal}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={styles.cancelButtonText}>{isAdmin ? "Cancelar" : "Cerrar"}</Text>
          </TouchableOpacity>
          {isAdmin && (
            <TouchableOpacity
              style={[styles.saveButton, isMobile && styles.modalActionTouch, saving && styles.saveButtonDisabled]}
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
          )}
        </View>
      </View>
    );

    if (isMobile) {
      return (
        <SafeAreaView style={styles.modalSafeArea} edges={["top", "bottom"]}>
          {modalBody}
        </SafeAreaView>
      );
    }

    return modalBody;
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
            <TouchableOpacity style={[styles.addButton, isMobile && styles.addButtonMobile]} onPress={() => openModal()} activeOpacity={0.85}>
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

            <TouchableOpacity style={[styles.exportButton, isMobile && styles.exportButtonMobile]} onPress={exportToExcel} activeOpacity={0.85}>
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
            style={[styles.webModalOverlay, isMobile && styles.webModalOverlayTouch]}
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
          <View style={[styles.modalContainer, isMobile && styles.modalContainerTouch]}>
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
  addButtonMobile: { width: "100%", alignSelf: "stretch" as const, paddingVertical: 14 },
  addButtonText:{color: "#ffffff", fontWeight: "700", fontSize: 14 },
  exportButton:{flexDirection: "row",alignItems: "center",justifyContent: "center",gap: 8,paddingVertical: 10,paddingHorizontal: 16, borderRadius: 999,borderWidth: 1.5,borderColor: "#111111",backgroundColor: "#ffffff",flexShrink: 0,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  exportButtonMobile: { width: "100%" },
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
  estadoProgreso: { backgroundColor: "#eff6ff", borderWidth: 1, borderColor: "#bfdbfe" },
  estadoParada: { backgroundColor: "#f5f3ff", borderWidth: 1, borderColor: "#ddd6fe" },
  estadoCompletado: { backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#a7f3d0" },
  estadoText: { fontSize: 11, fontWeight: "700" },
  estadoTextPendiente: { color: "#d97706" },
  estadoTextProgreso: { color: "#2563eb" },
  estadoTextParada: { color: "#7c3aed" },
  estadoTextCompletado: { color: "#059669" },
  operadorCardFooter: {
    marginTop: 4,
    gap: 10,
  },
  operadorActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  operadorActionsRowCompact: {
    marginBottom: 4,
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
    fontWeight: "700",
    fontSize: 12,
  },
  operadorActionTextPrimary: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 12,
  },
  operadorActionTextDanger: {
    color: "#dc2626",
    fontWeight: "700",
    fontSize: 12,
  },
  operadorDoneHint: {
    fontSize: 12,
    fontWeight: "600",
    color: "#059669",
  },
  operadorLegHint: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },
  cancelButtonFull: { flex: 1 },
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
  webModalOverlayTouch: { padding: 0, justifyContent: "flex-end", alignItems: "stretch" } as any,
  modalContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 16 },
  modalContainerTouch: { padding: 0, justifyContent: "flex-end", backgroundColor: "#ffffff" },
  modalSafeArea: { flex: 1, backgroundColor: "#ffffff" },
  modalCard: {
    width: Platform.OS === "web" ? 720 : "96%",
    maxWidth: "100%",
    maxHeight: Platform.OS === "web" ? ("90vh" as any) : "92%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "column",
    ...(Platform.OS === "web" ? { boxShadow: "0 20px 50px rgba(0,0,0,0.18)" as any, display: "flex" as any } : {}),
  },
  modalCardTouch: {
    width: "100%",
    maxHeight: Platform.OS === "web" ? ("94vh" as any) : "100%",
    height: Platform.OS === "web" ? ("94vh" as any) : "100%",
    borderRadius: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 0,
    flex: 1,
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
    minHeight: Platform.OS === "web" ? 280 : 0,
    maxHeight: Platform.OS === "web" ? ("calc(90vh - 160px)" as any) : undefined,
  },
  modalScroll:{ flex: 1 },
  modalScrollContent:{paddingHorizontal: 22, paddingTop: 18, paddingBottom: 24 },
  modalScrollContentTouch: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  formSection: {
    backgroundColor: "#fafafa",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    marginBottom: 14,
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
  modalFieldGroup:{marginBottom: 12 },
  modalFieldGroupMobile: { marginBottom: 14 },
  modalFieldLabel:{fontSize: 12,fontWeight: "700",color: "#374151",marginBottom: 6,letterSpacing: 0.2, },
  modalFieldLabelMobile: { fontSize: 13, marginBottom: 8 },
  modalFieldRow: { flexDirection: "row", gap: 12 },
  modalFieldRowStack: { flexDirection: "column", gap: 0 },
  modalFieldHalf: { flex: 1, minWidth: 0 },
  modalFieldFull: { flex: undefined, width: "100%", minWidth: "100%" as any },
  modalInput: {width: "100%",height: 42,backgroundColor: "#ffffff",borderRadius: 10,borderWidth: 1,borderColor: "#e5e7eb",},
  modalInputTouch: { height: 48, borderRadius: 12 },
  modalInputContent: { color: "#111111", fontWeight: "600", fontSize: 14 },
  modalInputContentTouch: { fontSize: 16 },
  pickerWrap: { backgroundColor: "#ffffff", borderRadius: 10, borderWidth: 1, borderColor: "#e5e7eb", overflow: "hidden",},
  pickerWrapTouch: { borderRadius: 12, minHeight: 48, justifyContent: "center" },
  picker: { width: "100%", color: "#111111" },
  pickerTouch: { height: 48 },
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
  dateTimeRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  dateTimeRowStack: { flexDirection: "column", alignItems: "stretch", gap: 10 },
  dateTimeInput: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#ffffff", borderRadius: 10, borderWidth: 1, borderColor: "#e5e7eb", paddingHorizontal: 12, paddingVertical: 11 },
  dateTimeInputTouch: { width: "100%", minHeight: 48, borderRadius: 12, paddingVertical: 14 },
  dateTimeText: { fontSize: 14, fontWeight: "600", color: "#111111" },
  travelTimeCard: { backgroundColor: "#ffffff", borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb", padding: 16, marginTop: 4 },
  travelTimeCardTouch: { padding: 18, borderRadius: 14, marginTop: 8 },
  travelTimeCardLive: { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0" },
  travelTimeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  travelTimeHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  travelTimeTitle: { fontSize: 13, fontWeight: "800", color: "#111111" },
  travelTimeValue: { fontSize: 28, fontWeight: "800", color: "#111111", letterSpacing: 0.5 },
  travelTimeValueTouch: { fontSize: 32 },
  travelTimeValueLive: { color: "#059669" },
  travelTimeHint: { fontSize: 12, color: "#6b7280", marginTop: 4 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#059669" },
  modalActions: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingHorizontal: 22, paddingTop: 14,paddingBottom: 22,borderTopWidth: 1,borderTopColor: "#f3f4f6", flexShrink: 0,
  },
  modalActionsTouch: { flexDirection: "column-reverse", gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  modalActionTouch: { width: "100%", paddingVertical: 15, borderRadius: 14 },
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
