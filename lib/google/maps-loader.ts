// Browser-only loader for the Google Maps JavaScript API (maps + Places API (New)).
// The browser key (GOOGLE_MAPS_API_KEY) is referrer-restricted; server pages pass it in as a prop.
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

let configuredKey: string | null = null;

function configure(apiKey: string) {
  if (configuredKey === apiKey) return;
  if (configuredKey !== null) throw new Error("Google Maps already configured with a different key");
  setOptions({ key: apiKey, v: "weekly" });
  configuredKey = apiKey;
}

export async function loadMapsLibrary(apiKey: string): Promise<google.maps.MapsLibrary> {
  configure(apiKey);
  return importLibrary("maps");
}

export async function loadPlacesLibrary(apiKey: string): Promise<google.maps.PlacesLibrary> {
  configure(apiKey);
  return importLibrary("places");
}
