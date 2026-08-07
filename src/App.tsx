import { useEffect, useState, type FormEvent } from "react";

import {
  connectPriceChangeStream,
  type PriceChangePayload,
  type StreamStatus,
} from "./lib/priceChangeStream";
import {
  supabase,
  supabaseAnonKey,
  supabaseConfigError,
  supabaseUrl,
} from "./lib/supabase";

const MAX_PLACES = 10;

interface DraftPlace {
  id: string;
  name: string;
  address: string;
}

interface PlaceResult {
  name: string;
  address: string | null;
  rating: number | null;
  place_id: string | null;
  fallback_data?: boolean;
}

function newPlace(): DraftPlace {
  return { id: crypto.randomUUID(), name: "", address: "" };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function LivePriceAlert({
  event,
}: {
  event: PriceChangePayload;
}) {
  return (
    <section className="live-alert" aria-live="assertive">
      <div className="live-alert-summary">
        <p className="eyebrow">Live competitor change</p>
        <div className="live-alert-title">
          <div>
            <h2>{event.competitor} · {event.item}</h2>
            <p>Detected {new Date(event.observed_at).toLocaleString()}</p>
          </div>
          <span className={`direction ${event.price.direction}`}>
            {event.price.direction}
          </span>
        </div>
        <div className="price-shift">
          <span>{money(event.price.previous, event.price.currency)}</span>
          <b aria-hidden="true">→</b>
          <strong>{money(event.price.current, event.price.currency)}</strong>
          <em>
            {event.price.change > 0 ? "+" : ""}
            {money(event.price.change, event.price.currency)}
            {event.price.percent === null
              ? ""
              : ` (${event.price.percent > 0 ? "+" : ""}${event.price.percent.toFixed(1)}%)`}
          </em>
        </div>
      </div>
      <div className="recommendation-card">
        <span>AI recommendation</span>
        <p>{event.recommendation.text}</p>
        <small>{event.recommendation.model}</small>
      </div>
    </section>
  );
}

export default function App() {
  const [places, setPlaces] = useState<DraftPlace[]>(() => [newPlace()]);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<StreamStatus>("connecting");
  const [liveEvent, setLiveEvent] = useState<PriceChangePayload | null>(null);

  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey) return;
    return connectPriceChangeStream({
      supabaseUrl,
      anonKey: supabaseAnonKey,
      accessToken: supabaseAnonKey,
      onEvent: setLiveEvent,
      onStatus: setLiveStatus,
      onError: (error) => console.warn("Price change stream:", error.message),
    });
  }, []);

  function updatePlace(id: string, field: "name" | "address", value: string) {
    setPlaces((current) =>
      current.map((place) => place.id === id ? { ...place, [field]: value } : place)
    );
  }

  function addPlace() {
    setPlaces((current) => current.length < MAX_PLACES ? [...current, newPlace()] : current);
  }

  function removePlace(id: string) {
    setPlaces((current) => current.length > 1
      ? current.filter((place) => place.id !== id)
      : current
    );
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = supabase;
    if (!client) return;

    const payload = places.map(({ name, address }) => ({
      name: name.trim(),
      ...(address.trim() ? { address: address.trim() } : {}),
    }));
    if (payload.some((place) => !place.name)) {
      setSearchError("Every row needs a place name.");
      return;
    }

    setSearchBusy(true);
    setSearchError(null);
    setResults([]);
    try {
      const { data, error } = await client.functions.invoke<{ results: PlaceResult[] }>(
        "marfa-fetch-places",
        { body: { places: payload } },
      );
      if (error) {
        let message = error.message;
        const context = (error as { context?: Response }).context;
        if (context) {
          try {
            const body = await context.clone().json() as { error?: string };
            message = body.error ?? message;
          } catch {
            // Keep the SDK error when the response is not JSON.
          }
        }
        throw new Error(message);
      }
      if (!data || !Array.isArray(data.results)) {
        throw new Error("The function returned an unexpected response.");
      }
      setResults(data.results);
    } catch (error) {
      setSearchError(errorMessage(error));
    } finally {
      setSearchBusy(false);
    }
  }

  if (supabaseConfigError) {
    return (
      <main className="app-shell">
        <section className="setup-card">
          <p className="eyebrow">Setup required</p>
          <h1>Connect your Supabase project</h1>
          <p>{supabaseConfigError}</p>
          <code>Copy .env.example to .env.local</code>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="brand-mark">M</p>
          <div>
            <strong>Marfa place finder</strong>
            <span>Google Maps enrichment</span>
          </div>
        </div>
        <div className="account">
          <span className={`live-status ${liveStatus}`}>
            <i aria-hidden="true" />
            {liveStatus === "listening" ? "Live" : liveStatus}
          </span>
        </div>
      </header>

      {liveEvent && <LivePriceAlert event={liveEvent} />}

      <div className="dashboard-grid">
        <section className="search-panel">
          <p className="eyebrow">New lookup</p>
          <h1>Find the right Marfa locations.</h1>
          <p className="section-copy">
            Add up to {MAX_PLACES} names. Known addresses make matching more accurate.
          </p>

          <form onSubmit={handleSearch} className="places-form">
            <div className="place-list">
              {places.map((place, index) => (
                <fieldset className="place-row" key={place.id}>
                  <legend>Place {index + 1}</legend>
                  <label>
                    Name <span>required</span>
                    <input
                      value={place.name}
                      maxLength={120}
                      placeholder="e.g. The Sentinel"
                      onChange={(event) => updatePlace(place.id, "name", event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Address <span>optional</span>
                    <input
                      value={place.address}
                      maxLength={240}
                      placeholder="e.g. 209 W El Paso St"
                      onChange={(event) => updatePlace(place.id, "address", event.target.value)}
                    />
                  </label>
                  <button
                    className="remove-button"
                    type="button"
                    onClick={() => removePlace(place.id)}
                    disabled={places.length === 1}
                    aria-label={`Remove place ${index + 1}`}
                  >
                    Remove
                  </button>
                </fieldset>
              ))}
            </div>

            <div className="form-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={addPlace}
                disabled={places.length >= MAX_PLACES}
              >
                + Add another
              </button>
              <button className="primary-button" type="submit" disabled={searchBusy}>
                {searchBusy ? "Searching…" : "Search places"}
              </button>
            </div>
            {searchError && <p className="error-message" role="alert">{searchError}</p>}
          </form>
        </section>

        <aside className="results-panel" aria-live="polite">
          <div className="results-heading">
            <div>
              <p className="eyebrow">Results</p>
              <h2>{results.length ? `${results.length} matched` : "Ready when you are"}</h2>
            </div>
            {results.length > 0 && <span className="result-count">{results.length}</span>}
          </div>

          {results.length === 0 ? (
            <div className="empty-state">
              <div className="map-pin" aria-hidden="true">⌖</div>
              <p>Your enriched place details will appear here.</p>
            </div>
          ) : (
            <div className="result-list">
              {results.map((result, index) => (
                <article className="result-card" key={`${result.place_id ?? result.name}-${index}`}>
                  <div className="result-title">
                    <h3>{result.name || places[index]?.name || "Unknown place"}</h3>
                    {result.fallback_data
                      ? <span className="badge fallback">Original data</span>
                      : <span className="badge matched">Matched</span>}
                  </div>
                  <p>{result.address ?? "No address available"}</p>
                  <dl>
                    <div><dt>Rating</dt><dd>{result.rating?.toFixed(1) ?? "—"}</dd></div>
                    <div><dt>Place ID</dt><dd title={result.place_id ?? undefined}>{result.place_id ?? "—"}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
