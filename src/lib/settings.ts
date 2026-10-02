import { z } from "zod";
import { isValidMapDate } from "./map-data";

const clockTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const timezone = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Invalid timezone.");
const cityCoordinate = (maximum: number) =>
  z
    .number()
    .finite()
    .min(-maximum)
    .max(maximum)
    .transform((value) => Math.round(value * 10) / 10);
const savedPlace = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    title: z.string().trim().min(1).max(100),
    city: z.string().max(100),
    country: z.string().max(100),
    lat: cityCoordinate(90),
    lon: cityCoordinate(180),
    category: z.enum(["place", "favorite", "want"]),
    note: z.string().max(300),
  })
  .strict();
export const mapPreferencesSchema = z
  .object({
    version: z.literal(1),
    style: z.enum(["atlas", "satellite", "terrain", "dark", "light"]),
    mode: z.enum(["modern", "history"]),
    date: z
      .string()
      .refine(isValidMapDate, "Choose a valid map date between 1800 and 2100."),
    layers: z
      .object({
        places: z.boolean(),
        favorites: z.boolean(),
        want: z.boolean(),
        history: z.boolean(),
        labels: z.boolean(),
        borders: z.boolean(),
      })
      .strict(),
    places: z
      .array(savedPlace)
      .max(20)
      .refine(
        (places) =>
          new Set(places.map((place) => place.id)).size === places.length,
        "Duplicate saved places.",
      ),
  })
  .strict()
  .refine(
    (value) => new TextEncoder().encode(JSON.stringify(value)).length <= 16000,
    "Saved map details are too large. Shorten place notes or remove places.",
  );

export const settingsPatchSchema = z
  .object({
    timezone: timezone.optional(),
    quietStart: clockTime.optional(),
    quietEnd: clockTime.optional(),
    activeView: z.enum(["chat", "feed", "networks", "map"]).optional(),
    backgroundScene: z.enum(["home", "network", "custom"]).optional(),
    heroCharacter: z.enum(["cat", "agent", "none"]).optional(),
    heroAgentId: z
      .union([z.string().uuid(), z.literal(""), z.null()])
      .optional(),
    catVisits: z.boolean().optional(),
    worldMap: mapPreferencesSchema.optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Choose a setting to update.",
  );
