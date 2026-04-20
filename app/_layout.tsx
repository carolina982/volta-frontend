import { Stack } from "expo-router";
import { StoreProvider } from "../context/Store";

export default function Layout (){
    return (
        <StoreProvider>
            <Stack />
        </StoreProvider>
    );
}