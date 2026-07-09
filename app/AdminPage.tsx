import { FontAwesome5 } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { TextInput, Portal } from "react-native-paper";
import { api } from "../services/api";
import { User } from "../types";

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [initialUserSnapshot, setInitialUserSnapshot] = useState<Partial<User>>({});
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState("");

  const notify = (title: string, message: string) => {
    if (Platform.OS === "web") {
      window.alert(`${title}\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setEditingUser(null);
    setIsAdding(false);
    setFormMessage("");
  }, []);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setListLoading(true);
    setLoadError("");
    try {
      const res = await api.get("/users");
      setUsers(res.data);
    } catch (error) {
      console.error("Error cargando usuarios", error);
      setLoadError("No se pudieron cargar los usuarios. Intenta de nuevo.");
    } finally {
      setListLoading(false);
    }
  };
  const handleEdit = useCallback((user?: User) => {
    if (user) {
      const userForEdit = { ...user, password: "" };
      setEditingUser(userForEdit);
      setInitialUserSnapshot({ ...user, password: "" });
      setIsAdding(false);
    } else {
      const newUser: Partial<User> = {
        nombre: "",
        apellido: "",
        email: "",
        password: "",
        rol: "Operador",
        contacto: "",
        photoUrl: null,
      };
      setEditingUser(newUser as User);
      setInitialUserSnapshot({ ...newUser });
      setIsAdding(true);
    }
    setModalVisible(true);
    setFormMessage("");
  }, []);

  const saveChanges = async () => {
    if (!editingUser || saving) return;
    setFormMessage("");
    const { nombre, apellido, email, password, rol, photoUrl, contacto, _id } = editingUser;

    const nombreTrim = nombre?.trim();
    const apellidoTrim = apellido?.trim();
    const contactoTrim = contacto?.trim();

    if (!nombreTrim || !apellidoTrim || !rol) {
      setFormMessage("Nombre, apellido y rol son obligatorios.");
      return;
    }

    if (rol === "Operador" && isAdding && !contactoTrim) {
      setFormMessage("El contacto es obligatorio para operadores.");
      return;
    }

    if (!isAdding && rol === "Admin" && !email?.trim()) {
      setFormMessage("El correo es obligatorio para administradores.");
      return;
    }

    setSaving(true);
    try {
      if (isAdding) {
        if (rol === "Admin" && (!email?.trim() || !password?.trim())) {
          setFormMessage("Admin requiere correo y contraseña.");
          return;
        }
        await api.post("/users", {
          nombre: nombreTrim,
          apellido: apellidoTrim,
          email: rol === "Admin" ? email?.trim() : undefined,
          password: rol === "Admin" ? password : undefined,
          rol,
          contacto: contactoTrim || undefined,
          photoUrl,
        });
        notify("Éxito", "Usuario creado correctamente");
      } else {
        const changedFields: Partial<User> = {};
        if (nombreTrim !== initialUserSnapshot.nombre?.trim()) changedFields.nombre = nombreTrim;
        if (apellidoTrim !== initialUserSnapshot.apellido?.trim()) changedFields.apellido = apellidoTrim;
        if ((email?.trim() || "") !== (initialUserSnapshot.email?.trim() || "")) changedFields.email = email?.trim();
        if ((contactoTrim || "") !== (initialUserSnapshot.contacto?.trim() || "")) changedFields.contacto = contactoTrim;
        if (rol !== initialUserSnapshot.rol) changedFields.rol = rol;
        if (password?.trim()) changedFields.password = password.trim();

        if (Object.keys(changedFields).length === 0) {
          setFormMessage("No hay cambios para guardar.");
          return;
        }

        await api.patch(`/users/${_id}`, changedFields);
        notify("Éxito", "Usuario actualizado correctamente");
      }
      await loadUsers();
      closeModal();
    } catch (error: any) {
      console.error("Error guardando usuario", error);
      const message = error.code === "ECONNABORTED"
        ? "El servidor tardó demasiado en responder. Intenta de nuevo."
        : error.response?.data?.message || "No se pudo guardar el usuario";
      setFormMessage(message);
      notify("Error", message);
    } finally {
      setSaving(false);
    }
  };
const deleteUser =async (id:string)=>{
  let confirmed = false ;
  if (Platform.OS === "web"){
    confirmed=window.confirm("¿Desea eliminar este usuario?");
    if (!confirmed) return ;
  }else {
    confirmed =await new  Promise<boolean>((resolve)=>{
      Alert.alert("Confirmar", "¿Desea eliminar este usuario?",[
        {text:"Cancelar", style:"cancel" , onPress:()=>resolve (false)},
        {text:"Eliminar", style:"destructive", onPress:()=>resolve(true)},
      ],
      {cancelable:true}
    );
    });
    if (!confirmed)return;
  }
  try {
    const res =await api.delete(`/users/${id}`);
    setUsers((prevUsers)=>prevUsers.filter((u)=>u._id !== id));
    Alert.alert("Exito","Usuario eliminando correctamente");
  }catch (error:any){
    console.error("Error  eliminando usuario",error);
    Alert.alert("Error","No se pudo eliminar el usuario");
  }
};
  const getContactLine = (item: User) => {
    if (item.email) return { icon: "envelope" as const, text: item.email };
    if (item.contacto?.trim()) return { icon: "phone" as const, text: item.contacto };
    return { icon: "info-circle" as const, text: "Sin contacto registrado" };
  };

  const getInitials = (item: User) =>
    `${item.nombre?.[0] || ""}${item.apellido?.[0] || ""}`.toUpperCase() || "U";

  const renderItem = ({ item }: { item: User }) => {
    const contact = getContactLine(item);
    const isAdmin = item.rol === "Admin";

    return (
      <View style={styles.userCard}>
        <View style={styles.userCardMain}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(item)}</Text>
          </View>

          <View style={styles.userInfo}>
            <View style={styles.userTitleRow}>
              <Text style={styles.name} numberOfLines={1}>
                {item.nombre} {item.apellido}
              </Text>
              <View style={[styles.roleBadge, isAdmin ? styles.roleBadgeAdmin : styles.roleBadgeOperador]}>
                <FontAwesome5
                  name={isAdmin ? "user-shield" : "truck"}
                  size={10}
                  color={isAdmin ? "#ffffff" : "#111111"}
                />
                <Text style={[styles.roleBadgeText, isAdmin && styles.roleBadgeTextAdmin]}>{item.rol}</Text>
              </View>
            </View>

            <View style={styles.contactRow}>
              <FontAwesome5 name={contact.icon} size={12} color="#9ca3af" />
              <Text style={[styles.contactText, contact.text.includes("Sin") && styles.contactMuted]} numberOfLines={1}>
                {contact.text}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.iconAction} onPress={() => handleEdit(item)} activeOpacity={0.85}>
            <FontAwesome5 name="pen" size={13} color="#111111" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconAction, styles.iconActionDanger]} onPress={() => deleteUser(item._id)} activeOpacity={0.85}>
            <FontAwesome5 name="trash-alt" size={13} color="#dc2626" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const showCredentials = isAdding ? editingUser?.rol === "Admin" : true;
  const showContacto = isAdding ? editingUser?.rol === "Operador" : true;

  const roleOptions: { value: User["rol"]; label: string; icon: string }[] = isAdding
    ? [{ value: "Operador", label: "Operador", icon: "truck" }]
    : [
        { value: "Admin", label: "Admin", icon: "user-shield" },
        { value: "Operador", label: "Operador", icon: "truck" },
      ];

  const inputProps = {
    mode: "flat" as const,
    dense: true,
    underlineColor: "#e5e7eb",
    activeUnderlineColor: "#111111",
    placeholderTextColor: "#9ca3af",
    contentStyle: styles.inputContent,
    style: styles.input,
  };

  const renderField = (
    label: string,
    field: React.ReactNode
  ) => (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {field}
    </View>
  );

  const renderModalContent = () => (
    <View
      style={styles.modalContent}
      onStartShouldSetResponder={() => true}
      {...(Platform.OS === "web" ? { onClick: (e: any) => e.stopPropagation() } : {})}
    >
      <View style={styles.modalHeader}>
        <View style={styles.modalHeaderLeft}>
          <View style={styles.modalIconBadge}>
            <FontAwesome5 name={isAdding ? "user-plus" : "user-edit"} size={16} color="#ffffff" />
          </View>
          <View>
            <Text style={styles.modalTitle}>{isAdding ? "Agregar Operador" : "Editar Usuario"}</Text>
            <Text style={styles.modalSubtitle}>
              {isAdding ? "Completa los datos del nuevo operador" : "Actualiza la información del usuario"}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.modalCloseButton} onPress={closeModal} disabled={saving} activeOpacity={0.85}>
          <FontAwesome5 name="times" size={14} color="#6b7280" />
        </TouchableOpacity>
      </View>

      <View style={styles.modalBody}>
        <View style={styles.fieldRow}>
          <View style={styles.fieldHalf}>
            {renderField("Nombre", (
              <TextInput
                placeholder="Nombre"
                value={editingUser?.nombre ?? ""}
                onChangeText={(text) => editingUser && setEditingUser({ ...editingUser, nombre: text })}
                {...inputProps}
              />
            ))}
          </View>
          <View style={styles.fieldHalf}>
            {renderField("Apellido", (
              <TextInput
                placeholder="Apellido"
                value={editingUser?.apellido ?? ""}
                onChangeText={(text) => editingUser && setEditingUser({ ...editingUser, apellido: text })}
                {...inputProps}
              />
            ))}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Rol</Text>
          <View style={styles.roleSelector}>
            {roleOptions.map((item) => {
              const isActive = editingUser?.rol === item.value;
              return (
                <TouchableOpacity
                  key={item.value}
                  style={[styles.rolePill, isActive && styles.rolePillActive]}
                  onPress={() => editingUser && setEditingUser({ ...editingUser, rol: item.value })}
                  activeOpacity={0.85}
                  disabled={isAdding}
                >
                  <FontAwesome5 name={item.icon as any} size={12} color={isActive ? "#ffffff" : "#6b7280"} />
                  <Text style={[styles.rolePillText, isActive && styles.rolePillTextActive]}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {showContacto && renderField("Contacto", (
          <TextInput
            placeholder={isAdding ? "Teléfono obligatorio" : "Teléfono de contacto"}
            value={editingUser?.contacto ?? ""}
            onChangeText={(text) => editingUser && setEditingUser({ ...editingUser, contacto: text })}
            keyboardType="phone-pad"
            {...inputProps}
          />
        ))}

        {showCredentials && (
          <>
            {renderField("Correo", (
              <TextInput
                placeholder={editingUser?.rol === "Admin" ? "correo@empresa.com" : "Correo (opcional)"}
                value={editingUser?.email ?? ""}
                onChangeText={(text) => editingUser && setEditingUser({ ...editingUser, email: text })}
                keyboardType="email-address"
                autoCapitalize="none"
                {...inputProps}
              />
            ))}
            {renderField("Contraseña", (
              <TextInput
                placeholder={
                  isAdding && editingUser?.rol === "Admin"
                    ? "Contraseña obligatoria"
                    : "Nueva contraseña (opcional)"
                }
                value={editingUser?.password ?? ""}
                onChangeText={(text) => editingUser && setEditingUser({ ...editingUser, password: text })}
                secureTextEntry
                autoComplete="off"
                {...inputProps}
              />
            ))}
          </>
        )}
      </View>

      {formMessage ? (
        <View style={styles.formMessageBox}>
          <FontAwesome5 name="exclamation-circle" size={14} color="#dc2626" />
          <Text style={styles.formMessage}>{formMessage}</Text>
        </View>
      ) : null}

      <View style={styles.modalActions}>
        <TouchableOpacity style={styles.cancelButton} onPress={closeModal} disabled={saving} activeOpacity={0.85}>
          <Text style={styles.cancelButtonText}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={saveChanges}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Text style={styles.saveButtonText}>{saving ? "Guardando..." : "Guardar"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderWebModal = () => (
    <Portal>
      <View
        style={styles.webModalOverlay}
        {...(Platform.OS === "web" ? { onClick: closeModal } : {})}
      >
        {renderModalContent()}
      </View>
    </Portal>
  );

  return (
    <View style={styles.container}>
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderText}>
          <Text style={styles.title}>Usuarios Registrados</Text>
          <Text style={styles.subtitle}>Gestiona el equipo y los accesos de Volta</Text>
        </View>
        {!listLoading && !loadError && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{users.length}</Text>
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.addButton} onPress={() => handleEdit()} activeOpacity={0.85}>
        <FontAwesome5 name="user-plus" size={14} color="#ffffff" />
        <Text style={styles.addButtonText}>Agregar Usuario</Text>
      </TouchableOpacity>

      <View style={styles.listPanel}>
        {listLoading ? (
          <View style={styles.emptyState}>
            <FontAwesome5 name="spinner" size={20} color="#9ca3af" />
            <Text style={styles.emptyText}>Cargando usuarios...</Text>
          </View>
        ) : loadError ? (
          <View style={styles.emptyState}>
            <FontAwesome5 name="exclamation-triangle" size={20} color="#dc2626" />
            <Text style={styles.emptyText}>{loadError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadUsers}>
              <Text style={styles.retryButtonText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : users.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome5 name="users" size={22} color="#9ca3af" />
            <Text style={styles.emptyTitle}>No hay usuarios</Text>
            <Text style={styles.emptyText}>Pulsa "Agregar Usuario" para crear el primero.</Text>
          </View>
        ) : (
          <View style={styles.userList}>
            {users.map((item) => (
              <View key={item._id}>{renderItem({ item })}</View>
            ))}
          </View>
        )}
      </View>

      {Platform.OS === "web" && modalVisible ? (
        renderWebModal()
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
    paddingHorizontal: 0,
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
  title: { fontSize: 24, fontWeight: "800", color: "#111111", letterSpacing: 0.2 },
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
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#111111",
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 999,
    marginBottom: 18,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const, alignSelf: "flex-start" as const } : {}),
  },
  addButtonText: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
  listPanel: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 8px 24px rgba(0,0,0,0.04)" as any }
      : {}),
  },
  userList: { gap: 10 },
  emptyState: {
    paddingVertical: 40,
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
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fafafa",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  userCardMain: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: { color: "#ffffff", fontWeight: "800", fontSize: 14 },
  userInfo: { flex: 1, minWidth: 0 },
  userTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  },
  name: { fontSize: 15, fontWeight: "700", color: "#111111", flex: 1 },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  roleBadgeAdmin: { backgroundColor: "#111111" },
  roleBadgeOperador: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#d1d5db" },
  roleBadgeText: { fontSize: 11, fontWeight: "700", color: "#111111" },
  roleBadgeTextAdmin: { color: "#ffffff" },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  contactText: { fontSize: 13, color: "#4b5563", flex: 1 },
  contactMuted: { color: "#9ca3af", fontStyle: "italic" },
  actions: { flexDirection: "row", gap: 8 },
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
  iconActionDanger: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
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
  modalContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: {
    width: Platform.OS === "web" ? 460 : "92%",
    backgroundColor: "#ffffff",
    padding: 0,
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
  modalBody: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 8,
  },
  fieldRow: {
    flexDirection: "row",
    gap: 12,
  },
  fieldHalf: { flex: 1 },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  input: {
    width: "100%",
    height: 44,
    backgroundColor: "#fafafa",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 0,
  },
  inputContent: { color: "#111111", fontWeight: "600", fontSize: 14 },
  roleSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  rolePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    backgroundColor: "#fafafa",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  rolePillActive: {
    backgroundColor: "#111111",
    borderColor: "#111111",
  },
  rolePillText: { fontSize: 13, fontWeight: "700", color: "#374151" },
  rolePillTextActive: { color: "#ffffff" },
  formMessageBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 22,
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  formMessage: {
    flex: 1,
    color: "#dc2626",
    fontSize: 12,
    fontWeight: "600",
  },
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
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: "#ffffff", fontWeight: "700", fontSize: 14 },
});