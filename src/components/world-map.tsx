"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Compass,
  ExternalLink,
  Flag,
  Flame,
  Globe2,
  GripHorizontal,
  History,
  Info,
  Layers3,
  MapPin,
  Maximize2,
  Minus,
  Mountain,
  Navigation,
  Newspaper,
  Pause,
  Plane,
  Play,
  Plus,
  RotateCcw,
  Search,
  Ship,
  Star,
  Sun,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { assetPath } from "@/lib/assets";
import {
  CURATED_PLACES,
  DEFAULT_MAP_PREFERENCES,
  HISTORICAL_EVENTS,
  MAP_HEIGHT,
  MAP_WIDTH,
  countryPath,
  clusterMapItems,
  historicalEventsAtDate,
  isValidMapDate,
  mapDirectionsUrl,
  parseMapPreferences,
  projectCoordinates,
  searchMapPlaces,
} from "@/lib/map-data";
import type {
  CountryShape,
  CuratedPlace,
  HistoricalEvent,
  MapPreferences,
  MapStyle,
  PlaceCategory,
  SavedMapPlace,
} from "@/lib/map-data";
import "./world-map.css";

type MapItem = CuratedPlace | SavedMapPlace | HistoricalEvent;
export type WorldMapProps = {
  ownerId?: string;
  settings?: Record<string, unknown>;
  onSaveSettings?: (patch: Record<string, unknown>) => Promise<void> | void;
  preview?: boolean;
};
type Camera = { x: number; y: number; zoom: number };
const DEFAULT_CAMERA: Camera = { x: 600, y: 300, zoom: 1 };
const STYLES: { id: MapStyle; title: string; icon: typeof Globe2 }[] = [
  { id: "atlas", title: "Atlas", icon: Globe2 },
  { id: "satellite", title: "Satellite", icon: Sun },
  { id: "terrain", title: "Terrain", icon: Mountain },
  { id: "dark", title: "Dark", icon: Compass },
  { id: "light", title: "Light", icon: MapPin },
];
const CATEGORY_COLORS = {
  place: "#348ef5",
  favorite: "#2bab78",
  want: "#dfae26",
  history: "#e65762",
};
const DATE_PRESETS = [
  { label: "1900s", date: "1903-12-17" },
  { label: "WWI", date: "1916-07-01" },
  { label: "Interwar", date: "1930-01-01" },
  { label: "WWII", date: "1944-06-06" },
  { label: "Cold War", date: "1989-11-09" },
];
const CONTINENTS = [
  { name: "NORTH AMERICA", lat: 42, lon: -107 },
  { name: "SOUTH AMERICA", lat: -16, lon: -62 },
  { name: "EUROPE", lat: 58, lon: 20 },
  { name: "AFRICA", lat: 11, lon: 17 },
  { name: "ASIA", lat: 41, lon: 97 },
  { name: "AUSTRALIA", lat: -25, lon: 134 },
];
const OCEANS = [
  { name: "PACIFIC OCEAN", lat: 0, lon: -140 },
  { name: "ATLANTIC OCEAN", lat: 8, lon: -32 },
  { name: "INDIAN OCEAN", lat: -22, lon: 77 },
  { name: "ARCTIC OCEAN", lat: 79, lon: 0 },
];

function isHistory(item: MapItem): item is HistoricalEvent {
  return "date" in item;
}
function isCurated(item: MapItem): item is CuratedPlace {
  return "terrain" in item;
}
function readableDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
function itemCategory(item: MapItem) {
  return isHistory(item)
    ? "history"
    : "category" in item
      ? item.category
      : "place";
}
function placeThumbnail(place: CuratedPlace | undefined, historical = false) {
  const colors = historical
    ? ["#6b7070", "#383d3b", "#89908a"]
    : (place?.colors ?? ["#c3d5d9", "#8a9d93", "#78988c"]);
  return (
    <svg
      className="map-place-art"
      viewBox="0 0 180 82"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="180" height="82" fill={colors[0]} />
      <circle cx="143" cy="19" r="11" fill="#fff4d6" opacity=".72" />
      <path
        d="M0 57L20 40L37 50L58 19L75 40L98 27L127 57L151 37L180 51V82H0Z"
        fill={colors[1]}
        opacity=".78"
      />
      <path
        d="M0 64L34 57L68 68L97 49L126 61L151 53L180 68V82H0Z"
        fill={colors[2]}
      />
      {(place?.terrain === "city" || !place || historical) && (
        <g fill={historical ? "#28322f" : "#ede1c9"} opacity=".9">
          <path d="M18 66V40H31V66M36 69V47H48V69M66 69V37H76V69M104 69V30H115V69M123 69V43H139V69M145 69V48H160V69" />
          <path d="M107 30V20H111V30M69 37V28H73V37" />
        </g>
      )}
      {(place?.terrain === "coast" || place?.terrain === "island") && (
        <path d="M0 72Q40 63 85 73T180 69V82H0Z" fill="#6cb2b5" opacity=".85" />
      )}
      <path
        d="M0 78Q48 72 96 77T180 74"
        fill="none"
        stroke="#e3e7db"
        strokeWidth="1.3"
        opacity=".5"
      />
    </svg>
  );
}

