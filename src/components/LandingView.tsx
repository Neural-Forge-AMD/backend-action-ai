import { MapPin, Radio, Sparkles } from "lucide-react";

interface LandingViewProps {
  onExplore: () => void;
  onDashboard: () => void;
}

const FEATURES = [
  {
    icon: MapPin,
    title: "Location Enrichment",
    copy: "Batch query and resolve place names with high-confidence Google Maps metadata & ratings.",
  },
  {
    icon: Radio,
    title: "Live Competitor Stream",
    copy: "Real-time event stream monitoring competitor price movements live with zero latency.",
  },
  {
    icon: Sparkles,
    title: "AI Recommendations",
    copy: "Instant Gemini AI pricing strategy suggestions attached to every live market shift.",
  },
];

export default function LandingView({ onExplore, onDashboard }: LandingViewProps) {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-[1000] border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-heading text-sm font-bold text-on-primary shadow-sm">
              M
            </span>
            <strong className="font-heading text-sm font-semibold uppercase tracking-wider">
              Marfa AI Platform
            </strong>
          </div>
          <button
            type="button"
            onClick={onDashboard}
            className="btn border border-border bg-white text-foreground/80 hover:bg-muted"
          >
            Business Dashboard
          </button>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 pt-16 pb-10 text-center sm:px-6 sm:pt-24">
        <span className="rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-primary">
          Demo Version · Judge Preview
        </span>
        <h1 className="mt-5 font-heading text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Real-Time Location Enrichment &amp; Competitor Intelligence
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-foreground/60">
          Welcome judges! Experience our end-to-end platform for Google Maps place
          resolution, live competitor price streaming, and AI-driven pricing
          recommendations.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={onExplore} className="btn btn-primary px-6 py-3 text-base">
            Explore Demo →
          </button>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 px-4 pb-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <article key={feature.title} className="card card-enter">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <feature.icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="mt-4 font-heading text-lg font-semibold">{feature.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/60">{feature.copy}</p>
          </article>
        ))}
      </section>

      <footer className="mt-auto border-t border-border py-6 text-center text-xs text-foreground/50">
        Marfa AI Platform · Built for Hackathon Demo
      </footer>
    </main>
  );
}
