import L from "leaflet";
import { useEffect, useRef } from "react";
import { getCoordinates, toNumber, type Business } from "../lib/types";

const MARFA_CENTER: L.LatLngTuple = [30.3114, -104.0208];

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );
}

function pinHtml(business: Business, isUser: boolean): string {
  const letter = escapeHtml(business.name.charAt(0).toUpperCase());
  return `<div class="marfa-pin ${isUser ? "marfa-pin--user" : "marfa-pin--competitor"}"><span>${letter}</span></div>`;
}

function popupHtml(business: Business, rating: number | null): string {
  const ratingMarkup =
    rating !== null
      ? `<div class="map-popup__rating">★ ${rating.toFixed(1)}</div>`
      : "";
  const addressMarkup = business.formatted_address
    ? `<div class="map-popup__addr">${escapeHtml(business.formatted_address)}</div>`
    : "";
  return `<div class="map-popup"><span class="map-popup__name">${escapeHtml(
    business.name,
  )}</span>${ratingMarkup}${addressMarkup}</div>`;
}

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-lg bg-white/95 px-3 py-2 text-xs shadow-md ring-1 ring-border">
      <div className="flex items-center gap-2">
        <span className="marfa-dot marfa-dot--user" aria-hidden="true" /> Your business
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="marfa-dot marfa-dot--competitor" aria-hidden="true" /> Competitors
      </div>
    </div>
  );
}

/** Interactive Leaflet map centered on Marfa, TX with one marker per business. */
export default function MarfaMap({ businesses }: { businesses: Business[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  // Initialise the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: MARFA_CENTER,
      zoom: 14,
      scrollWheelZoom: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const markers = L.layerGroup().addTo(map);
    mapRef.current = map;
    markersRef.current = markers;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
  }, []);

  // Rebuild markers whenever the data changes.
  useEffect(() => {
    const map = mapRef.current;
    const markers = markersRef.current;
    if (!map || !markers) return;

    markers.clearLayers();

    const located = businesses
      .map((b) => ({ business: b, coords: getCoordinates(b) }))
      .filter(
        (x): x is { business: Business; coords: { lat: number; lng: number } } =>
          x.coords !== null,
      );

    if (located.length === 0) return;

    for (const { business, coords } of located) {
      const isUser = business.category === "user";
      const rating = toNumber(business.rating);

      const icon = L.divIcon({
        className: "marfa-pin-wrap",
        html: pinHtml(business, isUser),
        iconSize: [30, 40],
        iconAnchor: [15, 38],
        popupAnchor: [0, -36],
      });

      const marker = L.marker([coords.lat, coords.lng], {
        icon,
        title: business.name,
        keyboard: true,
        riseOnHover: true,
      }).addTo(markers);

      marker.bindPopup(popupHtml(business, rating), {
        closeButton: false,
        minWidth: 170,
      });
    }

    if (located.length === 1) {
      const c = located[0].coords;
      map.setView([c.lat, c.lng], 15);
    } else {
      map.fitBounds(
        L.latLngBounds(located.map((x) => [x.coords.lat, x.coords.lng] as L.LatLngTuple)),
        { padding: [48, 48], maxZoom: 15 },
      );
    }
  }, [businesses]);

  return (
    <section
      role="img"
      aria-label="Interactive map of Marfa, Texas showing the location of each business"
      className="card relative h-[340px] overflow-hidden p-0 lg:sticky lg:top-20 lg:h-[calc(100vh-7.5rem)]"
    >
      <div ref={containerRef} className="h-full w-full" />
      <Legend />
    </section>
  );
}
