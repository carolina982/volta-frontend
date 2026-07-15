import { FontAwesome5 } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { TextInput } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, BASE_URL } from "../services/api";

interface Unit {
  id: string;
  nombre: string;
  placas: string;
  modelo: string;
  capacidad: string;
  estado: "Disponible" | "Mantenimiento" | "Ocupado";
  tipoRemolque?: "Lowboy" | "Caja Seca" | "";
  placaRemolque?: string;
  inventarios?: {
    _id: string;
    archivo: string;
    fecha: string;
  }[];
  imagenUrl?: string;
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
    archivo: inv.archivo,
    fecha: inv.fecha,
  })),
  imagenUrl: u.imagenUrl || "",
});

export default function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingInv, setUploadingInv] = useState(false);

  const [nombre, setNombre] = useState("");
  const [placas, setPlacas] = useState("");
  const [modelo, setModelo] = useState("");
  const [capacidad, setCapacidad] = useState("");
  const [estado, setEstado] = useState<Unit["estado"]>("Disponible");
  const [tipoRemolque, setTipoRemolque] = useState<"" | "Lowboy" | "Caja Seca">("");
  const [placaRemolque, setPlacaRemolque] = useState("");

  const unidadesConRemolque = ["002", "007"];
  const [mostrarRemolque, setMostrarRemolque] = useState(false);
  const [pdf, setPdf] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [imagenUrl, setImagenUrl] = useState("");

  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  useEffect(() => {
    loadUnits();
  }, []);

  const loadUnits = async () => {
    setListLoading(true);
    setLoadError("");
    try {
      const res = await api.get("/units");
      setUnits(res.data.map(mapUnit));
    } catch (error) {
      console.error("Error cargando unidades", error);
      setLoadError("No se pudieron cargar las unidades.");
    } finally {
      setListLoading(false);
    }
  };

  const closeModal = () => {
    setModalVisible(false);
    setPdf(null);
    setSaving(false);
    setUploadingInv(false);
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
    setPdf(null);
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

  const pickPDF = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      if (result.assets && result.assets.length > 0) {
        setPdf(result.assets[0]);
      }
    } catch (error) {
      console.error(error);
      notify("Error", "No se pudo seleccionar el PDF.");
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

  const deleteUnit = async (id: string) => {
    const performDelete = async () => {
      try {
        await api.delete(`/units/${id}`);
        setUnits((prev) => prev.filter((u) => u.id !== id));
        notify("Listo", "Unidad eliminada correctamente.");
      } catch (error) {
        console.error("Error eliminando unidad", error);
        notify("Error", "No se pudo eliminar la unidad.");
      }
    };
    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        "¿Está seguro de que desea eliminar esta unidad? Esta acción no se puede deshacer."
      );
      if (confirmed) await performDelete();
    } else {
      Alert.alert(
        "Confirmar eliminación",
        "¿Deseas eliminar esta unidad permanentemente?",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Eliminar", style: "destructive", onPress: () => { void performDelete(); } },
        ],
        { cancelable: true }
      );
    }
  };

  const refreshEditingUnit = async (unitId: string, inventariosFromResponse?: any[]) => {
    if (inventariosFromResponse) {
      setEditingUnit((prev) =>
        prev
          ? {
              ...prev,
              inventarios: inventariosFromResponse.map((inv: any) => ({
                _id: String(inv._id || inv.id),
                archivo: inv.archivo,
                fecha: inv.fecha,
              })),
            }
          : prev
      );
      return;
    }
    try {
      const res = await api.get(`/units/${unitId}`);
      setEditingUnit(mapUnit(res.data));
    } catch (error) {
      console.error(error);
    }
  };

  const subirInventario = async () => {
    if (!pdf) {
      notify("Falta archivo", "Selecciona un PDF de inventario.");
      return;
    }
    if (!editingUnit) {
      notify("Guarda primero", "Guarda la unidad antes de subir inventario.");
      return;
    }

    setUploadingInv(true);
    try {
      const formData = new FormData();
      const fileName = pdf.name || `inventario_${Date.now()}.pdf`;
      const mimeType = pdf.mimeType || "application/pdf";

      if (Platform.OS === "web") {
        const response = await fetch(pdf.uri);
        const blob = await response.blob();
        formData.append("file", blob, fileName);
      } else {
        formData.append("file", {
          uri: pdf.uri,
          name: fileName,
          type: mimeType,
        } as any);
      }

      const res = await api.post(`/units/${editingUnit.id}/inventario`, formData);
      await refreshEditingUnit(editingUnit.id, res.data?.inventarios);
      setPdf(null);
      await loadUnits();
      notify("Listo", "Inventario subido correctamente.");
    } catch (error: any) {
      console.error("Error subiendo inventario", error);
      const msg =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        "No se pudo subir el inventario.";
      notify("Error", String(msg));
    } finally {
      setUploadingInv(false);
    }
  };

  const eliminarInventario = async (inventarioId: string) => {
    if (!editingUnit) return;

    const performDelete = async () => {
      try {
        const res = await api.delete(`/units/${editingUnit.id}/inventarios/${inventarioId}`);
        await refreshEditingUnit(editingUnit.id, res.data?.inventarios);
        await loadUnits();
        notify("Listo", "Inventario eliminado.");
      } catch (error) {
        console.error(error);
        notify("Error", "No se pudo eliminar el inventario.");
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm("¿Eliminar este PDF de inventario?")) await performDelete();
    } else {
      Alert.alert("Confirmar eliminación", "¿Eliminar este PDF de inventario?", [
        { text: "Cancelar", style: "cancel" },
        { text: "Eliminar", style: "destructive", onPress: () => { void performDelete(); } },
      ]);
    }
  };

  const abrirPDF = async (url: string) => {
    try {
      let fileUrl = url;
      if (!fileUrl.startsWith("http")) {
        const origin = BASE_URL.replace(/\/api\/?$/, "");
        fileUrl = `${origin}${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;
      }
      if (Platform.OS === "web") {
        window.open(fileUrl, "_blank");
      } else {
        const supported = await Linking.canOpenURL(fileUrl);
        if (supported) {
          await Linking.openURL(fileUrl);
        } else {
          notify("Error", "No se puede abrir este PDF en el dispositivo.");
        }
      }
    } catch (error) {
      console.error(error);
      notify("Error", "No se pudo abrir el PDF.");
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
    const hasRemolque = unidadesConRemolque.includes(item.nombre);
    const invCount = item.inventarios?.length || 0;

    return (
      <View style={[styles.card, isMobile ? styles.cardMobile : styles.cardDesktop]}>
        <TouchableOpacity
          style={styles.imageWrap}
          onPress={() => seleccionarImagenUnidad(item.id)}
          activeOpacity={0.85}
        >
          {item.imagenUrl ? (
            <Image source={{ uri: item.imagenUrl }} style={styles.unitImage} />
          ) : (
            <View style={styles.unitImagePlaceholder}>
              <FontAwesome5 name="truck" size={28} color="#9ca3af" />
            </View>
          )}
          <View style={styles.photoBadge}>
            <FontAwesome5 name="camera" size={10} color="#ffffff" />
          </View>
        </TouchableOpacity>

        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <Text style={styles.unitName}>{item.nombre}</Text>
            <View style={[styles.estadoBadge, estadoStyle.badge]}>
              <FontAwesome5 name={estadoStyle.icon} size={10} color={estadoStyle.iconColor} />
              <Text style={[styles.estadoText, estadoStyle.text]}>{item.estado}</Text>
            </View>
          </View>

          <View style={styles.specGrid}>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Modelo</Text>
              <Text style={styles.specValue} numberOfLines={1}>
                {item.modelo}
              </Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Capacidad</Text>
              <Text style={styles.specValue}>{item.capacidad}</Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Placas</Text>
              <Text style={styles.specValue}>{item.placas}</Text>
            </View>
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>Inventario</Text>
              <Text style={styles.specValue}>
                {invCount > 0 ? `${invCount} PDF${invCount === 1 ? "" : "s"}` : "Sin archivo"}
              </Text>
            </View>
            {hasRemolque ? (
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Remolque</Text>
                <Text style={styles.specValue} numberOfLines={1}>
                  {item.tipoRemolque || "Ninguno"}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.cardActions}>
            <TouchableOpacity style={styles.iconAction} onPress={() => openModal(item)} activeOpacity={0.85}>
              <FontAwesome5 name="pen" size={13} color="#111111" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconAction, styles.iconActionDanger]}
              onPress={() => deleteUnit(item.id)}
              activeOpacity={0.85}
            >
              <FontAwesome5 name="trash-alt" size={13} color="#dc2626" />
            </TouchableOpacity>
          </View>
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
                      ? "Actualiza datos e inventario PDF"
                      : "Registra la unidad; el inventario se sube después de guardar"}
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

              {mostrarRemolque ? (
                <View style={[styles.formSection, isMobile && styles.formSectionMobile]}>
                  <Text style={styles.formSectionTitle}>Remolque</Text>
                  <Text style={styles.fieldLabel}>Tipo</Text>
                  <View style={styles.pickerWrap}>
                    <Picker selectedValue={tipoRemolque} onValueChange={setTipoRemolque}>
                      <Picker.Item label="Ninguno" value="" />
                      <Picker.Item label="Lowboy" value="Lowboy" />
                      <Picker.Item label="Caja Seca" value="Caja Seca" />
                    </Picker>
                  </View>
                  {tipoRemolque === "Lowboy" || tipoRemolque === "Caja Seca" ? (
                    <>
                      <Text style={styles.fieldLabel}>Placa del remolque</Text>
                      <TextInput
                        value={placaRemolque}
                        onChangeText={setPlacaRemolque}
                        mode="outlined"
                        outlineColor="#e5e7eb"
                        activeOutlineColor="#111111"
                        dense
                        style={styles.input}
                        contentStyle={styles.inputContent}
                      />
                    </>
                  ) : null}
                </View>
              ) : null}

              <View style={[styles.formSection, isMobile && styles.formSectionMobile]}>
                <View style={styles.invSectionHeader}>
                  <View style={styles.invSectionHeaderLeft}>
                    <FontAwesome5 name="file-pdf" size={14} color="#111111" />
                    <Text style={styles.formSectionTitleInline}>Inventario PDF</Text>
                  </View>
                  {editingUnit?.inventarios?.length ? (
                    <View style={styles.invCountPill}>
                      <Text style={styles.invCountPillText}>{editingUnit.inventarios.length}</Text>
                    </View>
                  ) : null}
                </View>

                {!editingUnit ? (
                  <Text style={styles.invHint}>
                    Guarda la unidad primero. Después podrás subir el PDF de inventario.
                  </Text>
                ) : (
                  <>
                    <Text style={styles.invHint}>
                      Selecciona un PDF y súbelo. Puedes agregar varios archivos.
                    </Text>

                    <TouchableOpacity style={styles.pickPdfBtn} onPress={pickPDF} activeOpacity={0.85}>
                      <FontAwesome5 name="paperclip" size={13} color="#111111" />
                      <Text style={styles.pickPdfBtnText}>
                        {pdf ? "Cambiar PDF" : "Seleccionar PDF"}
                      </Text>
                    </TouchableOpacity>

                    {pdf ? (
                      <View style={styles.selectedFileRow}>
                        <FontAwesome5 name="file-pdf" size={16} color="#dc2626" />
                        <Text style={styles.selectedFileName} numberOfLines={2}>
                          {pdf.name || "archivo.pdf"}
                        </Text>
                        <TouchableOpacity onPress={() => setPdf(null)} hitSlop={8}>
                          <FontAwesome5 name="times" size={14} color="#6b7280" />
                        </TouchableOpacity>
                      </View>
                    ) : null}

                    <TouchableOpacity
                      style={[
                        styles.uploadInvBtn,
                        (!pdf || uploadingInv) && styles.uploadInvBtnDisabled,
                      ]}
                      onPress={() => {
                        void subirInventario();
                      }}
                      disabled={!pdf || uploadingInv}
                      activeOpacity={0.85}
                    >
                      {uploadingInv ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <>
                          <FontAwesome5 name="cloud-upload-alt" size={14} color="#ffffff" />
                          <Text style={styles.uploadInvBtnText}>Subir inventario</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {(editingUnit.inventarios || []).length === 0 ? (
                      <View style={styles.invEmpty}>
                        <FontAwesome5 name="folder-open" size={18} color="#9ca3af" />
                        <Text style={styles.invEmptyText}>Aún no hay inventarios cargados</Text>
                      </View>
                    ) : (
                      <View style={styles.invList}>
                        {(editingUnit.inventarios || []).map((inv, index) => (
                          <View key={inv._id || String(index)} style={styles.invCard}>
                            <View style={styles.invCardIcon}>
                              <FontAwesome5 name="file-pdf" size={16} color="#dc2626" />
                            </View>
                            <View style={styles.invCardBody}>
                              <Text style={styles.invCardTitle}>Inventario {index + 1}</Text>
                              <Text style={styles.invCardMeta}>
                                {inv.fecha
                                  ? new Date(inv.fecha).toLocaleDateString("es-MX", {
                                      day: "2-digit",
                                      month: "short",
                                      year: "numeric",
                                    })
                                  : "Sin fecha"}
                              </Text>
                            </View>
                            <TouchableOpacity
                              style={styles.invActionBtn}
                              onPress={() => {
                                void abrirPDF(inv.archivo);
                              }}
                              activeOpacity={0.85}
                            >
                              <FontAwesome5 name="eye" size={12} color="#111111" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.invActionBtn, styles.invActionBtnDanger]}
                              onPress={() => {
                                void eliminarInventario(inv._id);
                              }}
                              activeOpacity={0.85}
                            >
                              <FontAwesome5 name="trash-alt" size={12} color="#dc2626" />
                            </TouchableOpacity>
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
                  <TouchableOpacity
                    style={styles.cancelButton}
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
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingVertical: 4, backgroundColor: "transparent" },
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
    marginBottom: 12,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  unitImage: { width: 88, height: 88, borderRadius: 14, backgroundColor: "#e5e7eb" },
  unitImagePlaceholder: {
    width: 88,
    height: 88,
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
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 12,
  },
  unitName: { fontSize: 20, fontWeight: "800", color: "#111111", flex: 1 },
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
    marginBottom: 14,
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
  },
  modalActionsMobile: {
    flexDirection: "column",
    paddingHorizontal: 14,
  },
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
