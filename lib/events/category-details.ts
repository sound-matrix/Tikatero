import { z } from "zod";
import { categories, type Category } from "./model";

type TextField = {
  kind: "text" | "long" | "time";
  label: string;
  max: number;
};
type Field =
  | TextField
  | { kind: "choice"; label: string; options: readonly (readonly [string, string])[] }
  | { kind: "flag"; label: string }
  | { kind: "list"; label: string; max: number; item: TextField | Record<string, TextField> };
type FieldDefinition = Field & { publishMessage?: string };

const short = (label: string, max = 120): TextField => ({ kind: "text", label, max });
const long = (label: string, max = 1000): TextField => ({ kind: "long", label, max });
const time = { kind: "time", label: "Time (IST)", max: 5 } as const;
const list = (label: string, item: Extract<Field, { kind: "list" }>["item"], max = 20) =>
  ({ kind: "list", label, item, max }) as const;
const flag = (label: string) => ({ kind: "flag", label }) as const;
const choice = (label: string, options: Extract<Field, { kind: "choice" }>["options"]) =>
  ({ kind: "choice", label, options }) as const;
const needed = <T extends Field>(field: T, publishMessage: string) => ({
  ...field,
  publishMessage,
});

const ageLimit = choice("Age limit", [
  ["all", "All ages"],
  ["12+", "12+"],
  ["16+", "16+"],
  ["18+", "18+"],
  ["21+", "21+"],
]);
const lineup = { name: short("Name"), role: short("Role"), time };
const name = { name: short("Name") };
const certificate = flag("Certificate given");
const dressCode = short("Dress code");

export const categoryFields: Record<Category, Record<string, FieldDefinition>> = {
  Concert: {
    lineup: list("Who's performing", lineup),
    genre: short("Music style"),
    age_limit: ageLimit,
    languages: list("Languages", short("Language")),
  },
  "Festival party": {
    lineup: list("Artists and DJs", lineup),
    dress_code: dressCode,
    age_limit: needed(ageLimit, "Choose an age limit before publishing."),
    food_drinks: choice("Food and drinks", [
      ["included", "Included"],
      ["sold_there", "Sold there"],
      ["none", "None"],
    ]),
  },
  Conference: {
    agenda: list("Schedule", { time, title: short("Title"), speaker: short("Speaker") }),
    speakers: list("Speakers", { ...name, about: long("About the speaker") }),
    who_for: short("Who should come"),
    certificate,
  },
  Comedy: {
    comedians: needed(list("Comedians", name), "Add at least one comedian before publishing."),
    languages: list("Language of the show", short("Language")),
    age_limit: needed(ageLimit, "Choose an age limit before publishing."),
  },
  Workshop: {
    trainer: needed(short("Taught by"), "Enter who is teaching before publishing."),
    level: choice("Level", [
      ["beginner", "Beginner"],
      ["some_experience", "Some experience"],
      ["advanced", "Advanced"],
    ]),
    bring: long("What to bring"),
    materials_included: flag("Materials included"),
    certificate,
  },
  Sports: {
    teams: list("Teams / players", name),
    sport: needed(short("Sport"), "Enter the sport before publishing."),
    format: short("Match type"),
  },
  "Wedding / Private": {
    hosts: short("Hosted by"),
    dress_code: dressCode,
    invite_note: long("Message for guests"),
  },
  Other: {
    event_kind: needed(
      short("What kind of event is it?"),
      "Enter the kind of event before publishing.",
    ),
    who_for: short("Who is it for?"),
    what_to_expect: long("What will happen?"),
    extra: list(
      "Add your own detail",
      { label: short("Label", 40), value: long("Answer", 300) },
      5,
    ),
  },
};

export const privateEventLabel = "Only people with the link can see this event";
export function allowsUnlisted(category: string) {
  return category === "Wedding / Private" || category === "Other";
}
export function knownCategory(category: string | null): Category | undefined {
  return categories.find((item) => item === category);
}

type DetailItem = string | Record<string, string>;
export type DetailValue = string | boolean | DetailItem[];
export type CategoryDetails = Record<string, DetailValue>;
type FieldSchema = z.ZodType<DetailValue | undefined>;

function textSchema(field: TextField) {
  return z
    .string()
    .trim()
    .refine((value) => [...value].length <= field.max, {
      message: `Enter up to ${field.max} characters for ${field.label.toLowerCase()}.`,
    })
    .refine((value) => field.kind !== "time" || !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value), {
      message: "Enter a valid time in IST.",
    });
}

function fieldSchema(field: FieldDefinition): FieldSchema {
  if (field.kind === "flag") return z.boolean().optional();
  if (field.kind === "choice") {
    return z
      .string()
      .trim()
      .pipe(z.enum(field.options.map(([value]) => value)))
      .optional();
  }
  if (field.kind === "list") {
    const schema = isTextItem(field.item)
      ? textSchema(field.item)
      : z.object(
          Object.fromEntries(
            Object.entries(field.item).map(([key, itemField]) => [
              key,
              textSchema(itemField).optional(),
            ]),
          ),
        );
    return z
      .array(schema, { error: `Check the answers under ${field.label}.` })
      .max(field.max, `Add up to ${field.max} answers under ${field.label}.`)
      .transform((rows) =>
        rows.flatMap<DetailItem>((row) => {
          if (typeof row === "string") return row ? [row] : [];
          const filled = Object.fromEntries(
            Object.entries(row).filter((entry): entry is [string, string] => Boolean(entry[1])),
          );
          return Object.keys(filled).length ? [filled] : [];
        }),
      )
      .optional();
  }
  return textSchema(field).optional();
}

export function isTextItem(item: TextField | Record<string, TextField>): item is TextField {
  return typeof item.kind === "string";
}

function categorySchema(fields: Record<string, FieldDefinition>) {
  return z
    .object(
      Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, fieldSchema(field)])),
    )
    .transform((values): CategoryDetails =>
      Object.fromEntries(
        Object.entries(values).filter((entry): entry is [string, DetailValue] => {
          const value = entry[1];
          return value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0);
        }),
      ),
    );
}

export const categoryDetailsSchemas: Record<
  Category,
  z.ZodType<CategoryDetails>
> = Object.fromEntries(
  categories.map((category): [Category, z.ZodType<CategoryDetails>] => [
    category,
    categorySchema(categoryFields[category]),
  ]),
) as Record<Category, z.ZodType<CategoryDetails>>;

export function readCategoryDetails(category: string | null, input: unknown): CategoryDetails {
  const known = knownCategory(category);
  if (!known) return {};
  const parsed = categoryDetailsSchemas[known].safeParse(input);
  return parsed.success ? parsed.data : {};
}

export function missingCategoryDetails(category: Category, details: CategoryDetails) {
  return Object.entries(categoryFields[category]).flatMap(([key, field]) => {
    if (!field.publishMessage) return [];
    const value = details[key];
    const present = Array.isArray(value)
      ? value.some((row) => typeof row !== "string" && row.name?.trim())
      : typeof value === "string" && value.trim();
    return present ? [] : [{ key, label: field.label, message: field.publishMessage }];
  });
}

export function choiceLabel(field: Extract<Field, { kind: "choice" }>, value: string) {
  return field.options.find(([key]) => key === value)?.[1];
}

export function ageLimitLabel(value: DetailValue | undefined) {
  return typeof value === "string" ? choiceLabel(ageLimit, value) : undefined;
}
