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
import { Appbar, Badge, Divider } from "react-native-paper"; // <-- Importamos Badge
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../context/Store";
import { useNotifications } from "../hooks/useNotifications";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { api, BASE_URL } from "../services/api";

import AdminPage from "./AdminPage";
import HomePage from "./HomePage";
import PerfilePage from "./PerfilePage";
import TripsPage from "./TripsPage";
import UnitsPage from "./UnitsPage";
import ViaticsPage from "./GastosPage";

type TabType = "Inicio" | "Viajes" | "Gastos" | "Perfil" | "Unidades" | "Usuarios";

const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, "");

const resolvePhotoUrl = (photoUrl?: string | null) => {
  if (!photoUrl) return null;
  const raw = String(photoUrl).trim();
  if (!raw) return null;

  // Conserva ?t=... para forzar refresco tras cambiar foto
  const qIndex = raw.indexOf("?");
  const pathPart = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const query = qIndex >= 0 ? raw.slice(qIndex) : "";

  if (
    pathPart.startsWith("http") ||
    pathPart.startsWith("file:") ||
    pathPart.startsWith("blob:") ||
    pathPart.startsWith("data:")
  ) {
    return `${pathPart}${query}`;
  }

  const path = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  return `${API_ORIGIN}${path}${query}`;
};

function UserAvatar({
  uri,
  initials,
  size = 40,
}: {
  uri?: string | null;
  initials: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(uri) && !failed;

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#111111",
        borderWidth: 2,
        borderColor: "#e5e7eb",
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {showImage ? (
        <Image
          source={{ uri: uri as string }}
          style={{ width: size, height: size }}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Text
          style={{
            color: "#ffffff",
            fontWeight: "800",
            fontSize: Math.round(size * 0.34),
          }}
        >
          {initials}
        </Text>
      )}
    </View>
  );
}

