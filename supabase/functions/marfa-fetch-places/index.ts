import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SERPAPI_BASE = "https://serpapi.com/search.json";
const MARFA_LL = "@30.3114,-104.0208,14z";

export interface PlaceInput {
  name: string;
  address?: string;
  rating?: number | null;
  place_id?: string;
}

export interface PlaceResult {
  name: string;
  address: string | null;
  rating: number | null;
  place_id: string | null;
  /** If we couldn't search Google Maps (API error), we fell back to the input data. */
  fallback_data?: boolean;
}

function normalise(str: string | null | undefined): string {
  return (str ?? "").toLowerCase().replace(/[,\\.\\s]+/g, " ").trim();
}

/** Check whether `resultAddr` roughly matches `targetAddr` (same street number + overlapping name token). */
function addressesMatch(target: string | undefined, result: string | null | undefined): boolean {
  if (!target || !result) return false;
  const t = normalise(target);
  const r = normalise(result);

  // If target has a street number, check it appears in the result
  const tTokens = t.split(/\s+/);
  const firstToken = tTokens[0];
  if (/^\d+$/.test(firstToken)) {
    if (!r.includes(firstToken)) return false;
    // Then check at least one meaningful name token overlaps
    for (const token of tTokens.slice(1, 4)) {
      if (token.length > 3 && r.includes(token)) return true;
    }
    return false;
  }
  // Fall back to substring match
  return r.includes(t) || t.includes(r);
}

/**
 * Search Google Maps via SerpApi for a place by name.
 * Returns the raw local_results array, or null on error / zero results.
 */
async function fetchRawResults(
  name: string,
  apiKey: string,
): Promise<Array<Record<string, unknown>> | null> {
  const params = new URLSearchParams({
    engine: "google_maps",
    q: name,
    ll: MARFA_LL,
    type: "search",
    hl: "en",
    google_domain: "google.com",
    api_key: apiKey,
  });

  try {
    const res = await fetch(`${SERPAPI_BASE}?${params}`, {
      headers: { "Content-Type": "application/json" },
    });
    const data: Record<string, unknown> = await res.json();

    if (data.error) {
      console.warn("SerpApi error for", name, ":", data.error);
      return null;
    }

    const results = data.local_results as Array<Record<string, unknown>> | undefined;
    if (!results || results.length === 0) {
      return null;
    }
    return results;
  } catch (err) {
    console.warn("Network error for", name, ":", String(err));
    return null;
  }
}

function pickBestResult(
  results: Array<Record<string, unknown>>,
  knownAddress?: string,
): PlaceResult | null {
  // Pass 1: exact address match (scans ALL results)
  if (knownAddress) {
    for (const r of results) {
      if (addressesMatch(knownAddress, r.address as string | undefined)) {
        return {
          name: (r.title as string) ?? "",
          address: (r.address as string) ?? knownAddress,
          rating: (r.rating as number) ?? null,
          place_id: (r.place_id as string) ?? null,
        };
      }
    }
  }

  // Pass 2: first result that is definitely in Marfa, TX
  const marfaResult = results.find((r) => {
    const addr = (r.address as string) ?? "";
    return addr.includes("Marfa, TX") || addr.includes("Marfa, Texas");
  });
  if (marfaResult) {
    return {
      name: (marfaResult.title as string) ?? "",
      address: (marfaResult.address as string) ?? null,
      rating: (marfaResult.rating as number) ?? null,
      place_id: (marfaResult.place_id as string) ?? null,
    };
  }

  // Pass 3: nothing matched Marfa — return null so caller falls back to input data.
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const apiKey = Deno.env.get("SERPAPI_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "SERPAPI_KEY not configured on server" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  let body: { places: PlaceInput[] };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { places } = body;
  if (!Array.isArray(places) || places.length === 0) {
    return new Response(
      JSON.stringify({ error: "Provide at least one place" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Serialise searches so we don't race SerpApi rate limits
  const results: PlaceResult[] = [];
  for (const place of places) {
    const rawResults = await fetchRawResults(place.name, apiKey);

    if (rawResults) {
      const chosen = pickBestResult(rawResults, place.address);
      if (chosen) {
        results.push(chosen);
      } else {
        // Results existed but none matched address or Marfa — fallback
        results.push({
          name: place.name,
          address: place.address ?? null,
          rating: place.rating ?? null,
          place_id: place.place_id ?? null,
          fallback_data: true,
        });
      }
    } else {
      // No results from SerpApi at all — fallback to provided data
      results.push({
        name: place.name,
        address: place.address ?? null,
        rating: place.rating ?? null,
        place_id: place.place_id ?? null,
        fallback_data: true,
      });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});