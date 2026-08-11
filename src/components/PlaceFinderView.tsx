import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  LayoutDashboard,
  MapPin,
  Plus,
  Radio,
  Search,
  X,
} from "lucide-react";
import LivePriceAlert from "./LivePriceAlert";
import {
  connectPriceChangeStream,
  type PriceChangePayload,
  type StreamStatus,
} from "../lib/priceChangeStream";
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "../lib/supabase";

const MAX_PLACES = 10;
type BusinessRole = "user" | "competitor";

interface DraftPlace {
  id: string;
  name: string;
  address: string;
  role: BusinessRole;
}

interface PlaceResult {
  name: string;
  address: string | null;
  rating: number | null;
  place_id: string | null;
  latitude: number | null;
  longitude: number | null;
  reviews_count: number | null;
  role?: BusinessRole;
  fallback_data?: boolean;
}

const TARGET_BUSINESSES: ReadonlyArray<Omit<DraftPlace, "id">> = [
  {
    name: "Marfa Bread",
    address: "701 N Gonzales St, Marfa, TX 79843",
    role: "user",
  },
  {
    name: "Dirty Water Bagels",
    address: "108 E El Paso St, Marfa, TX 79843",
    role: "competitor",
  },
  {
    name: "Coyote Coffee",
    address: "317 W San Antonio St, Marfa, TX 79843",
    role: "competitor",
  },
  {
    name: "Mutual Friends Coffee",
    address: "110 E El Paso St, Marfa, TX 79843",
    role: "competitor",
  },
];

