import { describe, expect, it } from "vitest";
import { parseVillageJson } from "./villageParser";

const NOW = 1_793_659_054_000;

const EXPORT_VILLAGE = {
  tag: "#TEST",
  timestamp: 1_793_659_054,
  buildings: [{ data: 1000008, lvl: 21 }],
  buildings2: [
    { data: 1000036, lvl: 9, timer: 404034 },
    { data: 1000082, lvl: 2, timer: 231217 },
  ],
  units: [{ data: 4000065, lvl: 3, timer: 283997 }],
  heroes: [
    { data: 28000000, lvl: 95, timer: 3004 },
    { data: 28000001, lvl: 90, timer: 57027 },
    { data: 28000002, lvl: 70, timer: 24770 },
    { data: 28000004, lvl: 45, timer: 24641 },
    { data: 28000006, lvl: 85, timer: 3052 },
    { data: 28000007, lvl: 40, timer: 147055 },
  ],
  helpers: [{ data: 93000000, lvl: 8, helper_cooldown: 71712 }],
};

describe("parseVillageJson", () => {
  it("detecta las 9 mejoras del formato data/lvl/timer", () => {
    const result = parseVillageJson(JSON.stringify(EXPORT_VILLAGE), { now: NOW });

    expect(result.error).toBeUndefined();
    expect(result.source).toBe("export");
    expect(result.timers).toHaveLength(9);
    expect(result.expired).toBe(0);

    const storage = result.timers.find((timer) => timer.sourceId === 1000036);
    expect(storage).toMatchObject({
      name: "Almacén de Elixir",
      level: 9,
      nextLevel: 10,
      endTime: NOW + 404034 * 1000,
      category: "building",
    });

    const hero = result.timers.find((timer) => timer.sourceId === 28000007);
    expect(hero).toMatchObject({
      name: "Duque Dragón",
      level: 40,
      nextLevel: 41,
      endTime: NOW + 147055 * 1000,
      category: "hero",
    });
  });

  it("ignora ayudantes con helper_cooldown y elementos sin timer", () => {
    const result = parseVillageJson(JSON.stringify(EXPORT_VILLAGE), { now: NOW });
    const ids = result.timers.map((timer) => timer.sourceId);

    expect(ids).not.toContain(93000000);
    expect(ids).not.toContain(1000008);
  });

  it("mantiene compatibilidad con el formato antiguo", () => {
    const legacy = {
      buildings: [
        {
          name: "Ayuntamiento",
          level: 14,
          upgradeEndTime: NOW + 3 * 86_400_000,
        },
      ],
      heroes: [
        {
          name: "Rey Bárbaro",
          level: 75,
          regenerationEndTime: NOW + 45 * 60_000,
        },
      ],
      research: [
        {
          name: "Gólem",
          level: 11,
          remainingSeconds: 3600,
        },
      ],
    };

    const result = parseVillageJson(JSON.stringify(legacy), { now: NOW });

    expect(result.source).toBe("legacy");
    expect(result.timers).toHaveLength(3);
    expect(result.timers.find((timer) => timer.name === "Gólem")?.endTime).toBe(
      NOW + 3_600_000,
    );
  });

  it("acepta fechas ISO y timestamps en segundos", () => {
    const json = {
      timestamp: Math.floor(NOW / 1000),
      buildings: [
        {
          name: "Mina de Oro",
          level: 12,
          endTime: Math.floor((NOW + 7_200_000) / 1000),
        },
        {
          name: "Almacén de Oro",
          level: 12,
          finishDate: new Date(NOW + 10_800_000).toISOString(),
        },
      ],
    };

    const result = parseVillageJson(JSON.stringify(json), { now: NOW });

    expect(result.timers).toHaveLength(2);
    expect(result.timers[0].endTime).toBe(NOW + 7_200_000);
    expect(result.timers[1].endTime).toBe(NOW + 10_800_000);
  });

  it("descarta mejoras ya terminadas", () => {
    const json = {
      timestamp: Math.floor((NOW - 5_000_000) / 1000),
      buildings2: [
        { data: 1000036, lvl: 9, timer: 3600 },
        { data: 1000082, lvl: 2, timer: 4200 },
      ],
    };

    const result = parseVillageJson(JSON.stringify(json), { now: NOW });

    expect(result.timers).toHaveLength(0);
    expect(result.expired).toBe(2);
  });

  it("elimina duplicados dentro del mismo JSON", () => {
    const json = {
      timestamp: Math.floor(NOW / 1000),
      buildings2: [
        { data: 1000036, lvl: 9, timer: 3600 },
        { data: 1000036, lvl: 9, timer: 3600 },
      ],
    };

    const result = parseVillageJson(JSON.stringify(json), { now: NOW });

    expect(result.timers).toHaveLength(1);
  });

  it("informa de JSON inválido y de formatos desconocidos", () => {
    expect(parseVillageJson("{ roto", { now: NOW }).error).toContain(
      "JSON inválido",
    );

    const unknown = parseVillageJson(JSON.stringify({ foo: "bar" }), {
      now: NOW,
    });
    expect(unknown.timers).toHaveLength(0);
    expect(unknown.source).toBe("unknown");
  });

  it("cuenta los elementos revisados y las categorías", () => {
    const result = parseVillageJson(JSON.stringify(EXPORT_VILLAGE), { now: NOW });
    const categories = Object.fromEntries(
      result.categories.map((category) => [category.category, category.withTimer]),
    );

    expect(result.scanned).toBe(11);
    expect(categories.building).toBe(2);
    expect(categories.troop).toBe(1);
    expect(categories.hero).toBe(6);
  });
});
