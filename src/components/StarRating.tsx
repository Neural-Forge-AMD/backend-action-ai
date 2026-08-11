import { Star } from "lucide-react";

const STAR_COUNT = 5;

function StarSlice({ percent }: { percent: number }) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <span className="relative inline-block h-4 w-4 shrink-0" aria-hidden="true">
      <Star
        className="absolute inset-0 h-4 w-4 text-amber-500/25"
        fill="currentColor"
        strokeWidth={0}
      />
      <span
        className="absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: `${pct}%` }}
      >
        <Star className="h-4 w-4 text-amber-500" fill="currentColor" strokeWidth={0} />
      </span>
    </span>
  );
}

/** Five-star display, supports fractional ratings via clipped slices. */
export default function StarRating({ rating }: { rating: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`Rated ${rating.toFixed(1)} out of 5`}
    >
      {Array.from({ length: STAR_COUNT }, (_, i) => {
        const value = Math.max(0, Math.min(1, rating - i));
        return <StarSlice key={i} percent={value * 100} />;
      })}
    </span>
  );
}
