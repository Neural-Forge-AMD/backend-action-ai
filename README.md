# Marfa Place Finder

A small React application backed by a Supabase Edge Function. Authenticated users can submit up to 10 place names and optional addresses. The function searches Google Maps through SerpApi, prefers an address match in Marfa, Texas, and clearly marks original input used as fallback data.

## Requirements

- Node.js 20.19+ or 22.12+
- A Supabase project with email/password authentication enabled
- A SerpApi API key
- Supabase CLI for local function development and deployment

## Local setup

1. Install the frontend dependencies:

   ```bash
   npm ci
   ```

2. Copy `.env.example` to `.env.local` and provide the project URL and public anon key:

   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
   ```

3. Copy `supabase/.env.example` to `supabase/.env.local`, add the SerpApi key, and list every browser origin allowed to invoke the function.

4. Serve the Edge Function locally:

   ```bash
   supabase functions serve marfa-fetch-places --env-file supabase/.env.local
   ```

5. Start the frontend:

   ```bash
   npm run dev
   ```

The local browser origins `http://localhost:5173` and `http://127.0.0.1:5173` are allowed automatically.

## Deploy the function

Link the Supabase project, store server-only secrets, then deploy:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set SERPAPI_KEY=YOUR_SERPAPI_KEY
supabase secrets set ALLOWED_ORIGINS=https://your-app.example.com
supabase functions deploy marfa-fetch-places
```

`supabase/config.toml` enables JWT verification. The function also requires an `authenticated` user or `service_role` token; the public anon role is rejected. Never expose `SERPAPI_KEY` in a `VITE_` environment variable.

## API shape

Authenticated `POST` request body:

```json
{
  "places": [
    {
      "name": "The Sentinel",
      "address": "209 W El Paso St, Marfa, TX"
    }
  ]
}
```

Successful response:

```json
{
  "results": [
    {
      "name": "The Sentinel",
      "address": "209 West El Paso Street, Marfa, TX",
      "rating": 4.6,
      "place_id": "example"
    }
  ]
}
```

`fallback_data` is only present and `true` when the external lookup fails or no suitable Marfa result is found.

## Checks

```bash
npm test          # address matching, validation, and result selection
npm run typecheck # frontend and Edge Function TypeScript
npm run build     # production frontend bundle
npm run check     # all checks above
```
