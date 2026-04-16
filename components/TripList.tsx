import { FlatList, Text } from "react-native";
import { Card, Title } from "react-native-paper";
import { useStore } from "../context/Store";
import UploadTicket from "./UploadTicket";

interface TripListProps { viewOnly?: boolean }

export default function TripList({ viewOnly }: TripListProps) {
  const { trips, currentUser } = useStore();
  const filtered = currentUser?.rol === "Chofer" ? trips.filter(t => t.choferId === currentUser.id) : trips;

  return (
    <FlatList
      data={filtered}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <Card className="my-2 p-2">
          <Title>{item.origen} → {item.destino}</Title>
          <Text>{item.kilometros} km | {item.estado}</Text>
          {!viewOnly && <UploadTicket tripId={item.id} />}
        </Card>
      )}
    />
  );
}