import { createClient } from "@supabase/supabase-js";

/** Public dashboard backed by the Supabase project "radar" (`marfa` schema). */
export const SUPABASE_URL = "https://xfbgagyjizpzqjxljcfz.supabase.co";

/**
 * Anon (publishable) key — safe to ship in client source.
 * RLS restricts it to SELECT on `marfa.businesses` only; the SSE stream and
 * enrichment function accept it as a verified project token.
 */
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmYmdhZ3lqaXpwenFqeGxqY2Z6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NDY2NjQsImV4cCI6MjEwMTMyMjY2NH0.mgitjWk4JOmsNGgjT2tVi3BWBTxhMPieq33-DZglbuo";

/** Public edge function (verify_jwt=false) that triggers a SerpApi fetch. */
export const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/marfa-fetch-places`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