export default function Dashboard() {
  const { currentUser, setCurrentUser, logout, isHydrated } = useStore();
  const [tab, setTab] = useState<TabType>("Inicio");
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuRendered, setMenuRendered] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { width } = useWindowDimensions();
  const router = useRouter();
  const drawerWidth = Math.min(Math.max(width * 0.88, 320), 400);
  const drawerSlide = useRef(new Animated.Value(0)).current;
  const overlayFade = useRef(new Animated.Value(0)).current;
  const drawerScale = useRef(new Animated.Value(0.96)).current;
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
    drawerScale.setValue(0.96);
    itemAnims.forEach((anim) => anim.setValue(0));

    Animated.parallel([
      Animated.timing(overlayFade, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(drawerSlide, {
        toValue: 1,
        friction: 8,
        tension: 68,
        useNativeDriver: true,
      }),
      Animated.spring(drawerScale, {
        toValue: 1,
        friction: 8,
        tension: 70,
        useNativeDriver: true,
      }),
      Animated.stagger(
        40,
        itemAnims.map((anim) =>
          Animated.timing(anim, {
            toValue: 1,
            duration: 320,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          })
        )
      ),
    ]).start();
  }, [drawerSlide, overlayFade, drawerScale, itemAnims]);

  const closeMobileMenu = useCallback(() => {
    Animated.parallel([
      Animated.timing(overlayFade, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(drawerSlide, {
        toValue: 0,
        duration: 240,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(drawerScale, {
        toValue: 0.97,
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
  }, [drawerSlide, overlayFade, drawerScale]);

  const handleTabPress = useCallback((item: TabType) => {
    setTab(item);
  }, []);

  // ================= CONTADORES (BADGES) =================
  
  const [viajesActivos, setViajesActivos] = useState(0);
  const [viaticesPendientes, setViaticesPendientes] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const isAdmin = currentUser?.rol?.toLowerCase() === "admin";
  const resolvedPhotoUrl = resolvePhotoUrl(currentUser?.photoUrl);
  const userInitials = `${currentUser?.nombre?.[0] || "U"}${currentUser?.apellido?.[0] || ""}`.toUpperCase();
  const userFullName = [currentUser?.nombre, currentUser?.apellido].filter(Boolean).join(" ");
  const userRoleShort = String(currentUser?.rol || "Usuario")
    .replace(/Ayudante General/i, "Ayudante")
    .trim();
  const {
    unreadCount,
    items: notifications,
    loading: notificationsLoading,
    loadNotifications,
    markRead,
    markAllRead,
    refreshUnread,
  } = useNotifications(Boolean(currentUser));

  usePushNotifications(Boolean(currentUser), refreshUnread);

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
    if (currentUser && !isAdmin && tab === "Gastos") {
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
      case "Gastos":
        return isAdmin ? <ViaticsPage /> : null;
      case "Perfil":
        return <PerfilePage currentUser={currentUser} setCurrentUser={setCurrentUser} />;
      case "Unidades":
        return currentUser.rol?.toLowerCase() === "admin" ? (
          <UnitsPage currentUser={currentUser} />
        ) : null;
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
    tab === "Gastos" ||
    tab === "Inicio" ||
    tab === "Perfil";

  // Prioridad 4: Reordenar menú por frecuencia de uso (Inicio > Viajes > Gastos > Perfil)
  const menuItems: TabType[] = [
    "Inicio",
    "Viajes",
    ...(isAdmin ? (["Gastos"] as TabType[]) : []),
    "Perfil",
    ...(isAdmin ? (["Unidades", "Usuarios"] as TabType[]) : []),
  ];

  const getTabIcon = (item: TabType) => {
    switch (item) {
      case "Inicio": return "home";
      case "Viajes": return "route";
      case "Gastos": return "wallet";
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
      case "Gastos": return `Control de gastos (${viaticesPendientes} pendientes)`;
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

  const handleNotificationPress = (id: string, read: boolean, type?: string) => {
    if (!read) markRead(id);
    if (type === "announcement_published") {
      setTab("Inicio");
    } else {
      setTab("Viajes");
    }
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

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "trip_assigned":
        return { name: "route" as const, color: "#111111", bg: "#f3f4f6" };
      case "companion_assigned":
        return { name: "user-friends" as const, color: "#111111", bg: "#f3f4f6" };
      case "trip_started":
        return { name: "play-circle" as const, color: "#2563eb", bg: "#eff6ff" };
      case "trip_completed":
        return { name: "check-circle" as const, color: "#059669", bg: "#ecfdf5" };
      case "announcement_published":
        return { name: "bullhorn" as const, color: "#111111", bg: "#f3f4f6" };
      default:
        return { name: "bell" as const, color: "#374151", bg: "#f3f4f6" };
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
              {notifications.map((item) => {
                const icon = getNotificationIcon(item.type);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.notificationItem,
                      !item.read && styles.notificationItemUnread,
                    ]}
                    onPress={() => handleNotificationPress(item.id, item.read, item.type)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.notificationIconBadge, { backgroundColor: icon.bg }]}>
                      <FontAwesome5 name={icon.name} size={14} color={icon.color} solid />
                    </View>
                    <View style={styles.notificationItemContent}>
                      <View style={styles.notificationItemTop}>
                        <Text style={styles.notificationItemTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        {!item.read && <View style={styles.notificationDot} />}
                      </View>
                      <Text style={styles.notificationItemBody} numberOfLines={3}>
                        {item.body}
                      </Text>
                      <Text style={styles.notificationItemDate}>
                        {formatNotificationDate(item.createdAt)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
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

            <View style={styles.sideMenuList}>
              {menuItems.map((item) => {
                const isActive = tab === item;
                return (
                  <TouchableOpacity 
                    key={item} 
                    style={[styles.sideTab, isActive && styles.sideTabActive]} 
                    onPress={() => handleTabPress(item)}
                    // @ts-ignore
                    dataSet={Platform.OS === 'web' ? { title: getTabTooltip(item) } : undefined}
                    title={Platform.OS === 'web' ? getTabTooltip(item) : undefined}
                  >
                    {isActive && <View style={styles.activeIndicatorLine} />}
                    
                    <View style={styles.menuItemLeftSection}>
                      <View style={[styles.menuIconWrap, isActive && styles.menuIconWrapActive]}>
                        <FontAwesome5 
                          name={getTabIcon(item)} 
                          size={16} 
                          color={isActive ? "#111111" : "#6b7280"} 
                        />
                      </View>
                      <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                        {item}
                      </Text>
                    </View>

                    {item === "Viajes" && viajesActivos > 0 && (
                      <Badge style={styles.badgeViajes}>{viajesActivos}</Badge>
                    )}
                    {item === "Gastos" && viaticesPendientes > 0 && (
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
              <View style={styles.footerBlock}>
                <Text style={styles.footerMeta}>v1.0.4 · © 2026</Text>
              </View>
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
                      {userFullName || "Usuario"}
                    </Text>
                    <View style={styles.headerRoleBadge}>
                      <Text style={styles.headerRoleText}>{userRoleShort}</Text>
                    </View>
                  </View>
                  <UserAvatar uri={resolvedPhotoUrl} initials={userInitials} size={40} />
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
            <Appbar.Content
              title={tab}
              titleStyle={styles.mobileHeaderTitle}
              style={styles.mobileHeaderTitleWrap}
            />
            <View style={styles.mobileHeaderActions}>
              {renderNotificationBell(true)}
              <TouchableOpacity
                style={styles.mobileHeaderUserChip}
                onPress={() => {
                  handleTabPress("Perfil");
                  if (menuVisible) closeMobileMenu();
                }}
                activeOpacity={0.85}
                accessibilityLabel={`Perfil de ${userFullName || "Usuario"}`}
              >
                <View style={styles.mobileHeaderUserText}>
                  <Text numberOfLines={2} style={styles.mobileHeaderUserName}>
                    {userFullName || "Usuario"}
                  </Text>
                  <View style={styles.mobileHeaderRoleBadge}>
                    <Text numberOfLines={1} style={styles.mobileHeaderRoleText}>
                      {userRoleShort}
                    </Text>
                  </View>
                </View>
                <UserAvatar uri={resolvedPhotoUrl} initials={userInitials} size={36} />
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
                      { scale: drawerScale },
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
                            {item === "Gastos" && viaticesPendientes > 0 && (
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
                    <View style={styles.footerBlock}>
                      <Text style={styles.footerMeta}>v1.0.4 · © 2026</Text>
                    </View>
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
    width: 320,
    backgroundColor: "#ffffff",
    paddingVertical: 24,
    paddingHorizontal: 18,
    height: "100%",
    justifyContent: "space-between",
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
    ...(Platform.OS === "web"
      ? { boxShadow: "4px 0 24px rgba(15, 23, 42, 0.04)" as any }
      : {}),
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  logoImage: { width: 228, height: 82 },
  avatarContainer: { flexDirection: "row", alignItems: "center", paddingVertical: 5, paddingHorizontal: 5 },
  userInfo: { marginLeft: 12, flex: 1 },
  name: { fontSize: 16, fontWeight: "bold", color: "#111111" },
  role: { fontSize: 13, color: "#2563eb", marginTop: 2, fontWeight: "500" },
  divider: { backgroundColor: "#eef2f7", marginVertical: 18, height: 1 },
  sideMenuList: { flex: 1, gap: 4 },
  
  sideTab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginVertical: 2,
    borderRadius: 12,
    position: "relative",
    ...(Platform.OS === "web" ? { cursor: "pointer" as const } : {}),
  },
  menuItemLeftSection: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#eef2f7",
    alignItems: "center",
    justifyContent: "center",
  },
  menuIconWrapActive: {
    backgroundColor: "#ffffff",
    borderColor: "#e5e7eb",
  },
  activeIndicatorLine: {
    position: "absolute",
    left: 0,
    top: "28%",
    height: "44%",
    width: 3,
    backgroundColor: "#111111",
    borderRadius: 2,
  },
  sideTabActive: { backgroundColor: "rgba(15, 23, 42, 0.06)" },
  menuIcon: { width: 25, textAlign: "center" },
  tabText: { fontSize: 15, color: "#4b5563", fontWeight: "600", flexShrink: 1 },
  tabTextActive: { color: "#111111", fontWeight: "800" },
  
  // Estilos de los Badges (Web)
  badgeViajes: { backgroundColor: "#10b981", color: "#fff", fontWeight: "700" },
  badgeViaticos: { backgroundColor: "#f59e0b", color: "#1e293b", fontWeight: "700" },

  sidebarBottom: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    gap: 14,
  },
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
  footerBlock: {
    alignItems: "center",
    gap: 2,
  },
  footerBrand: {
    fontSize: 12,
    fontWeight: "800",
    color: "#111111",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  footerMeta: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9ca3af",
    letterSpacing: 0.2,
  },
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
    color: "#111111",
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
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    backgroundColor: "#ffffff",
  },
  notificationItemUnread: {
    backgroundColor: "#f8fafc",
  },
  notificationIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  notificationItemContent: {
    flex: 1,
    minWidth: 0,
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
    backgroundColor: "#111111",
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
    minHeight: 64,
  },
  mobileHeaderTitleWrap: {
    flex: 0.55,
    marginHorizontal: 0,
  },
  mobileHeaderTitle: {
    fontWeight: "800",
    fontSize: 15,
    color: "#111111",
  },
  mobileHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginRight: 6,
    flexShrink: 1,
    maxWidth: "62%",
  },
  mobileHeaderUserChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 5,
    paddingLeft: 12,
    paddingRight: 5,
    backgroundColor: "#f8fafc",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexShrink: 1,
    minWidth: 0,
    maxWidth: 220,
  },
  mobileHeaderUserText: {
    flexShrink: 1,
    alignItems: "flex-end",
    minWidth: 0,
  },
  mobileHeaderUserName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111111",
    textAlign: "right",
    lineHeight: 15,
  },
  mobileHeaderRoleBadge: {
    marginTop: 3,
    alignSelf: "flex-end",
    backgroundColor: "#111111",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  mobileHeaderRoleText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 0.2,
  },
  mobileHeaderUserRole: {
    fontSize: 10,
    fontWeight: "600",
    color: "#6b7280",
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
    paddingHorizontal: 20,
    paddingBottom: 18,
    zIndex: 2,
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
    ...(Platform.OS === "web"
      ? { boxShadow: "12px 0 40px rgba(15, 23, 42, 0.18)" as any }
      : {
          shadowColor: "#0f172a",
          shadowOpacity: 0.22,
          shadowRadius: 24,
          shadowOffset: { width: 6, height: 0 },
          elevation: 24,
        }),
  },
  drawerInner: {
    flex: 1,
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
  },
  drawerLogoBlock: {
    alignItems: "center",
    paddingTop: 14,
    paddingBottom: 18,
    backgroundColor: "#ffffff",
  },
  drawerLogo: {
    width: "92%",
    maxWidth: 280,
    height: 84,
  },
  drawerDividerLine: {
    height: 1,
    backgroundColor: "#eef2f7",
    marginBottom: 10,
  },
  drawerMenuList: { flex: 1 },
  drawerMenuContent: { paddingTop: 4, paddingBottom: 16, gap: 6 },
  overlayBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
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
    backgroundColor: "rgba(15, 23, 42, 0.06)",
  },
  drawerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#eef2f7",
    alignItems: "center",
    justifyContent: "center",
  },
  drawerIconWrapActive: {
    backgroundColor: "#ffffff",
    borderColor: "#e5e7eb",
  },
  drawerText: { fontSize: 16, color: "#4b5563", marginLeft: 12, fontWeight: "600" },
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