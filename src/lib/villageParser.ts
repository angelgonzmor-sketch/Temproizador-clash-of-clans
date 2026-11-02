import { getClashName } from "../data/clashIds";
import type { Timer } from "../types";
import { generateId } from "./utils";

export interface CategoryMeta {
  icon: string;
  label: string;
  fallback: string;
}

export const CATEGORY_META: Record<string, CategoryMeta> = {
  building: { icon: "🏗️", label: "edificios", fallback: "Edificio" },
  troop: { icon: "⚔️", label: "tropas", fallback: "Tropa" },
  spell: { icon: "🧪", label: "hechizos", fallback: "Hechizo" },
  hero: { icon: "🦸", label: "héroes", fallback: "Héroe" },
  pet: { icon: "🐾", label: "mascotas", fallback: "Mascota" },
  equipment: { icon: "🛡️", label: "equipo", fallback: "Equipo" },
  guardian: { icon: "🗡️", label: "guardianes", fallback: "Guardián" },
  helper: { icon: "🧑‍🌾", label: "ayudantes", fallback: "Ayudante" },
  research: { icon: "🔬", label: "investigaciones", fallback: "Investigación" },
  other: { icon: "⏳", label: "otros", fallback: "Elemento" },
};

export interface CategorySummary {
  category: string;
  scanned: number;
  withTimer: number;
}

export interface ParseResult {
  timers: Timer[];
  scanned: number;
  expired: number;
  categories: CategorySummary[];
  source: "export" | "legacy" | "unknown";
  error?: string;
}

export interface ParseOptions {
  now?: number;
}

const ROOT_CATEGORIES: Record<string, string> = {
  buildings: "building",
  buildings2: "building",
  traps: "building",
  traps2: "building",
  units: "troop",
  units2: "troop",
  siege_machines: "troop",
  heroes: "hero",
  heroes2: "hero",
  spells: "spell",
  pets: "pet",
  equipment: "equipment",
  guardians: "guardian",
  helpers: "helper",
  research: "research",
  upgrades: "other",
  timers: "other",
  items: "other",
};

const END_TIME_FIELDS = [
  "upgradeEndTime",
  "endTime",
  "end_time",
  "finishTime",
  "finish_time",
  "completeTime",
  "completionTime",
  "completesAt",
  "readyAt",
  "readyTime",
  "endDate",
  "finishDate",
  "end_date",
  "finish_date",
  "regenerationEndTime",
];

const REMAINING_FIELDS = [
  "remainingSeconds",
  "remaining_seconds",
  "remainingTime",
  "remaining_time",
  "timeRemaining",
  "secondsRemaining",
  "timer",
];

