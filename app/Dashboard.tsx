import { FontAwesome5 } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { Appbar, Avatar, Badge, Divider } from "react-native-paper"; // <-- Importamos Badge
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../context/Store";

import AdminPage from "./AdminPage";
import HomePage from "./HomePage";
import PerfilePage from "./PerfilePage";
import TripsPage from "./TripsPage";
import UnitsPage from "./UnitsPage";
import ViaticsPage from "./ViaticsPage";

type TabType = "Inicio" | "Viajes" | "Viáticos" | "Perfil" | "Unidades" | "Usuarios";

export default function Dashboard() {
  const { currentUser, setCurrentUser } = useStore();
  const [tab, setTab] = useState<TabType>("Inicio");
  const [menuVisible, setMenuVisible] = useState(false);
  const { width } = useWindowDimensions();
  const router = useRouter();

  const isLargeScreen = width >= 1024;

  // ================= CONTADORES (BADGES) =================
  
  const viaticesPendientes = 0; 
  const viajesActivos = 0;

  if (!currentUser) {
    return (
      <View style={styles.centered}>
        <Text>Debes iniciar sesión</Text>
      </View>
    );
  }

  const handleLogout = async () => {
    try {
      if (Platform.OS === "web") {
        localStorage.removeItem("token");
      } else {
        await AsyncStorage.removeItem("token");
      }
      setCurrentUser(null);
      router.replace("/Login");
    } catch (error) {
      console.error("Error al cerrar sesión", error);
    }
  };

  const renderContent = () => {
    switch (tab) {
      case "Inicio":
        return <HomePage currentUser={currentUser} />;
      case "Viajes":
        return <TripsPage />;
      case "Viáticos":
        return <ViaticsPage />;
      case "Perfil":
        return <PerfilePage currentUser={currentUser} setCurrentUser={setCurrentUser} />;
      case "Unidades":
        return currentUser.rol?.toLowerCase() === "admin" ? <UnitsPage /> : null;
      case "Usuarios":
        return currentUser.rol?.toLowerCase() === "admin" ? <AdminPage /> : null;
      default:
        return null;
    }
  };

  // Prioridad 4: Reordenar menú por frecuencia de uso (Inicio > Viajes > Viáticos > Perfil)
  const menuItems: TabType[] = ["Inicio","Viajes",
    "Viáticos",
    "Perfil",
    ...(currentUser.rol?.toLowerCase() === "admin" ? (["Unidades", "Usuarios"] as TabType[]) : []),
  ];

  const getTabIcon = (item: TabType) => {
    switch (item) {
      case "Inicio": return "home";
      case "Viajes": return "route";
      case "Viáticos": return "wallet";
      case "Perfil": return "user";
      case "Unidades": return "truck";
      case "Usuarios": return "users";
      default: return "folder";
    }
  };

  // Prioridad 3: Tooltips informativos independientes para la versión Web
  const getTabTooltip = (item: TabType) => {
    switch (item) {
      case "Inicio": return "Ir al panel principal";
      case "Viajes": return `Ver rutas (${viajesActivos} activas)`;
      case "Viáticos": return `Control de gastos (${viaticesPendientes} pendientes)`;
      case "Perfil": return "Editar tu información personal";
      case "Unidades": return "Administrar flotilla de camiones";
      case "Usuarios": return "Control de personal y accesos";
      default: return "";
    }
  };

  return (
    <SafeAreaView style={[styles.container, isLargeScreen && { flexDirection: "row" }]}>
      {isLargeScreen ? (
        <>
          {/* ================= SIDEBAR WEB ================= */}
          <View style={styles.sideMenu}>
            
            <View style={styles.logoContainer}>
              <FontAwesome5 name="truck-moving" size={26} color="#007bff" />
              <Text style={styles.logoText}>Volta</Text>
            </View>
            <Divider style={styles.divider} />

            <View style={styles.avatarContainer}>
              {currentUser.photoUrl ? (
                <Avatar.Image size={48} source={{ uri: currentUser.photoUrl }} />
              ) : (
                <Avatar.Text size={48} label={`${currentUser.nombre?.[0] || 'U'}${currentUser.apellido?.[0] || ''}`}  />
              )}
              <View style={styles.userInfo}>
                <Text numberOfLines={1} style={styles.name}>{currentUser.nombre} {currentUser.apellido}</Text>
                <Text numberOfLines={1} style={styles.role}>{currentUser.rol || currentUser.rol}</Text>
              </View>
            </View>
            <Divider style={styles.divider} />

            {/* Lista del Menú */}
            <View style={{ flex: 1 }}>
              {menuItems.map((item) => {
                const isActive = tab === item;
                return (
                  <TouchableOpacity 
                    key={item} 
                    style={[styles.sideTab, isActive && styles.sideTabActive]} 
                    onPress={() => setTab(item)}
                    // @ts-ignore: Propiedad nativa para tooltips en navegadores web (Prioridad 3)
                    dataSet={Platform.OS === 'web' ? { title: getTabTooltip(item) } : undefined}
                    title={Platform.OS === 'web' ? getTabTooltip(item) : undefined}
                  >
                    {isActive && <View style={styles.activeIndicatorLine} />}
                    
                    <View style={styles.menuItemLeftSection}>
                      <FontAwesome5 
                        name={getTabIcon(item)} 
                        size={16} 
                        color={isActive ? "#fff" : "#94a3b8"} 
                        style={styles.menuIcon} 
                      />
                      <Text style={[styles.tabText, isActive && { color: "#fff", fontWeight: "700" }]}>
                        {item}
                      </Text>
                    </View>

                    {/* Prioridad 2: Badge/Contadores dinámicos en el Menú */}
                    {item === "Viajes" && viajesActivos > 0 && (
                      <Badge style={styles.badgeViajes}>{viajesActivos}</Badge>
                    )}
                    {item === "Viáticos" && viaticesPendientes > 0 && (
                      <Badge style={styles.badgeViaticos}>{viaticesPendientes}</Badge>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.sidebarBottom}>
              <TouchableOpacity 
                style={styles.logoutButton} 
                onPress={handleLogout}
                // @ts-ignore
                title={Platform.OS === 'web' ? "Terminar sesión actual de forma segura" : undefined}
              >
                <FontAwesome5 name="sign-out-alt" size={16} color="#fff" style={styles.menuIcon} />
                <Text style={styles.logoutText}>Cerrar Sesión</Text>
              </TouchableOpacity>
              <Text style={styles.footerText}>v1.0.4 ©️ 2026</Text>
            </View>
          </View>

          {/* ================= CONTENIDO WEB ================= */}
          <View style={styles.content}>
            <View style={styles.webHeader}>
              <Text style={styles.breadcrumb}>
                Inicio <Text style={styles.breadcrumbSeparator}>&gt;</Text> <Text style={styles.breadcrumbActive}>{tab}</Text>
              </Text>
            </View>

            <ScrollView contentContainerStyle={styles.contentContainer}> 
              {renderContent()}
            </ScrollView>
          </View>
        </>
      ) : (
        <>
          {/* ================= HEADER MOVIL ================= */}
          <Appbar.Header style={{ backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" }}>
            <Appbar.Action icon="menu" onPress={() => setMenuVisible(true)} />
            <Appbar.Content title={tab} titleStyle={{ fontWeight: "bold", fontSize: 18 }} />
          </Appbar.Header>

          {menuVisible && (
            <View style={styles.drawerOverlay}>
              <SafeAreaView style={styles.drawer}>
                
                <View style={styles.drawerAvatarContainer}>
                  {currentUser.photoUrl ? (
                    <Avatar.Image size={50} source={{ uri: currentUser.photoUrl }} />
                  ) : (
                    <Avatar.Text size={50} label={`${currentUser.nombre?.[0] || 'U'}${currentUser.apellido?.[0] || ''}`} />
                  )}
                  <View style={styles.userInfo}>
                    <Text numberOfLines={1} style={styles.drawerName}>{currentUser.nombre} {currentUser.apellido}</Text>
                    <Text numberOfLines={1} style={styles.drawerRole}>{currentUser.rol}</Text>
                  </View>
                </View>
                <Divider style={{ marginVertical: 15 }} />

                <ScrollView style={{ flex: 1 }}>
                  {menuItems.map((item) => {
                    const isActive = tab === item;
                    return (
                      <TouchableOpacity 
                        key={item} 
                        style={[styles.drawerItem, isActive && styles.drawerItemActive]}
                        onPress={() => { setTab(item); setMenuVisible(false); }}
                      >
                        <View style={styles.menuItemLeftSection}>
                          <FontAwesome5 
                            name={getTabIcon(item)} 
                            size={16} 
                            color={isActive ? "#fff" : "#64748b"} 
                            style={styles.menuIcon} 
                          />
                          <Text style={[styles.drawerText, isActive && { color: "#fff", fontWeight: "700" }]}>
                            {item}
                          </Text>
                        </View>

                        {/* Badges también en menú móvil */}
                        {item === "Viajes" && viajesActivos > 0 && (
                          <Badge style={styles.badgeViajesMobile}>{viajesActivos}</Badge>
                        )}
                        {item === "Viáticos" && viaticesPendientes > 0 && (
                          <Badge style={styles.badgeViaticosMobile}>{viaticesPendientes}</Badge>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <TouchableOpacity style={styles.logoutButton} onPress={() => { setMenuVisible(false); handleLogout(); }}>
                  <FontAwesome5 name="sign-out-alt" size={16} color="#fff" style={styles.menuIcon} />
                  <Text style={styles.logoutText}>Cerrar Sesión</Text>
                </TouchableOpacity>
              </SafeAreaView>
              <TouchableOpacity style={styles.overlayBackground} onPress={() => setMenuVisible(false)} />
            </View>
          )}

          <View style={styles.mobileContent}>
            {renderContent()}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

/* ================= ESTILOS ================= */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f6f9" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  
  /* ===== SIDEBAR WEB ===== */
  sideMenu: { width: 280, backgroundColor: "#1e293b", padding: 20, height: "100%", justifyContent: "space-between" },
  logoContainer: { flexDirection: "row", alignItems: "center", marginBottom: 5, paddingLeft: 5 },
  logoText: { fontSize: 22, fontWeight: "bold", color: "#ffffff", marginLeft: 10, letterSpacing: 0.5 },
  avatarContainer: { flexDirection: "row", alignItems: "center", paddingVertical: 5, paddingHorizontal: 5 },
  userInfo: { marginLeft: 12, flex: 1 },
  name: { fontSize: 16, fontWeight: "bold", color: "#ffffff" },
  role: { fontSize: 13, color: "#38bdf8", marginTop: 2, fontWeight: "500" },
  divider: { backgroundColor: "rgba(148, 163, 184, 0.2)", marginVertical: 15 },
  
  sideTab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between", // Empuja los Badges al extremo derecho
    padding: 14, 
    marginVertical: 4,
    borderRadius: 8,
    position: "relative",
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  menuItemLeftSection: {
    flexDirection: "row",
    alignItems: "center",
  },
  activeIndicatorLine: {
    position: "absolute",
    left: 0,
    top: "30%",
    height: "40%",
    width: 4,
    backgroundColor: "#007bff",
    borderRadius: 2
  },
  sideTabActive: { backgroundColor: "rgba(0, 123, 255, 0.15)" },
  menuIcon: { width: 25, textAlign: "center" },
  tabText: { fontSize: 15, color: "#cbd5e1", marginLeft: 5 },
  
  // Estilos de los Badges (Web)
  badgeViajes: { backgroundColor: "#10b981", color: "#fff", fontWeight: "700" }, // Verde para activos
  badgeViaticos: { backgroundColor: "#f59e0b", color: "#1e293b", fontWeight: "700" }, // Ámbar para pendientes

  sidebarBottom: { marginTop: 20 },
  logoutButton: { flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: "#ef4444", borderRadius: 8, justifyContent: "center" },
  logoutText: { color: "#fff", fontWeight: "bold", marginLeft: 5 },
  footerText: { color: "#64748b", fontSize: 11, textAlign: "center", marginTop: 10 },

  /* ===== CONTENIDO DERECHO (WEB) ===== */
  content: { flex: 1, backgroundColor: "#f4f6f9" },
  webHeader: { height: 60, backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0", justifyContent: "center", paddingHorizontal: 30 },
  breadcrumb: { fontSize: 14, color: "#64748b", fontWeight: "500" },
  breadcrumbSeparator: { color: "#cbd5e1", marginHorizontal: 4 },
  breadcrumbActive: { color: "#007bff", fontWeight: "600" },
  contentContainer: { width: "100%", maxWidth: 1200, alignSelf: "center", paddingHorizontal: 30, paddingVertical: 25 },

  /* ===== MÓVIL ===== */
  mobileContent: { flex: 1, padding: 20, backgroundColor: "#f4f6f9" },
  drawerOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "row", zIndex: 1000 },
  drawer: { width: 280, backgroundColor: "#fff", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, elevation: 16, justifyContent: "space-between" },
  drawerAvatarContainer: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  overlayBackground: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  
  drawerItem: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between",
    paddingVertical: 12, 
    paddingHorizontal: 12, 
    borderRadius: 8, 
    marginVertical: 4 
  },
  drawerItemActive: { backgroundColor: "#007bff" },
  drawerText: { fontSize: 15, color: "#334155", marginLeft: 5 },
  drawerName: { fontSize: 16, fontWeight: "bold", color: "#1e293b" },
  drawerRole: { fontSize: 13, color: "#007bff", marginTop: 1 },
  
  // Estilos de los Badges (Móvil)
  badgeViajesMobile: { backgroundColor: "#10b981", color: "#fff" },
  badgeViaticosMobile: { backgroundColor: "#f59e0b", color: "#fff" }
});