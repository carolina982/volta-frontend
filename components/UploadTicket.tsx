import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { Button, Card } from "react-native-paper";
import { useStore } from "../context/Store";

interface UploadTicketProps {
  tripId: string;
}

export default function UploadTicket({ tripId }: UploadTicketProps) {
  const { trips, addTrip } = useStore();
  const [images, setImages] = useState<string[]>([]);

  const pickImages = async () => {
    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.onchange = () => {
        if (!input.files) return;
        const uris = Array.from(input.files).map(f => URL.createObjectURL(f));
        setImages([...images, ...uris]);
        const trip = trips.find(t => t.id === tripId);
        if (trip) addTrip({ ...trip, facturas: [...(trip.facturas || []), ...uris] });
      };
      input.click();
    } else {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
      if (!result.canceled) {
        const uris = result.assets.map(a => a.uri);
        setImages([...images, ...uris]);
        const trip = trips.find(t => t.id === tripId);
        if (trip) addTrip({ ...trip, facturas: [...(trip.facturas || []), ...uris] });
      }
    }
  };

  return (
    <View className="my-2">
      <Button mode="contained" onPress={pickImages}>Subir Tickets/Fotos</Button>
      <ScrollView horizontal className="mt-2">
        {images.map(uri => (
          <Card key={uri} className="mr-2" style={{ width: 100, height: 100 }}>
            <Card.Cover source={{ uri }} />
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}