import { FlatList, Text } from "react-native";
import { Card, Title } from "react-native-paper";
import { useStore } from "../context/Store";

export default function UnitList() {
  const { units } = useStore();

  return (
    <FlatList
      data={units}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <Card className="my-2 p-2">
          <Title>{item.nombre}</Title>
          {item.items.map(i => (
            <Text key={i}>- {i}</Text>
          ))}
        </Card>
      )}
    />
  );
}