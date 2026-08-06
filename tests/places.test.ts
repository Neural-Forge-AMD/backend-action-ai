import assert from "node:assert/strict";
import test from "node:test";

import {
  addressesMatch,
  MAX_PLACES,
  normalise,
  pickBestResult,
  validatePlaces,
} from "../supabase/functions/_shared/places.ts";

test("normalise keeps letters and collapses punctuation and whitespace", () => {
  assert.equal(normalise(" 123  Main St.,  "), "123 main st");
  assert.equal(normalise("Mississippi"), "mississippi");
});

test("addressesMatch requires the full street number and a useful name token", () => {
  assert.equal(
    addressesMatch("209 W El Paso St", "209 West El Paso Street, Marfa, TX"),
    true,
  );
  assert.equal(addressesMatch("100 Highland St", "1000 Highland St, Marfa, TX"), false);
  assert.equal(addressesMatch("100 Highland St", "100 Desert Rd, Marfa, TX"), false);
});

test("validatePlaces trims valid input and rejects malformed or oversized batches", () => {
  assert.deepEqual(validatePlaces([{ name: "  The Sentinel  ", address: " 209 W El Paso St " }]), {
    ok: true,
    places: [{ name: "The Sentinel", address: "209 W El Paso St" }],
  });
  assert.deepEqual(validatePlaces([{ name: "Test", rating: 9 }]), {
    ok: false,
    error: "places[0].rating must be a number between 0 and 5",
  });
  assert.equal(validatePlaces(Array.from({ length: MAX_PLACES + 1 }, () => ({ name: "x" }))).ok, false);
});

test("pickBestResult prioritises a known address, then a Marfa result", () => {
  const results = [
    { title: "Wrong city", address: "209 W El Paso St, Alpine, TX", rating: 3.2 },
    {
      title: "The Sentinel",
      address: "209 West El Paso Street, Marfa, TX",
      rating: 4.6,
      place_id: "abc",
    },
  ];

  assert.deepEqual(pickBestResult(results, "209 W El Paso St"), {
    name: "The Sentinel",
    address: "209 West El Paso Street, Marfa, TX",
    rating: 4.6,
    place_id: "abc",
  });
  assert.equal(pickBestResult([{ title: "Other", address: "Austin, TX" }]), null);
});
