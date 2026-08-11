import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SERPAPI_BASE = "https://serpapi.com/search.json";

/** Centroid of Marfa, TX for geographically-biased searches (zoom=14). */
const MARFA_LL = "@30.3114,-104.0208,14z";

interface BusinessDef {
  name: string;
  address: string; // street only, e.g. "108 E El Paso St"
  category: string; // "user" | "competitor"
  search_term: string; // category keyword used as a fallback search
}

const BUSINESSES: BusinessDef[] = [
  { name: "Marfa Bread", address: "701 N Gonzales St", category: "user", search_term: "bakery" },
  { name: "Coyote Coffee", address: "317 W San Antonio St", category: "competitor", search_term: "coffee" },
  { name: "Dirty Water Bagels", address: "108 E El Paso St", category: "competitor", search_term: "bagels" },
  { name: "Mutual Friends Coffee", address: "110 E El Paso St", category: "competitor", search_term: "coffee" },
];

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

/** Map SerpApi price string ("$", "$$", etc.) to integer 1-4. */
function mapPriceLevel(price: string | undefined): number | null {
  if (!price) return null;
  const level = price.length;
  return level >= 1 && level <= 4 ? level : null;
}

/** Normalise a string for fuzzy comparison. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * True when `expectedStreet` (e.g. "108 E El Paso St") is contained within
 * the full returned address (e.g. "108 E El Paso St, Marfa, TX 79843"),
 * ignoring punctuation, case and whitespace.
 */
function addressesMatch(expectedStreet: string, returnedAddress: string | undefined): boolean {
  if (!returnedAddress) return false;
  return norm(returnedAddress).includes(norm(expectedStreet));
}

// --------------------------------------------------------------------------
// SerpApi search (multi-stage)
// --------------------------------------------------------------------------

interface LocalResult {
  position?: number;
  title?: string;
  rating?: number;
  reviews?: number;
  price?: string;
  type?: string;
  address?: string;
  hours?: string;
  description?: string;
  place_id?: string;
  data_id?: string;
  lsig?: string;
  thumbnail?: string;
  thumbnail_large?: string;
  gps_coordinates?: { latitude: number; longitude: number };
  links?: {
    website?: string;
    phone?: string;
    directions?: string;
    order?: string;
    schedule?: string;
  };
  service_options?: { dine_in?: boolean; takeout?: boolean };
}

/** Run one SerpApi google_maps search, returning the raw local_results. */
async function googleMapsSearch(
  apiKey: string,
  q: string,
  withLl: boolean,
): Promise<LocalResult[]> {
  const params = new URLSearchParams({
    engine: "google_maps",
    q,
    type: "search",
    hl: "en",
    google_domain: "google.com",
    api_key: apiKey,
  });
  if (withLl) params.set("ll", MARFA_LL);

  const res = await fetch(`${SERPAPI_BASE}?${params}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    let errorMsg = `SerpApi request failed (${res.status})`;
    try {
      const body = await res.json() as { error: string };
      if (body.error) errorMsg += `: ${body.error}`;
    } catch {
      /* ignore parse errors */
    }
    throw new Error(errorMsg);
  }

  const data = await res.json() as { error?: string; local_results?: LocalResult[] };

  if (data.error) {
    throw new Error(`SerpApi error: ${data.error}`);
  }

  return data.local_results ?? [];
}

/**
 * Find a business on Google Maps using a staged search strategy.
 *
 * Exact-name queries with the `ll` location hint are unreliable (they can
 * return 0 results for businesses that clearly exist), so we ladder through:
 *   1. name only (with ll)
 *   2. name only (nationwide, no ll)
 *   3. category keyword + "Marfa" (with ll) — the most reliable stage
 *
 * Each stage scans ALL results for an exact street-address match.
 * Returns null if no stage finds an address match.
 */
async function findPlace(
  apiKey: string,
  biz: BusinessDef,
): Promise<LocalResult | null> {
  const stages: Array<{ q: string; withLl: boolean }> = [
    { q: biz.name, withLl: true },
    { q: biz.name, withLl: false },
    { q: `${biz.search_term} Marfa`, withLl: true },
  ];

  for (const stage of stages) {
    const results = await googleMapsSearch(apiKey, stage.q, stage.withLl);
    for (const r of results) {
      if (addressesMatch(biz.address, r.address)) {
        return r;
      }
    }
  }
  return null;
}

// --------------------------------------------------------------------------
// Entry point
// --------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const apiKey = Deno.env.get("SERPAPI_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error:
          "SERPAPI_KEY not configured. Run: suggest_action with store_secret_action for SERPAPI_KEY.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const supabase = adminClient();
    const results: {
      name: string;
      status: "ok" | "not_found" | "error";
      error?: string;
    }[] = [];

    for (const biz of BUSINESSES) {
      try {
        const r = await findPlace(apiKey, biz);

        if (!r) {
          // Genuinely no Google Maps listing found — record known data only.
          const { error } = await supabase
            .schema("marfa")
            .from("businesses")
            .upsert(
              {
                place_id: `known:${biz.name.toLowerCase().replace(/\s+/g, "-")}`,
                name: biz.name,
                category: biz.category,
                display_name: biz.name,
                formatted_address: `${biz.address}, Marfa, TX 79843`,
                rating: null,
                user_rating_count: null,
                last_fetched_at: new Date().toISOString(),
              },
              { onConflict: "place_id" },
            );
          if (error) throw new Error(error.message);
          results.push({ name: biz.name, status: "not_found" });
          continue;
        }

        const gps = r.gps_coordinates;
        const thumbnail = r.thumbnail_large ?? r.thumbnail ?? null;

        const row = {
          place_id: r.place_id ?? r.data_id ?? r.lsig ?? biz.name,
          name: biz.name,
          category: biz.category,
          display_name: r.title ?? biz.name,
          formatted_address: r.address ?? null,
          national_phone_number: r.links?.phone ?? null,
          website_uri: r.links?.website ?? null,
          rating: r.rating ?? null,
          user_rating_count: r.reviews ?? null,
          price_level: mapPriceLevel(r.price),
          regular_opening_hours: r.hours
            ? { source: "serpapi", display: r.hours }
            : null,
          reviews: [],
          photo_urls: thumbnail ? [thumbnail] : [],
          lat: gps?.latitude ?? null,
          lng: gps?.longitude ?? null,
          last_fetched_at: new Date().toISOString(),
        };

        // Upsert: onConflict maps to the unique constraint on place_id.
        const { error } = await supabase
          .schema("marfa")
          .from("businesses")
          .upsert(row, { onConflict: "place_id" });

        if (error) throw new Error(error.message);
        results.push({ name: biz.name, status: "ok" });
      } catch (err) {
        results.push({
          name: biz.name,
          status: "error",
          error: String(err),
        });
      }
    }

    const allOk = results.every((r) => r.status === "ok");

    return new Response(JSON.stringify({ ok: allOk, results }), {
      status: allOk ? 200 : 207,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
