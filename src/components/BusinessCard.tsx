import {
  Clock,
  DollarSign,
  ExternalLink,
  Globe,
  MapPin,
  MessageSquareQuote,
  Phone,
  Store,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { formatPhone, hostnameOf } from "../lib/api";
import { toNumber, type Business, type Review } from "../lib/types";
import StarRating from "./StarRating";

function InfoRow({
  icon: Icon,
  text,
  href,
  external,
}: {
  icon: LucideIcon;
  text: string;
  href?: string;
  external?: boolean;
}) {
  const body = (
    <>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 truncate">{text}</span>
      {external && (
        <ExternalLink
          className="ml-auto h-3.5 w-3.5 shrink-0 text-foreground/40"
          aria-hidden="true"
        />
      )}
    </>
  );

  const linkClasses =
    "flex min-w-0 items-start gap-2 text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    <li className="flex min-w-0 items-start gap-2">
      {href ? (
        <a
          href={href}
          className={linkClasses}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer noopener" : undefined}
        >
          {body}
        </a>
      ) : (
        <span className="flex min-w-0 items-start gap-2">{body}</span>
      )}
    </li>
  );
}

function ReviewItem({ review }: { review: Review }) {
  const author =
    typeof review.author_name === "string" ? review.author_name : "Google reviewer";
  const text = typeof review.text === "string" ? review.text : "";
  const rating = toNumber(
    typeof review.rating === "number" || typeof review.rating === "string"
      ? review.rating
      : null,
  );

  return (
    <li className="rounded-xl bg-muted p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{author}</p>
        {rating !== null && <StarRating rating={rating} />}
      </div>
      {text && <p className="mt-1 text-sm leading-relaxed text-foreground/80">{text}</p>}
    </li>
  );
}

export default function BusinessCard({
  business,
  index,
}: {
  business: Business;
  index: number;
}) {
  const [brokenPhotos, setBrokenPhotos] = useState<Set<string>>(new Set());
  const rating = toNumber(business.rating);
  const reviewCount = toNumber(business.user_rating_count);
  const isUser = business.category === "user";
  const hours = business.regular_opening_hours?.display ?? null;
  const priceLevel = toNumber(business.price_level);
  const price = priceLevel !== null ? "$".repeat(Math.max(1, Math.min(4, priceLevel))) : null;
  const reviews = (business.reviews ?? []).slice(0, 3);
  const photos = (business.photo_urls ?? []).filter((u) => !brokenPhotos.has(u));
  const primaryPhoto = photos[0];
  const extraPhotos = photos.slice(1, 5);

  const markBroken = (url: string) =>
    setBrokenPhotos((prev) => new Set(prev).add(url));

  return (
    <article
      className="card card-enter"
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
    >
      <header className="flex items-start gap-4">
        {primaryPhoto ? (
          <img
            src={primaryPhoto}
            alt={`Photo of ${business.name}`}
            loading="lazy"
            onError={() => markBroken(primaryPhoto)}
            className="h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-border"
          />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground/40 ring-1 ring-border">
            <Store className="h-7 w-7" aria-hidden="true" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-heading text-lg font-semibold leading-tight">
              {business.name}
            </h3>
            <span
              className={
                isUser ? "badge badge--user" : "badge badge--competitor"
              }
            >
              {isUser ? "You" : "Competitor"}
            </span>
          </div>

          {rating !== null ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StarRating rating={rating} />
              <span className="text-sm font-semibold">{rating.toFixed(1)}</span>
              {reviewCount !== null && (
                <span className="text-sm text-foreground/60">
                  · {reviewCount} review{reviewCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
          ) : (
            <p className="mt-1 text-sm text-foreground/60">
              No ratings yet — newly listed
            </p>
          )}
        </div>
      </header>

      <ul className="mt-4 space-y-2 text-sm">
        {business.formatted_address && (
          <InfoRow icon={MapPin} text={business.formatted_address} />
        )}
        {business.national_phone_number && (
          <InfoRow
            icon={Phone}
            text={formatPhone(business.national_phone_number)}
            href={`tel:${business.national_phone_number.replace(/[^+\d]/g, "")}`}
          />
        )}
        {business.website_uri && (
          <InfoRow
            icon={Globe}
            text={hostnameOf(business.website_uri)}
            href={business.website_uri}
            external
          />
        )}
        {hours && <InfoRow icon={Clock} text={hours} />}
        {price && <InfoRow icon={DollarSign} text={price} />}
      </ul>

      {extraPhotos.length > 0 && (
        <div className="mt-4 flex gap-2">
          {extraPhotos.map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              loading="lazy"
              onError={() => markBroken(url)}
              className="h-14 w-14 rounded-lg object-cover ring-1 ring-border"
            />
          ))}
        </div>
      )}

      <section className="mt-4 border-t border-border pt-3">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/60">
          <MessageSquareQuote className="h-3.5 w-3.5" aria-hidden="true" />
          Recent reviews
        </h4>
        {reviews.length > 0 ? (
          <ul className="mt-2 space-y-3">
            {reviews.map((review, i) => (
              <ReviewItem key={i} review={review} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-foreground/60">
            No written reviews on Google yet — come back soon or check the listing
            on Google Maps.
          </p>
        )}
      </section>
    </article>
  );
}
