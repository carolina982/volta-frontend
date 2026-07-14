import { FontAwesome5 } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Appbar, Avatar, Badge, Divider } from "react-native-paper"; // <-- Importamos Badge
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../context/Store";
import { api } from "../services/api";

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
  const [menuRendered, setMenuRendered] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { width } = useWindowDimensions();
  const router = useRouter();
  const drawerWidth = Math.min(Math.max(width * 0.82, 300), 360);
  const drawerSlide = useRef(new Animated.Value(0)).current;
  const overlayFade = useRef(new Animated.Value(0)).current;
  const itemAnims = useRef(
    Array.from({ length: 8 }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const isLargeScreen = isMounted && width >= 1024;

  const openMobileMenu = useCallback(() => {
    setMenuRendered(true);
    setMenuVisible(true);
    drawerSlide.setValue(0);
    overlayFade.setValue(0);
    itemAnims.forEach((anim) => anim.setValue(0));

    Animated.parallel([
      Animated.timing(overlayFade, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(drawerSlide, {
        toValue: 1,
        friction: 9,
        tension: 70,
        useNativeDriver: true,
      }),
      Animated.stagger(
        45,
        itemAnims.map((anim) =>
          Animated.timing(anim, {
            toValue: 1,
            duration: 280,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          })
        )
      ),
    ]).start();
  }, [drawerSlide, overlayFade, itemAnims]);

  const closeMobileMenu = useCallback(() => {
    Animated.parallel([
      Animated.timing(overlayFade, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(drawerSlide, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setMenuVisible(false);
        setMenuRendered(false);
      }
    });
  }, [drawerSlide, overlayFade]);

  const handleTabPress = useCallback((item: TabType) => {
    setTab(item);
  }, []);

  // ================= CONTADORES (BADGES) =================
  
  const [viajesActivos, setViajesActivos] = useState(0);
  const [viaticesPendientes, setViaticesPendientes] = useState(0);

  const isAdmin = currentUser?.rol?.toLowerCase() === "admin";

  useEffect(() => {
    const loadCounts = async () => {
      try {
        if (isAdmin) {
          const [tripsRes, viaticsRes] = await Promise.all([
            api.get("/trips"),
            api.get("/viatics"),
          ]);
          const trips = tripsRes.data || [];
          const viatics = viaticsRes.data || [];
          setViajesActivos(trips.filter((t: { estado?: string }) => (t.estado || "").toLowerCase() === "pendiente").length);
          setViaticesPendientes(viatics.filter((v: { estado?: string }) => (v.estado || "").toLowerCase() === "pendiente").length);
        } else {
          const tripsRes = await api.get("/trips");
          const trips = tripsRes.data || [];
          setViajesActivos(trips.filter((t: { estado?: string }) => (t.estado || "").toLowerCase() === "pendiente").length);
          setViaticesPendientes(0);
        }
      } catch (error) {
        console.error("Error cargando contadores del menú", error);
      }
    };
    if (currentUser) loadCounts();
  }, [currentUser, tab, isAdmin]);

  useEffect(() => {
    if (currentUser && !isAdmin && tab === "Viáticos") {
      setTab("Inicio");
    }
  }, [currentUser, isAdmin, tab]);

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
        return isAdmin ? <ViaticsPage /> : null;
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
  const menuItems: TabType[] = [
    "Inicio",
    "Viajes",
    ...(isAdmin ? (["Viáticos"] as TabType[]) : []),
    "Perfil",
    ...(isAdmin ? (["Unidades", "Usuarios"] as TabType[]) : []),
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
              <Image
                source={require("../assets/images/logo-volta.jpeg")}
                style={styles.logoImage}
                resizeMode="contain"
              />
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
                    onPress={() => handleTabPress(item)}
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

              <TouchableOpacity
                style={styles.headerUserChip}
                onPress={() => handleTabPress("Perfil")}
                activeOpacity={0.85}
                // @ts-ignore
                title={Platform.OS === "web" ? "Ver perfil" : undefined}
              >
                <View style={styles.headerUserText}>
                  <Text numberOfLines={1} style={styles.headerUserName}>
                    {currentUser.nombre} {currentUser.apellido}
                  </Text>
                  <View style={styles.headerRoleBadge}>
                    <Text style={styles.headerRoleText}>{currentUser.rol || "Usuario"}</Text>
                  </View>
                </View>
                {currentUser.photoUrl ? (
                  <Avatar.Image size={40} source={{ uri: currentUser.photoUrl }} />
                ) : (
                  <Avatar.Text
                    size={40}
                    label={`${currentUser.nombre?.[0] || "U"}${currentUser.apellido?.[0] || ""}`}
                    style={styles.headerAvatar}
                    labelStyle={styles.headerAvatarLabel}
                  />
                )}
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.contentContainer}> 
              {renderContent()}
            </ScrollView>
          </View>
        </>
      ) : (
        <>
          {/* ================= HEADER MOVIL ================= */}
          <Appbar.Header style={styles.mobileAppbar}>
            <Appbar.Action icon="menu" color="#111111" onPress={() => setMenuVisible(true)} />
            <View style={styles.mobileLogoWrap}>
              <Image
                source={require("../assets/images/logo-volta.jpeg")}
                style={styles.mobileHeaderLogo}
                resizeMode="contain"
              />
            </View>
            <TouchableOpacity
              style={styles.mobileHeaderUser}
              onPress={() => { handleTabPress("Perfil"); setMenuVisible(false); }}
              activeOpacity={0.85}
            >
              {currentUser.photoUrl ? (
                <Avatar.Image size={34} source={{ uri: currentUser.photoUrl }} />
              ) : (
                <Avatar.Text
                  size={34}
                  label={`${currentUser.nombre?.[0] || "U"}${currentUser.apellido?.[0] || ""}`}
                  style={styles.headerAvatar}
                  labelStyle={styles.headerAvatarLabel}
                />
              )}
            </TouchableOpacity>
          </Appbar.Header>

          {menuVisible && (
            <View style={styles.drawerOverlay}>
              <SafeAreaView style={styles.drawer}>
                <ScrollView style={styles.drawerMenuList} contentContainerStyle={styles.drawerMenuContent}>
                  {menuItems.map((item) => {
                    const isActive = tab === item;
                    return (
                      <TouchableOpacity 
                        key={item} 
                        style={[styles.drawerItem, isActive && styles.drawerItemActive]}
                        onPress={() => { handleTabPress(item); setMenuVisible(false); }}
                      >
                        <View style={styles.menuItemLeftSection}>
                          <FontAwesome5 
                            name={getTabIcon(item)} 
                            size={16} 
                            color={isActive ? "#111111" : "#6b7280"} 
                            style={styles.menuIcon} 
                          />
                          <Text style={[styles.drawerText, isActive && styles.drawerTextActive]}>
                            {item}
                          </Text>
                        </View>

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

                <TouchableOpacity
                  style={styles.drawerLogoutButton}
                  onPress={() => { setMenuVisible(false); handleLogout(); }}
                  activeOpacity={0.85}
                >
                  <FontAwesome5 name="sign-out-alt" size={15} color="#dc2626" style={styles.menuIcon} />
                  <Text style={styles.drawerLogoutText}>Cerrar Sesión</Text>
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
  sideMenu: { width: 280, backgroundColor: "#070707", padding: 20, height: "100%", justifyContent: "space-between" },
  logoContainer: { alignItems: "center", marginBottom: 5, paddingHorizontal: 5 },
  logoImage: { width: 200, height: 72 },
  avatarContainer: { flexDirection: "row", alignItems: "center", paddingVertical: 5, paddingHorizontal: 5 },
  userInfo: { marginLeft: 12, flex: 1 },
  name: { fontSize: 16, fontWeight: "bold", color: "#ffffff" },
  role: { fontSize: 13, color: "#38bdf8", marginTop: 2, fontWeight: "500" },
  divider: { backgroundColor: "rgba(148, 163, 184, 0.2)", marginVertical: 15 },
  
  sideTab:{flexDirection: "row", alignItems: "center",justifyContent: "space-between",padding: 14, marginVertical: 4,borderRadius: 8,position: "relative",...(Platform.OS === "web" ? { cursor: "pointer" } : {}),},
  menuItemLeftSection: { flexDirection: "row",alignItems: "center",},
  activeIndicatorLine: {position: "absolute",left: 0,top: "30%",height: "40%",width: 4,backgroundColor: "#007bff",borderRadius: 2 },
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
  webHeader: {
    height: 64,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingHorizontal: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  breadcrumb: { fontSize: 14, color: "#64748b", fontWeight: "500", flexShrink: 1 },
  breadcrumbSeparator: { color: "#cbd5e1", marginHorizontal: 4 },
  breadcrumbActive: { color: "#111111", fontWeight: "700" },
  headerUserChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
    paddingLeft: 14,
    paddingRight: 6,
    backgroundColor: "#f8fafc",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    maxWidth: 280,
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  headerUserText: { flexShrink: 1, alignItems: "flex-end" },
  headerUserName: { fontSize: 13, fontWeight: "700", color: "#111111", maxWidth: 180 },
  headerRoleBadge: {
    marginTop: 3,
    alignSelf: "flex-end",
    backgroundColor: "#111111",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  headerRoleText: { fontSize: 10, fontWeight: "700", color: "#ffffff", letterSpacing: 0.3 },
  headerAvatar: { backgroundColor: "#e5e7eb" },
  headerAvatarLabel: { color: "#111111", fontWeight: "800", fontSize: 14 },
  contentContainer: { width: "100%", maxWidth: 1200, alignSelf: "center", paddingHorizontal: 30, paddingVertical: 25 },

  /* ===== MÓVIL ===== */
  mobileContent: { flex: 1, padding: 20, backgroundColor: "#f4f6f9" },
  mobileAppbar: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    elevation: 0,
    justifyContent: "space-between",
    alignItems: "center",
  },
  mobileLogoWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  mobileHeaderLogo: {
    width: 140,
    height: 36,
  },
  mobileHeaderUser: {
    marginRight: 8,
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  drawerOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "row", zIndex: 1000 },
  drawer: {
    width: 280,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 20,
    elevation: 16,
    justifyContent: "space-between",
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
  },
  drawerMenuList: { flex: 1 },
  drawerMenuContent: { paddingTop: 10, paddingBottom: 12, gap: 2 },
  overlayBackground: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },

  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginVertical: 2,
  },
  drawerItemActive: {
    backgroundColor: "rgba(0, 0, 0, 0.08)",
  },
  drawerText: { fontSize: 15, color: "#374151", marginLeft: 8, fontWeight: "600" },
  drawerTextActive: { color: "#111111", fontWeight: "800" },
  drawerLogoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    marginTop: 8,
  },
  drawerLogoutText: { color: "#dc2626", fontWeight: "700", fontSize: 14, marginLeft: 6 },

  // Estilos de los Badges (Móvil)
  badgeViajesMobile: { backgroundColor: "#10b981", color: "#fff" },
  badgeViaticosMobile: { backgroundColor: "#f59e0b", color: "#fff" }
});