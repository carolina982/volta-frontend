import { Stack } from "expo-router";
import { MD3LightTheme, Provider as PaperProvider } from "react-native-paper";
import { StoreProvider } from "@/context/Store";

const voltaTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: "#111111",
    secondary: "#111111",
    tertiary: "#374151",
    primaryContainer: "#e5e7eb",
    secondaryContainer: "#e5e7eb",
    onPrimary: "#ffffff",
    onSecondary: "#ffffff",
    onPrimaryContainer: "#111111",
  },
};

export default function layout() {
  return (
    <StoreProvider>
      <PaperProvider theme={voltaTheme}>
        <Stack screenOptions={{ headerShown: false }} />
      </PaperProvider>
    </StoreProvider>
  );
}
