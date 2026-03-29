import { SafeAreaView, View, Text, StyleSheet, Pressable, Alert } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { router } from "expo-router";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";

type Station = {
  id: number;
  code: string;
  nom: string;
  adresse: string;
  ville: string;
  capacite_totale: number;
  statut: string;
  latitude: number;
  longitude: number;
};

const API_URL = "https://zentra-backend-hy00.onrender.com";

export default function StationsMap() {
  const mapRef = useRef<MapView | null>(null);

  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLocation();
    loadStations();
  }, []);

  const loadLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Localisation refusée",
          "Autorisez la localisation pour voir votre position et trouver la station la plus proche."
        );
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setUserLocation(coords);

      mapRef.current?.animateToRegion(
        {
          ...coords,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        },
        1200
      );
    } catch (error) {
      Alert.alert("Erreur", "Impossible de récupérer votre position actuelle.");
    }
  };

  const loadStations = async () => {
    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/api/stations`);
      const data = await response.json();

      setStations(data);

      if (data.length > 0) {
        mapRef.current?.animateToRegion(
          {
            latitude: Number(data[0].latitude),
            longitude: Number(data[0].longitude),
            latitudeDelta: 0.2,
            longitudeDelta: 0.2,
          },
          1200
        );
      }
    } catch (error) {
      Alert.alert("Erreur", "Impossible de charger les stations.");
      console.log("Erreur stations :", error);
    } finally {
      setLoading(false);
    }
  };

  const centerOnUser = async () => {
    if (!userLocation) {
      Alert.alert(
        "Position indisponible",
        "Votre localisation n'est pas encore disponible."
      );
      return;
    }

    mapRef.current?.animateToRegion(
      {
        ...userLocation,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      },
      1000
    );
  };

  const goToReservation = () => {
    router.push("/(client)/reservation");
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: 4.9386,
          longitude: -52.334,
          latitudeDelta: 0.3,
          longitudeDelta: 0.3,
        }}
        showsUserLocation
        showsMyLocationButton
      >
        {stations.map((station) => (
          <Marker
            key={station.id}
            coordinate={{
              latitude: Number(station.latitude),
              longitude: Number(station.longitude),
            }}
            title={station.nom}
            description={`${station.capacite_totale} scooters disponibles`}
            onCalloutPress={goToReservation}
          />
        ))}
      </MapView>

      <View style={styles.panel}>
        <Text style={styles.title}>Stations ZENTRA</Text>

        <Text style={styles.text}>
          {loading
            ? "Chargement des stations..."
            : `${stations.length} station(s) disponible(s) affichée(s) sur la carte.`}
        </Text>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable
            onPress={centerOnUser}
            style={[styles.button, { backgroundColor: "#0A84C6", flex: 1 }]}
          >
            <Text style={styles.buttonText}>Me localiser</Text>
          </Pressable>

          <Pressable
            onPress={goToReservation}
            style={[styles.button, { flex: 1 }]}
          >
            <Text style={styles.buttonText}>Voir scooters</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },

  panel: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },

  title: {
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 5,
    color: "#111827",
  },

  text: {
    color: "#667085",
    marginBottom: 15,
    lineHeight: 20,
  },

  button: {
    backgroundColor: "#111111",
    padding: 15,
    borderRadius: 12,
  },

  buttonText: {
    color: "#FFFFFF",
    textAlign: "center",
    fontWeight: "800",
  },
});
