const LOCAL_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function configuredOrigins(): Set<string> {
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set([...LOCAL_ORIGINS, ...configured]);
}

export function isAllowedOrigin(origin: string | null): boolean {
  return !origin || configuredOrigins().has(origin);
}

export function corsHeaders(
  origin: string | null,
  methods: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, last-event-id",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (origin && configuredOrigins().has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export function jwtRole(authorization: string | null): string | null {
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

export function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
