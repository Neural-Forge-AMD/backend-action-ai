import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  MapPin,
  Radio,
  RefreshCw,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect } from "react";
import BusinessCard from "./BusinessCard";
import { timeAgo } from "../lib/api";
import { useBusinesses, type Notice } from "../hooks/useBusinesses";

// Leaflet is ~150 kB — load it lazily so first paint stays fast.
const MarfaMap = lazy(() => import("./MarfaMap"));

function NoticeBanner({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [notice, onDismiss]);

  const toneStyles: Record<Notice["tone"], string> = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    error: "border-red-200 bg-red-50 text-red-900",
    info: "border-blue-200 bg-blue-50 text-blue-900",
  };

  return (
    <div
      role={notice.tone === "error" ? "alert" : "status"}
      className={`mt-4 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm shadow-sm ${toneStyles[notice.tone]}`}
    >
      <p>{notice.text}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss message"
        className="shrink-0 rounded-md p-1 transition-colors duration-150 hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="skeleton h-[340px] rounded-2xl lg:h-[calc(100vh-7.5rem)]" />
      <div className="space-y-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card">
            <div className="flex gap-4">
              <div className="skeleton h-16 w-16 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-5 w-2/5" />
                <div className="skeleton h-4 w-1/3" />
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <div className="skeleton h-4 w-4/5" />
              <div className="skeleton h-4 w-3/5" />
              <div className="skeleton h-4 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-destructive">
        <AlertTriangle className="h-7 w-7" aria-hidden="true" />
      </span>
      <h2 className="mt-4 font-heading text-xl font-semibold">
        We couldn't load the dashboard
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-foreground/60">
        Something went wrong reaching the data service. Give it a moment and try
        again — no need to change anything.
      </p>
      <button type="button" onClick={onRetry} className="btn btn-primary mt-6">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Try again
      </button>
    </div>
  );
}

function EmptyState({
  onRefresh,
  refreshing,
}: {
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-primary">
        <MapPin className="h-7 w-7" aria-hidden="true" />
      </span>
      <h2 className="mt-4 font-heading text-xl font-semibold">
        No data here yet
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-foreground/60">
        The dashboard starts empty on its very first visit. Hit refresh and we'll
        pull the latest business info from Google Maps.
      </p>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="btn btn-primary mt-6"
      >
        {refreshing ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        )}
        {refreshing ? "Fetching…" : "Refresh Data"}
      </button>
    </div>
  );
}

interface DashboardViewProps {
  onHome: () => void;
  onFinder: () => void;
}

export default function DashboardView({ onHome, onFinder }: DashboardViewProps) {
  const {
    businesses,
    status,
    refreshing,
    lastUpdated,
    notice,
    doRefresh,
    retry,
    clearNotice,
  } = useBusinesses();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-[1000] border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onHome}
              title="Return to Landing Page"
              className="btn border border-border bg-white px-3 text-foreground/70 hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Home
            </button>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary shadow-sm">
              <MapPin className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h1 className="font-heading text-lg font-bold leading-tight sm:text-xl">
                Marfa <span className="text-primary">Local Business</span> Dashboard
              </h1>
              <p className="hidden text-xs text-foreground/60 sm:block">
                Your bakery vs. the competition · live from Google Maps
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onFinder}
              className="btn hidden border border-border bg-white text-foreground/70 hover:bg-muted md:inline-flex"
            >
              <Radio className="h-4 w-4" aria-hidden="true" />
              Place Finder
            </button>
            <p className="hidden text-xs text-foreground/60 md:block">
              Updated <time dateTime={lastUpdated ?? undefined}>{timeAgo(lastUpdated)}</time>
            </p>
            <button
              type="button"
              onClick={doRefresh}
              disabled={refreshing}
              className="btn btn-primary"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              {refreshing ? "Refreshing…" : "Refresh Data"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-12 sm:px-6">
        {notice && <NoticeBanner notice={notice} onDismiss={clearNotice} />}

        {status === "loading" && <LoadingState />}

        {status === "error" && <ErrorState onRetry={retry} />}

        {status === "ready" &&
          (businesses && businesses.length > 0 ? (
            <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <Suspense
                fallback={
                  <div className="skeleton h-[340px] rounded-2xl lg:h-[calc(100vh-7.5rem)]" />
                }
              >
                <MarfaMap businesses={businesses} />
              </Suspense>
              <div className="space-y-5">
                {businesses.map((business, i) => (
                  <BusinessCard key={business.place_id || business.id} business={business} index={i} />
                ))}
              </div>
            </div>
          ) : (
            <EmptyState onRefresh={doRefresh} refreshing={refreshing} />
          ))}
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-foreground/50">
        Data provided by Google Maps via SerpApi · Marfa, Texas ·{" "}
        {businesses?.length ?? 0} businesses tracked
      </footer>
    </div>
  );
}
