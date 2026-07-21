import { FontAwesome5 } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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
import { Portal, TextInput } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import SignaturePad, { SignaturePadHandle } from "../components/SignaturePad";
import { api } from "../services/api";

interface InventarioUnidad {
  _id: string;
  contenido: string;
  firmaUrl: string;
  operadorNombre: string;
  creadoPorNombre?: string;
  fecha: string;
}

interface Unit {
  id: string;
  nombre: string;
  placas: string;
  modelo: string;
  capacidad: string;
  estado: "Disponible" | "Mantenimiento" | "Ocupado";
  tipoRemolque?: "Lowboy" | "Caja Seca" | "";
  placaRemolque?: string;
  inventarios?: InventarioUnidad[];
  imagenUrl?: string;
}

interface UnitsPageProps {
  currentUser?: {
    id?: string;
    _id?: string;
    nombre?: string;
    apellido?: string;
    rol?: string;
  } | null;
}

const notify = (title: string, message: string) => {
  if (Platform.OS === "web") {
    window.alert(`${title}\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

const mapUnit = (u: any): Unit => ({
  id: String(u.id || u._id),
  nombre: u.nombre,
  placas: u.placas,
  modelo: u.modelo,
  capacidad: String(u.capacidad),
  estado: u.estado,
  tipoRemolque: u.tipoRemolque || "",
  placaRemolque: u.placaRemolque || "",
  inventarios: (u.inventarios || []).map((inv: any) => ({
    _id: String(inv._id || inv.id),
    contenido: inv.contenido || "",
    firmaUrl: inv.firmaUrl || "",
    operadorNombre:
      inv.operadorNombre ||
      (inv.operadorId && typeof inv.operadorId === "object"
        ? `${inv.operadorId.nombre || ""} ${inv.operadorId.apellido || ""}`.trim()
        : ""),
    creadoPorNombre: inv.creadoPorNombre || "",
    fecha: inv.fecha,
  })),
  imagenUrl: u.imagenUrl || "",
});

/** Miniatura de unidad: muestra el camioncito si no hay foto o si la imagen falla/está subiendo. */
function UnitThumb({ uri, size = 28 }: { uri?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={styles.unitImage}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={styles.unitImagePlaceholder}>
      <FontAwesome5 name="truck" size={size} color="#9ca3af" />
    </View>
  );
}

export default function UnitsPage({ currentUser }: UnitsPageProps) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [saving, setSaving] = useState(false);

  // Inventario de entrega (texto + firma)
  const [inventarioTexto, setInventarioTexto] = useState("");
  const [invOperadorId, setInvOperadorId] = useState("");
  const [invOperadorSheetOpen, setInvOperadorSheetOpen] = useState(false);
  const [operadores, setOperadores] = useState<{ id: string; nombre: string }[]>([]);
  const [savingInv, setSavingInv] = useState(false);
  const signatureRef = useRef<SignaturePadHandle>(null);

  const [nombre, setNombre] = useState("");
  const [placas, setPlacas] = useState("");
  const [modelo, setModelo] = useState("");
  const [capacidad, setCapacidad] = useState("");
  const [estado, setEstado] = useState<Unit["estado"]>("Disponible");
  const [tipoRemolque, setTipoRemolque] = useState<"" | "Lowboy" | "Caja Seca">("");
  const [placaRemolque, setPlacaRemolque] = useState("");

  const unidadesConRemolque = ["002", "007"];
  const [mostrarRemolque, setMostrarRemolque] = useState(false);
  const [imagenUrl, setImagenUrl] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteInvConfirmId, setDeleteInvConfirmId] = useState<string | null>(null);
  const [viewInv, setViewInv] = useState<InventarioUnidad | null>(null);
  const [invScrollEnabled, setInvScrollEnabled] = useState(true);

  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  useEffect(() => {
    loadUnits();
    loadOperadores();
  }, []);

  const loadOperadores = async () => {
    try {
      const res = await api.get("/users", { params: { activo: true } });
      const ops = (res.data as any[])
        .filter((u) => {
          if (u.activo === false) return false;
          const r = String(u.rol || "").toLowerCase();
          return r.includes("operador") || r.includes("ayudante");
        })
        .map((u) => ({
          id: String(u._id || u.id),
          nombre: `${u.nombre || ""} ${u.apellido || ""}`.trim() || "Operador",
        }));
      setOperadores(ops);
    } catch (error) {
      console.error("Error cargando operadores", error);
    }
  };

  const loadUnits = async () => {
    setListLoading(true);
    setLoadError("");
    try {
      const res = await api.get("/units");
      const mapped = (res.data as any[])
        .map(mapUnit)
        .sort((a, b) =>
          String(a.nombre).localeCompare(String(b.nombre), "es", { numeric: true })
        );
      setUnits(mapped);
    } catch (error) {
      console.error("Error cargando unidades", error);
      setLoadError("No se pudieron cargar las unidades.");
    } finally {
      setListLoading(false);
    }
  };

  const closeModal = () => {
    setModalVisible(false);
    setSaving(false);
    setSavingInv(false);
    setInventarioTexto("");
    setInvOperadorId("");
    setInvOperadorSheetOpen(false);
    setInvScrollEnabled(true);
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
      setMostrarRemolque(unidadesConRemolque.includes(unit.nombre));
    } else {
      setEditingUnit(null);
      setNombre("");
      setPlacas("");
      setModelo("");
      setCapacidad("");
      setEstado("Disponible");
      setTipoRemolque("");
      setPlacaRemolque("");
      setImagenUrl("");
      setMostrarRemolque(false);
    }
    setInventarioTexto("");
    setInvOperadorId("");
    setModalVisible(true);
  };

  const saveUnit = async () => {
    if (!nombre || !placas || !modelo || !capacidad) {
      notify("Falta información", "Completa todos los datos obligatorios.");
      return;
    }
    const unitData = {
      nombre,
      placas,
      modelo,
      capacidad,
      estado,
      tipoRemolque,
      placaRemolque: tipoRemolque ? placaRemolque : "",
      imagenUrl,
    };

    setSaving(true);
    try {
      if (editingUnit) {
        await api.put(`/units/${editingUnit.id}`, unitData);
      } else {
        await api.post("/units", unitData);
      }
      await loadUnits();
      closeModal();
      notify("Listo", editingUnit ? "Unidad actualizada." : "Unidad guardada.");
    } catch (error) {
      console.error("Error guardando unidad", error);
      notify("Error", "No se pudo guardar la unidad.");
    } finally {
      setSaving(false);
    }
  };

  const seleccionarImagenUnidad = async (unitId: string) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });
      if (result.canceled) return;
      const imageUri = result.assets[0].uri;
      const formData = new FormData();

      if (Platform.OS === "web") {
        const response = await fetch(imageUri);
        const blob = await response.blob();
        formData.append("image", blob, `unidad_${Date.now()}.jpg`);
      } else {
        formData.append("image", {
          uri: imageUri,
          name: `unidad_${Date.now()}.jpg`,
          type: "image/jpeg",
        } as any);
      }

      await api.post(`/units/${unitId}/image`, formData);
      notify("Listo", "Imagen actualizada.");
      await loadUnits();
    } catch (error) {
      console.error(error);
      notify("Error", "No se pudo subir la imagen.");
    }
  };

  // Modal propio: Alert.alert / window.confirm fallan o no se ven bien en Expo web/móvil
  const deleteUnit = (id: string) => {
    setDeleteConfirmId(String(id));
  };

  const proceedDeleteUnit = async () => {
    const id = deleteConfirmId;
    if (!id) return;
    setDeleteConfirmId(null);
    try {
      await api.delete(`/units/${id}`);
      setUnits((prev) => prev.filter((u) => u.id !== id));
      notify("Listo", "Unidad eliminada correctamente.");
    } catch (error) {
      console.error("Error eliminando unidad", error);
      notify("Error", "No se pudo eliminar la unidad.");
    }
  };

  const closeDeleteConfirm = () => setDeleteConfirmId(null);

  const deleteInventario = (inventarioId: string) => {
    setDeleteInvConfirmId(String(inventarioId));
  };

  const proceedDeleteInventario = async () => {
    const inventarioId = deleteInvConfirmId;
    if (!inventarioId || !editingUnit) return;
    setDeleteInvConfirmId(null);
    try {
      await api.delete(`/units/${editingUnit.id}/inventarios/${inventarioId}`);
      await refreshEditingUnit(editingUnit.id);
      await loadUnits();
      notify("Listo", "Inventario eliminado correctamente.");
    } catch (error) {
      console.error("Error eliminando inventario", error);
      notify("Error", "No se pudo eliminar el inventario.");
    }
  };

  const closeDeleteInvConfirm = () => setDeleteInvConfirmId(null);

  const renderDeleteInvConfirmModal = () => {
    if (!deleteInvConfirmId) return null;

    const card = (
      <View
        style={[styles.confirmCard, isMobile && styles.confirmCardMobile]}
        {...(Platform.OS === "web" ? { onClick: (e: any) => e.stopPropagation() } : {})}
      >
        <View style={styles.confirmIconBadge}>
          <FontAwesome5 name="trash-alt" size={18} color="#ffffff" />
        </View>
        <Text style={styles.confirmTitle}>Eliminar inventario</Text>
        <Text style={styles.confirmMessage}>
          ¿Estás seguro de que deseas eliminar este inventario? Esta acción no se puede
          deshacer.
        </Text>
        <View style={styles.confirmActions}>
          <TouchableOpacity
            style={styles.confirmCancelBtn}
            onPress={closeDeleteInvConfirm}
            activeOpacity={0.85}
          >
            <Text style={styles.confirmCancelText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.confirmDeleteBtn}
            onPress={() => {
              void proceedDeleteInventario();
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.confirmDeleteText}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );

    return (
      <View style={styles.embedOverlay} pointerEvents="box-none">
        <Pressable style={styles.confirmBackdrop} onPress={closeDeleteInvConfirm} />
        {card}
      </View>
    );
  };

  const renderViewInvModal = () => {
    if (!viewInv) return null;
    const inv = viewInv;

    const card = (
      <View
        style={[styles.viewInvCard, isMobile && styles.viewInvCardMobile]}
        {...(Platform.OS === "web" ? { onClick: (e: any) => e.stopPropagation() } : {})}
      >
        <View style={styles.viewInvHeader}>
          <View style={styles.invHistoryHeaderLeft}>
            <FontAwesome5 name="clipboard-check" size={16} color="#111111" />
            <Text style={styles.viewInvTitle}>Inventario</Text>
          </View>
          <TouchableOpacity onPress={() => setViewInv(null)} hitSlop={8}>
            <FontAwesome5 name="times" size={18} color="#6b7280" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.viewInvScroll} contentContainerStyle={{ paddingBottom: 8 }}>
          <Text style={styles.viewInvMeta}>
            <Text style={styles.invAutoInfoLabel}>Fecha: </Text>
            {formatInvFecha(inv.fecha)}
          </Text>
          {inv.operadorNombre ? (
            <Text style={styles.viewInvMeta}>
              <Text style={styles.invAutoInfoLabel}>Operador: </Text>
              {inv.operadorNombre}
            </Text>
          ) : null}

          <Text style={styles.viewInvSectionLabel}>Contenido</Text>
          <Text style={styles.viewInvContent}>{inv.contenido}</Text>

          {inv.firmaUrl ? (
            <>
              <Text style={styles.viewInvSectionLabel}>Firma</Text>
              <Image
                source={{ uri: inv.firmaUrl }}
                style={styles.viewInvSignature}
                resizeMode="contain"
              />
            </>
          ) : null}

          {inv.creadoPorNombre ? (
            <Text style={styles.invHistoryBy}>Registrado por {inv.creadoPorNombre}</Text>
          ) : null}
        </ScrollView>

        <TouchableOpacity
          style={styles.viewInvCloseBtn}
          onPress={() => setViewInv(null)}
          activeOpacity={0.85}
        >
          <Text style={styles.viewInvCloseText}>Cerrar</Text>
        </TouchableOpacity>
      </View>
    );

    return (
      <View style={styles.embedOverlay} pointerEvents="box-none">
        <Pressable style={styles.confirmBackdrop} onPress={() => setViewInv(null)} />
        {card}
      </View>
    );
  };

  const renderInvOperadorSheet = () => {
    if (!invOperadorSheetOpen) return null;
    const close = () => setInvOperadorSheetOpen(false);
    const card = (
      <View
        style={[styles.invSheetCard, isMobile && styles.invSheetCardMobile]}
        {...(Platform.OS === "web" ? { onClick: (e: any) => e.stopPropagation() } : {})}
      >
        <View style={styles.invSheetHeader}>
          <Text style={styles.invSheetTitle}>Selecciona operador</Text>
          <TouchableOpacity onPress={close} hitSlop={8}>
            <FontAwesome5 name="times" size={16} color="#6b7280" />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.invSheetList} keyboardShouldPersistTaps="handled">
          {operadores.length === 0 ? (
            <Text style={styles.invSheetEmpty}>No hay operadores disponibles</Text>
          ) : (
            operadores.map((op) => {
              const active = op.id === invOperadorId;
              return (
                <TouchableOpacity
                  key={op.id}
                  style={[styles.invSheetItem, active && styles.invSheetItemActive]}
                  onPress={() => {
                    setInvOperadorId(op.id);
                    close();
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.invSheetItemText, active && styles.invSheetItemTextActive]}>
                    {op.nombre}
                  </Text>
                  {active ? <FontAwesome5 name="check" size={13} color="#111111" /> : null}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>
    );
    return (
      <View style={styles.embedOverlay} pointerEvents="box-none">
        <Pressable style={styles.confirmBackdrop} onPress={close} />
        {card}
      </View>
    );
  };

  const renderDeleteConfirmModal = () => {
    if (!deleteConfirmId) return null;

    const card = (
      <View
        style={[styles.confirmCard, isMobile && styles.confirmCardMobile]}
        {...(Platform.OS === "web" ? { onClick: (e: any) => e.stopPropagation() } : {})}
      >
        <View style={styles.confirmIconBadge}>
          <FontAwesome5 name="trash-alt" size={18} color="#ffffff" />
        </View>
        <Text style={styles.confirmTitle}>Eliminar unidad</Text>
        <Text style={styles.confirmMessage}>
          ¿Estás seguro de que deseas eliminar esta unidad? Esta acción no se puede deshacer.
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
              void proceedDeleteUnit();
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

  const refreshEditingUnit = async (unitId: string) => {
    try {
      const res = await api.get(`/units/${unitId}`);
      setEditingUnit(mapUnit(res.data));
    } catch (error) {
      console.error(error);
    }
  };

  const guardarInventario = async () => {
    if (!editingUnit) {
      notify("Guarda primero", "Guarda la unidad antes de crear un inventario.");
      return;
    }
    if (!inventarioTexto.trim()) {
      notify("Falta contenido", "Escribe el contenido del inventario.");
      return;
    }
    if (!invOperadorId) {
      notify("Falta operador", "Selecciona el operador que recibe la unidad.");
      return;
    }

    let firma = "";
    try {
      firma = (await signatureRef.current?.getData()) || "";
    } catch (error) {
      console.error("Error leyendo firma", error);
    }
    if (!firma) {
      notify("Falta firma", "Captura la firma antes de guardar.");
      return;
    }

    setSavingInv(true);
    try {
      await api.post(`/units/${editingUnit.id}/inventarios`, {
        contenido: inventarioTexto.trim(),
        operadorId: invOperadorId,
        firmaBase64: firma,
      });
      await refreshEditingUnit(editingUnit.id);
      await loadUnits();
      setInventarioTexto("");
      setInvOperadorId("");
      signatureRef.current?.clear();
      notify("Listo", "Inventario guardado correctamente.");
    } catch (error: any) {
      console.error("Error guardando inventario", error);
      const msg =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        "No se pudo guardar el inventario.";
      notify("Error", String(msg));
    } finally {
      setSavingInv(false);
    }
  };

  const formatInvFecha = (fecha?: string) => {
    if (!fecha) return "Sin fecha";
    try {
      return new Date(fecha).toLocaleString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Sin fecha";
    }
  };

  const getEstadoStyle = (estadoValue: Unit["estado"]) => {
    if (estadoValue === "Disponible") {
      return {
        badge: styles.estadoDisponible,
        text: styles.estadoTextDisponible,
        icon: "check-circle" as const,
        iconColor: "#059669",
      };
    }
    if (estadoValue === "Mantenimiento") {
      return {
        badge: styles.estadoMantenimiento,
        text: styles.estadoTextMantenimiento,
        icon: "tools" as const,
        iconColor: "#d97706",
      };
    }
    return {
      badge: styles.estadoOcupado,
      text: styles.estadoTextOcupado,
      icon: "ban" as const,
      iconColor: "#dc2626",
    };
  };

  const renderItem = ({ item }: { item: Unit }) => {
    const estadoStyle = getEstadoStyle(item.estado);
    const invCount = item.inventarios?.length || 0;

    return (
      <View style={[styles.card, isMobile ? styles.cardMobile : styles.cardDesktop]}>
        <View style={styles.cardTop}>
          <TouchableOpacity
            style={styles.imageWrap}
            onPress={() => seleccionarImagenUnidad(item.id)}
            activeOpacity={0.85}
          >
            <UnitThumb uri={item.imagenUrl} />
            <View style={styles.photoBadge}>
              <FontAwesome5 name="camera" size={9} color="#ffffff" />
            </View>
          </TouchableOpacity>

          <View style={styles.cardTopInfo}>
            <View style={styles.cardHeader}>
              <Text style={styles.unitName} numberOfLines={1}>
                {item.nombre}
              </Text>
              <View style={[styles.estadoBadge, estadoStyle.badge]}>
                <FontAwesome5 name={estadoStyle.icon} size={9} color={estadoStyle.iconColor} />
                <Text style={[styles.estadoText, estadoStyle.text]}>{item.estado}</Text>
              </View>
            </View>
            {item.modelo ? (
              <Text style={styles.unitModelo} numberOfLines={1}>
                {item.modelo}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.specGrid}>
          <View style={styles.specItem}>
            <Text style={styles.specLabel}>Placas</Text>
            <Text style={styles.specValue} numberOfLines={1}>
              {item.placas || "—"}
            </Text>
          </View>
          <View style={styles.specItem}>
            <Text style={styles.specLabel}>Capacidad</Text>
            <Text style={styles.specValue} numberOfLines={1}>
              {item.capacidad || "—"}
            </Text>
          </View>
          <View style={styles.specItem}>
            <Text style={styles.specLabel}>Inventarios</Text>
            <Text style={styles.specValue} numberOfLines={1}>
              {invCount > 0 ? `${invCount} registro${invCount === 1 ? "" : "s"}` : "Sin registros"}
            </Text>
          </View>
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => openModal(item)}
            activeOpacity={0.85}
          >
            <FontAwesome5 name="pen" size={12} color="#111111" />
            <Text style={styles.editBtnText}>Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteBtnCard}
            onPress={() => deleteUnit(item.id)}
            activeOpacity={0.85}
          >
            <FontAwesome5 name="trash-alt" size={12} color="#dc2626" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderText}>
          <Text style={styles.pageTitle}>Unidades Registradas</Text>
          <Text style={styles.subtitle}>Flota, capacidad y estado de cada vehículo</Text>
        </View>
        {!listLoading && !loadError ? (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{units.length}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.toolbarPanel}>
        <TouchableOpacity
          style={[styles.addButton, isMobile && styles.addButtonMobile]}
          onPress={() => openModal()}
          activeOpacity={0.85}
        >
          <FontAwesome5 name="plus" size={14} color="#ffffff" />
          <Text style={styles.addButtonText}>Nueva Unidad</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listPanel}>
        {listLoading ? (
          <View style={styles.emptyState}>
            <FontAwesome5 name="spinner" size={20} color="#9ca3af" />
            <Text style={styles.emptyText}>Cargando unidades...</Text>
          </View>
        ) : loadError ? (
          <View style={styles.emptyState}>
            <FontAwesome5 name="exclamation-triangle" size={20} color="#dc2626" />
            <Text style={styles.emptyText}>{loadError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadUnits}>
              <Text style={styles.retryButtonText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : units.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome5 name="truck" size={22} color="#9ca3af" />
            <Text style={styles.emptyTitle}>No hay unidades</Text>
            <Text style={styles.emptyText}>Pulsa "Nueva Unidad" para registrar la primera.</Text>
          </View>
        ) : (
          <FlatList
            data={units}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            style={styles.listFlex}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            numColumns={isMobile ? 1 : 2}
            columnWrapperStyle={isMobile ? undefined : styles.listRow}
          />
        )}
      </View>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={!isMobile}
        presentationStyle={isMobile ? "fullScreen" : "pageSheet"}
        onRequestClose={closeModal}
      >
        <View style={[styles.modalOverlay, isMobile && styles.modalOverlayMobile]}>
          <SafeAreaView style={[styles.modalCard, isMobile && styles.modalCardMobile]}>
            {isMobile ? <View style={styles.modalDragHandle} /> : null}

            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View style={styles.modalIconBadge}>
                  <FontAwesome5 name="truck" size={16} color="#ffffff" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.modalTitle}>
                    {editingUnit ? "Editar unidad" : "Nueva unidad"}
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    {editingUnit
                      ? "Actualiza datos y registra inventarios de entrega"
                      : "Registra la unidad; el inventario se agrega después de guardar"}
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={styles.modalCloseButton} onPress={closeModal} activeOpacity={0.85}>
                <FontAwesome5 name="times" size={14} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={[
                styles.modalScrollContent,
                isMobile && styles.modalScrollContentMobile,
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              scrollEnabled={invScrollEnabled}
            >
              <View style={[styles.formSection, isMobile && styles.formSectionMobile]}>
                <Text style={styles.formSectionTitle}>Datos generales</Text>
                <Text style={styles.fieldLabel}>Nombre</Text>
                <TextInput
                  value={nombre}
                  onChangeText={(t) => {
                    setNombre(t);
                    setMostrarRemolque(unidadesConRemolque.includes(t));
                  }}
                  mode="outlined"
                  outlineColor="#e5e7eb"
                  activeOutlineColor="#111111"
                  dense
                  style={styles.input}
                  contentStyle={styles.inputContent}
                />
                <Text style={styles.fieldLabel}>Placas</Text>
                <TextInput
                  value={placas}
                  onChangeText={setPlacas}
                  mode="outlined"
                  outlineColor="#e5e7eb"
                  activeOutlineColor="#111111"
                  dense
                  style={styles.input}
                  contentStyle={styles.inputContent}
                />
                <Text style={styles.fieldLabel}>Modelo</Text>
                <TextInput
                  value={modelo}
                  onChangeText={setModelo}
                  mode="outlined"
                  outlineColor="#e5e7eb"
                  activeOutlineColor="#111111"
                  dense
                  style={styles.input}
                  contentStyle={styles.inputContent}
                />
                <Text style={styles.fieldLabel}>Capacidad</Text>
                <TextInput
                  value={capacidad}
                  onChangeText={setCapacidad}
                  mode="outlined"
                  outlineColor="#e5e7eb"
                  activeOutlineColor="#111111"
                  dense
                  style={styles.input}
                  contentStyle={styles.inputContent}
                />
                <Text style={styles.fieldLabel}>Estado</Text>
                <View style={styles.estadoPickerWrap}>
                  {(["Disponible", "Mantenimiento", "Ocupado"] as Unit["estado"][]).map((opt) => {
                    const active = estado === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.estadoPill, active && styles.estadoPillActive]}
                        onPress={() => setEstado(opt)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.estadoPillText, active && styles.estadoPillTextActive]}>
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={[styles.formSection, isMobile && styles.formSectionMobile]}>
                <View style={styles.invSectionHeader}>
                  <View style={styles.invSectionHeaderLeft}>
                    <FontAwesome5 name="clipboard-list" size={14} color="#111111" />
                    <Text style={styles.formSectionTitleInline}>Inventario de la unidad</Text>
                  </View>
                  {editingUnit?.inventarios?.length ? (
                    <View style={styles.invCountPill}>
                      <Text style={styles.invCountPillText}>{editingUnit.inventarios.length}</Text>
                    </View>
                  ) : null}
                </View>

                {!editingUnit ? (
                  <Text style={styles.invHint}>
                    Guarda la unidad primero. Después podrás crear inventarios de entrega.
                  </Text>
                ) : (
                  <>
                    <Text style={styles.invHint}>
                      Registra la entrega: describe el contenido, elige el operador y firma. Cada
                      registro se guarda en el historial y no se sobrescribe.
                    </Text>

                    <View style={styles.invFormCard}>
                      <View style={styles.invFormCardHeader}>
                        <FontAwesome5 name="plus-circle" size={13} color="#111111" />
                        <Text style={styles.invFormCardTitle}>Nuevo inventario de entrega</Text>
                      </View>

                      <Text style={styles.invFieldLabel}>Operador que recibe la unidad</Text>
                      <Pressable
                        style={styles.invSelectTrigger}
                        onPress={() => setInvOperadorSheetOpen(true)}
                      >
                        <Text
                          style={[
                            styles.invSelectText,
                            !invOperadorId && styles.invSelectPlaceholder,
                          ]}
                          numberOfLines={1}
                        >
                          {operadores.find((o) => o.id === invOperadorId)?.nombre ||
                            "Selecciona un operador…"}
                        </Text>
                        <FontAwesome5 name="chevron-down" size={12} color="#6b7280" />
                      </Pressable>

                      <Text style={styles.invFieldLabel}>Contenido del inventario</Text>
                      <TextInput
                        mode="outlined"
                        value={inventarioTexto}
                        onChangeText={setInventarioTexto}
                        placeholder="Describe todo el contenido y estado de la unidad…"
                        multiline
                        numberOfLines={6}
                        style={styles.invTextArea}
                        outlineColor="#e5e7eb"
                        activeOutlineColor="#111111"
                      />

                      <View style={styles.invSignHeaderRow}>
                        <Text style={styles.invFieldLabel}>Firma digital</Text>
                        <TouchableOpacity
                          onPress={() => signatureRef.current?.clear()}
                          hitSlop={8}
                          style={styles.invClearSignBtn}
                        >
                          <FontAwesome5 name="eraser" size={11} color="#2563eb" />
                          <Text style={styles.invClearSign}>Limpiar</Text>
                        </TouchableOpacity>
                      </View>
                      <View
                        style={styles.invSignFrame}
                        onTouchStart={() => setInvScrollEnabled(false)}
                        onTouchEnd={() => setInvScrollEnabled(true)}
                        onTouchCancel={() => setInvScrollEnabled(true)}
                      >
                        <SignaturePad
                          ref={signatureRef}
                          height={isMobile ? 220 : 180}
                          onBegin={() => setInvScrollEnabled(false)}
                          onEnd={() => setInvScrollEnabled(true)}
                        />
                        <Text style={styles.invSignBaseline}>Firme dentro del recuadro</Text>
                      </View>

                      <View style={styles.invAutoInfo}>
                        <View style={styles.invAutoInfoRow}>
                          <FontAwesome5 name="user-shield" size={11} color="#6b7280" />
                          <Text style={styles.invAutoInfoText}>
                            <Text style={styles.invAutoInfoLabel}>Registrado por: </Text>
                            {`${currentUser?.nombre || ""} ${currentUser?.apellido || ""}`.trim() ||
                              "Administrador"}
                          </Text>
                        </View>
                        <View style={styles.invAutoInfoRow}>
                          <FontAwesome5 name="clock" size={11} color="#6b7280" />
                          <Text style={styles.invAutoInfoText}>
                            <Text style={styles.invAutoInfoLabel}>Fecha y hora: </Text>
                            se registran automáticamente al guardar.
                          </Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={[styles.uploadInvBtn, savingInv && styles.uploadInvBtnDisabled]}
                        onPress={() => {
                          void guardarInventario();
                        }}
                        disabled={savingInv}
                        activeOpacity={0.85}
                      >
                        {savingInv ? (
                          <ActivityIndicator color="#ffffff" />
                        ) : (
                          <>
                            <FontAwesome5 name="save" size={14} color="#ffffff" />
                            <Text style={styles.uploadInvBtnText}>Guardar inventario</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>

                    <View style={styles.invHistoryTitleRow}>
                      <FontAwesome5 name="history" size={13} color="#111111" />
                      <Text style={styles.invHistoryTitle}>Historial de inventarios</Text>
                    </View>
                    {(editingUnit.inventarios || []).length === 0 ? (
                      <View style={styles.invEmpty}>
                        <FontAwesome5 name="folder-open" size={18} color="#9ca3af" />
                        <Text style={styles.invEmptyText}>Aún no hay inventarios registrados</Text>
                      </View>
                    ) : (
                      <View style={styles.invList}>
                        {[...(editingUnit.inventarios || [])]
                          .sort(
                            (a, b) =>
                              new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
                          )
                          .map((inv, index) => (
                            <View key={inv._id || String(index)} style={styles.invHistoryCard}>
                              <View style={styles.invHistoryHeader}>
                                <View style={styles.invHistoryHeaderLeft}>
                                  <FontAwesome5
                                    name="clipboard-check"
                                    size={14}
                                    color="#111111"
                                  />
                                  <Text style={styles.invHistoryDate}>
                                    {formatInvFecha(inv.fecha)}
                                  </Text>
                                </View>
                              </View>
                              {inv.operadorNombre ? (
                                <Text style={styles.invHistoryMeta}>
                                  <Text style={styles.invAutoInfoLabel}>Operador: </Text>
                                  {inv.operadorNombre}
                                </Text>
                              ) : null}
                              <Text style={styles.invHistoryContent} numberOfLines={4}>
                                {inv.contenido}
                              </Text>
                              {inv.firmaUrl ? (
                                <Image
                                  source={{ uri: inv.firmaUrl }}
                                  style={styles.invHistorySignature}
                                  resizeMode="contain"
                                />
                              ) : null}
                              {inv.creadoPorNombre ? (
                                <Text style={styles.invHistoryBy}>
                                  Registrado por {inv.creadoPorNombre}
                                </Text>
                              ) : null}

                              <View style={styles.invCardActions}>
                                <TouchableOpacity
                                  style={styles.invViewBtn}
                                  onPress={() => setViewInv(inv)}
                                  activeOpacity={0.85}
                                >
                                  <FontAwesome5 name="eye" size={12} color="#111111" />
                                  <Text style={styles.invViewBtnText}>Ver detalle</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={styles.invDeleteBtnFull}
                                  onPress={() => deleteInventario(inv._id)}
                                  activeOpacity={0.85}
                                >
                                  <FontAwesome5 name="trash-alt" size={12} color="#dc2626" />
                                  <Text style={styles.invDeleteBtnText}>Eliminar</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          ))}
                      </View>
                    )}
                  </>
                )}
              </View>
            </ScrollView>

            <View style={[styles.modalActions, isMobile && styles.modalActionsMobile]}>
              {isMobile ? (
                <>
                  <TouchableOpacity
                    style={[styles.saveButton, styles.actionBtnMobile, saving && styles.btnDisabled]}
                    onPress={() => {
                      void saveUnit();
                    }}
                    disabled={saving}
                    activeOpacity={0.85}
                  >
                    {saving ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.saveButtonText}>Guardar</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.cancelButton, styles.actionBtnMobile]}
                    onPress={closeModal}
                    disabled={saving}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.cancelButtonText}>Cancelar</Text>
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
                    style={[styles.saveButton, saving && styles.btnDisabled]}
                    onPress={() => {
                      void saveUnit();
                    }}
                    disabled={saving}
                    activeOpacity={0.85}
                  >
                    {saving ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.saveButtonText}>Guardar</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </SafeAreaView>
          {renderInvOperadorSheet()}
          {renderDeleteInvConfirmModal()}
          {renderViewInvModal()}
        </View>
      </Modal>

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
  embedOverlay: {
    ...StyleSheet.absoluteFillObject,
    position: (Platform.OS === "web" ? "fixed" : "absolute") as any,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    zIndex: 10050,
    elevation: 50,
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
  pageHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  pageHeaderText: { flex: 1, paddingRight: 12 },
  pageTitle: { fontSize: 24, fontWeight: "800", color: "#111111", letterSpacing: 0.2 },
  subtitle: { fontSize: 13, color: "#6b7280", marginTop: 4 },
  countBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  countBadgeText: { color: "#ffffff", fontWeight: "800", fontSize: 14 },
  toolbarPanel: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    marginBottom: 14,
    ...(Platform.OS === "web" ? { boxShadow: "0 8px 24px rgba(0,0,0,0.04)" as any } : {}),
  },
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
  listPanel: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === "web" ? { boxShadow: "0 8px 24px rgba(0,0,0,0.04)" as any } : {}),
  },
  listFlex: { flex: 1, minHeight: 0 },
  listContent: { paddingBottom: 24, gap: 12 },
  listRow: { gap: 12 },
  emptyState: { paddingVertical: 48, paddingHorizontal: 20, alignItems: "center", gap: 8 },
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
  card: {
    backgroundColor: "#fafafa",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    flex: 1,
  },
  cardMobile: { width: "100%" },
  cardDesktop: { minWidth: 0, maxWidth: "49%" as any },
  imageWrap: {
    position: "relative",
    alignSelf: "flex-start",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  unitImage: { width: 72, height: 72, borderRadius: 14, backgroundColor: "#e5e7eb" },
  unitImagePlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  photoBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  cardTopInfo: { flex: 1, minWidth: 0 },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  unitName: { fontSize: 18, fontWeight: "800", color: "#111111", flex: 1 },
  unitModelo: { fontSize: 13, color: "#6b7280", fontWeight: "600", marginTop: 3 },
  estadoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  estadoDisponible: { backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#a7f3d0" },
  estadoMantenimiento: { backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fde68a" },
  estadoOcupado: { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca" },
  estadoText: { fontSize: 11, fontWeight: "700" },
  estadoTextDisponible: { color: "#059669" },
  estadoTextMantenimiento: { color: "#d97706" },
  estadoTextOcupado: { color: "#dc2626" },
  specGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  specItem: {
    flex: 1,
    minWidth: 92,
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
  specValue: { fontSize: 13, fontWeight: "700", color: "#111111", marginTop: 3 },
  cardActions: { flexDirection: "row", gap: 8, alignItems: "stretch" },
  editBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  editBtnText: { fontSize: 13, fontWeight: "800", color: "#111111" },
  deleteBtnCard: {
    width: 48,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },

  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 16,
  },
  modalOverlayMobile: {
    padding: 0,
    backgroundColor: "#ffffff",
    justifyContent: "flex-start",
  },
  modalCard: {
    width: Platform.OS === "web" ? 640 : "100%",
    maxWidth: 640,
    maxHeight: Platform.OS === "web" ? ("90vh" as any) : "100%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "column",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 20px 50px rgba(0,0,0,0.18)" as any, display: "flex" as any }
      : { flex: 1 }),
  },
  modalCardMobile: {
    width: "100%",
    maxWidth: "100%",
    borderRadius: 0,
    borderWidth: 0,
    flex: 1,
    maxHeight: "100%",
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
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
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
  },
  modalScroll: { flex: 1, minHeight: 0 },
  modalScrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  modalScrollContentMobile: { paddingHorizontal: 14, paddingBottom: 40 },
  formSection: { marginBottom: 16 },
  formSectionMobile: {
    backgroundColor: "#fafafa",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    marginBottom: 14,
  },
  formSectionTitle: { fontSize: 14, fontWeight: "800", color: "#111111", marginBottom: 10 },
  formSectionTitleInline: { fontSize: 14, fontWeight: "800", color: "#111111", marginBottom: 0 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 6,
    marginTop: 4,
  },
  input: { backgroundColor: "#ffffff", marginBottom: 8 },
  inputContent: { color: "#111111", fontWeight: "600" },
  estadoPickerWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  estadoPill: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  estadoPillActive: { backgroundColor: "#111111", borderColor: "#111111" },
  estadoPillText: { fontSize: 12, fontWeight: "700", color: "#6b7280" },
  estadoPillTextActive: { color: "#ffffff" },
  pickerWrap: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 8,
    overflow: "hidden",
  },
  invSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  invSectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  invCountPill: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  invCountPillText: { color: "#ffffff", fontWeight: "800", fontSize: 12 },
  invHint: { fontSize: 13, color: "#6b7280", lineHeight: 18, marginBottom: 12 },
  remolqueHintText: { fontSize: 12, color: "#6b7280", lineHeight: 16, marginTop: 6 },
  pickPdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#111111",
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    marginBottom: 10,
  },
  pickPdfBtnText: { fontSize: 14, fontWeight: "800", color: "#111111" },
  selectedFileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  selectedFileName: { flex: 1, fontSize: 13, fontWeight: "600", color: "#111111" },
  uploadInvBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#111111",
    borderRadius: 12,
    paddingVertical: 14,
    minHeight: 48,
    marginBottom: 0,
  },
  uploadInvBtnDisabled: { opacity: 0.5 },
  uploadInvBtnText: { color: "#ffffff", fontWeight: "800", fontSize: 14 },
  invEmpty: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderStyle: "dashed",
    backgroundColor: "#ffffff",
  },
  invEmptyText: { fontSize: 13, color: "#9ca3af", fontWeight: "600" },
  invFieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 6,
    marginTop: 4,
  },
  invSelectTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 12,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  invSelectText: { flex: 1, fontSize: 14, fontWeight: "600", color: "#111111" },
  invSelectPlaceholder: { color: "#9ca3af", fontWeight: "500" },
  invSheetCard: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "70%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 20px 50px rgba(0,0,0,0.18)" as any }
      : {}),
  },
  invSheetCardMobile: { maxWidth: "100%" },
  invSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  invSheetTitle: { fontSize: 15, fontWeight: "800", color: "#111111" },
  invSheetList: { maxHeight: 340 },
  invSheetItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f6f7f9",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  invSheetItemActive: { backgroundColor: "#f8fafc" },
  invSheetItemText: { fontSize: 14, fontWeight: "600", color: "#374151", flex: 1 },
  invSheetItemTextActive: { color: "#111111", fontWeight: "800" },
  invSheetEmpty: {
    fontSize: 13,
    color: "#9ca3af",
    fontWeight: "600",
    textAlign: "center",
    paddingVertical: 24,
  },
  invTextArea: {
    backgroundColor: "#ffffff",
    minHeight: 120,
    marginBottom: 12,
  },
  invSignHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  invClearSign: { fontSize: 13, fontWeight: "700", color: "#2563eb" },
  invAutoInfo: {
    marginTop: 10,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 4,
  },
  invAutoInfoText: { fontSize: 12.5, color: "#374151", lineHeight: 18, flex: 1 },
  invAutoInfoLabel: { fontWeight: "800", color: "#111111" },
  invAutoInfoRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  invFormCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    marginBottom: 18,
  },
  invFormCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  invFormCardTitle: { fontSize: 13.5, fontWeight: "800", color: "#111111" },
  invClearSignBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#eff6ff",
  },
  invSignFrame: {
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    padding: 6,
    marginBottom: 12,
  },
  invSignBaseline: {
    fontSize: 11,
    color: "#9ca3af",
    fontWeight: "600",
    textAlign: "center",
    marginTop: 6,
  },
  invHistoryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    marginBottom: 10,
  },
  invHistoryTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111111",
  },
  invHistoryCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    gap: 6,
  },
  invHistoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  invHistoryHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  invDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    alignItems: "center",
    justifyContent: "center",
  },
  invHistoryDate: { fontSize: 13, fontWeight: "800", color: "#111111" },
  invHistoryMeta: { fontSize: 12.5, color: "#374151" },
  invHistoryContent: {
    fontSize: 13,
    color: "#111111",
    lineHeight: 19,
    marginTop: 2,
  },
  invHistorySignature: {
    width: "100%",
    height: 120,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    marginTop: 6,
  },
  invHistoryBy: { fontSize: 11.5, color: "#9ca3af", fontWeight: "600", marginTop: 2 },
  invCardActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  invViewBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  invViewBtnText: { fontSize: 13, fontWeight: "700", color: "#111111" },
  invDeleteBtnFull: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
  },
  invDeleteBtnText: { fontSize: 13, fontWeight: "700", color: "#dc2626" },
  viewInvCard: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "80%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 18,
    gap: 4,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  viewInvCardMobile: { maxWidth: "92%" },
  viewInvHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  viewInvTitle: { fontSize: 16, fontWeight: "800", color: "#111111" },
  viewInvScroll: { maxHeight: 420 },
  viewInvMeta: { fontSize: 13, color: "#374151", marginBottom: 2 },
  viewInvSectionLabel: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#111111",
    marginTop: 10,
    marginBottom: 4,
  },
  viewInvContent: { fontSize: 14, color: "#111111", lineHeight: 20 },
  viewInvSignature: {
    width: "100%",
    height: 160,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  viewInvCloseBtn: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#111111",
    alignItems: "center",
  },
  viewInvCloseText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  invList: { gap: 10 },
  invCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  invCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#fef2f2",
    alignItems: "center",
    justifyContent: "center",
  },
  invCardBody: { flex: 1, minWidth: 0 },
  invCardTitle: { fontSize: 14, fontWeight: "700", color: "#111111" },
  invCardMeta: { fontSize: 12, color: "#6b7280", marginTop: 2, fontWeight: "600" },
  invActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fafafa",
    alignItems: "center",
    justifyContent: "center",
  },
  invActionBtnDanger: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    backgroundColor: "#ffffff",
  },
  modalActionsMobile: {
    flexDirection: "column",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 24,
  },
  actionBtnMobile: { flex: 0, width: "100%", alignSelf: "stretch" },
  cancelButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#111111",
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  cancelButtonText: { color: "#111111", fontWeight: "800", fontSize: 14 },
  saveButton: {
    flex: 1,
    backgroundColor: "#111111",
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: { color: "#ffffff", fontWeight: "800", fontSize: 14 },
  btnDisabled: { opacity: 0.6 },
});