type JsonObject = Record<string, any>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseEpoch(value: unknown): number | null {
  const numeric = toNumber(value);
  if (numeric !== null) {
    if (numeric <= 0) return null;
    return numeric < 100_000_000_000 ? numeric * 1000 : numeric;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return null;
}

function parseRemaining(value: unknown): number | null {
  const numeric = toNumber(value);
  if (numeric !== null) {
    if (numeric <= 0) return null;
    return numeric >= 1_000_000_000 ? numeric : numeric * 1000;
  }

  if (typeof value !== "string") return null;

  const text = value.trim();
  if (text === "") return null;

  const clock = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (clock) {
    const first = Number(clock[1]);
    const second = Number(clock[2]);
    const third = clock[3] === undefined ? null : Number(clock[3]);
    const seconds = third === null ? first * 60 + second : first * 3600 + second * 60 + third;
    return seconds * 1000;
  }

  const parts = text.matchAll(
    /(\d+(?:[.,]\d+)?)\s*(días?|d|horas?|h|minutos?|min|m|segundos?|seg|s)\b/gi,
  );

  let total = 0;
  let found = false;

  for (const part of parts) {
    found = true;
    const amount = Number(part[1].replace(",", "."));
    const unit = part[2].toLowerCase();

    if (unit === "d" || unit.startsWith("dí")) {
      total += amount * 86_400_000;
    } else if (unit === "h" || unit.startsWith("hora")) {
      total += amount * 3_600_000;
    } else if (unit === "m" || unit.startsWith("min")) {
      total += amount * 60_000;
    } else {
      total += amount * 1000;
    }
  }

  return found && total > 0 ? total : null;
}

function getContainers(item: JsonObject): JsonObject[] {
  const containers: JsonObject[] = [item];

  for (const key of ["upgrade", "timer", "time", "finish", "data", "details"]) {
    if (isObject(item[key])) containers.push(item[key]);
  }

  return containers;
}

function extractTiming(
  item: JsonObject,
  baseTime: number,
  now: number,
): { endTime: number } | null {
  const containers = getContainers(item);
  let expiredEndTime: number | null = null;

  for (const container of containers) {
    for (const field of END_TIME_FIELDS) {
      if (container[field] === undefined || container[field] === null) continue;

      const endTime = parseEpoch(container[field]);
      if (endTime === null) continue;

      if (endTime > now) return { endTime };
      expiredEndTime = Math.max(expiredEndTime ?? 0, endTime);
    }
  }

  if (expiredEndTime !== null) {
    return { endTime: expiredEndTime };
  }

  for (const container of containers) {
    for (const field of REMAINING_FIELDS) {
      if (container[field] === undefined || container[field] === null) continue;

      const remaining = parseRemaining(container[field]);
      if (remaining === null) continue;

      return { endTime: baseTime + remaining };
    }
  }

  return null;
}

function extractLevel(item: JsonObject): number | undefined {
  const level = toNumber(item.lvl ?? item.level);
  if (level === null || level <= 0) return undefined;
  return Math.floor(level);
}

function extractSourceId(item: JsonObject): number | undefined {
  const id = toNumber(item.data ?? item.id);
  if (id === null || id <= 0) return undefined;
  return Math.trunc(id);
}

function pickName(
  item: JsonObject,
  sourceId: number | undefined,
  category: string,
): string {
  if (typeof item.name === "string" && item.name.trim() !== "") {
    return item.name.trim();
  }

  const mapped = getClashName(sourceId);
  if (mapped) return mapped;

  const meta = CATEGORY_META[category] ?? CATEGORY_META.other;
  return sourceId === undefined ? meta.fallback : `${meta.fallback} ${sourceId}`;
}

function emptyResult(error: string): ParseResult {
  return {
    timers: [],
    scanned: 0,
    expired: 0,
    categories: [],
    source: "unknown",
    error,
  };
}

export function parseVillageJson(raw: string, options: ParseOptions = {}): ParseResult {
  const now = options.now ?? Date.now();
  const trimmed = raw.replace(/^\uFEFF/, "").trim();

  if (trimmed === "") {
    return emptyResult("Pega un JSON antes de importar.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "formato no válido";
    return emptyResult(`JSON inválido: ${detail}`);
  }

  const root: JsonObject | null = Array.isArray(parsed)
    ? { items: parsed }
    : isObject(parsed)
      ? parsed
      : null;

  if (root === null) {
    return emptyResult("El JSON debe ser un objeto o una lista de mejoras.");
  }

  const hasKnownArray = (value: JsonObject): boolean =>
    Object.keys(ROOT_CATEGORIES).some((key) => Array.isArray(value[key]));

  let source = root;

  if (!hasKnownArray(source)) {
    for (const key of ["data", "village", "player"]) {
      const nested = source[key];
      if (isObject(nested) && hasKnownArray(nested)) {
        source = nested;
        break;
      }
    }
  }

  if (!hasKnownArray(source)) {
    return {
      timers: [],
      scanned: 0,
      expired: 0,
      categories: [],
      source: "unknown",
    };
  }

  const timestamp = parseEpoch(source.timestamp ?? root.timestamp);
  const baseTime = timestamp !== null && timestamp <= now ? timestamp : now;

  const timers: Timer[] = [];
  const seen = new Set<string>();
  const categoryStats = new Map<string, CategorySummary>();
  let scanned = 0;
  let expired = 0;
  let sawExportItem = false;

  for (const [rootKey, category] of Object.entries(ROOT_CATEGORIES)) {
    const items = source[rootKey];
    if (!Array.isArray(items)) continue;

    let stats = categoryStats.get(category);
    if (!stats) {
      stats = { category, scanned: 0, withTimer: 0 };
      categoryStats.set(category, stats);
    }

    for (const item of items) {
      if (!isObject(item)) continue;

      scanned++;
      stats.scanned++;

      const timing = extractTiming(item, baseTime, now);
      if (timing === null) continue;

      stats.withTimer++;

      if (timing.endTime <= now) {
        expired++;
        continue;
      }

      const sourceId = extractSourceId(item);
      if (sourceId !== undefined) sawExportItem = true;

      const name = pickName(item, sourceId, category);
      const level = extractLevel(item);
      const key = sourceId === undefined ? `${name}-${timing.endTime}` : `${sourceId}-${timing.endTime}`;

      if (seen.has(key)) continue;
      seen.add(key);

      const meta = CATEGORY_META[category] ?? CATEGORY_META.other;

      timers.push({
        id: generateId(),
        name,
        level,
        nextLevel:
          level !== undefined && sourceId !== undefined ? level + 1 : undefined,
        endTime: timing.endTime,
        duration: timing.endTime - now,
        icon: meta.icon,
        category,
        sourceId,
      });
    }
  }

  return {
    timers,
    scanned,
    expired,
    categories: Array.from(categoryStats.values()).filter(
      (stats) => stats.scanned > 0,
    ),
    source: sawExportItem ? "export" : "legacy",
  };
}