function newPlace(place?: Omit<DraftPlace, "id">): DraftPlace {
  return {
    id: crypto.randomUUID(),
    name: place?.name ?? "",
    address: place?.address ?? "",
    role: place?.role ?? "competitor",
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function LiveStatusPill({ status }: { status: StreamStatus }) {
  const label = status === "listening" ? "Live" : status;
  const pill =
    status === "listening"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
      : status === "reconnecting"
        ? "border-amber-300 bg-amber-50 text-amber-700"
        : "border-border bg-muted text-foreground/60";
  const dot =
    status === "listening"
      ? "live-dot--pulse bg-emerald-500"
      : status === "reconnecting"
        ? "bg-amber-500"
        : "bg-foreground/30";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${pill}`}
    >
      <i aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function RoleBadge({ role }: { role: BusinessRole }) {
  return (
    <span
      className={`badge ${
        role === "user"
          ? "badge--user"
          : "badge--competitor"
      }`}
    >
      {role === "user" ? "Your business" : "Competitor"}
    </span>
  );
}

interface PlaceFinderViewProps {
  onHome: () => void;
  onDashboard: () => void;
}

export default function PlaceFinderView({ onHome, onDashboard }: PlaceFinderViewProps) {
  const [places, setPlaces] = useState<DraftPlace[]>(() =>
    TARGET_BUSINESSES.map((place) => newPlace(place))
  );
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<StreamStatus>("connecting");
  const [liveEvent, setLiveEvent] = useState<PriceChangePayload | null>(null);

  useEffect(() => {
    return connectPriceChangeStream({
      supabaseUrl: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      accessToken: SUPABASE_ANON_KEY,
      onEvent: setLiveEvent,
      onStatus: setLiveStatus,
      onError: (error) => console.warn("Price change stream:", error.message),
    });
  }, []);

  function updatePlace(id: string, field: "name" | "address", value: string) {
    setPlaces((current) =>
      current.map((place) =>
        place.id === id ? { ...place, [field]: value } : place
      )
    );
  }

  function addPlace() {
    setPlaces((current) =>
      current.length < MAX_PLACES ? [...current, newPlace()] : current
    );
  }

  function removePlace(id: string) {
    setPlaces((current) =>
      current.length > 1 ? current.filter((place) => place.id !== id) : current
    );
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = places.map(({ name, address, role }) => ({
      name: name.trim(),
      role,
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
      const { data, error } = await supabase.functions.invoke<{ results: PlaceResult[] }>(
        "marfa-enrich-places",
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

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-[1000] border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onHome}
              title="Return to Landing Page"
              className="btn border border-border bg-white px-3 text-foreground/70 hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Home
            </button>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-heading text-sm font-bold text-on-primary shadow-sm">
              M
            </span>
            <div>
              <strong className="block font-heading text-sm font-semibold uppercase tracking-wider">
                Marfa place finder
              </strong>
              <span className="block text-[11px] text-foreground/60">
                Google Maps enrichment
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onDashboard}
              className="btn hidden border border-border bg-white text-foreground/70 hover:bg-muted sm:inline-flex"
            >
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              Business Dashboard
            </button>
            <LiveStatusPill status={liveStatus} />
          </div>
        </div>
      </header>

      {liveEvent && <LivePriceAlert event={liveEvent} />}

      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-start gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">
            New lookup
          </p>
          <h1 className="mt-1 font-heading text-3xl font-bold tracking-tight">
            Track the Marfa network.
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-foreground/60">
            Refresh live Maps metadata for the four target businesses or add up
            to {MAX_PLACES} places.
          </p>

          <form onSubmit={handleSearch} className="mt-6 space-y-4">
            <div className="space-y-4">
              {places.map((place, index) => (
                <fieldset key={place.id} className="card relative">
                  <legend className="sr-only">Place {index + 1}</legend>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-foreground/50">
                      Place {index + 1}
                    </p>
                    <RoleBadge role={place.role} />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_auto] sm:items-end">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-foreground/70">
                        Name <span className="text-foreground/40">required</span>
                      </span>
                      <input
                        value={place.name}
                        maxLength={120}
                        placeholder="e.g. The Sentinel"
                        onChange={(event) =>
                          updatePlace(place.id, "name", event.target.value)
                        }
                        required
                        className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-foreground/70">
                        Address <span className="text-foreground/40">optional</span>
                      </span>
                      <input
                        value={place.address}
                        maxLength={240}
                        placeholder="e.g. 209 W El Paso St"
                        onChange={(event) =>
                          updatePlace(place.id, "address", event.target.value)
                        }
                        className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => removePlace(place.id)}
                      disabled={places.length === 1}
                      aria-label={`Remove place ${index + 1}`}
                      className="btn border border-border bg-white text-foreground/60 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                      <span className="sm:hidden">Remove</span>
                    </button>
                  </div>
                </fieldset>
              ))}
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={addPlace}
                disabled={places.length >= MAX_PLACES}
                className="btn border border-border bg-white text-foreground/80 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add another
              </button>
              <button type="submit" disabled={searchBusy} className="btn btn-primary">
                {searchBusy ? (
                  <Search className="h-4 w-4 animate-pulse" aria-hidden="true" />
                ) : (
                  <Search className="h-4 w-4" aria-hidden="true" />
                )}
                {searchBusy ? "Searching…" : "Search places"}
              </button>
            </div>
            {searchError && (
              <p
                role="alert"
                className="rounded-lg border-l-4 border-destructive bg-red-50 px-4 py-3 text-sm text-red-900"
              >
                {searchError}
              </p>
            )}
          </form>
        </section>

        <aside aria-live="polite" className="card sticky top-24 min-h-[380px]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">
                Results
              </p>
              <h2 className="mt-0.5 font-heading text-xl font-bold">
                {results.length ? `${results.length} matched` : "Ready when you are"}
              </h2>
            </div>
            {results.length > 0 && (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">
                {results.length}
              </span>
            )}
          </div>

          {results.length === 0 ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-border text-primary">
                <MapPin className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="mt-4 max-w-[260px] text-sm leading-relaxed text-foreground/60">
                Your enriched place details will appear here. Hit "Search places"
                to resolve the Marfa network against Google Maps.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {results.map((result, index) => (
                <article
                  key={`${result.place_id ?? result.name}-${index}`}
                  className="card-enter rounded-xl border border-border bg-white p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="min-w-0 font-heading text-base font-semibold">
                      {result.name || places[index]?.name || "Unknown place"}
                    </h3>
                    <div className="flex flex-none flex-wrap justify-end gap-1.5">
                      <RoleBadge role={result.role ?? places[index]?.role ?? "competitor"} />
                      <span
                        className={`badge ${
                          result.fallback_data
                            ? "bg-muted text-foreground/60"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        {result.fallback_data ? "Original data" : "Matched"}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1.5 text-sm text-foreground/60">
                    {result.address ?? "No address available"}
                  </p>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4">
                    <div className="min-w-0">
                      <dt className="text-[11px] font-semibold uppercase tracking-wider text-foreground/50">
                        Rating
                      </dt>
                      <dd className="mt-0.5 truncate text-sm text-foreground">
                        {result.rating?.toFixed(1) ?? "—"}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[11px] font-semibold uppercase tracking-wider text-foreground/50">
                        Reviews
                      </dt>
                      <dd className="mt-0.5 truncate text-sm text-foreground">
                        {result.reviews_count?.toLocaleString() ?? "—"}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[11px] font-semibold uppercase tracking-wider text-foreground/50">
                        Coordinates
                      </dt>
                      <dd className="mt-0.5 truncate text-sm text-foreground">
                        {result.latitude !== null && result.longitude !== null
                          ? `${result.latitude.toFixed(5)}, ${result.longitude.toFixed(5)}`
                          : "—"}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[11px] font-semibold uppercase tracking-wider text-foreground/50">
                        Place ID
                      </dt>
                      <dd
                        title={result.place_id ?? undefined}
                        className="mt-0.5 truncate text-sm text-foreground"
                      >
                        {result.place_id ?? "—"}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </aside>
      </div>

      <footer className="border-t border-border py-6 text-center text-xs text-foreground/50">
        <span className="inline-flex items-center gap-1.5">
          <Radio className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          Live stream · Gemini-powered recommendations
        </span>
      </footer>
    </main>
  );
}
