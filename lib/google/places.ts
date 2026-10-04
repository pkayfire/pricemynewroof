// Places API (New) place details: placeId → lat/lng, ZIP, city, state, formatted address. Server only.
import { DEFAULT_TIMEOUT_MS, GoogleApiError, readGoogleError, type GoogleClientOptions } from "./http";
import type { LatLng } from "@/lib/engine/types";

export const PLACES_BASE = "https://places.googleapis.com/v1/places/";
/** Essentials-tier fields only. */
export const PLACE_DETAILS_FIELDS = "id,formattedAddress,addressComponents,location,types";

/** Place types that identify a single address (not a street, city or business area). */
const ADDRESS_TYPES = new Set(["street_address", "premise", "subpremise"]);

export interface PlaceDetails {
  placeId: string;
  formattedAddress: string;
  location: LatLng;
  zip: string;
  city: string | null;
  state: string;
  types: string[];
}

export type PlaceErrorCode = "not_found" | "not_an_address" | "unsupported_location";

export class PlaceError extends Error {
  constructor(
    readonly code: PlaceErrorCode,
    message: string,
  ) {
    super(message);
  }
}

interface AddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface PlaceResponse {
  id?: string;
  formattedAddress?: string;
  addressComponents?: AddressComponent[];
  location?: { latitude?: number; longitude?: number };
  types?: string[];
}

const component = (cs: AddressComponent[], type: string) => cs.find((c) => c.types?.includes(type));

/** Parses a place details response; throws PlaceError when it isn't a single US address with a ZIP. */
export function parsePlaceDetails(json: unknown, placeId: string): PlaceDetails {
  const p = json as PlaceResponse;
  const cs = p.addressComponents ?? [];
  const types = p.types ?? [];
  const country = component(cs, "country")?.shortText;
  if (country !== "US") throw new PlaceError("unsupported_location", "only US addresses are supported");
  const zip = component(cs, "postal_code")?.shortText ?? component(cs, "postal_code")?.longText;
  const state = component(cs, "administrative_area_level_1")?.shortText;
  const lat = p.location?.latitude;
  const lng = p.location?.longitude;
  if (!types.some((t) => ADDRESS_TYPES.has(t)) || !zip || !/^\d{5}$/.test(zip) || !state || lat == null || lng == null) {
    throw new PlaceError("not_an_address", "choose a street address");
  }
  const city =
    component(cs, "locality")?.longText ??
    component(cs, "postal_town")?.longText ??
    component(cs, "sublocality")?.longText ??
    component(cs, "administrative_area_level_3")?.longText ??
    null;
  return {
    placeId: p.id ?? placeId,
    formattedAddress: p.formattedAddress ?? "",
    location: { latitude: lat, longitude: lng },
    zip,
    city,
    state,
    types,
  };
}

export async function getPlaceDetails(placeId: string, opts: GoogleClientOptions): Promise<PlaceDetails> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(`${PLACES_BASE}${encodeURIComponent(placeId)}`, {
    method: "GET",
    headers: { "X-Goog-Api-Key": opts.apiKey, "X-Goog-FieldMask": PLACE_DETAILS_FIELDS },
    signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  if (!res.ok) {
    const err = await readGoogleError(res);
    // An unknown or malformed place ID comes back as 404 NOT_FOUND or 400 INVALID_ARGUMENT.
    if (res.status === 404 || (res.status === 400 && err.status === "INVALID_ARGUMENT")) {
      throw new PlaceError("not_found", "place not found");
    }
    throw new GoogleApiError(`Places API ${res.status}: ${err.message}`, res.status, err.status);
  }
  return parsePlaceDetails(await res.json(), placeId);
}
