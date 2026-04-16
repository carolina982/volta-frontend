import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { Platform, TouchableWithoutFeedback } from 'react-native';
import { Provider as PaperProvider } from "react-native-paper";
import { StoreProvider, useStore } from "./context/Store";
import useAutoLogout from "./hooks/useAutoLogout";


import { View } from "react-native";
import AdminPage from "./app/AdminPage";
import Dashboard from "./app/Dashboard";
import EditUnitsPage from "./app/EditUnitsPage";
import ForgotPassword from "./app/ForgotPassword";
import Login from "./app/Login";
import Register from "./app/Register";
import ResetPassword from "./app/ResetPassword";
import TripsPage from "./app/TripsPage";
import UnitsPage from "./app/UnitsPage";
import ViaticsPage from "./app/ViaticsPage";





// --- INICIO DEL PARCHE DE PORTABILIDAD ---

if (Platform.OS !== 'web') {
  if (typeof global.HTMLAnchorElement === 'undefined') {
    // @ts-ignore
    global.HTMLAnchorElement = class {};
  }
}


const Stack = createNativeStackNavigator();


  function AppNavigator() {
  const { currentUser, logout } = useStore();

  const { resetTimer } = useAutoLogout(logout);

  return (
    <TouchableWithoutFeedback onPress={resetTimer}>
      <View style={{ flex: 1 }}>
        <NavigationContainer onStateChange={resetTimer}>
          <Stack.Navigator screenOptions={{ headerShown: true }}>
            {!currentUser ? (
              <>
                <Stack.Screen name="Login" component={Login} options={{headerShown:false}}/>
                <Stack.Screen name="Register" component={Register} options={{headerShown:false}}/>
                <Stack.Screen name="ForgotPassword" component={ForgotPassword} options={{headerShown:false}}/>
                <Stack.Screen name="ResetPassword" component={ResetPassword} options={{headerShown:false}}/>
              </>
            ) : (
              <>
                <Stack.Screen name="Dashboard" component={Dashboard} options={{headerShown:false}} />
                <Stack.Screen name="TripsPage" component={TripsPage} />
                <Stack.Screen name="ViaticsPage" component={ViaticsPage} />
                <Stack.Screen name="AdminPage" component={AdminPage} />
                <Stack.Screen name="UnitsPage" component={UnitsPage} />
                <Stack.Screen name="EditUnitsPage" component={EditUnitsPage} />
              </>
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </View>
    </TouchableWithoutFeedback>
  );
};

export default function App() {
  return (
    <StoreProvider>
      <PaperProvider>
        <AppNavigator />
      </PaperProvider>
    </StoreProvider>
  );
}