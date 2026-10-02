/** Local cartography and explicitly curated, source-linked places. No live location feeds. */
export const MAP_WIDTH = 1200;
export const MAP_HEIGHT = 600;
export type MapStyle = "atlas" | "satellite" | "terrain" | "dark" | "light";
export type PlaceCategory = "place" | "favorite" | "want";
export type SavedMapPlace = {
  id: string;
  title: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  category: PlaceCategory;
  note: string;
};
export type CuratedPlace = Omit<SavedMapPlace, "category" | "note"> & {
  description: string;
  sourceUrl: string;
  terrain: "city" | "coast" | "mountain" | "island";
  colors: [string, string, string];
};
export type HistoricalEvent = {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  description: string;
  sourceUrl: string;
  sourceName: string;
  kind: "battle" | "discovery" | "milestone";
};
export type MapPreferences = {
  version: 1;
  style: MapStyle;
  mode: "modern" | "history";
  date: string;
  layers: {
    places: boolean;
    favorites: boolean;
    want: boolean;
    history: boolean;
    labels: boolean;
    borders: boolean;
  };
  places: SavedMapPlace[];
};
export type CountryShape = {
  name: string;
  code: string;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
};
export const DEFAULT_MAP_PREFERENCES: MapPreferences = {
  version: 1,
  style: "atlas",
  mode: "modern",
  date: "1916-07-01",
  layers: {
    places: true,
    favorites: true,
    want: true,
    history: true,
    labels: true,
    borders: true,
  },
  places: [],
};

