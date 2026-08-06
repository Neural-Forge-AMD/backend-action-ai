export const MAX_PLACES = 10;
export const MAX_NAME_LENGTH = 120;
export const MAX_ADDRESS_LENGTH = 240;

export interface PlaceInput {
  name: string;
  address?: string;
  rating?: number | null;
  place_id?: string;
}

export interface PlaceResult {
  name: string;
  address: string | null;
  rating: number | null;
  place_id: string | null;
  /** True when the external lookup failed or no Marfa result matched. */
  fallback_data?: boolean;
}

type ValidationResult =
  | { ok: true; places: PlaceInput[] }
  | { ok: false; error: string };

const GENERIC_ADDRESS_TOKENS = new Set([
  "street",
  "st",
  "road",
  "rd",
  "avenue",
  "ave",
  "drive",
  "dr",
  "lane",
  "ln",
  "highway",
  "hwy",
  "north",
  "south",
  "east",
  "west",
]);

export function normalise(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[,.#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Check for the same street number and at least one useful street-name token. */
export function addressesMatch(
  target: string | undefined,
  result: string | null | undefined,
): boolean {
  if (!target || !result) return false;

  const targetAddress = normalise(target);
  const resultAddress = normalise(result);
  if (!targetAddress || !resultAddress) return false;

  const targetTokens = targetAddress.split(" ");
  const resultTokens = new Set(resultAddress.split(" "));
  const streetNumber = targetTokens[0];

  if (/^\d+[a-z]?$/.test(streetNumber)) {
    if (!resultTokens.has(streetNumber)) return false;

    const usefulTokens = targetTokens.slice(1).filter((token) =>
      token.length >= 3 && !GENERIC_ADDRESS_TOKENS.has(token)
    );
    return usefulTokens.some((token) => resultTokens.has(token));
  }

  return targetAddress.length >= 4 &&
    (resultAddress.includes(targetAddress) || targetAddress.includes(resultAddress));
}

function optionalString(
  value: unknown,
  field: string,
  index: number,
  maxLength: number,
): { ok: true; value?: string } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true };
  }
  if (typeof value !== "string") {
    return { ok: false, error: `places[${index}].${field} must be a string` };
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return {
      ok: false,
      error: `places[${index}].${field} must be at most ${maxLength} characters`,
    };
  }
  return trimmed ? { ok: true, value: trimmed } : { ok: true };
}

export function validatePlaces(value: unknown): ValidationResult {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: "Provide at least one place" };
  }
  if (value.length > MAX_PLACES) {
    return { ok: false, error: `Provide no more than ${MAX_PLACES} places` };
  }

  const places: PlaceInput[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: `places[${index}] must be an object` };
    }

    const candidate = item as Record<string, unknown>;
    if (typeof candidate.name !== "string" || !candidate.name.trim()) {
      return { ok: false, error: `places[${index}].name is required` };
    }

    const name = candidate.name.trim();
    if (name.length > MAX_NAME_LENGTH) {
      return {
        ok: false,
        error: `places[${index}].name must be at most ${MAX_NAME_LENGTH} characters`,
      };
    }

    const address = optionalString(
      candidate.address,
      "address",
      index,
      MAX_ADDRESS_LENGTH,
    );
    if (!address.ok) return address;

    const placeId = optionalString(candidate.place_id, "place_id", index, 256);
    if (!placeId.ok) return placeId;

    const rating = candidate.rating;
    if (
      rating !== undefined &&
      rating !== null &&
      (typeof rating !== "number" || !Number.isFinite(rating) || rating < 0 || rating > 5)
    ) {
      return {
        ok: false,
        error: `places[${index}].rating must be a number between 0 and 5`,
      };
    }

    places.push({
      name,
      ...(address.value ? { address: address.value } : {}),
      ...(rating === undefined ? {} : { rating: rating as number | null }),
      ...(placeId.value ? { place_id: placeId.value } : {}),
    });
  }

  return { ok: true, places };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function ratingValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resultFromRecord(record: Record<string, unknown>): PlaceResult {
  return {
    name: stringValue(record.title) ?? "",
    address: stringValue(record.address),
    rating: ratingValue(record.rating),
    place_id: stringValue(record.place_id),
  };
}

function isMarfaResult(result: Record<string, unknown>): boolean {
  const address = stringValue(result.address) ?? "";
  return /\bMarfa,\s*(TX|Texas)\b/i.test(address);
}

export function pickBestResult(
  results: Array<Record<string, unknown>>,
  knownAddress?: string,
): PlaceResult | null {
  if (knownAddress) {
    const addressMatch = results.find((result) =>
      isMarfaResult(result) &&
      addressesMatch(knownAddress, stringValue(result.address))
    );
    if (addressMatch) return resultFromRecord(addressMatch);
  }

  const marfaResult = results.find(isMarfaResult);

  return marfaResult ? resultFromRecord(marfaResult) : null;
}
