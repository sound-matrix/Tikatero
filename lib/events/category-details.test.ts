import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { categoryDetailsSchemas, categoryFields, missingCategoryDetails } from "./category-details";
import { categories, emptyValues } from "./model";
import { stepPayload, valuesSchema } from "./validation";

describe("category details", () => {
  it("keeps the TypeScript and SQL category keys in sync", () => {
    const sql = readFileSync(
      new URL(
        "../../supabase/migrations/20261112180000_event_category_details.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const rules = sql.split("select case p_category")[1].split("else array[]::text[]")[0];
    const allowed = Object.fromEntries(
      [...rules.matchAll(/when '([^']+)' then array\[([^\]]+)\]/g)].map(([, category, keys]) => [
        category,
        [...keys.matchAll(/'([^']+)'/g)].map(([, key]) => key).sort(),
      ]),
    );
    expect(allowed).toEqual(
      Object.fromEntries(
        categories.map((category) => [category, Object.keys(categoryFields[category]).sort()]),
      ),
    );
  });

  it("allows empty drafts for every category and strips blank and unknown answers", () => {
    for (const category of categories)
      expect(categoryDetailsSchemas[category].parse({})).toEqual({});
    const details = categoryDetailsSchemas.Concert.parse({
      lineup: [{ name: "  Mira  ", role: " Singer ", time: " 19:00 ", unknown: "drop" }, {}],
      genre: "  ",
      age_limit: " all ",
      languages: [" Telugu ", "  ", " English "],
      certificate: true,
    });
    expect(details).toEqual({
      lineup: [{ name: "Mira", role: "Singer", time: "19:00" }],
      age_limit: "all",
      languages: ["Telugu", "English"],
    });
    expect(categoryDetailsSchemas.Comedy.parse(details)).toEqual({
      age_limit: "all",
      languages: ["Telugu", "English"],
    });
    expect(categoryDetailsSchemas.Conference.parse({ certificate: false })).toEqual({
      certificate: false,
    });
  });

  it("checks limits, times, choices and answer types", () => {
    const { Concert, Conference, Other, Workshop } = categoryDetailsSchemas;
    expect(Concert.safeParse({ lineup: [{ time: "24:00" }] }).success).toBe(false);
    expect(Concert.safeParse({ age_limit: "15+" }).success).toBe(false);
    expect(Concert.safeParse({ genre: "🎵".repeat(120) }).success).toBe(true);
    expect(Concert.safeParse({ genre: "🎵".repeat(121) }).success).toBe(false);
    expect(Concert.safeParse({ languages: Array(21).fill("Telugu") }).success).toBe(false);
    expect(Conference.safeParse({ speakers: [{ about: "x".repeat(1001) }] }).success).toBe(false);
    expect(Workshop.safeParse({ materials_included: "yes" }).success).toBe(false);
    expect(
      Other.safeParse({ extra: Array(6).fill({ label: "Place", value: "Hall" }) }).success,
    ).toBe(false);
    expect(Other.safeParse({ extra: [{ label: "x".repeat(41), value: "Hall" }] }).success).toBe(
      false,
    );
    expect(Other.safeParse({ extra: [{ label: "Place", value: "x".repeat(301) }] }).success).toBe(
      false,
    );
    expect(Other.safeParse([]).success).toBe(false);
  });

  it("reports only the missing answers required to publish", () => {
    const missing = (
      category: (typeof categories)[number],
      details: Record<string, unknown> = {},
    ) =>
      missingCategoryDetails(category, categoryDetailsSchemas[category].parse(details)).map(
        ({ key }) => key,
      );
    expect(missing("Concert")).toEqual([]);
    expect(missing("Festival party")).toEqual(["age_limit"]);
    expect(missing("Comedy", { comedians: [{ name: "   " }] })).toEqual(["comedians", "age_limit"]);
    expect(missing("Comedy", { comedians: [{ name: "Mira" }], age_limit: "all" })).toEqual([]);
    expect(missing("Workshop")).toEqual(["trainer"]);
    expect(missing("Sports")).toEqual(["sport"]);
    expect(missing("Other")).toEqual(["event_kind"]);
    expect(missing("Wedding / Private")).toEqual([]);
  });

  it("sends clean answers and supports an explicit public wedding", () => {
    const wedding = {
      ...emptyValues(),
      category: "Wedding / Private",
      details: { hosts: "  Maya  " },
    };
    expect(stepPayload(valuesSchema.parse({ ...wedding, isUnlisted: undefined }), 0)).toMatchObject(
      {
        details: { hosts: "Maya" },
        is_unlisted: true,
      },
    );
    expect(stepPayload(valuesSchema.parse(wedding), 0)).toMatchObject({ is_unlisted: false });
    expect(valuesSchema.safeParse({ ...emptyValues(), isUnlisted: true }).success).toBe(false);
  });
});
