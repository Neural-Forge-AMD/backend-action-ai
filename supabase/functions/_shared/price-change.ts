export interface PriceChangeQueueEvent {
  id: number;
  competitor_name: string;
  item_name: string;
  old_price: number;
  new_price: number;
  currency: string;
  direction: "increased" | "decreased";
  change_amount: number;
  change_percent: number | null;
  source_url: string | null;
  observed_at: string;
  recommendation: string | null;
  ai_model: string | null;
  claimed: boolean;
}

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

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
    ? Number(value)
    : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function requiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseQueueEvent(value: unknown): PriceChangeQueueEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = finiteNumber(row.id);
  const oldPrice = finiteNumber(row.old_price);
  const newPrice = finiteNumber(row.new_price);
  const changeAmount = finiteNumber(row.change_amount);
  const competitor = requiredString(row.competitor_name);
  const item = requiredString(row.item_name);
  const currency = requiredString(row.currency);
  const observedAt = requiredString(row.observed_at);
  const direction = row.direction;

  if (
    id === null ||
    oldPrice === null ||
    newPrice === null ||
    changeAmount === null ||
    !competitor ||
    !item ||
    !currency ||
    !observedAt ||
    (direction !== "increased" && direction !== "decreased")
  ) {
    return null;
  }

  return {
    id,
    competitor_name: competitor,
    item_name: item,
    old_price: oldPrice,
    new_price: newPrice,
    currency,
    direction,
    change_amount: changeAmount,
    change_percent: finiteNumber(row.change_percent),
    source_url: requiredString(row.source_url),
    observed_at: observedAt,
    recommendation: requiredString(row.recommendation),
    ai_model: requiredString(row.ai_model),
    claimed: row.claimed === true,
  };
}

export function recommendationPrompt(event: PriceChangeQueueEvent): string {
  const percent = event.change_percent === null
    ? "not available"
    : `${event.change_percent.toFixed(2)}%`;
  return [
    `Competitor: ${event.competitor_name}`,
    `Item: ${event.item_name}`,
    `Old price: ${event.old_price.toFixed(2)} ${event.currency}`,
    `New price: ${event.new_price.toFixed(2)} ${event.currency}`,
    `Direction: ${event.direction}`,
    `Change: ${event.change_amount.toFixed(2)} ${event.currency} (${percent})`,
    "Recommend one concrete pricing or positioning action for our operator.",
  ].join("\n");
}

export function extractGeminiText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const response = value as Record<string, unknown>;
  if (!Array.isArray(response.candidates)) return null;

  const textParts: string[] = [];
  for (const candidate of response.candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const content = (candidate as Record<string, unknown>).content;
    if (!content || typeof content !== "object") continue;
    const parts = (content as Record<string, unknown>).parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) {
        textParts.push(text.trim());
      }
    }
  }
  const combined = textParts.filter(Boolean).join("\n").trim();
  return combined || null;
}

export function buildPriceChangePayload(
  event: PriceChangeQueueEvent,
  recommendation: string,
  model: string,
): PriceChangePayload {
  return {
    type: "competitor_price_change",
    event_id: event.id,
    competitor: event.competitor_name,
    item: event.item_name,
    price: {
      previous: event.old_price,
      current: event.new_price,
      currency: event.currency,
      change: event.change_amount,
      percent: event.change_percent,
      direction: event.direction,
    },
    observed_at: event.observed_at,
    source_url: event.source_url,
    recommendation: { text: recommendation, model },
  };
}
