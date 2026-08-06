import assert from "node:assert/strict";
import test from "node:test";

import { parseSseFrames } from "../src/lib/priceChangeStream.ts";
import {
  buildPriceChangePayload,
  extractGeminiText,
  parseQueueEvent,
  recommendationPrompt,
} from "../supabase/functions/_shared/price-change.ts";

const queueRow = {
  id: 42,
  competitor_name: "Coyote Coffee",
  item_name: "Latte",
  old_price: "4.50",
  new_price: "5.00",
  currency: "USD",
  direction: "increased",
  change_amount: "0.50",
  change_percent: "11.11",
  source_url: "https://example.com/menu",
  observed_at: "2026-08-06T12:00:00.000Z",
  recommendation: null,
  ai_model: null,
  claimed: true,
};

test("parseQueueEvent accepts PostgREST numeric strings", () => {
  const event = parseQueueEvent(queueRow);
  assert.ok(event);
  assert.equal(event.old_price, 4.5);
  assert.equal(event.new_price, 5);
  assert.equal(event.change_percent, 11.11);
  assert.equal(event.claimed, true);
});

test("recommendation prompt includes the complete detected change", () => {
  const event = parseQueueEvent(queueRow);
  assert.ok(event);
  const prompt = recommendationPrompt(event);
  assert.match(prompt, /Coyote Coffee/);
  assert.match(prompt, /Latte/);
  assert.match(prompt, /4\.50 USD/);
  assert.match(prompt, /5\.00 USD/);
  assert.match(prompt, /11\.11%/);
});

test("extractGeminiText reads generateContent candidate parts", () => {
  assert.equal(
    extractGeminiText({
      candidates: [
        { content: { parts: [{ text: "Hold price and emphasize value." }] } },
      ],
    }),
    "Hold price and emphasize value.",
  );
});

test("buildPriceChangePayload produces the frontend contract", () => {
  const event = parseQueueEvent(queueRow);
  assert.ok(event);
  const payload = buildPriceChangePayload(event, "Bundle the latte with breakfast.", "gpt-test");
  assert.deepEqual(payload, {
    type: "competitor_price_change",
    event_id: 42,
    competitor: "Coyote Coffee",
    item: "Latte",
    price: {
      previous: 4.5,
      current: 5,
      currency: "USD",
      change: 0.5,
      percent: 11.11,
      direction: "increased",
    },
    observed_at: "2026-08-06T12:00:00.000Z",
    source_url: "https://example.com/menu",
    recommendation: {
      text: "Bundle the latte with breakfast.",
      model: "gpt-test",
    },
  });
});

test("SSE parser ignores heartbeats and preserves incomplete frames", () => {
  const parsed = parseSseFrames(
    ': connected\n\nid: 42\nevent: price-change\ndata: {"event_id":42}\n\nid: 43\nevent: price',
  );
  assert.deepEqual(parsed.events, [
    { id: "42", event: "price-change", data: '{"event_id":42}' },
  ]);
  assert.equal(parsed.remainder, "id: 43\nevent: price");
});
