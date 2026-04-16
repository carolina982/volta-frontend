import { useState } from "react";
import { FlatList, Text, View } from "react-native";
import { Button, Card, TextInput, Title } from "react-native-paper";
import { useStore } from "../context/Store";

interface ViaticListProps {
  viewOnly?: boolean;
}

export default function ViaticList({ viewOnly }: ViaticListProps) {
  const { viatics, currentUser, updateViatic } = useStore();
  const [monto, setMonto] = useState<number>(0);

  const filtered = currentUser?.rol === "Chofer"
    ? viatics.filter(v => v.choferId === currentUser.id)
    : viatics;

  return (
    <FlatList
      data={filtered}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <Card className="my-2 p-2">
          <Title>Monto: ${item.monto}</Title>
          <Text>Fecha: {item.fecha}</Text>
          {!viewOnly && currentUser?.rol === "Admin" && (
            <View className="flex-row items-center mt-2">
              <TextInput label="Nuevo monto"value={monto.toString()}onChangeText={text => setMonto(Number(text))}keyboardType="numeric"className="flex-1 mr-2"/>
              <Button mode="contained" onPress={() => updateViatic({ ...item, monto })}>Actualizar</Button>
            </View>
          )}
        </Card>
      )}
/>
);
}