export const CURATED_PLACES: CuratedPlace[] = [
  {
    id: "athens",
    title: "Athens",
    city: "Athens",
    country: "Greece",
    lat: 37.98,
    lon: 23.73,
    description:
      "Ancient landmarks and a living city, from the Acropolis to the streets of Plaka.",
    sourceUrl: "https://whc.unesco.org/en/list/404/",
    terrain: "city",
    colors: ["#b7d5d9", "#c0ad91", "#667d68"],
  },
  {
    id: "kyoto",
    title: "Kyoto",
    city: "Kyoto",
    country: "Japan",
    lat: 35.01,
    lon: 135.77,
    description:
      "Temples, gardens, and historic neighborhoods at the foot of forested mountains.",
    sourceUrl: "https://whc.unesco.org/en/list/688/",
    terrain: "mountain",
    colors: ["#e3b8b8", "#5b6756", "#a87768"],
  },
  {
    id: "cape-town",
    title: "Cape Town",
    city: "Cape Town",
    country: "South Africa",
    lat: -33.92,
    lon: 18.42,
    description:
      "An Atlantic coast city beneath Table Mountain, beside the Cape Floral Region.",
    sourceUrl: "https://whc.unesco.org/en/list/1007/",
    terrain: "coast",
    colors: ["#add6dc", "#777869", "#497c76"],
  },
  {
    id: "new-york",
    title: "New York",
    city: "New York",
    country: "United States",
    lat: 40.71,
    lon: -74.01,
    description:
      "A city of neighborhoods, museums, and an unmistakable harbor skyline.",
    sourceUrl: "https://www.nyc.gov/",
    terrain: "city",
    colors: ["#b4d0dc", "#71818a", "#778b73"],
  },
  {
    id: "reykjavik",
    title: "Reykjavík",
    city: "Reykjavík",
    country: "Iceland",
    lat: 64.15,
    lon: -21.94,
    description:
      "Colorful streets, ocean views, and a starting point for Iceland’s volcanic landscapes.",
    sourceUrl: "https://reykjavik.is/en",
    terrain: "mountain",
    colors: ["#b8cbd6", "#727785", "#90a9a3"],
  },
  {
    id: "bali",
    title: "Bali",
    city: "Denpasar",
    country: "Indonesia",
    lat: -8.65,
    lon: 115.22,
    description:
      "An island of tropical coastlines and the UNESCO-listed subak landscape.",
    sourceUrl: "https://whc.unesco.org/en/list/1194/",
    terrain: "island",
    colors: ["#b1dcd6", "#527b61", "#a3ba84"],
  },
  {
    id: "paris",
    title: "Paris",
    city: "Paris",
    country: "France",
    lat: 48.86,
    lon: 2.35,
    description:
      "Walk the Seine, discover neighborhood cafés, and explore the city’s museums.",
    sourceUrl: "https://whc.unesco.org/en/list/600/",
    terrain: "city",
    colors: ["#c3ceda", "#b7a798", "#788475"],
  },
  {
    id: "cairo",
    title: "Cairo",
    city: "Cairo",
    country: "Egypt",
    lat: 30.04,
    lon: 31.24,
    description:
      "A Nile metropolis with a historic urban center and the pyramids nearby at Giza.",
    sourceUrl: "https://whc.unesco.org/en/list/89/",
    terrain: "city",
    colors: ["#d7c8ab", "#b99565", "#ac8353"],
  },
  {
    id: "london",
    title: "London",
    city: "London",
    country: "United Kingdom",
    lat: 51.51,
    lon: -0.13,
    description:
      "Explore riverside walks and a layered city of history, art, and public parks.",
    sourceUrl: "https://www.london.gov.uk/",
    terrain: "city",
    colors: ["#c9d5dc", "#8a9296", "#6f8b71"],
  },
  {
    id: "singapore",
    title: "Singapore",
    city: "Singapore",
    country: "Singapore",
    lat: 1.29,
    lon: 103.85,
    description:
      "A garden city with a maritime heritage and UNESCO-listed botanical gardens.",
    sourceUrl: "https://whc.unesco.org/en/list/1483/",
    terrain: "island",
    colors: ["#b0d7dd", "#6d8e85", "#5e7961"],
  },
  {
    id: "tucson",
    title: "Tucson",
    city: "Tucson",
    country: "United States",
    lat: 32.22,
    lon: -110.97,
    description:
      "Desert trails, mountain horizons, and the Sonoran landscape of southern Arizona.",
    sourceUrl: "https://www.nps.gov/sagu/index.htm",
    terrain: "mountain",
    colors: ["#edc6aa", "#aa8273", "#71816e"],
  },
  {
    id: "sydney",
    title: "Sydney",
    city: "Sydney",
    country: "Australia",
    lat: -33.87,
    lon: 151.21,
    description:
      "A harbor city with coastal walks and the UNESCO-listed Sydney Opera House.",
    sourceUrl: "https://whc.unesco.org/en/list/166/",
    terrain: "coast",
    colors: ["#aed1e0", "#758e9b", "#5596a0"],
  },
  {
    id: "mexico-city",
    title: "Mexico City",
    city: "Mexico City",
    country: "Mexico",
    lat: 19.43,
    lon: -99.13,
    description:
      "Museums and markets within a city shaped by centuries of urban history.",
    sourceUrl: "https://whc.unesco.org/en/list/412/",
    terrain: "city",
    colors: ["#c8c1d3", "#aaa090", "#719473"],
  },
  {
    id: "buenos-aires",
    title: "Buenos Aires",
    city: "Buenos Aires",
    country: "Argentina",
    lat: -34.6,
    lon: -58.38,
    description:
      "Tree-lined streets, architecture, and a rich cultural life beside the Río de la Plata.",
    sourceUrl: "https://turismo.buenosaires.gob.ar/en",
    terrain: "city",
    colors: ["#bfd4e0", "#a4b0b4", "#699b84"],
  },
  {
    id: "nairobi",
    title: "Nairobi",
    city: "Nairobi",
    country: "Kenya",
    lat: -1.29,
    lon: 36.82,
    description:
      "Kenya’s capital is a base for urban culture and nearby national park landscapes.",
    sourceUrl: "https://www.kws.go.ke/nairobi-national-park",
    terrain: "mountain",
    colors: ["#b7d5da", "#83946c", "#8fa76d"],
  },
];

