export type Category = "user" | "competitor";

export interface Review {
  author_name?: string;
  rating?: number | string;
  text?: string;
  relative_time_description?: string;
  [key: string]: unknown;
}

export interface OpeningHours {
  source?: string | null;
  display?: string | null;
}

/** Row shape of `marfa.businesses` (read via anon role). */
export interface Business {
  id: string;
  place_id: string;
  name: string;
  category: Category;
  display_name: string;
  formatted_address: string | null;
  national_phone_number: string | null;
  website_uri: string | null;
  rating: number | null;
  user_rating_count: number | null;
  price_level: number | null;
  regular_opening_hours: OpeningHours | null;
  reviews: Review[] | null;
  photo_urls: string[] | null;
  lat: number | null;
  lng: number | null;
  last_fetched_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type FetchStatus = "ok" | "not_found" | "error";

/** One entry of the edge function's `results` array. */
export interface FetchResult {
  name: string;
  status: FetchStatus;
  error?: string;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

/** Coerce PostgREST numeric (number | string) to a plain number. */
export function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function getCoordinates(b: Business): Coordinates | null {
  const lat = toNumber(b.lat);
  const lng = toNumber(b.lng);
  return lat !== null && lng !== null ? { lat, lng } : null;
}
