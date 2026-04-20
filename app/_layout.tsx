import { StoreProvider } from "@/context/Store";
import { Stack } from "expo-router";

export default function layout (){
    return (
        <StoreProvider>
            <Stack screenOptions={{headerShown:false}}/>
        </StoreProvider>
    );
}