export const HISTORICAL_EVENTS: HistoricalEvent[] = [
  {
    id: "somme-1916",
    title: "First day of the Battle of the Somme",
    date: "1916-07-01",
    endDate: "1916-11-18",
    city: "Somme",
    country: "France",
    lat: 50.01,
    lon: 2.69,
    kind: "battle",
    description:
      "The British and French offensive began on the Western Front. The British Army suffered approximately 57,000 casualties on the first day, including more than 19,000 killed.",
    sourceUrl:
      "https://www.iwm.org.uk/history/what-happened-on-the-first-day-of-the-battle-of-the-somme",
    sourceName: "Imperial War Museums",
  },
  {
    id: "jutland-1916",
    title: "Battle of Jutland",
    date: "1916-05-31",
    endDate: "1916-06-01",
    city: "North Sea",
    country: "Denmark",
    lat: 56.7,
    lon: 5.9,
    kind: "battle",
    description:
      "British and German fleets fought the largest naval battle of the First World War in the North Sea.",
    sourceUrl: "https://www.iwm.org.uk/history/what-was-the-battle-of-jutland",
    sourceName: "Imperial War Museums",
  },
  {
    id: "verdun-1916",
    title: "Battle of Verdun",
    date: "1916-02-21",
    endDate: "1916-12-18",
    city: "Verdun",
    country: "France",
    lat: 49.16,
    lon: 5.38,
    kind: "battle",
    description:
      "A prolonged battle between French and German armies on the Western Front became a defining episode of the First World War.",
    sourceUrl: "https://www.iwm.org.uk/history/what-was-the-battle-of-verdun",
    sourceName: "Imperial War Museums",
  },
  {
    id: "armistice-1918",
    title: "Armistice on the Western Front",
    date: "1918-11-11",
    city: "Compiègne",
    country: "France",
    lat: 49.42,
    lon: 2.83,
    kind: "milestone",
    description:
      "The armistice between the Allies and Germany took effect at 11 a.m., ending fighting on the Western Front.",
    sourceUrl: "https://www.iwm.org.uk/history/the-11-november-armistice",
    sourceName: "Imperial War Museums",
  },
  {
    id: "dday-1944",
    title: "The Normandy landings",
    date: "1944-06-06",
    city: "Normandy",
    country: "France",
    lat: 49.37,
    lon: -0.87,
    kind: "battle",
    description:
      "Allied forces landed on the coast of Normandy, beginning the liberation of Western Europe from Nazi occupation.",
    sourceUrl:
      "https://www.iwm.org.uk/history/the-10-things-you-need-to-know-about-d-day",
    sourceName: "Imperial War Museums",
  },
  {
    id: "berlin-wall-1989",
    title: "The fall of the Berlin Wall",
    date: "1989-11-09",
    city: "Berlin",
    country: "Germany",
    lat: 52.52,
    lon: 13.4,
    kind: "milestone",
    description:
      "The opening of border crossings on 9 November marked the fall of the Berlin Wall and a turning point in the end of the Cold War.",
    sourceUrl: "https://www.berlin.de/mauer/en/history/opening-of-the-wall/",
    sourceName: "City of Berlin",
  },
  {
    id: "wright-1903",
    title: "The Wright brothers’ first powered flight",
    date: "1903-12-17",
    city: "Kitty Hawk",
    country: "United States",
    lat: 36.02,
    lon: -75.67,
    kind: "discovery",
    description:
      "Orville and Wilbur Wright achieved the first successful sustained flight of a powered, heavier-than-air airplane near Kitty Hawk.",
    sourceUrl:
      "https://www.nps.gov/wrbr/learn/historyculture/thefirstflight.htm",
    sourceName: "National Park Service",
  },
];

export function projectCoordinates(lon: number, lat: number) {
  return {
    x: ((Math.max(-180, Math.min(180, lon)) + 180) / 360) * MAP_WIDTH,
    y: ((90 - Math.max(-90, Math.min(90, lat))) / 180) * MAP_HEIGHT,
  };
}

