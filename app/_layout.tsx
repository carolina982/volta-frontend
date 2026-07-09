import { StoreProvider } from "@/context/Store";
import { Stack } from "expo-router";
import { Provider as PaperProvider } from "react-native-paper";

export default function layout (){
    return (
        <StoreProvider>
            <PaperProvider>
                <Stack screenOptions={{headerShown:false}}/>
            </PaperProvider>
        </StoreProvider>
    );
}