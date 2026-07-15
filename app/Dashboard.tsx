import { FontAwesome5 } from "@expo/vector-icons";
import { useRouter, Redirect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
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
import { Appbar, Avatar, Badge, Divider } from "react-native-paper"; // <-- Importamos Badge
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../context/Store";
import { useNotifications } from "../hooks/useNotifications";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { api } from "../services/api";

import AdminPage from "./AdminPage";
import HomePage from "./HomePage";
import PerfilePage from "./PerfilePage";
import TripsPage from "./TripsPage";
import UnitsPage from "./UnitsPage";
import ViaticsPage from "./ViaticsPage";

type TabType = "Inicio" | "Viajes" | "Viáticos" | "Perfil" | "Unidades" | "Usuarios";

export default function Dashboard() {
  const { currentUser, setCurrentUser, logout, isHydrated } = useStore();
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
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const isAdmin = currentUser?.rol?.toLowerCase() === "admin";
  const {
    unreadCount,
    items: notifications,
    loading: notificationsLoading,
    loadNotifications,
    markRead,
    markAllRead,
    refreshUnread,
  } = useNotifications(Boolean(currentUser));

  usePushNotifications(Boolean(currentUser));

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

  if (!isHydrated) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111111" />
        <Text style={styles.loadingSessionText}>Cargando sesión...</Text>
      </View>
    );
  }

  if (!currentUser) {
    return <Redirect href="/Login" />;
  }

  const handleLogout = async () => {
    try {
      await logout();
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

  // Páginas con FlatList/ScrollView propio: no anidar otro ScrollView (evita warning VirtualizedList)
  const pageOwnsScroll =
    tab === "Viajes" ||
    tab === "Unidades" ||
    tab === "Viáticos" ||
    tab === "Inicio" ||
    tab === "Perfil";

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

  const openNotifications = () => {
    setNotificationsOpen(true);
    loadNotifications();
  };

  const closeNotifications = () => {
    setNotificationsOpen(false);
    refreshUnread();
  };

  const handleNotificationPress = (id: string, read: boolean) => {
    if (!read) markRead(id);
    setTab("Viajes");
    closeNotifications();
  };

  const formatNotificationDate = (value: string) => {
    try {
      return new Date(value).toLocaleString("es-MX", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const renderNotificationBell = (compact?: boolean) => (
    <TouchableOpacity
      style={[styles.notificationBell, compact && styles.notificationBellCompact]}
      onPress={openNotifications}
      activeOpacity={0.85}
      // @ts-ignore
      title={Platform.OS === "web" ? "Notificaciones" : undefined}
    >
      <FontAwesome5 name="bell" size={compact ? 17 : 18} color="#111111" />
      {unreadCount > 0 && (
        <View style={styles.notificationBadge}>
          <Text style={styles.notificationBadgeText}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderNotificationsModal = () => (
    <Modal
      visible={notificationsOpen}
      transparent
      animationType="fade"
      onRequestClose={closeNotifications}
    >
      <Pressable style={styles.notificationsOverlay} onPress={closeNotifications}>
        <Pressable
          style={[
            styles.notificationsPanel,
            !isLargeScreen && styles.notificationsPanelMobile,
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.notificationsHeader}>
            <Text style={styles.notificationsTitle}>Notificaciones</Text>
            <View style={styles.notificationsHeaderActions}>
              {unreadCount > 0 && (
                <TouchableOpacity onPress={markAllRead} activeOpacity={0.85}>
                  <Text style={styles.notificationsMarkAll}>Marcar todas</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={closeNotifications} activeOpacity={0.85}>
                <FontAwesome5 name="times" size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>
          </View>

          {notificationsLoading ? (
            <View style={styles.notificationsEmpty}>
              <ActivityIndicator size="small" color="#111111" />
            </View>
          ) : notifications.length === 0 ? (
            <View style={styles.notificationsEmpty}>
              <FontAwesome5 name="bell-slash" size={28} color="#cbd5e1" />
              <Text style={styles.notificationsEmptyText}>Sin notificaciones</Text>
            </View>
          ) : (
            <ScrollView style={styles.notificationsList} showsVerticalScrollIndicator={false}>
              {notifications.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.notificationItem,
                    !item.read && styles.notificationItemUnread,
                  ]}
                  onPress={() => handleNotificationPress(item.id, item.read)}
                  activeOpacity={0.85}
                >
                  <View style={styles.notificationItemTop}>
                    <Text style={styles.notificationItemTitle}>{item.title}</Text>
                    {!item.read && <View style={styles.notificationDot} />}
                  </View>
                  <Text style={styles.notificationItemBody}>{item.body}</Text>
                  <Text style={styles.notificationItemDate}>
                    {formatNotificationDate(item.createdAt)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );

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
                        color={isActive ? "#111111" : "#6b7280"} 
                        style={styles.menuIcon} 
                      />
                      <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
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
                style={styles.logoutButtonWeb} 
                onPress={handleLogout}
                // @ts-ignore
                title={Platform.OS === 'web' ? "Terminar sesión actual de forma segura" : undefined}
              >
                <FontAwesome5 name="sign-out-alt" size={15} color="#dc2626" style={styles.menuIcon} />
                <Text style={styles.logoutTextWeb}>Cerrar Sesión</Text>
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

              <View style={styles.webHeaderActions}>
                {renderNotificationBell()}
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
            </View>

            {pageOwnsScroll ? (
              <View style={styles.contentScrollHost}>
                <View style={[styles.contentContainer, styles.contentContainerFill]}>
                  {renderContent()}
                </View>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.contentContainer}>
                {renderContent()}
              </ScrollView>
            )}
          </View>
        </>
      ) : (
        <>
          {/* ================= HEADER MOVIL ================= */}
          <Appbar.Header style={styles.mobileAppbar}>
            <Appbar.Action icon="menu" color="#111111" onPress={openMobileMenu} />
            <Appbar.Content title={tab} titleStyle={styles.mobileHeaderTitle} />
            <View style={styles.mobileHeaderActions}>
              {renderNotificationBell(true)}
              <TouchableOpacity
                style={styles.mobileHeaderUser}
                onPress={() => { handleTabPress("Perfil"); if (menuVisible) closeMobileMenu(); }}
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
            </View>
          </Appbar.Header>

          {menuRendered && (
            <View style={styles.drawerOverlay} pointerEvents={menuVisible ? "auto" : "none"}>
              <Pressable style={StyleSheet.absoluteFill} onPress={closeMobileMenu}>
                <Animated.View style={[styles.overlayBackground, { opacity: overlayFade }]} />
              </Pressable>

              <Animated.View
                style={[
                  styles.drawer,
                  {
                    width: drawerWidth,
                    transform: [
                      {
                        translateX: drawerSlide.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-drawerWidth, 0],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <SafeAreaView style={styles.drawerInner} edges={["top", "bottom", "left"]}>
                  <Animated.View
                    style={[
                      styles.drawerLogoBlock,
                      {
                        opacity: itemAnims[0],
                        transform: [
                          {
                            translateY: itemAnims[0].interpolate({
                              inputRange: [0, 1],
                              outputRange: [12, 0],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <Image
                      source={require("../assets/images/logo-volta.jpeg")}
                      style={styles.drawerLogo}
                      resizeMode="contain"
                    />
                  </Animated.View>
                  <View style={styles.drawerDividerLine} />

                  <ScrollView
                    style={styles.drawerMenuList}
                    contentContainerStyle={styles.drawerMenuContent}
                    showsVerticalScrollIndicator={false}
                  >
                    {menuItems.map((item, index) => {
                      const isActive = tab === item;
                      const anim = itemAnims[Math.min(index + 1, itemAnims.length - 1)];
                      return (
                        <Animated.View
                          key={item}
                          style={{
                            opacity: anim,
                            transform: [
                              {
                                translateX: anim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [-18, 0],
                                }),
                              },
                            ],
                          }}
                        >
                          <TouchableOpacity
                            style={[styles.drawerItem, isActive && styles.drawerItemActive]}
                            onPress={() => {
                              handleTabPress(item);
                              closeMobileMenu();
                            }}
                            activeOpacity={0.85}
                          >
                            <View style={styles.menuItemLeftSection}>
                              <View style={[styles.drawerIconWrap, isActive && styles.drawerIconWrapActive]}>
                                <FontAwesome5
                                  name={getTabIcon(item)}
                                  size={17}
                                  color={isActive ? "#111111" : "#6b7280"}
                                />
                              </View>
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
                        </Animated.View>
                      );
                    })}
                  </ScrollView>

                  <Animated.View
                    style={{
                      opacity: itemAnims[itemAnims.length - 1],
                      transform: [
                        {
                          translateY: itemAnims[itemAnims.length - 1].interpolate({
                            inputRange: [0, 1],
                            outputRange: [16, 0],
                          }),
                        },
                      ],
                    }}
                  >
                    <TouchableOpacity
                      style={styles.drawerLogoutButton}
                      onPress={() => {
                        closeMobileMenu();
                        handleLogout();
                      }}
                      activeOpacity={0.85}
                    >
                      <FontAwesome5 name="sign-out-alt" size={15} color="#dc2626" />
                      <Text style={styles.drawerLogoutText}>Cerrar Sesión</Text>
                    </TouchableOpacity>
                  </Animated.View>
                </SafeAreaView>
              </Animated.View>
            </View>
          )}

          {pageOwnsScroll ? (
            <View style={[styles.mobileContent, styles.mobileContentPad]}>
              {renderContent()}
            </View>
          ) : (
            <ScrollView
              style={styles.mobileContent}
              contentContainerStyle={styles.mobileContentInner}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              {renderContent()}
            </ScrollView>
          )}
        </>
      )}
      {renderNotificationsModal()}
    </SafeAreaView>
  );
}

/* ================= ESTILOS ================= */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f6f9" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, backgroundColor: "#f4f6f9" },
  loadingSessionText: { fontSize: 14, color: "#6b7280", fontWeight: "600" },
  
  /* ===== SIDEBAR WEB ===== */
  sideMenu: {
    width: 280,
    backgroundColor: "#ffffff",
    padding: 20,
    height: "100%",
    justifyContent: "space-between",
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
  },
  logoContainer: { alignItems: "center", marginBottom: 5, paddingHorizontal: 5 },
  logoImage: { width: 200, height: 72 },
  avatarContainer: { flexDirection: "row", alignItems: "center", paddingVertical: 5, paddingHorizontal: 5 },
  userInfo: { marginLeft: 12, flex: 1 },
  name: { fontSize: 16, fontWeight: "bold", color: "#111111" },
  role: { fontSize: 13, color: "#2563eb", marginTop: 2, fontWeight: "500" },
  divider: { backgroundColor: "#e5e7eb", marginVertical: 15 },
  
  sideTab:{flexDirection: "row", alignItems: "center",justifyContent: "space-between",padding: 14, marginVertical: 4,borderRadius: 10,position: "relative",...(Platform.OS === "web" ? { cursor: "pointer" } : {}),},
  menuItemLeftSection: { flexDirection: "row",alignItems: "center",},
  activeIndicatorLine: {position: "absolute",left: 0,top: "30%",height: "40%",width: 4,backgroundColor: "#111111",borderRadius: 2 },
  sideTabActive: { backgroundColor: "rgba(0, 0, 0, 0.08)" },
  menuIcon: { width: 25, textAlign: "center" },
  tabText: { fontSize: 15, color: "#4b5563", marginLeft: 5, fontWeight: "600" },
  tabTextActive: { color: "#111111", fontWeight: "800" },
  
  // Estilos de los Badges (Web)
  badgeViajes: { backgroundColor: "#10b981", color: "#fff", fontWeight: "700" },
  badgeViaticos: { backgroundColor: "#f59e0b", color: "#1e293b", fontWeight: "700" },

  sidebarBottom: { marginTop: 20 },
  logoutButton: { flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: "#ef4444", borderRadius: 8, justifyContent: "center" },
  logoutText: { color: "#fff", fontWeight: "bold", marginLeft: 5 },
  logoutButtonWeb: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  logoutTextWeb: { color: "#dc2626", fontWeight: "700", marginLeft: 6, fontSize: 14 },
  footerText: { color: "#9ca3af", fontSize: 11, textAlign: "center", marginTop: 10 },

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
  webHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  notificationBell: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    position: "relative",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  notificationBellCompact: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  notificationBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  notificationBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
  },
  notificationsOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: Platform.OS === "web" ? 72 : 56,
    paddingRight: Platform.OS === "web" ? 28 : 12,
    paddingLeft: 12,
  },
  notificationsPanel: {
    width: 380,
    maxWidth: "100%",
    maxHeight: 480,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? { boxShadow: "0 16px 40px rgba(0,0,0,0.12)" as any }
      : {
          shadowColor: "#000",
          shadowOpacity: 0.15,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 8 },
          elevation: 12,
        }),
  },
  notificationsPanelMobile: {
    width: "100%",
    maxHeight: "78%",
    alignSelf: "center",
  },
  notificationsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  notificationsTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111111",
  },
  notificationsHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  notificationsMarkAll: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563eb",
  },
  notificationsList: {
    maxHeight: 400,
  },
  notificationsEmpty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 10,
  },
  notificationsEmptyText: {
    fontSize: 14,
    color: "#94a3b8",
    fontWeight: "600",
  },
  notificationItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    backgroundColor: "#ffffff",
  },
  notificationItemUnread: {
    backgroundColor: "#f8fafc",
  },
  notificationItemTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  notificationItemTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    color: "#111111",
  },
  notificationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2563eb",
  },
  notificationItemBody: {
    marginTop: 4,
    fontSize: 13,
    color: "#475569",
    lineHeight: 18,
  },
  notificationItemDate: {
    marginTop: 6,
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "600",
  },
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
  contentScrollHost: { flex: 1, minHeight: 0 },
  contentContainerFill: { flex: 1, minHeight: 0 },

  /* ===== MÓVIL ===== */
  mobileContent: { flex: 1, backgroundColor: "#f4f6f9" },
  mobileContentInner: { flexGrow: 1, padding: 14, paddingBottom: 36 },
  mobileContentPad: { padding: 14, paddingBottom: 20, minHeight: 0 },
  mobileAppbar: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    elevation: 0,
    justifyContent: "space-between",
    alignItems: "center",
  },
  mobileHeaderTitle: {
    fontWeight: "800",
    fontSize: 17,
    color: "#111111",
  },
  mobileHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginRight: 4,
  },
  mobileHeaderUser: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  drawerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    flexDirection: "row",
  },
  drawer: {
    height: "100%",
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    paddingBottom: 16,
    zIndex: 2,
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
    ...(Platform.OS === "web"
      ? { boxShadow: "8px 0 28px rgba(0,0,0,0.12)" as any }
      : {
          shadowColor: "#000",
          shadowOpacity: 0.18,
          shadowRadius: 16,
          shadowOffset: { width: 4, height: 0 },
          elevation: 20,
        }),
  },
  drawerInner: {
    flex: 1,
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
  },
  drawerLogoBlock: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: "#ffffff",
  },
  drawerLogo: {
    width: "90%",
    maxWidth: 240,
    height: 72,
  },
  drawerDividerLine: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginBottom: 10,
  },
  drawerMenuList: { flex: 1 },
  drawerMenuContent: { paddingTop: 4, paddingBottom: 16, gap: 6 },
  overlayBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.42)",
  },

  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 56,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginVertical: 1,
  },
  drawerItemActive: {
    backgroundColor: "rgba(0, 0, 0, 0.08)",
  },
  drawerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  drawerIconWrapActive: {
    backgroundColor: "rgba(0, 0, 0, 0.1)",
  },
  drawerText: { fontSize: 17, color: "#374151", marginLeft: 12, fontWeight: "600" },
  drawerTextActive: { color: "#111111", fontWeight: "800" },
  drawerLogoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    marginTop: 8,
  },
  drawerLogoutText: { color: "#dc2626", fontWeight: "700", fontSize: 15 },

  // Estilos de los Badges (Móvil)
  badgeViajesMobile: { backgroundColor: "#10b981", color: "#fff" },
  badgeViaticosMobile: { backgroundColor: "#f59e0b", color: "#fff" }
});