import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  pickBestResult,
  type PlaceInput,
  type PlaceResult,
  validatePlaces,
} from "../_shared/places.ts";

const SERPAPI_BASE = "https://serpapi.com/search.json";
const MARFA_LL = "@30.3114,-104.0208,14z";
const FETCH_TIMEOUT_MS = 8_000;
const LOCAL_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function allowedOrigins(): Set<string> {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set([...LOCAL_ORIGINS, ...configured]);
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins().has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

function jwtRole(authorization: string | null): string | null {
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) return null;

  try {
    const payloadPart = match[1].split(".")[1];
    if (!payloadPart) return null;
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    if (typeof payload.exp === "number" && payload.exp <= Date.now() / 1000) return null;
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

async function fetchRawResults(
  place: PlaceInput,
  apiKey: string,
): Promise<Array<Record<string, unknown>> | null> {
  const params = new URLSearchParams({
    engine: "google_maps",
    q: [place.name, place.address].filter(Boolean).join(" "),
    ll: MARFA_LL,
    type: "search",
    hl: "en",
    google_domain: "google.com",
    api_key: apiKey,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${SERPAPI_BASE}?${params}`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn("SerpApi HTTP error for", place.name, ":", response.status);
      return null;
    }

    const data = await response.json() as Record<string, unknown>;
    if (data.error) {
      console.warn("SerpApi error for", place.name, ":", data.error);
      return null;
    }

    return Array.isArray(data.local_results) && data.local_results.length > 0
      ? data.local_results as Array<Record<string, unknown>>
      : null;
  } catch (error) {
    console.warn("SerpApi request failed for", place.name, ":", String(error));
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackResult(place: PlaceInput): PlaceResult {
  return {
    name: place.name,
    address: place.address ?? null,
    rating: place.rating ?? null,
    place_id: place.place_id ?? null,
    latitude: null,
    longitude: null,
    reviews_count: null,
    ...(place.role ? { role: place.role } : {}),
    fallback_data: true,
  };
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  const headers = corsHeaders(origin);

  if (origin && !allowedOrigins().has(origin)) {
    return jsonResponse({ error: "Origin is not allowed" }, 403, headers);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        ...headers,
        "Allow": "POST, OPTIONS",
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }

  // Supabase's gateway verifies the signature; this additionally rejects anon tokens.
  const role = jwtRole(request.headers.get("Authorization"));
  if (role !== "authenticated" && role !== "service_role") {
    return jsonResponse({ error: "Authentication required" }, 401, headers);
  }

  const apiKey = Deno.env.get("SERPAPI_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "Server is missing SERPAPI_KEY" }, 500, headers);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, headers);
  }

  const placesValue = body && typeof body === "object"
    ? (body as Record<string, unknown>).places
    : undefined;
  const validation = validatePlaces(placesValue);
  if (!validation.ok) {
    return jsonResponse({ error: validation.error }, 400, headers);
  }

  // Keep requests serial to avoid short bursts against SerpApi's quota.
  const results: PlaceResult[] = [];
  for (const place of validation.places) {
    const rawResults = await fetchRawResults(place, apiKey);
    const chosen = rawResults
      ? pickBestResult(rawResults, place.address)
      : null;
    results.push(chosen
      ? { ...chosen, ...(place.role ? { role: place.role } : {}) }
      : fallbackResult(place));
  }

  return jsonResponse({ results }, 200, headers);
});
