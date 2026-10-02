import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CURATED_PLACES,
  HISTORICAL_EVENTS,
  clusterMapItems,
  countryPath,
  historicalEventsAtDate,
  isValidMapDate,
  mapDirectionsUrl,
  parseMapPreferences,
  projectCoordinates,
  searchMapPlaces,
} from "../src/lib/map-data";
import type { CountryShape } from "../src/lib/map-data";

test("WGS84 frame aligns country geometry, NASA image, and known-place markers", () => {
  assert.deepEqual(projectCoordinates(-180, 90), { x: 0, y: 0 });
  assert.deepEqual(projectCoordinates(180, -90), { x: 1200, y: 600 });
  assert.deepEqual(projectCoordinates(0, 0), { x: 600, y: 300 });
  const london = projectCoordinates(-0.13, 51.51);
  const sydney = projectCoordinates(151.21, -33.87);
  const newYork = projectCoordinates(-74.01, 40.71);
  assert.ok(london.x < 600 && london.y < 150);
  assert.ok(sydney.x > 1000 && sydney.y > 400);
  assert.ok(newYork.x < 400 && newYork.y < 170);
  const countries = JSON.parse(
    readFileSync(
      new URL("../public/maps/natural-earth-50m.json", import.meta.url),
      "utf8",
    ),
  ) as CountryShape[];
  assert.equal(countries.length, 242);
  for (const name of [
    "United Kingdom",
    "Australia",
    "United States of America",
    "Japan",
  ]) {
    const country = countries.find((item) => item.name === name);
    assert.ok(country, `${name} reference geometry is present`);
    const path = countryPath(country);
    assert.ok(path.startsWith("M") && path.endsWith("Z"));
    assert.ok(!path.includes("NaN") && !path.includes("Infinity"));
  }
});

test("history respects complete calendar dates and never shows an event before it began", () => {
  assert.equal(isValidMapDate("1916-02-30"), false);
  assert.equal(isValidMapDate("1916-07-01"), true);
  assert.equal(isValidMapDate("1916-7-1"), false);
  assert.equal(isValidMapDate("1000-01-01"), false);
  assert.equal(historicalEventsAtDate("invalid").length, 0);
  assert.equal(
    historicalEventsAtDate("1916-06-30").some(
      (item) => item.id === "somme-1916",
    ),
    false,
  );
  assert.equal(historicalEventsAtDate("1916-07-01")[0].id, "somme-1916");
  assert.equal(
    historicalEventsAtDate("1916-07-01").some(
      (item) => item.id === "dday-1944",
    ),
    false,
  );
  assert.ok(
    HISTORICAL_EVENTS.every(
      (event) => event.sourceUrl.startsWith("https://") && event.sourceName,
    ),
  );
});

test("saved places reject malformed locations, cap storage, and preserve only city-level precision", () => {
  const place = {
    id: "custom_place",
    title: "Home city",
    city: "Tucson",
    country: "United States",
    lat: 32.221742,
    lon: -110.926479,
    category: "want",
    note: "a".repeat(500),
  };
  const parsed = parseMapPreferences({
    style: "fake-feed",
    places: [
      place,
      { ...place },
      { ...place, id: "wrong-lat", lat: 91 },
      { ...place, id: "nan", lat: NaN },
      { ...place, id: "wrong-category", category: "friends" },
    ],
  });
  assert.equal(parsed.style, "atlas");
  assert.equal(parsed.places.length, 1);
  assert.equal(parsed.places[0].lat, 32.2);
  assert.equal(parsed.places[0].lon, -110.9);
  assert.equal(parsed.places[0].note.length, 300);
  const many = parseMapPreferences({
    places: Array.from({ length: 50 }, (_, index) => ({
      ...place,
      id: `saved-${index}`,
    })),
  });
  assert.equal(many.places.length, 20);
  assert.ok(JSON.stringify(many).length < 20000);
});

test("search uses curated or explicitly saved places and directions omit a private origin", () => {
  assert.equal(searchMapPlaces("kyoto")[0].id, "kyoto");
  assert.equal(searchMapPlaces("1916-07-01")[0].id, "somme-1916");
  assert.equal(searchMapPlaces("unverified current flights").length, 0);
  const url = new URL(mapDirectionsUrl(CURATED_PLACES[0]));
  assert.equal(url.hostname, "www.google.com");
  assert.ok(url.searchParams.get("destination"));
  assert.equal(url.searchParams.has("origin"), false);
});

test("nearby locators cluster at world scale and separate at regional scale", () => {
  const nearby = CURATED_PLACES.filter((place) =>
    ["paris", "london"].includes(place.id),
  );
  assert.equal(clusterMapItems(nearby, 1).length, 1);
  assert.equal(clusterMapItems(nearby, 1)[0].items.length, 2);
  assert.equal(clusterMapItems(nearby, 5).length, 2);
  assert.equal(
    clusterMapItems(CURATED_PLACES, 1).flatMap((group) => group.items).length,
    CURATED_PLACES.length,
  );
});
