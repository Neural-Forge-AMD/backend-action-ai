# Marfa Place Finder

A React application backed by Supabase Edge Functions. It supports manual Google Maps enrichment and an automated Biggie → database trigger → Gemini recommendation → SSE frontend pipeline for competitor price changes.

Price-change automation owner: [@Fidan6557](https://github.com/Fidan6557).

## Automated price-change flow

```text
Biggie scrape
  → biggie_price_history INSERT
  → Postgres trigger compares the newest and previous price
  → changed prices enter competitor_price_change_events
  → frontend opens the SSE stream as soon as the app loads
  → server waits 3 seconds, claims the event and calls Gemini once
  → final JSON is stored and pushed to every connected frontend
```

The first observation and repeated observations with the same price produce no event. SSE heartbeat comments keep the connection alive but are ignored by the frontend, so unchanged prices remain quiet.

## Requirements

- Node.js 20.19+ or 22.12+
- A Supabase project with email/password authentication enabled
- Supabase CLI
- A SerpApi API key for manual place enrichment
- A Gemini API key from Google AI Studio for price recommendations

## Target business network

The application starts with the four required Marfa businesses in client state. These records identify the lookup targets; ratings, coordinates, review counts, and place IDs are never hard-coded and come from the live Maps lookup.

| Role | Business | Address |
| --- | --- | --- |
| User business | Marfa Bread | 701 N Gonzales St, Marfa, TX 79843 |
| Competitor | Dirty Water Bagels | 108 E El Paso St, Marfa, TX 79843 |
| Competitor | Coyote Coffee | 317 W San Antonio St, Marfa, TX 79843 |
| Competitor | Mutual Friends Coffee | 110 E El Paso St, Marfa, TX 79843 |

## Local setup

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Copy `.env.example` to `.env.local` and set the frontend values:

   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
   ```

3. Copy `supabase/.env.example` to `supabase/.env.local` and set the server-only keys. Never prefix `SERPAPI_KEY`, `GEMINI_API_KEY`, or the service-role key with `VITE_`.

4. Apply the database migration:

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

5. Serve both Edge Functions locally:

   ```bash
   supabase functions serve --env-file supabase/.env.local
   ```

6. Start the frontend:

   ```bash
   npm run dev
   ```

7. Open the app and sign in or create an account. Manual Maps enrichment requires an authenticated Supabase session. If email confirmation is enabled in the project, confirm the email before signing in.

The local origins `http://localhost:5173` and `http://127.0.0.1:5173` are allowed automatically.

## Biggie database contract

Biggie must append every scrape to `public.biggie_price_history` using the Supabase service role. Required columns are `competitor_name`, `item_name`, and `price`; `currency`, `source_url`, `scraped_at`, and `raw_payload` are optional.

Example acceptance data:

```sql
-- First observation: quiet.
insert into public.biggie_price_history
  (competitor_name, item_name, price, currency)
values
  ('Coyote Coffee', 'Latte', 4.50, 'USD');

-- Same price: still quiet.
insert into public.biggie_price_history
  (competitor_name, item_name, price, currency)
values
  ('Coyote Coffee', 'Latte', 4.50, 'USD');

-- Changed price: creates exactly one queued event.
insert into public.biggie_price_history
  (competitor_name, item_name, price, currency)
values
  ('Coyote Coffee', 'Latte', 5.00, 'USD');
```

The migration is in `supabase/migrations/202608060001_price_change_events.sql`. Tables have RLS enabled and are not readable by browser roles. Queue RPC functions are restricted to `service_role`.

## SSE contract

The frontend opens this automatically with the public Supabase anon token, then reconnects with the authenticated user token after sign-in:

```text
GET /functions/v1/price-change-stream
Accept: text/event-stream
Authorization: Bearer <anon-or-authenticated-access-token>
```

The stream waits three seconds before its first database pull. It uses `Last-Event-ID` on reconnect, and one client generates each AI recommendation while all clients receive the stored result.

Example event:

```text
id: 42
event: price-change
data: {"type":"competitor_price_change","event_id":42,"competitor":"Coyote Coffee","item":"Latte","price":{"previous":4.5,"current":5,"currency":"USD","change":0.5,"percent":11.11,"direction":"increased"},"observed_at":"2026-08-06T12:00:00.000Z","source_url":null,"recommendation":{"text":"Hold your latte price and emphasize value, or test a breakfast bundle before matching the increase.","model":"gemini-3.5-flash-lite"}}
```

The frontend consumes the stream with authenticated `fetch` rather than native `EventSource`, because native `EventSource` cannot attach the Supabase authorization header.

## Deploy

Store secrets and deploy both functions:

```bash
supabase secrets set SERPAPI_KEY=YOUR_SERPAPI_KEY
supabase secrets set GEMINI_API_KEY=YOUR_GEMINI_API_KEY
supabase secrets set GEMINI_MODEL=gemini-3.5-flash-lite
supabase secrets set ALLOWED_ORIGINS=https://your-app.example.com
supabase functions deploy marfa-fetch-places
supabase functions deploy price-change-stream
```

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the Edge Function environment. `supabase/config.toml` enables gateway JWT verification. The live stream accepts a verified project anon token so the three-second judge flow starts immediately on page load; manual place enrichment still requires an authenticated user. AI enrichment is claimed and stored once per database event, so reconnects do not repeat the model call.

## Manual place-enrichment API

Authenticated request:

```json
{
  "places": [
    {
      "name": "The Sentinel",
      "address": "209 W El Paso St, Marfa, TX",
      "role": "competitor"
    }
  ]
}
```

Each live match returns `name`, `address`, `rating`, `place_id`, `latitude`, `longitude`, `reviews_count`, and the supplied `role`. `fallback_data` is present and `true` when the external lookup fails or no suitable Marfa result is found; fallback responses do not invent Maps metadata.

## Checks

```bash
npm test          # matching, queue payload, Gemini response, and SSE parsing tests
npm run typecheck # frontend and both Edge Functions
npm run build     # production frontend bundle
npm run check     # all checks above
supabase test db  # trigger behavior against local Postgres
```