export function countryPath(country: CountryShape): string {
  const polygons =
    country.geometry.type === "Polygon"
      ? [country.geometry.coordinates as number[][][]]
      : (country.geometry.coordinates as number[][][][]);
  return polygons
    .map((polygon) =>
      polygon
        .map(
          (ring) =>
            ring
              .map(([lon, lat], i) => {
                const point = projectCoordinates(lon, lat);
                return `${i ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
              })
              .join(" ") + "Z",
        )
        .join(" "),
    )
    .join(" ");
}

export function parseMapPreferences(raw: unknown): MapPreferences {
  const defaults: MapPreferences = {
    ...DEFAULT_MAP_PREFERENCES,
    layers: { ...DEFAULT_MAP_PREFERENCES.layers },
    places: [],
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;
  const value = raw as Record<string, unknown>;
  const styles: MapStyle[] = ["atlas", "satellite", "terrain", "dark", "light"];
  if (styles.includes(value.style as MapStyle))
    defaults.style = value.style as MapStyle;
  if (value.mode === "history") defaults.mode = "history";
  if (typeof value.date === "string" && isValidMapDate(value.date))
    defaults.date = value.date;
  if (
    value.layers &&
    typeof value.layers === "object" &&
    !Array.isArray(value.layers)
  ) {
    for (const key of Object.keys(
      defaults.layers,
    ) as (keyof MapPreferences["layers"])[]) {
      const flag = (value.layers as Record<string, unknown>)[key];
      if (typeof flag === "boolean") defaults.layers[key] = flag;
    }
  }
  if (Array.isArray(value.places)) {
    const seen = new Set<string>();
    defaults.places = value.places.slice(0, 20).flatMap((rawPlace) => {
      if (!rawPlace || typeof rawPlace !== "object" || Array.isArray(rawPlace))
        return [];
      const p = rawPlace as Record<string, unknown>;
      if (
        typeof p.id !== "string" ||
        !/^[a-zA-Z0-9_-]{1,80}$/.test(p.id) ||
        seen.has(p.id)
      )
        return [];
      if (
        typeof p.title !== "string" ||
        !p.title.trim() ||
        p.title.length > 100
      )
        return [];
      if (
        typeof p.lat !== "number" ||
        !Number.isFinite(p.lat) ||
        Math.abs(p.lat) > 90
      )
        return [];
      if (
        typeof p.lon !== "number" ||
        !Number.isFinite(p.lon) ||
        Math.abs(p.lon) > 180
      )
        return [];
      if (!["place", "favorite", "want"].includes(p.category as string))
        return [];
      seen.add(p.id);
      return [
        {
          id: p.id,
          title: p.title.trim(),
          city: typeof p.city === "string" ? p.city.slice(0, 100) : "",
          country: typeof p.country === "string" ? p.country.slice(0, 100) : "",
          // User-saved locations intentionally store city-level coordinates only.
          lat: Math.round(p.lat * 10) / 10,
          lon: Math.round(p.lon * 10) / 10,
          category: p.category as PlaceCategory,
          note: typeof p.note === "string" ? p.note.slice(0, 300) : "",
        },
      ];
    });
  }
  return defaults;
}

export function isValidMapDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T12:00:00Z`);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value &&
    value >= "1800-01-01" &&
    value <= "2100-12-31"
  );
}

/** A dated event is visible only once it has begun. An ended event remains part of history. */
export function historicalEventsAtDate(
  date: string,
  events = HISTORICAL_EVENTS,
) {
  if (!isValidMapDate(date)) return [];
  return events
    .filter((event) => event.date <= date)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function searchMapPlaces(query: string, saved: SavedMapPlace[] = []) {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [];
  const all = [...saved, ...CURATED_PLACES, ...HISTORICAL_EVENTS];
  return all
    .filter((place) =>
      [
        place.title,
        place.city,
        place.country,
        "date" in place ? place.date : "",
      ].some((value) => value.toLocaleLowerCase().includes(q)),
    )
    .slice(0, 8);
}

export function mapDirectionsUrl(place: Pick<SavedMapPlace, "lat" | "lon">) {
  // No origin is sent. The user can choose one after opening the external service.
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${place.lat},${place.lon}`)}`;
}

/** Nearby screen-stable locators combine until zoom separates them. */
export function clusterMapItems<T extends { lat: number; lon: number }>(
  items: T[],
  zoom: number,
) {
  const groups: { items: T[]; x: number; y: number }[] = [];
  const radius = 22 / Math.max(1, zoom);
  for (const item of items) {
    const point = projectCoordinates(item.lon, item.lat);
    const group = groups.find(
      (value) => Math.hypot(value.x - point.x, value.y - point.y) < radius,
    );
    if (group) {
      const count = group.items.length;
      group.x = (group.x * count + point.x) / (count + 1);
      group.y = (group.y * count + point.y) / (count + 1);
      group.items.push(item);
    } else groups.push({ items: [item], ...point });
  }
  return groups;
}
