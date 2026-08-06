export type StreamStatus = "connecting" | "listening" | "reconnecting";

export interface PriceChangePayload {
  type: "competitor_price_change";
  event_id: number;
  competitor: string;
  item: string;
  price: {
    previous: number;
    current: number;
    currency: string;
    change: number;
    percent: number | null;
    direction: "increased" | "decreased";
  };
  observed_at: string;
  source_url: string | null;
  recommendation: {
    text: string;
    model: string;
  };
}

export interface ParsedSseEvent {
  id: string | null;
  event: string;
  data: string;
}

interface StreamOptions {
  supabaseUrl: string;
  anonKey: string;
  accessToken: string;
  onEvent(payload: PriceChangePayload): void;
  onStatus(status: StreamStatus): void;
  onError(error: Error): void;
}

const LAST_EVENT_STORAGE_KEY = "marfa-price-change-last-event-id";

export function parseSseFrames(input: string): {
  events: ParsedSseEvent[];
  remainder: string;
} {
  const normalized = input.replace(/\r\n/g, "\n");
  const frames = normalized.split("\n\n");
  const remainder = frames.pop() ?? "";
  const events: ParsedSseEvent[] = [];

  for (const frame of frames) {
    let id: string | null = null;
    let event = "message";
    const data: string[] = [];

    for (const line of frame.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const separator = line.indexOf(":");
      const field = separator === -1 ? line : line.slice(0, separator);
      const value = separator === -1
        ? ""
        : line.slice(separator + 1).replace(/^ /, "");
      if (field === "id") id = value;
      if (field === "event") event = value;
      if (field === "data") data.push(value);
    }

    if (data.length > 0) events.push({ id, event, data: data.join("\n") });
  }

  return { events, remainder };
}

function isPriceChangePayload(value: unknown): value is PriceChangePayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<PriceChangePayload>;
  const price = payload.price as Partial<PriceChangePayload["price"]> | undefined;
  const recommendation = payload.recommendation as
    | Partial<PriceChangePayload["recommendation"]>
    | undefined;
  return payload.type === "competitor_price_change" &&
    typeof payload.event_id === "number" &&
    typeof payload.competitor === "string" &&
    typeof payload.item === "string" &&
    typeof payload.observed_at === "string" &&
    typeof price?.previous === "number" &&
    typeof price.current === "number" &&
    typeof price.currency === "string" &&
    typeof price.change === "number" &&
    (price.percent === null || typeof price.percent === "number") &&
    (price.direction === "increased" || price.direction === "decreased") &&
    typeof recommendation?.text === "string" &&
    typeof recommendation.model === "string";
}

function savedEventId(): number {
  try {
    const parsed = Number(localStorage.getItem(LAST_EVENT_STORAGE_KEY) ?? "0");
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function rememberEventId(id: number) {
  try {
    localStorage.setItem(LAST_EVENT_STORAGE_KEY, String(id));
  } catch {
    // Streaming still works when storage is blocked.
  }
}

function reconnectDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function connectPriceChangeStream(options: StreamOptions): () => void {
  let stopped = false;
  let activeController: AbortController | null = null;
  let lastEventId = savedEventId();

  void (async () => {
    while (!stopped) {
      options.onStatus(lastEventId > 0 ? "reconnecting" : "connecting");
      activeController = new AbortController();

      try {
        const headers: Record<string, string> = {
          "Accept": "text/event-stream",
          "apikey": options.anonKey,
          "Authorization": `Bearer ${options.accessToken}`,
        };
        if (lastEventId > 0) headers["Last-Event-ID"] = String(lastEventId);

        const response = await fetch(
          `${options.supabaseUrl}/functions/v1/price-change-stream`,
          { headers, signal: activeController.signal },
        );
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(`Live stream failed (${response.status}): ${detail.slice(0, 200)}`);
        }
        if (!response.body) throw new Error("Live stream returned no response body");

        options.onStatus("listening");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!stopped) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parsed = parseSseFrames(buffer);
          buffer = parsed.remainder;

          for (const event of parsed.events) {
            if (event.event !== "price-change") continue;
            const payload = JSON.parse(event.data) as unknown;
            if (!isPriceChangePayload(payload)) continue;
            lastEventId = payload.event_id;
            rememberEventId(lastEventId);
            options.onEvent(payload);
          }
        }

        if (!stopped) throw new Error("Live stream disconnected");
      } catch (error) {
        if (stopped || activeController.signal.aborted) break;
        options.onError(error instanceof Error ? error : new Error(String(error)));
        options.onStatus("reconnecting");
        await reconnectDelay(2_000);
      }
    }
  })();

  return () => {
    stopped = true;
    activeController?.abort();
  };
}
