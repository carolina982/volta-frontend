import { FontAwesome5 } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
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
import { TextInput, Portal } from "react-native-paper";
import { api } from "../services/api";
import { User } from "../types";

export default function AdminPage() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
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
      const apellidoPaterno =
        user.apellidoPaterno?.trim() ||
        (user.apellidoMaterno ? "" : user.apellido?.trim() || "");
      const apellidoMaterno = user.apellidoMaterno?.trim() || "";
      const userForEdit = {
        ...user,
        password: "",
        apellidoPaterno,
        apellidoMaterno,
        apellido: [apellidoPaterno, apellidoMaterno].filter(Boolean).join(" "),
        activo: user.activo !== false,
      };
      setEditingUser(userForEdit);
      setInitialUserSnapshot({ ...userForEdit });
      setIsAdding(false);
    } else {
      const newUser: Partial<User> = {
        nombre: "",
        apellido: "",
        apellidoPaterno: "",
        apellidoMaterno: "",
        email: "",
        password: "",
        rol: "Operador",
        contacto: "",
        activo: true,
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
    const { nombre, apellidoPaterno, apellidoMaterno, email, password, rol, photoUrl, contacto, activo, _id } =
      editingUser;

    const nombreTrim = nombre?.trim();
    const apellidoPaternoTrim = apellidoPaterno?.trim() || "";
    const apellidoMaternoTrim = apellidoMaterno?.trim() || "";
    const apellidoTrim = [apellidoPaternoTrim, apellidoMaternoTrim].filter(Boolean).join(" ");
    const contactoTrim = contacto?.trim();
    const isActivo = activo !== false;

    if (!nombreTrim || !apellidoPaternoTrim || !rol) {
      setFormMessage("Nombre, apellido paterno y rol son obligatorios.");
      return;
    }

    setSaving(true);
    try {
      if (isAdding) {
        const emailTrim = email?.trim() || "";
        const passwordTrim = password?.trim() || "";
        if ((emailTrim && !passwordTrim) || (!emailTrim && passwordTrim)) {
          setFormMessage("Si das acceso, llena correo y contraseña juntos.");
          setSaving(false);
          return;
        }
        if (passwordTrim && passwordTrim.length < 6) {
          setFormMessage("La contraseña debe tener al menos 6 caracteres.");
          setSaving(false);
          return;
        }
        await api.post("/users", {
          nombre: nombreTrim,
          apellido: apellidoTrim,
          apellidoPaterno: apellidoPaternoTrim,
          apellidoMaterno: apellidoMaternoTrim,
          rol,
          activo: isActivo,
          ...(contactoTrim ? { contacto: contactoTrim } : {}),
          ...(emailTrim ? { email: emailTrim.toLowerCase() } : {}),
          ...(passwordTrim ? { password: passwordTrim } : {}),
          ...(photoUrl ? { photoUrl } : {}),
        });
        notify("Éxito", "Usuario creado correctamente");
      } else {
        const changedFields: Partial<User> & { activo?: boolean } = {};
        if (nombreTrim !== initialUserSnapshot.nombre?.trim()) changedFields.nombre = nombreTrim;
        if (
          apellidoPaternoTrim !== (initialUserSnapshot.apellidoPaterno?.trim() || "") ||
          apellidoMaternoTrim !== (initialUserSnapshot.apellidoMaterno?.trim() || "")
        ) {
          changedFields.apellidoPaterno = apellidoPaternoTrim;
          changedFields.apellidoMaterno = apellidoMaternoTrim;
          changedFields.apellido = apellidoTrim;
        }
        if ((email?.trim() || "") !== (initialUserSnapshot.email?.trim() || "")) {
          changedFields.email = email?.trim().toLowerCase() || "";
        }
        if ((contactoTrim || "") !== (initialUserSnapshot.contacto?.trim() || "")) {
          changedFields.contacto = contactoTrim;
        }
        if (rol !== initialUserSnapshot.rol) changedFields.rol = rol;
        if (isActivo !== (initialUserSnapshot.activo !== false)) {
          changedFields.activo = isActivo;
        }

        if (password?.trim()) {
          if (password.trim().length < 6) {
            setFormMessage("La contraseña debe tener al menos 6 caracteres.");
            setSaving(false);
            return;
          }
          const emailForLogin = (email?.trim() || initialUserSnapshot.email?.trim() || "").toLowerCase();
          if (!emailForLogin) {
            setFormMessage("Asigna un correo al usuario para que pueda iniciar sesión con la nueva contraseña.");
            setSaving(false);
            return;
          }
          changedFields.password = password.trim();
          if (!changedFields.email && !initialUserSnapshot.email) {
            changedFields.email = emailForLogin;
          }
        }

        if (Object.keys(changedFields).length === 0) {
          setFormMessage("No hay cambios para guardar.");
          setSaving(false);
          return;
        }

        await api.patch(`/users/${_id}`, changedFields);
        notify(
          "Éxito",
          changedFields.password
            ? "Usuario actualizado. Ya puede iniciar sesión con la nueva contraseña."
            : "Usuario actualizado correctamente"
        );
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

  const getContactLine = (item: User) => {
    if (item.contacto?.trim()) return { icon: "phone" as const, text: item.contacto };
    if (item.email) return { icon: "envelope" as const, text: item.email };
    return { icon: "info-circle" as const, text: "Sin teléfono ni correo" };
  };

  const roleLabel = (rol?: string) => {
    if (rol === "Admin") return "Administrador";
    if (rol === "Ayudante General") return "Ayudante General";
    return rol || "—";
  };

  const isUserActive = (u: Pick<User, "activo">) => u.activo !== false;

  const getInitials = (item: User) =>
    `${item.nombre?.[0] || ""}${item.apellido?.[0] || item.apellidoPaterno?.[0] || ""}`.toUpperCase() || "U";

  const renderItem = ({ item }: { item: User }) => {
    const contact = getContactLine(item);
    const isAdmin = item.rol === "Admin";
    const active = isUserActive(item);

    return (
      <View style={[styles.userCard, !active && styles.userCardInactive]}>
        <View style={styles.userCardMain}>
          <View style={[styles.avatar, !active && styles.avatarInactive]}>
            <Text style={styles.avatarText}>{getInitials(item)}</Text>
          </View>

          <View style={styles.userInfo}>
            <View style={styles.userTitleRow}>
              <Text style={styles.name} numberOfLines={1}>
                {item.nombre} {item.apellido}
              </Text>
              <View style={[styles.roleBadge, isAdmin ? styles.roleBadgeAdmin : styles.roleBadgeOperador]}>
                <FontAwesome5
                  name={
                    isAdmin ? "user-shield" : item.rol === "Ayudante General" ? "user-friends" : "truck"
                  }
                  size={10}
                  color={isAdmin ? "#ffffff" : "#111111"}
                />
                <Text style={[styles.roleBadgeText, isAdmin && styles.roleBadgeTextAdmin]}>
                  {roleLabel(item.rol)}
                </Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              <View style={[styles.statusBadge, active ? styles.statusBadgeActive : styles.statusBadgeInactive]}>
                <Text style={[styles.statusBadgeText, active ? styles.statusBadgeTextActive : styles.statusBadgeTextInactive]}>
                  {active ? "Activo" : "Inactivo"}
                </Text>
              </View>
              <View style={styles.contactRow}>
                <FontAwesome5 name={contact.icon} size={12} color="#9ca3af" />
                <Text style={[styles.contactText, contact.text.includes("Sin") && styles.contactMuted]} numberOfLines={1}>
                  {contact.text}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.iconAction} onPress={() => handleEdit(item)} activeOpacity={0.85}>
            <FontAwesome5 name="pen" size={13} color="#111111" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const showCredentials = true;
  const showContacto = true;

  const roleOptions: { value: User["rol"]; label: string; icon: string }[] = [
    { value: "Admin", label: "Administrador", icon: "user-shield" },
    { value: "Operador", label: "Operador", icon: "truck" },
    { value: "Ayudante General", label: "Ayudante General", icon: "user-friends" },
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
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.modalKeyboardWrap}
      keyboardVerticalOffset={Platform.OS === "ios" ? 24 : 0}
    >
      <View
        style={[styles.modalContent, isMobile && styles.modalContentMobile]}
        onStartShouldSetResponder={() => true}
        {...(Platform.OS === "web" ? { onClick: (e: any) => e.stopPropagation() } : {})}
      >
        <View style={styles.modalHeader}>
          <View style={styles.modalHeaderLeft}>
            <View style={styles.modalIconBadge}>
              <FontAwesome5 name={isAdding ? "user-plus" : "user-edit"} size={16} color="#ffffff" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.modalTitle}>{isAdding ? "Agregar Usuario" : "Editar Usuario"}</Text>
              <Text style={styles.modalSubtitle}>
                {isAdding
                  ? "Catálogo de personal. Correo y contraseña opcionales (solo si iniciará sesión)"
                  : "Actualiza la información del usuario"}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.modalCloseButton} onPress={closeModal} disabled={saving} activeOpacity={0.85}>
            <FontAwesome5 name="times" size={14} color="#6b7280" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.modalBodyScroll}
          contentContainerStyle={styles.modalBody}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
          nestedScrollEnabled
          bounces
        >
          <View style={styles.fieldGroup}>
            {renderField("Nombre(s)", (
              <TextInput
                placeholder="Nombre(s)"
                value={editingUser?.nombre ?? ""}
                onChangeText={(text) => editingUser && setEditingUser({ ...editingUser, nombre: text })}
                {...inputProps}
              />
            ))}
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              {renderField("Apellido paterno", (
                <TextInput
                  placeholder="Apellido paterno"
                  value={editingUser?.apellidoPaterno ?? ""}
                  onChangeText={(text) =>
                    editingUser &&
                    setEditingUser({
                      ...editingUser,
                      apellidoPaterno: text,
                      apellido: [text, editingUser.apellidoMaterno].filter(Boolean).join(" ").trim(),
                    })
                  }
                  {...inputProps}
                />
              ))}
            </View>
            <View style={styles.fieldHalf}>
              {renderField("Apellido materno", (
                <TextInput
                  placeholder="Apellido materno"
                  value={editingUser?.apellidoMaterno ?? ""}
                  onChangeText={(text) =>
                    editingUser &&
                    setEditingUser({
                      ...editingUser,
                      apellidoMaterno: text,
                      apellido: [editingUser.apellidoPaterno, text].filter(Boolean).join(" ").trim(),
                    })
                  }
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
                  >
                    <FontAwesome5 name={item.icon as any} size={12} color={isActive ? "#ffffff" : "#6b7280"} />
                    <Text style={[styles.rolePillText, isActive && styles.rolePillTextActive]}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Estado</Text>
            <View style={styles.roleSelector}>
              {[
                { value: true, label: "Activo", icon: "check-circle" },
                { value: false, label: "Inactivo", icon: "ban" },
              ].map((opt) => {
                const isActive = (editingUser?.activo !== false) === opt.value;
                return (
                  <TouchableOpacity
                    key={String(opt.value)}
                    style={[styles.rolePill, isActive && styles.rolePillActive]}
                    onPress={() => editingUser && setEditingUser({ ...editingUser, activo: opt.value })}
                    activeOpacity={0.85}
                  >
                    <FontAwesome5 name={opt.icon as any} size={12} color={isActive ? "#ffffff" : "#6b7280"} />
                    <Text style={[styles.rolePillText, isActive && styles.rolePillTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {showContacto && renderField("Teléfono", (
            <TextInput
              placeholder="Teléfono (opcional)"
              value={editingUser?.contacto ?? ""}
              onChangeText={(text) => editingUser && setEditingUser({ ...editingUser, contacto: text })}
              keyboardType="phone-pad"
              {...inputProps}
            />
          ))}

          {showCredentials && (
            <>
              {renderField("Correo (opcional)", (
                <TextInput
                  placeholder="correo@empresa.com — solo si inicia sesión"
                  value={editingUser?.email ?? ""}
                  onChangeText={(text) => editingUser && setEditingUser({ ...editingUser, email: text })}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  {...inputProps}
                />
              ))}
              {renderField("Contraseña (opcional)", (
                <TextInput
                  placeholder={isAdding ? "Mín. 6 caracteres si da acceso" : "Nueva contraseña (opcional)"}
                  value={editingUser?.password ?? ""}
                  onChangeText={(text) => editingUser && setEditingUser({ ...editingUser, password: text })}
                  secureTextEntry
                  autoComplete="new-password"
                  textContentType="newPassword"
                  importantForAutofill="no"
                  {...inputProps}
                />
              ))}
            </>
          )}

          {formMessage ? (
            <View style={styles.formMessageBoxInline}>
              <FontAwesome5 name="exclamation-circle" size={14} color="#dc2626" />
              <Text style={styles.formMessage}>{formMessage}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.modalActions, isMobile && styles.modalActionsMobile]}>
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
    </KeyboardAvoidingView>
  );

  const renderWebModal = () => (
    <Portal>
      <View
        style={[styles.webModalOverlay, isMobile && styles.webModalOverlayMobile]}
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
          <Text style={[styles.title, isMobile && styles.titleMobile]}>Catálogo de usuarios</Text>
          <Text style={styles.subtitle}>Personal para asignar a viajes. El estado se cambia al editar.</Text>
        </View>
        {!listLoading && !loadError && !isMobile && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{users.length}</Text>
          </View>
        )}
      </View>

      <View style={styles.toolbarPanel}>
        <TouchableOpacity
          style={[styles.addButton, isMobile && styles.addButtonMobile]}
          onPress={() => handleEdit()}
          activeOpacity={0.85}
        >
          <FontAwesome5 name="user-plus" size={14} color="#ffffff" />
          <Text style={styles.addButtonText}>Agregar Usuario</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listPanel}>
        {!listLoading && !loadError && users.length > 0 && (
          <View style={[styles.listHeader, isMobile && styles.listHeaderMobile]}>
            <Text style={styles.listHeaderTitle}>{users.length} usuarios</Text>
            <Text style={styles.listHeaderHint}>Equipo Volta</Text>
          </View>
        )}
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
          <View style={[styles.modalContainer, isMobile && styles.modalContainerMobile]}>
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
  confirmIconBadgeWarn: {
    backgroundColor: "#b45309",
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
  title: { fontSize: 24, fontWeight: "800", color: "#111111", letterSpacing: 0.2 },
  titleMobile: { fontSize: 22 },
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
    ...(Platform.OS === "web" ? { cursor: "pointer" as const, alignSelf: "flex-start" as const } : {}),
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
    ...(Platform.OS === "web"
      ? { boxShadow: "0 8px 24px rgba(0,0,0,0.04)" as any }
      : {}),
  },
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
  userList: { gap: 12 },
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
  contactRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  contactText: { fontSize: 13, color: "#4b5563", flex: 1 },
  contactMuted: { color: "#9ca3af", fontStyle: "italic" },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusBadgeActive: { backgroundColor: "#ecfdf5" },
  statusBadgeInactive: { backgroundColor: "#f3f4f6" },
  statusBadgeText: { fontSize: 11, fontWeight: "700" },
  statusBadgeTextActive: { color: "#059669" },
  statusBadgeTextInactive: { color: "#6b7280" },
  userCardInactive: { opacity: 0.78 },
  avatarInactive: { backgroundColor: "#9ca3af" },
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
  iconActionOk: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
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
  webModalOverlayMobile: {
    justifyContent: "flex-end",
    alignItems: "stretch",
    padding: 0,
    paddingTop: 40,
  },
  modalContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContainerMobile: {
    justifyContent: "flex-end",
    paddingTop: 40,
  },
  modalKeyboardWrap: {
    width: "100%",
    maxWidth: Platform.OS === "web" ? 460 : undefined,
    alignItems: "center",
  },
  modalContent: {
    width: Platform.OS === "web" ? 460 : "92%",
    maxHeight: "90%",
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
  modalContentMobile: {
    width: "100%",
    maxHeight: "92%",
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
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
  modalBodyScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  modalBody: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 20,
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
  formMessageBoxInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
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
    backgroundColor: "#ffffff",
  },
  modalActionsMobile: {
    paddingBottom: 28,
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