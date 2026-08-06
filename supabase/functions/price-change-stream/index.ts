import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  isAllowedOrigin,
  jsonResponse,
  jwtRole,
} from "../_shared/http.ts";
import {
  buildPriceChangePayload,
  extractGeminiText,
  parseQueueEvent,
  recommendationPrompt,
  type PriceChangeQueueEvent,
} from "../_shared/price-change.ts";

const INITIAL_DELAY_MS = 3_000;
const POLL_INTERVAL_MS = 2_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const encoder = new TextEncoder();

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Server is missing ${name}`);
  return value;
}

async function rpc<T>(
  name: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const supabaseUrl = requiredEnvironment("SUPABASE_URL");
  const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Database RPC ${name} failed (${response.status}): ${detail}`);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function claimEvent(
  afterId: number,
  signal: AbortSignal,
): Promise<PriceChangeQueueEvent | null> {
  const rows = await rpc<unknown[]>(
    "claim_price_change_event",
    { p_after_id: afterId },
    signal,
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const event = parseQueueEvent(rows[0]);
  if (!event) throw new Error("Database returned a malformed price change event");
  return event;
}

async function generateRecommendation(
  event: PriceChangeQueueEvent,
  signal: AbortSignal,
): Promise<{ text: string; model: string }> {
  const apiKey = requiredEnvironment("GEMINI_API_KEY");
  const model = Deno.env.get("GEMINI_MODEL")?.trim() || DEFAULT_MODEL;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text:
            "You are a restaurant pricing strategist. Give one specific, commercially useful recommendation in at most two short sentences. State whether to hold, raise, lower, bundle, or reposition the item and briefly explain why. Do not repeat the input data verbatim.",
        }],
      },
      contents: [{
        role: "user",
        parts: [{ text: recommendationPrompt(event) }],
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 300,
      },
    }),
    signal,
  });

  const data = await response.json() as unknown;
  if (!response.ok) {
    throw new Error(`Gemini generateContent failed (${response.status})`);
  }
  const text = extractGeminiText(data);
  if (!text) throw new Error("Gemini returned no recommendation text");
  return { text, model };
}

function sseEvent(eventId: number, payload: unknown): Uint8Array {
  return encoder.encode(
    `id: ${eventId}\nevent: price-change\ndata: ${JSON.stringify(payload)}\n\n`,
  );
}

function lastEventId(request: Request): number {
  const parsed = Number(request.headers.get("Last-Event-ID") ?? "0");
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

Deno.serve((request: Request) => {
  const origin = request.headers.get("Origin");
  const headers = corsHeaders(origin, "GET, OPTIONS");

  if (!isAllowedOrigin(origin)) {
    return jsonResponse({ error: "Origin is not allowed" }, 403, headers);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        ...headers,
        "Allow": "GET, OPTIONS",
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }

  const role = jwtRole(request.headers.get("Authorization"));
  if (role !== "anon" && role !== "authenticated" && role !== "service_role") {
    return jsonResponse({ error: "Authentication required" }, 401, headers);
  }

  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        let afterId = lastEventId(request);
        let lastHeartbeat = Date.now();
        controller.enqueue(encoder.encode(": connected\n\n"));

        try {
          // Acceptance requirement: wait exactly three seconds before the first DB pull.
          await delay(INITIAL_DELAY_MS, request.signal);

          while (!cancelled && !request.signal.aborted) {
            try {
              const event = await claimEvent(afterId, request.signal);
              if (event?.claimed) {
                try {
                  const recommendation = await generateRecommendation(event, request.signal);
                  await rpc<void>("complete_price_change_event", {
                    p_event_id: event.id,
                    p_recommendation: recommendation.text,
                    p_ai_model: recommendation.model,
                  });
                  event.recommendation = recommendation.text;
                  event.ai_model = recommendation.model;
                } catch (error) {
                  await rpc<void>("fail_price_change_event", {
                    p_event_id: event.id,
                    p_error: String(error),
                  });
                  console.error("Price recommendation failed:", String(error));
                }
              }

              if (event?.recommendation && event.ai_model) {
                const payload = buildPriceChangePayload(
                  event,
                  event.recommendation,
                  event.ai_model,
                );
                controller.enqueue(sseEvent(event.id, payload));
                afterId = event.id;
                lastHeartbeat = Date.now();
                continue;
              }
            } catch (error) {
              if (!request.signal.aborted) {
                console.error("Price change stream poll failed:", String(error));
              }
            }

            if (Date.now() - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
              controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
              lastHeartbeat = Date.now();
            }
            await delay(POLL_INTERVAL_MS, request.signal);
          }
        } catch (error) {
          if (!request.signal.aborted && !cancelled) {
            console.error("Price change stream closed:", String(error));
          }
        } finally {
          try {
            controller.close();
          } catch {
            // The browser may already have cancelled the stream.
          }
        }
      })();
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
