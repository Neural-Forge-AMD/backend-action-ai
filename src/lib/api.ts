import { supabase, EDGE_FUNCTION_URL } from "./supabase";
import type { Business, FetchResult } from "./types";

/** Load cached business data from `marfa.businesses` (anon SELECT, RLS). */
export async function fetchBusinesses(): Promise<Business[]> {
  const { data, error } = await supabase
    .schema("marfa")
    .from("businesses")
    .select("*");

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Business[];

  // Own business first, then competitors alphabetically.
  return rows.sort((a, b) => {
    if (a.category !== b.category) return a.category === "user" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Trigger a fresh pull from Google Maps via the edge function.
 * Returns the per-business status list (ok / not_found / error).
 */
export async function refreshFromEdgeFunction(): Promise<FetchResult[]> {
  const res = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  let body: { ok?: boolean; results?: FetchResult[]; error?: string };
  try {
    body = await res.json();
  } catch {
    throw new Error(`The data service responded with status ${res.status}.`);
  }

  if (body.error) throw new Error(body.error);
  return body.results ?? [];
}

/** "2 min ago" style relative timestamp. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** Format a US phone number for display; falls back to raw input. */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

/** Hostname of a URL, without "www." — for display in links. */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