export default function WorldMap({
  ownerId = "preview",
  settings,
  onSaveSettings,
  preview = false,
}: WorldMapProps) {
  const [preferences, setPreferences] = useState<MapPreferences>(() =>
    parseMapPreferences(settings?.worldMap),
  );
  const preferenceRef = useRef(preferences);
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);
  const [countries, setCountries] = useState<CountryShape[]>([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<MapItem | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ x: 0, y: 0 });
  const [carouselOpen, setCarouselOpen] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [editor, setEditor] = useState<SavedMapPlace | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [notice, setNotice] = useState("");
  const [playing, setPlaying] = useState(false);
  const saveSequence = useRef(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pointerGesture = useRef<{
    camera: Camera;
    x: number;
    y: number;
    distance: number;
    moved: boolean;
  } | null>(null);
  const panelGesture = useRef<{
    x: number;
    y: number;
    initialX: number;
    initialY: number;
  } | null>(null);
  const id = useId().replace(/:/g, "");
  const localPreview = preview || !onSaveSettings;
  const localFallback = !onSaveSettings;
  const dark = preferences.style === "dark" || preferences.mode === "history";
  const activeHistory = useMemo(
    () => historicalEventsAtDate(preferences.date),
    [preferences.date],
  );
  const results = useMemo(
    () => searchMapPlaces(query, preferences.places),
    [query, preferences.places],
  );
  const paths = useMemo(
    () =>
      countries.map((country) => ({ ...country, path: countryPath(country) })),
    [countries],
  );
  const mapItems: MapItem[] =
    preferences.mode === "history"
      ? preferences.layers.history
        ? activeHistory
        : []
      : [
          ...(preferences.layers.places
            ? CURATED_PLACES.filter(
                (place) =>
                  !preferences.places.some((saved) => saved.id === place.id),
              )
            : []),
          ...preferences.places.filter(
            (place) =>
              preferences.layers[
                place.category === "favorite"
                  ? "favorites"
                  : place.category === "want"
                    ? "want"
                    : "places"
              ],
          ),
        ];
  const mapGroups = clusterMapItems(mapItems, camera.zoom);

  useEffect(() => {
    const controller = new AbortController();
    setMapLoading(true);
    fetch(assetPath("/maps/natural-earth-50m.json"), {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Map unavailable");
        return response.json();
      })
      .then((data: CountryShape[]) => {
        setCountries(data);
        setMapError(false);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setMapError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setMapLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let initial = parseMapPreferences(settings?.worldMap);
    if (localFallback) {
      try {
        const stored = localStorage.getItem(`cast-map:${ownerId}`);
        if (stored) initial = parseMapPreferences(JSON.parse(stored));
      } catch {
        /* Preferences still work when browser storage is unavailable. */
      }
    }
    preferenceRef.current = initial;
    setPreferences(initial);
    // Rehydrate only when switching identities, not on every optimistic settings patch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, localFallback]);

  useEffect(() => {
    if (!editor && !showInfo) return;
    const dialog = surfaceRef.current?.querySelector("dialog");
    if (!dialog) return;
    // Native modal behavior supplies focus trapping and restores focus on close.
    dialog.removeAttribute("open");
    try {
      dialog.showModal();
    } catch {
      dialog.setAttribute("open", "");
    }
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [editor?.id, showInfo]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      )
        setSearchOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 600px)");
    const adaptPanel = () => setPanelCollapsed(narrow.matches);
    adaptPanel();
    narrow.addEventListener("change", adaptPanel);
    return () => narrow.removeEventListener("change", adaptPanel);
  }, []);

  useEffect(() => {
    if (!notice || saveStatus === "error") return;
    const timer = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice, saveStatus]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const wheel = (event: WheelEvent) => {
      if ((event.target as Element).closest("[data-map-interactive]")) return;
      event.preventDefault();
      const factor = Math.exp(
        -Math.max(-100, Math.min(100, event.deltaY)) * 0.0025,
      );
      const bounds = svg.getBoundingClientRect();
      const units = Math.max(
        MAP_WIDTH / bounds.width,
        MAP_HEIGHT / bounds.height,
      );
      const offsetX = (event.clientX - bounds.left - bounds.width / 2) * units;
      const offsetY = (event.clientY - bounds.top - bounds.height / 2) * units;
      setCamera((value) => {
        const zoom = Math.max(1, Math.min(8, value.zoom * factor));
        return {
          zoom,
          x: Math.max(
            0,
            Math.min(
              MAP_WIDTH,
              value.x + offsetX / value.zoom - offsetX / zoom,
            ),
          ),
          y: Math.max(
            0,
            Math.min(
              MAP_HEIGHT,
              value.y + offsetY / value.zoom - offsetY / zoom,
            ),
          ),
        };
      });
    };
    svg.addEventListener("wheel", wheel, { passive: false });
    return () => svg.removeEventListener("wheel", wheel);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const current = preferenceRef.current;
      const upcoming = HISTORICAL_EVENTS.filter(
        (event) => event.date > current.date,
      ).sort((a, b) => a.date.localeCompare(b.date))[0];
      if (!upcoming) {
        setPlaying(false);
        void persist(preferenceRef.current);
        return;
      }
      const next = { ...current, date: upcoming.date };
      preferenceRef.current = next;
      setPreferences(next);
      setSelected(upcoming);
      const point = projectCoordinates(upcoming.lon, upcoming.lat);
      setCamera({ ...point, zoom: 3.5 });
    }, 2800);
    return () => window.clearInterval(timer);
  }, [playing]);

  async function persist(next: MapPreferences) {
    const normalized = parseMapPreferences(next);
    preferenceRef.current = normalized;
    setPreferences(normalized);
    const sequence = ++saveSequence.current;
    setSaveStatus("saving");
    try {
      if (localFallback)
        localStorage.setItem(`cast-map:${ownerId}`, JSON.stringify(normalized));
      else await onSaveSettings?.({ worldMap: normalized });
      if (sequence === saveSequence.current) setSaveStatus("saved");
    } catch {
      if (sequence === saveSequence.current) {
        setSaveStatus("error");
        setNotice(
          "Your changes are visible, but couldn’t be saved. Retry when you’re connected.",
        );
      }
    }
  }

  function changeMode(mode: MapPreferences["mode"]) {
    setPlaying(false);
    void persist({ ...preferenceRef.current, mode });
    if (mode === "history") {
      const event =
        historicalEventsAtDate(preferenceRef.current.date)[0] ??
        HISTORICAL_EVENTS[0];
      setSelected(event);
      const point = projectCoordinates(event.lon, event.lat);
      setCamera({ ...point, zoom: 3.5 });
    } else {
      setSelected(null);
      setCamera(DEFAULT_CAMERA);
    }
  }

  function selectItem(item: MapItem, focus = false) {
    setSelected(item);
    setSearchOpen(false);
    if (
      isHistory(item) &&
      (preferences.mode !== "history" || item.date > preferences.date)
    )
      void persist({
        ...preferenceRef.current,
        mode: "history",
        date: item.date > preferences.date ? item.date : preferences.date,
      });
    if (focus) {
      const point = projectCoordinates(item.lon, item.lat);
      setCamera({ ...point, zoom: isHistory(item) ? 3.5 : 2.8 });
    }
  }

  function toggleLayer(key: keyof MapPreferences["layers"]) {
    const current = preferenceRef.current;
    void persist({
      ...current,
      layers: { ...current.layers, [key]: !current.layers[key] },
    });
  }

  function updateDate(date: string) {
    if (!isValidMapDate(date)) return;
    setPlaying(false);
    void persist({ ...preferenceRef.current, date });
    const event = historicalEventsAtDate(date)[0];
    setSelected(event ?? null);
    if (event) {
      const point = projectCoordinates(event.lon, event.lat);
      setCamera({ ...point, zoom: 3.5 });
    }
  }

  function stepDate(direction: number) {
    const dates = [
      ...new Set(HISTORICAL_EVENTS.map((event) => event.date)),
    ].sort();
    const target =
      direction > 0
        ? dates.find((date) => date > preferences.date)
        : dates.filter((date) => date < preferences.date).at(-1);
    if (target) updateDate(target);
    else
      setNotice(
        direction > 0
          ? "You’re at the last curated event."
          : "You’re at the first curated event.",
      );
  }

  function saveItem(item: MapItem, category: PlaceCategory) {
    const existing = preferences.places.find((place) => place.id === item.id);
    if (!existing && preferences.places.length >= 20) {
      setNotice("You can save up to 20 places. Remove one to make room.");
      return;
    }
    const saved: SavedMapPlace = {
      id: item.id,
      title: item.title,
      city: item.city,
      country: item.country,
      lat: Math.round(item.lat * 10) / 10,
      lon: Math.round(item.lon * 10) / 10,
      category,
      note: existing?.note ?? "",
    };
    void persist({
      ...preferenceRef.current,
      places: [
        ...preferenceRef.current.places.filter((place) => place.id !== item.id),
        saved,
      ],
    });
    setNotice(
      category === "favorite"
        ? "Saved to your favorite places."
        : "Added to your want-to-go list.",
    );
  }

  function beginEdit(item?: MapItem) {
    if (item) {
      const existing = preferences.places.find((place) => place.id === item.id);
      setEditor(
        existing ?? {
          id: item.id,
          title: item.title,
          city: item.city,
          country: item.country,
          lat: Math.round(item.lat * 10) / 10,
          lon: Math.round(item.lon * 10) / 10,
          category: "place",
          note: "",
        },
      );
    } else
      setEditor({
        id: crypto.randomUUID(),
        title: "",
        city: "",
        country: "",
        lat: 0,
        lon: 0,
        category: "want",
        note: "",
      });
  }

  function zoom(factor: number) {
    setCamera((value) => ({
      ...value,
      zoom: Math.max(1, Math.min(8, value.zoom * factor)),
    }));
  }
  function resetCamera() {
    setCamera(DEFAULT_CAMERA);
    setSelected(null);
  }

  function pointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (
      (event.target as Element).closest("[data-map-interactive]") ||
      event.button !== 0
    )
      return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const points = [...pointers.current.values()];
    const center = points.reduce(
      (sum, point) => ({
        x: sum.x + point.x / points.length,
        y: sum.y + point.y / points.length,
      }),
      { x: 0, y: 0 },
    );
    pointerGesture.current = {
      camera,
      ...center,
      distance:
        points.length > 1
          ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
          : 0,
      moved: false,
    };
  }

  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(event.pointerId) || !pointerGesture.current)
      return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const points = [...pointers.current.values()];
    const center = points.reduce(
      (sum, point) => ({
        x: sum.x + point.x / points.length,
        y: sum.y + point.y / points.length,
      }),
      { x: 0, y: 0 },
    );
    const gesture = pointerGesture.current;
    const bounds = event.currentTarget.getBoundingClientRect();
    const units = Math.max(
      MAP_WIDTH / bounds.width,
      MAP_HEIGHT / bounds.height,
    );
    const distance =
      points.length > 1
        ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
        : 0;
    const nextZoom =
      gesture.distance > 0 && distance > 0
        ? Math.max(
            1,
            Math.min(8, (gesture.camera.zoom * distance) / gesture.distance),
          )
        : gesture.camera.zoom;
    if (
      Math.abs(center.x - gesture.x) + Math.abs(center.y - gesture.y) > 4 ||
      Math.abs(nextZoom - gesture.camera.zoom) > 0.03
    )
      gesture.moved = true;
    setCamera({
      x: Math.max(
        0,
        Math.min(
          MAP_WIDTH,
          gesture.camera.x +
            ((gesture.x - bounds.left - bounds.width / 2) * units) /
              gesture.camera.zoom -
            ((center.x - bounds.left - bounds.width / 2) * units) / nextZoom,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          MAP_HEIGHT,
          gesture.camera.y +
            ((gesture.y - bounds.top - bounds.height / 2) * units) /
              gesture.camera.zoom -
            ((center.y - bounds.top - bounds.height / 2) * units) / nextZoom,
        ),
      ),
      zoom: nextZoom,
    });
  }

  function pointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (pointers.current.size) {
      const point = [...pointers.current.values()][0];
      pointerGesture.current = { camera, ...point, distance: 0, moved: true };
    } else pointerGesture.current = null;
  }

  function keyboardPan(event: React.KeyboardEvent<SVGSVGElement>) {
    if (event.target !== event.currentTarget) return;
    const step = 80 / camera.zoom;
    const changes: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    if (changes[event.key]) {
      event.preventDefault();
      const change = changes[event.key];
      setCamera((value) => ({
        ...value,
        x: Math.max(0, Math.min(MAP_WIDTH, value.x + change.x)),
        y: Math.max(0, Math.min(MAP_HEIGHT, value.y + change.y)),
      }));
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoom(1.3);
    }
    if (event.key === "-") {
      event.preventDefault();
      zoom(1 / 1.3);
    }
    if (event.key === "Escape") setSelected(null);
  }

  function dragPanel(event: ReactPointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    panelGesture.current = {
      x: event.clientX,
      y: event.clientY,
      initialX: panelPosition.x,
      initialY: panelPosition.y,
    };
  }

  function movePanel(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!panelGesture.current) return;
    const drag = panelGesture.current;
    const bounds = surfaceRef.current?.getBoundingClientRect();
    const panel = event.currentTarget.closest(
      ".map-layer-panel",
    ) as HTMLElement | null;
    const panelHeight = panel?.getBoundingClientRect().height ?? 400;
    const top = panel ? parseFloat(getComputedStyle(panel).top) : 70;
    setPanelPosition({
      x: Math.max(
        -(bounds?.width ?? 500) + 260,
        Math.min(0, drag.initialX + event.clientX - drag.x),
      ),
      y: Math.max(
        12 - top,
        Math.min(
          Math.max(12 - top, (bounds?.height ?? 600) - panelHeight - top - 30),
          drag.initialY + event.clientY - drag.y,
        ),
      ),
    });
  }

  const selectedSaved = selected
    ? preferences.places.find((place) => place.id === selected.id)
    : undefined;
  const visibleCarousel: MapItem[] =
    preferences.mode === "history"
      ? activeHistory
      : [
          ...preferences.places,
          ...CURATED_PLACES.filter(
            (place) =>
              !preferences.places.some((saved) => saved.id === place.id),
          ),
        ];
  const currentDescription = selected
    ? isHistory(selected) || isCurated(selected)
      ? selected.description
      : selected.note
    : "";
  const sourceUrl =
    selected && (isHistory(selected) || isCurated(selected))
      ? selected.sourceUrl
      : undefined;

  return (
    <section
      className={`world-map world-map--${dark ? "dark" : preferences.style} ${preferences.mode === "history" ? "world-map--history" : ""}`}
      ref={surfaceRef}
      aria-label="Explore the world map"
    >
      <svg
        ref={svgRef}
        className="map-cartography"
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        tabIndex={0}
        aria-label="Interactive map. Drag to pan, use plus or minus to zoom, or arrow keys to move."
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onKeyDown={keyboardPan}
      >
        <defs>
          <linearGradient id={`${id}-ocean`} x1="0" y1="0" x2=".2" y2="1">
            <stop stopColor={dark ? "#193747" : "#a4cbd6"} />
            <stop offset="1" stopColor={dark ? "#0e2836" : "#c4e0e6"} />
          </linearGradient>
          <radialGradient id={`${id}-water`}>
            <stop stopColor="#7faebc" stopOpacity=".4" />
            <stop offset="1" stopColor="#1a3f52" stopOpacity="0" />
          </radialGradient>
          <filter id={`${id}-paper`}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency=".8"
              numOctaves="3"
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="linear" slope=".11" />
            </feComponentTransfer>
            <feBlend in="SourceGraphic" mode="multiply" />
          </filter>
          <filter
            id={`${id}-pin-shadow`}
            x="-70%"
            y="-60%"
            width="240%"
            height="250%"
          >
            <feDropShadow
              dx="0"
              dy="2"
              stdDeviation="3"
              floodColor="#174f52"
              floodOpacity=".23"
            />
          </filter>
          <pattern
            id={`${id}-terrain`}
            width="31"
            height="27"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 18Q8 2 17 12T33 8M0 22Q10 8 18 18T36 16"
              fill="none"
              stroke={dark ? "#91a391" : "#607e56"}
              strokeWidth=".45"
              opacity=".16"
            />
          </pattern>
          <clipPath id={`${id}-land`}>
            {paths.map((country) => (
              <path key={country.code} d={country.path} fillRule="evenodd" />
            ))}
          </clipPath>
        </defs>
        <rect
          width={MAP_WIDTH}
          height={MAP_HEIGHT}
          fill={`url(#${id}-ocean)`}
        />
        <g
          transform={`translate(${MAP_WIDTH / 2} ${MAP_HEIGHT / 2}) scale(${camera.zoom}) translate(${-camera.x} ${-camera.y})`}
        >
          <rect
            x="-1200"
            y="-600"
            width="3600"
            height="1800"
            fill={`url(#${id}-ocean)`}
          />
          {preferences.style === "satellite" &&
            preferences.mode !== "history" && (
              <image
                href={assetPath("/maps/nasa-blue-marble.jpg")}
                x="0"
                y="0"
                width={MAP_WIDTH}
                height={MAP_HEIGHT}
                preserveAspectRatio="none"
              />
            )}
          {dark && (
            <image
              href={assetPath("/maps/nasa-blue-marble.jpg")}
              x="0"
              y="0"
              width={MAP_WIDTH}
              height={MAP_HEIGHT}
              preserveAspectRatio="none"
              opacity=".4"
              className="map-relief-imagery"
            />
          )}
          {paths.map((country, index) => (
            <path
              key={country.code}
              d={country.path}
              fillRule="evenodd"
              vectorEffect="non-scaling-stroke"
              className="map-country"
              style={{ "--country-tone": `${index % 6}` } as CSSProperties}
              fill={
                preferences.style === "satellite" && !dark
                  ? "transparent"
                  : dark
                    ? [
                        "#4a5550",
                        "#535a4b",
                        "#4c5554",
                        "#605e4c",
                        "#46595a",
                        "#5a6050",
                      ][index % 6]
                    : preferences.style === "light"
                      ? ["#edf1e9", "#e3e9e1", "#e9ede4"][index % 3]
                      : [
                          "#d2d1b0",
                          "#c1cdab",
                          "#d9d3b3",
                          "#c9d3b3",
                          "#bbcbaa",
                          "#d1d6b7",
                        ][index % 6]
              }
              stroke={
                preferences.layers.borders
                  ? dark
                    ? "#b8b69a"
                    : preferences.style === "satellite"
                      ? "#eef6e2"
                      : "#8e9c79"
                  : "transparent"
              }
              strokeWidth={preferences.style === "satellite" ? 0.55 : 0.6}
            />
          ))}
          {preferences.style !== "satellite" && (
            <g clipPath={`url(#${id}-land)`}>
              <image
                href={assetPath("/maps/nasa-blue-marble.jpg")}
                x="0"
                y="0"
                width={MAP_WIDTH}
                height={MAP_HEIGHT}
                preserveAspectRatio="none"
                opacity={
                  dark ? 0.3 : preferences.style === "terrain" ? 0.42 : 0.2
                }
                className="map-relief-imagery"
              />
              <rect
                width={MAP_WIDTH}
                height={MAP_HEIGHT}
                fill={`url(#${id}-terrain)`}
                opacity={preferences.style === "light" ? 0.25 : 0.75}
              />
            </g>
          )}
          <g
            className="map-graticule"
            fill="none"
            stroke={dark ? "#a7c7cb" : "#fcf8e8"}
            strokeWidth=".45"
            opacity={dark ? 0.08 : 0.22}
          >
            {Array.from({ length: 11 }, (_, i) => (
              <path
                key={`lon-${i}`}
                d={`M${(i + 1) * 100} 0V600`}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {Array.from({ length: 5 }, (_, i) => (
              <path
                key={`lat-${i}`}
                d={`M0 ${(i + 1) * 100}H1200`}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
          {preferences.layers.labels && (
            <g
              className="map-region-labels"
              fill={dark ? "#d7ddcf" : "#435949"}
            >
              {CONTINENTS.map((region) => {
                const point = projectCoordinates(region.lon, region.lat);
                return (
                  <text
                    key={region.name}
                    x={point.x}
                    y={point.y}
                    fontSize={Math.max(6, 12 / camera.zoom)}
                    textAnchor="middle"
                    letterSpacing={2 / camera.zoom}
                  >
                    {region.name}
                  </text>
                );
              })}
              {OCEANS.map((ocean) => {
                const point = projectCoordinates(ocean.lon, ocean.lat);
                return (
                  <text
                    key={ocean.name}
                    x={point.x}
                    y={point.y}
                    fontSize={Math.max(5, 10 / camera.zoom)}
                    textAnchor="middle"
                    letterSpacing={2.1 / camera.zoom}
                    className="map-ocean-label"
                  >
                    {ocean.name}
                  </text>
                );
              })}
            </g>
          )}
          {mapGroups.map((group) => {
            const item = group.items[0];
            const point = { x: group.x, y: group.y };
            const category = itemCategory(item);
            const active = selected?.id === item.id;
            if (group.items.length > 1) {
              const openGroup = () => {
                setSelected(null);
                setCamera({ ...point, zoom: Math.min(8, camera.zoom * 2) });
              };
              return (
                <g
                  key={`cluster-${item.id}`}
                  transform={`translate(${point.x} ${point.y}) scale(${1 / camera.zoom})`}
                  className="map-marker map-marker-cluster"
                  role="button"
                  tabIndex={0}
                  data-map-interactive="true"
                  aria-label={`${group.items.length} places: ${group.items.map((place) => place.title).join(", ")}. Zoom to separate.`}
                  onClick={openGroup}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openGroup();
                    }
                  }}
                >
                  <circle
                    cy="-12"
                    r="19"
                    fill={CATEGORY_COLORS[category]}
                    opacity=".17"
                  />
                  <circle
                    cy="-12"
                    r="12"
                    fill={CATEGORY_COLORS[category]}
                    stroke="white"
                    strokeWidth="1.8"
                    filter={`url(#${id}-pin-shadow)`}
                  />
                  <text
                    y="-8"
                    textAnchor="middle"
                    fill="white"
                    fontSize="11"
                    fontFamily="Arial"
                    fontWeight="600"
                  >
                    {group.items.length}
                  </text>
                </g>
              );
            }
            return (
              <g
                key={`${"category" in item ? "saved" : "curated"}-${item.id}`}
                transform={`translate(${point.x} ${point.y}) scale(${1 / camera.zoom})`}
                className={`map-marker ${active ? "is-selected" : ""}`}
                data-map-interactive="true"
                role="button"
                tabIndex={0}
                aria-label={`${item.title}, ${item.country}${isHistory(item) ? `, ${readableDate(item.date)}` : ""}`}
                onClick={() => selectItem(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectItem(item);
                  }
                }}
              >
                <circle
                  r={active ? 19 : 15}
                  cy="-12"
                  fill={CATEGORY_COLORS[category]}
                  opacity={active ? 0.16 : 0.1}
                />
                <path
                  d="M0 1C-3-5-11-11-11-18A11 11 0 0 1 11-18C11-11 3-5 0 1Z"
                  fill={CATEGORY_COLORS[category]}
                  stroke="#ffffff"
                  strokeWidth="1.8"
                  filter={`url(#${id}-pin-shadow)`}
                />
                {category === "want" || category === "favorite" ? (
                  <path
                    d="M0-25L2-20L7-20L3-17L5-12L0-15L-5-12L-3-17L-7-20L-2-20Z"
                    fill="white"
                  />
                ) : category === "history" ? (
                  <g fill="none" stroke="white" strokeWidth="1.4">
                    <rect x="-5" y="-23" width="10" height="9" rx="1" />
                    <path d="M-3-20H3M-3-17H3" />
                  </g>
                ) : (
                  <g fill="none" stroke="white" strokeWidth="1.5">
                    <path d="M0-12C-2-15-5-17-5-20A5 5 0 0 1 5-20C5-17 2-15 0-12Z" />
                    <circle cy="-20" r="1.5" />
                  </g>
                )}
                {preferences.layers.labels && (camera.zoom > 1.8 || active) && (
                  <text
                    x="15"
                    y="-10"
                    className="map-city-label"
                    fill={dark ? "#f3f3e6" : "#273c33"}
                    fontSize="10"
                  >
                    {item.city}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="map-topbar">
        <div className="map-search-wrap" ref={searchRef}>
          <div className="map-search glass-surface">
            <Search size={17} />
            <input
              aria-label="Search places and historical events"
              placeholder={
                preferences.mode === "history"
                  ? "Search places, events, or dates…"
                  : "Search places, cities, or anything…"
              }
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearchOpen(false);
                if (event.key === "Enter" && results[0])
                  selectItem(results[0], true);
              }}
            />
            {query && (
              <button
                className="map-icon-button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  setSearchOpen(false);
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          {searchOpen && query.trim() && (
            <div
              className="map-search-results glass-surface"
              role="listbox"
              aria-label="Search results"
            >
              {results.length ? (
                results.map((item, index) => (
                  <button
                    key={`${item.id}-${index}`}
                    role="option"
                    aria-selected={selected?.id === item.id}
                    onClick={() => selectItem(item, true)}
                  >
                    <span
                      className={`map-result-icon ${isHistory(item) ? "is-history" : ""}`}
                    >
                      {isHistory(item) ? (
                        <History size={15} />
                      ) : (
                        <MapPin size={15} />
                      )}
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>
                        {item.country}
                        {isHistory(item) ? ` · ${readableDate(item.date)}` : ""}
                      </small>
                    </span>
                    <ArrowRight size={14} />
                  </button>
                ))
              ) : (
                <p>
                  No matches in the curated guide or your saved places.{" "}
                  <button
                    onClick={() => {
                      beginEdit();
                      setSearchOpen(false);
                    }}
                  >
                    Add a place
                  </button>
                </p>
              )}
            </div>
          )}
        </div>
        <div className="map-top-right">
          <span className="map-motto">
            {preferences.mode === "history"
              ? "“To understand today, explore yesterday.”"
              : "“A more connected world.”"}
          </span>
          <button
            className="map-round-button glass-surface"
            aria-label="About this map and its data"
            onClick={() => setShowInfo(true)}
          >
            <Info size={17} />
          </button>
        </div>
      </div>

      <div className="map-mode-strip glass-surface">
        <button
          className={preferences.mode === "modern" ? "active" : ""}
          aria-pressed={preferences.mode === "modern"}
          onClick={() => changeMode("modern")}
        >
          <Globe2 size={14} />
          Explore
        </button>
        <button
          className={preferences.mode === "history" ? "active" : ""}
          aria-pressed={preferences.mode === "history"}
          onClick={() => changeMode("history")}
        >
          <History size={14} />
          History
        </button>
      </div>

      {preferences.mode === "history" && (
        <div className="map-timeline glass-surface">
          <div className="map-date-presets">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                className={
                  preferences.date.slice(0, 4) === preset.date.slice(0, 4)
                    ? "active"
                    : ""
                }
                onClick={() => updateDate(preset.date)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="map-date-control">
            <button
              aria-label="Previous curated event"
              onClick={() => stepDate(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <label>
              <CalendarDays size={14} />
              <input
                type="date"
                aria-label="Historical date"
                min="1800-01-01"
                max="2100-12-31"
                value={preferences.date}
                onChange={(event) => updateDate(event.target.value)}
              />
            </label>
            <button aria-label="Next curated event" onClick={() => stepDate(1)}>
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="map-time-range">
            <button
              className="map-play-button"
              aria-label={playing ? "Pause timeline" : "Play curated timeline"}
              onClick={() => {
                if (playing) void persist(preferenceRef.current);
                setPlaying((value) => !value);
              }}
            >
              {playing ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <input
              type="range"
              aria-label="Historical year"
              min="1900"
              max="1990"
              value={Math.min(
                1990,
                Math.max(1900, Number(preferences.date.slice(0, 4))),
              )}
              onChange={(event) => updateDate(`${event.target.value}-12-31`)}
            />
            <span>{preferences.date.slice(0, 4)}</span>
          </div>
        </div>
      )}

      {selected && (
        <article
          className="map-detail glass-surface"
          aria-label={`${selected.title} details`}
        >
          <div className="map-detail-eyebrow">
            <span
              className={`map-detail-category ${isHistory(selected) ? "historical" : ""}`}
            >
              {isHistory(selected) ? (
                <Newspaper size={13} />
              ) : (
                <MapPin size={13} />
              )}
            </span>
            <span>
              {isHistory(selected)
                ? `${readableDate(selected.date)} · ${selected.city}, ${selected.country}`
                : `${selected.city}, ${selected.country}`}
            </span>
            <button
              className="map-icon-button"
              aria-label="Close place details"
              onClick={() => setSelected(null)}
            >
              <X size={15} />
            </button>
          </div>
          <h2>{selected.title}</h2>
          <div className="map-detail-art">
            {placeThumbnail(
              isCurated(selected)
                ? selected
                : CURATED_PLACES.find((place) => place.id === selected.id),
              isHistory(selected),
            )}
            <span className="map-art-caption">
              {isHistory(selected)
                ? "Curated historical event"
                : "Explore the place"}
            </span>
          </div>
          {currentDescription && <p>{currentDescription}</p>}
          {isHistory(selected) && (
            <div className="map-history-tags">
              <span>
                {selected.kind === "battle"
                  ? "Conflict history"
                  : "Historical milestone"}
              </span>
              <span>{selected.sourceName}</span>
            </div>
          )}
          <div className="map-detail-actions">
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                {isHistory(selected) ? "Read the source" : "Official guide"}
                <ArrowRight size={13} />
              </a>
            )}
            {!isHistory(selected) && (
              <button
                className={
                  selectedSaved?.category === "favorite" ? "active" : ""
                }
                aria-label={`Save ${selected.title} as a favorite`}
                onClick={() => saveItem(selected, "favorite")}
              >
                <Star
                  size={14}
                  fill={
                    selectedSaved?.category === "favorite"
                      ? "currentColor"
                      : "none"
                  }
                />
                Favorite
              </button>
            )}
            {!isHistory(selected) && (
              <button
                aria-label={`Add ${selected.title} to want to go`}
                onClick={() => saveItem(selected, "want")}
              >
                <Bookmark size={14} />
                Want to go
              </button>
            )}
          </div>
          {!isHistory(selected) && (
            <div className="map-detail-secondary">
              <a
                href={mapDirectionsUrl(selected)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Navigation size={13} />
                Directions
                <ExternalLink size={11} />
              </a>
              <button onClick={() => beginEdit(selected)}>
                Edit notes{selectedSaved && <Check size={12} />}
              </button>
            </div>
          )}
        </article>
      )}

      {panelOpen ? (
        <aside
          className={`map-layer-panel glass-surface ${panelCollapsed ? "is-collapsed" : ""}`}
          style={{
            transform: `translate(${panelPosition.x}px, ${panelPosition.y}px)`,
          }}
          aria-label="Map styles and layers"
        >
          <header>
            <button
              className="map-panel-drag"
              aria-label="Drag map layers panel"
              title="Drag to move"
              onPointerDown={dragPanel}
              onPointerMove={movePanel}
              onPointerUp={(event) => {
                panelGesture.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
            >
              <GripHorizontal size={15} />
            </button>
            <strong>Map layers</strong>
            <button
              className="map-icon-button"
              aria-label={
                panelCollapsed ? "Expand map layers" : "Collapse map layers"
              }
              onClick={() => setPanelCollapsed((value) => !value)}
            >
              <ChevronDown
                size={14}
                className={panelCollapsed ? "" : "is-rotated"}
              />
            </button>
            <button
              className="map-icon-button"
              aria-label="Hide map layers panel"
              onClick={() => setPanelOpen(false)}
            >
              <X size={13} />
            </button>
          </header>
          {!panelCollapsed && (
            <div className="map-panel-body">
              <h3>Map style</h3>
              <div className="map-style-grid">
                {STYLES.map((style) => (
                  <button
                    key={style.id}
                    aria-pressed={preferences.style === style.id}
                    className={preferences.style === style.id ? "active" : ""}
                    onClick={() => {
                      if (preferences.mode === "history")
                        void persist({
                          ...preferenceRef.current,
                          mode: "modern",
                          style: style.id,
                        });
                      else
                        void persist({
                          ...preferenceRef.current,
                          style: style.id,
                        });
                    }}
                  >
                    <span
                      className={`map-style-preview map-style-preview--${style.id}`}
                      style={
                        style.id === "satellite"
                          ? {
                              backgroundImage: `url(${assetPath("/maps/nasa-blue-marble.jpg")})`,
                            }
                          : undefined
                      }
                    >
                      <style.icon size={19} />
                    </span>
                    <span>{style.title}</span>
                  </button>
                ))}
              </div>
              <h3>
                {preferences.mode === "history"
                  ? "Historical overlays"
                  : "Overlays"}
              </h3>
              {preferences.mode === "history" ? (
                <LayerToggle
                  icon={Flag}
                  label="Curated events"
                  checked={preferences.layers.history}
                  onChange={() => toggleLayer("history")}
                  color="#e65762"
                />
              ) : (
                <>
                  <LayerToggle
                    icon={MapPin}
                    label="Places of interest"
                    checked={preferences.layers.places}
                    onChange={() => toggleLayer("places")}
                    color="#368fe5"
                  />
                  <LayerToggle
                    icon={Star}
                    label="Favorite places"
                    checked={preferences.layers.favorites}
                    onChange={() => toggleLayer("favorites")}
                    color="#36a777"
                  />
                  <LayerToggle
                    icon={Bookmark}
                    label="Want to go"
                    checked={preferences.layers.want}
                    onChange={() => toggleLayer("want")}
                    color="#dcb12b"
                  />
                </>
              )}
              <h3>Reference layers</h3>
              <LayerToggle
                icon={Globe2}
                label="Country boundaries"
                checked={preferences.layers.borders}
                onChange={() => toggleLayer("borders")}
              />
              <LayerToggle
                icon={BookOpen}
                label="Place labels"
                checked={preferences.layers.labels}
                onChange={() => toggleLayer("labels")}
              />
              <details className="map-feed-details">
                <summary>
                  Live data <span>Not connected</span>
                  <ChevronDown size={12} />
                </summary>
                <p>Connect a licensed provider to display live feeds.</p>
                {[
                  {
                    icon: Users,
                    title: "Friends",
                    reason: "Location sharing off",
                  },
                  {
                    icon: Newspaper,
                    title: "News",
                    reason: "Provider required",
                  },
                  {
                    icon: Plane,
                    title: "Air traffic",
                    reason: "Provider required",
                  },
                  {
                    icon: Ship,
                    title: "Ship traffic",
                    reason: "Provider required",
                  },
                  {
                    icon: Cloud,
                    title: "Weather",
                    reason: "Provider required",
                  },
                  {
                    icon: Flame,
                    title: "Wildfires",
                    reason: "Provider required",
                  },
                ].map((feed) => (
                  <div className="map-unconnected-layer" key={feed.title}>
                    <feed.icon size={14} />
                    <span>
                      {feed.title}
                      <small>{feed.reason}</small>
                    </span>
                    <span
                      className="map-switch-off"
                      aria-label={`${feed.title} unavailable`}
                    />
                  </div>
                ))}
              </details>
              <button className="map-add-place" onClick={() => beginEdit()}>
                <Plus size={14} />
                Add a place
              </button>
            </div>
          )}
        </aside>
      ) : (
        <button
          className="map-reopen-layers glass-surface"
          onClick={() => setPanelOpen(true)}
        >
          <Layers3 size={16} />
          Map layers
        </button>
      )}

      <div className="map-compass" aria-hidden="true">
        <span>N</span>
        <Compass size={34} />
        <small>W &nbsp; &nbsp; E</small>
      </div>
      <div className="map-controls glass-surface">
        <button aria-label="Zoom in" onClick={() => zoom(1.35)}>
          <Plus size={19} />
        </button>
        <button aria-label="Zoom out" onClick={() => zoom(1 / 1.35)}>
          <Minus size={19} />
        </button>
        <button aria-label="Reset map view" onClick={resetCamera}>
          <RotateCcw size={16} />
        </button>
        <button
          aria-label="Toggle full screen map"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else
              void surfaceRef.current
                ?.requestFullscreen?.()
                .catch(() =>
                  setNotice("Full screen isn’t available in this browser."),
                );
          }}
        >
          <Maximize2 size={16} />
        </button>
      </div>

      {carouselOpen ? (
        <div className="map-place-dock glass-surface">
          <header>
            <strong>
              {preferences.mode === "history"
                ? `History through ${readableDate(preferences.date)}`
                : "Explore somewhere new"}
            </strong>
            <span>
              {preferences.mode === "history"
                ? "Curated events"
                : `${preferences.places.length} saved places`}
            </span>
            <button
              className="map-icon-button"
              aria-label="Hide places carousel"
              onClick={() => setCarouselOpen(false)}
            >
              <X size={13} />
            </button>
          </header>
          <div className="map-place-scroll" ref={carouselRef}>
            {visibleCarousel.map((item, index) => (
              <button
                className={`map-place-card ${selected?.id === item.id ? "active" : ""}`}
                key={`${item.id}-${index}`}
                onClick={() => selectItem(item, true)}
              >
                {placeThumbnail(
                  isCurated(item)
                    ? item
                    : CURATED_PLACES.find((place) => place.id === item.id),
                  isHistory(item),
                )}
                <strong>{item.title}</strong>
                <span style={{ color: CATEGORY_COLORS[itemCategory(item)] }}>
                  {isHistory(item) ? (
                    <History size={10} />
                  ) : "category" in item && item.category === "favorite" ? (
                    <Star size={10} />
                  ) : "category" in item && item.category === "want" ? (
                    <Bookmark size={10} />
                  ) : (
                    <MapPin size={10} />
                  )}
                  {isHistory(item) ? readableDate(item.date) : item.country}
                </span>
              </button>
            ))}
            {!visibleCarousel.length && (
              <p className="map-no-events">
                No events in this curated collection have begun at the selected
                date. Choose a later date.
              </p>
            )}
          </div>
          <button
            className="map-dock-next"
            aria-label="Show more places"
            onClick={() =>
              carouselRef.current?.scrollBy({ left: 360, behavior: "smooth" })
            }
          >
            <ChevronRight size={17} />
          </button>
        </div>
      ) : (
        <button
          className="map-reopen-carousel glass-surface"
          onClick={() => setCarouselOpen(true)}
        >
          <Compass size={15} />
          Explore places
        </button>
      )}

      <div className="map-attribution">
        <button onClick={() => setShowInfo(true)}>Natural Earth · NASA</button>
        <span>
          {preferences.mode === "history"
            ? "Modern reference borders · curated dated events"
            : preferences.style === "satellite"
              ? "Blue Marble · May 2004 composite"
              : "Reference map · city-level saved places"}
        </span>
        {localPreview && <span>Preview · saved in this browser</span>}
        {saveStatus === "saving" && <span>Saving…</span>}
        {saveStatus === "saved" && (
          <span className="map-saved-indicator">
            <Check size={10} />
            Saved
          </span>
        )}
        {saveStatus === "error" && (
          <button
            className="map-retry-save"
            onClick={() => void persist(preferenceRef.current)}
          >
            Retry save
          </button>
        )}
      </div>

      {(mapLoading || mapError) && (
        <div className="map-loading-state glass-surface" role="status">
          {mapLoading ? (
            <>
              <Globe2 size={19} />
              <span>Opening your world…</span>
            </>
          ) : (
            <>
              <Info size={19} />
              <span>
                The map couldn’t load. Check your connection and reopen the map.
              </span>
            </>
          )}
        </div>
      )}
      {notice && (
        <div className="map-notice glass-surface" role="status">
          <span>{notice}</span>
          <button
            className="map-icon-button"
            aria-label="Dismiss map notice"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {editor && (
        <div
          className="map-dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setEditor(null);
          }}
        >
          <dialog
            open
            className="map-edit-dialog"
            aria-labelledby={`${id}-edit-title`}
            onKeyDown={(event) => {
              if (event.key === "Escape") setEditor(null);
            }}
          >
            <header>
              <h2 id={`${id}-edit-title`}>
                {preferences.places.some((place) => place.id === editor.id)
                  ? "Edit your place"
                  : "Save a place"}
              </h2>
              <button
                className="map-icon-button"
                aria-label="Close place editor"
                onClick={() => setEditor(null)}
              >
                <X size={18} />
              </button>
            </header>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const normalized = parseMapPreferences({
                  ...preferences,
                  places: [editor],
                }).places[0];
                if (!normalized) {
                  setNotice(
                    "Enter a place name and valid coordinates before saving.",
                  );
                  return;
                }
                const places = [
                  ...preferenceRef.current.places.filter(
                    (place) => place.id !== editor.id,
                  ),
                  normalized,
                ];
                if (places.length > 20) {
                  setNotice("You can save up to 20 places.");
                  return;
                }
                void persist({ ...preferenceRef.current, places });
                setSelected(normalized);
                setEditor(null);
                setNotice("Your place has been saved.");
              }}
            >
              <p>
                Save a city or public place. Coordinates are rounded to the
                nearest tenth of a degree; your location is never requested.
              </p>
              <label>
                Place name
                <input
                  autoFocus
                  required
                  maxLength={100}
                  value={editor.title}
                  onChange={(event) =>
                    setEditor({ ...editor, title: event.target.value })
                  }
                  placeholder="A place worth remembering"
                />
              </label>
              <div className="map-form-pair">
                <label>
                  City
                  <input
                    maxLength={100}
                    value={editor.city}
                    onChange={(event) =>
                      setEditor({ ...editor, city: event.target.value })
                    }
                  />
                </label>
                <label>
                  Country
                  <input
                    maxLength={100}
                    value={editor.country}
                    onChange={(event) =>
                      setEditor({ ...editor, country: event.target.value })
                    }
                  />
                </label>
              </div>
              <div className="map-form-pair">
                <label>
                  Latitude
                  <input
                    required
                    type="number"
                    min="-90"
                    max="90"
                    step="any"
                    value={editor.lat}
                    onChange={(event) =>
                      setEditor({ ...editor, lat: Number(event.target.value) })
                    }
                  />
                </label>
                <label>
                  Longitude
                  <input
                    required
                    type="number"
                    min="-180"
                    max="180"
                    step="any"
                    value={editor.lon}
                    onChange={(event) =>
                      setEditor({ ...editor, lon: Number(event.target.value) })
                    }
                  />
                </label>
              </div>
              <label>
                Collection
                <select
                  value={editor.category}
                  onChange={(event) =>
                    setEditor({
                      ...editor,
                      category: event.target.value as PlaceCategory,
                    })
                  }
                >
                  <option value="place">My places</option>
                  <option value="favorite">Favorites</option>
                  <option value="want">Want to go</option>
                </select>
              </label>
              <label>
                Private notes
                <textarea
                  maxLength={300}
                  rows={3}
                  value={editor.note}
                  onChange={(event) =>
                    setEditor({ ...editor, note: event.target.value })
                  }
                  placeholder="What would you like to explore here?"
                />
              </label>
              <footer>
                {preferences.places.some((place) => place.id === editor.id) && (
                  <button
                    type="button"
                    className="map-delete-place"
                    onClick={() => {
                      void persist({
                        ...preferenceRef.current,
                        places: preferenceRef.current.places.filter(
                          (place) => place.id !== editor.id,
                        ),
                      });
                      if (selected?.id === editor.id) setSelected(null);
                      setEditor(null);
                      setNotice("Place removed.");
                    }}
                  >
                    <Trash2 size={14} />
                    Remove
                  </button>
                )}
                <button type="button" onClick={() => setEditor(null)}>
                  Cancel
                </button>
                <button type="submit" className="map-save-place">
                  <Check size={14} />
                  Save place
                </button>
              </footer>
            </form>
          </dialog>
        </div>
      )}

      {showInfo && (
        <div
          className="map-dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowInfo(false);
          }}
        >
          <dialog
            open
            className="map-info-dialog"
            aria-labelledby={`${id}-info-title`}
            onKeyDown={(event) => {
              if (event.key === "Escape") setShowInfo(false);
            }}
          >
            <header>
              <h2 id={`${id}-info-title`}>A world worth exploring</h2>
              <button
                className="map-icon-button"
                aria-label="Close map information"
                onClick={() => setShowInfo(false)}
              >
                <X size={18} />
              </button>
            </header>
            <p>
              This reference map works without an account with a map provider.
              Drag to pan, pinch or use the zoom buttons, and search our curated
              guide or your saved places.
            </p>
            <dl>
              <dt>Atlas & boundaries</dt>
              <dd>
                <a
                  href="https://www.naturalearthdata.com/about/terms-of-use/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Natural Earth
                </a>{" "}
                · public domain, 1:50 million. Modern outlines; disputed
                boundaries are reference geometry and imply no position on
                territorial claims.
              </dd>
              <dt>Satellite imagery</dt>
              <dd>
                <a
                  href="https://earthobservatory.nasa.gov/features/BlueMarble"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  NASA Blue Marble
                </a>{" "}
                · May 2004 static composite. It is not a live satellite feed.
              </dd>
              <dt>History</dt>
              <dd>
                Source-linked curated events visible from their start date. The
                history view uses modern reference outlines; it does not
                reproduce historical borders, front lines, or troop movements.
              </dd>
              <dt>Projection</dt>
              <dd>
                Equirectangular, WGS84 longitude/latitude. North is up; 0°
                longitude is centered. Areas and distances are distorted,
                especially near the poles. This is not a navigation map.
              </dd>
              <dt>Your places</dt>
              <dd>
                {localPreview
                  ? "Saved only in this browser’s preview storage."
                  : "Saved privately to your account."}{" "}
                Coordinates are rounded to city-level precision. No device
                location is read or shared. Directions open an external service
                without sending an origin.
              </dd>
              <dt>Live feeds</dt>
              <dd>
                Friends, news, aircraft, ships, weather, and wildfires require a
                connected provider or explicit sharing. They remain off here.
              </dd>
            </dl>
            <button
              className="map-save-place"
              onClick={() => setShowInfo(false)}
            >
              Back to exploring
              <ArrowRight size={14} />
            </button>
          </dialog>
        </div>
      )}
    </section>
  );
}

function LayerToggle({
  icon: Icon,
  label,
  checked,
  onChange,
  color,
}: {
  icon: typeof MapPin;
  label: string;
  checked: boolean;
  onChange: () => void;
  color?: string;
}) {
  return (
    <button
      className="map-layer-toggle"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
    >
      <Icon size={14} style={{ color }} />
      <span>{label}</span>
      <span className={`map-switch ${checked ? "is-on" : ""}`} />
    </button>
  );
}
