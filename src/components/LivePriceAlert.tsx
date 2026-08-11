import { Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import type { PriceChangePayload } from "../lib/priceChangeStream";

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function LivePriceAlert({ event }: { event: PriceChangePayload }) {
  const increased = event.price.direction === "increased";

  return (
    <section
      aria-live="assertive"
      aria-atomic="true"
      className="mx-auto mt-6 w-full max-w-7xl px-4 sm:px-6"
    >
      <div className="card-enter grid gap-6 rounded-2xl border border-primary/40 bg-white p-6 shadow-md lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">
            Live competitor change
          </p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-heading text-xl font-bold leading-tight">
                {event.competitor} · {event.item}
              </h2>
              <p className="mt-1 text-xs text-foreground/60">
                Detected {new Date(event.observed_at).toLocaleString()}
              </p>
            </div>
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                increased ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {increased ? (
                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {event.price.direction}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap items-baseline gap-3">
            <span className="text-lg text-foreground/50 line-through">
              {money(event.price.previous, event.price.currency)}
            </span>
            <span aria-hidden="true" className="text-foreground/40">→</span>
            <strong className="font-heading text-3xl font-bold tracking-tight">
              {money(event.price.current, event.price.currency)}
            </strong>
            <em
              className={`text-sm font-semibold not-italic ${
                increased ? "text-red-600" : "text-emerald-600"
              }`}
            >
              {event.price.change > 0 ? "+" : ""}
              {money(event.price.change, event.price.currency)}
              {event.price.percent === null
                ? ""
                : ` (${event.price.percent > 0 ? "+" : ""}${event.price.percent.toFixed(1)}%)`}
            </em>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-muted p-5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-foreground/50">
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            AI recommendation
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            {event.recommendation.text}
          </p>
          <p className="mt-3 text-[11px] font-medium uppercase tracking-wider text-foreground/40">
            {event.recommendation.model}
          </p>
        </div>
      </div>
    </section>
  );
}
