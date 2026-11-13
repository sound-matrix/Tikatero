"use client";

import { useId } from "react";
import {
  allowsUnlisted,
  categoryFields,
  isTextItem,
  privateEventLabel,
  type CategoryDetails,
} from "@/lib/events/category-details";
import type { Category } from "@/lib/events/model";

const fieldClass = "min-h-12 w-full rounded-xl border border-line bg-white px-3 text-ink";

function TextInput({
  field,
  value,
  onChange,
  describedBy,
}: {
  field: { label: string; kind: "text" | "long" | "time"; max: number };
  value: string;
  onChange: (value: string) => void;
  describedBy?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="block font-semibold">{field.label}</span>
      {field.kind === "long" ? (
        <textarea
          className={`${fieldClass} py-3`}
          rows={3}
          maxLength={field.max}
          value={value}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className={fieldClass}
          type={field.kind === "time" ? "time" : "text"}
          maxLength={field.max}
          value={value}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

export function CategoryDetailsFields({
  category,
  details,
  isUnlisted,
  onDetails,
  onUnlisted,
}: {
  category: Category;
  details: CategoryDetails;
  isUnlisted: boolean;
  onDetails: (details: CategoryDetails) => void;
  onUnlisted: (value: boolean) => void;
}) {
  const groupId = useId();
  function update(key: string, value: CategoryDetails[string] | undefined) {
    const next = { ...details };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onDetails(next);
  }
  return (
    <section
      aria-labelledby={`${groupId}-heading`}
      className="space-y-5 rounded-2xl border border-line p-4 sm:p-5"
    >
      <h3 id={`${groupId}-heading`} className="text-lg font-bold">
        More about your {category.toLowerCase()}
      </h3>
      {Object.entries(categoryFields[category]).map(([key, field]) => {
        const value = details[key];
        const id = `event-detail-${key}`;
        const hint = field.publishMessage ? `${id}-hint` : undefined;
        const rowList = Array.isArray(value) ? value : [];
        return (
          <div key={key} id={id} tabIndex={-1} className="scroll-mt-24 space-y-2">
            {field.kind === "list" ? (
              <fieldset className="min-w-0 space-y-3" aria-describedby={hint}>
                <legend className="font-semibold">{field.label}</legend>
                {rowList.map((row, index) => {
                  const updateRow = (next: (typeof rowList)[number]) =>
                    update(
                      key,
                      rowList.map((item, rowIndex) => (rowIndex === index ? next : item)),
                    );
                  return (
                    <div key={index} className="space-y-3 rounded-xl bg-soft p-3">
                      {isTextItem(field.item) ? (
                        <TextInput
                          field={field.item}
                          value={typeof row === "string" ? row : ""}
                          onChange={updateRow}
                        />
                      ) : (
                        Object.entries(field.item).map(([itemKey, itemField]) => (
                          <TextInput
                            key={itemKey}
                            field={itemField}
                            value={typeof row === "string" ? "" : (row[itemKey] ?? "")}
                            onChange={(answer) =>
                              updateRow({
                                ...(typeof row === "string" ? {} : row),
                                [itemKey]: answer,
                              })
                            }
                          />
                        ))
                      )}
                      <button
                        type="button"
                        className="min-h-11 rounded-lg px-3 font-semibold text-danger underline"
                        aria-label={`Remove answer ${index + 1} from ${field.label}`}
                        onClick={() =>
                          update(
                            key,
                            rowList.filter((_, rowIndex) => rowIndex !== index),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
                {rowList.length < field.max && (
                  <button
                    type="button"
                    className="min-h-11 rounded-xl border border-line px-4 font-semibold"
                    onClick={() => update(key, [...rowList, isTextItem(field.item) ? "" : {}])}
                  >
                    Add another
                  </button>
                )}
              </fieldset>
            ) : field.kind === "choice" || field.kind === "flag" ? (
              <fieldset className="min-w-0 space-y-2" aria-describedby={hint}>
                <legend className="font-semibold">{field.label}</legend>
                <div className="flex flex-wrap gap-2">
                  {[
                    ...(field.kind === "choice"
                      ? field.options
                      : ([
                          [true, "Yes"],
                          [false, "No"],
                        ] as const)),
                    [undefined, "Skip"] as const,
                  ].map(([answer, label]) => (
                    <label
                      key={label}
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-3 has-checked:border-teal has-checked:bg-teal-soft"
                    >
                      <input
                        type="radio"
                        name={`${groupId}-${key}`}
                        checked={value === answer}
                        className="accent-teal"
                        onChange={() => update(key, answer)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <TextInput
                field={field}
                value={typeof value === "string" ? value : ""}
                onChange={(answer) => update(key, answer)}
                describedBy={hint}
              />
            )}
            {hint && (
              <p id={hint} className="text-sm text-muted">
                Needed before you publish
              </p>
            )}
          </div>
        );
      })}
      {allowsUnlisted(category) && (
        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl bg-soft p-3 font-semibold">
          <input
            type="checkbox"
            className="size-5 shrink-0 accent-teal"
            checked={isUnlisted}
            onChange={(event) => onUnlisted(event.target.checked)}
          />
          {privateEventLabel}
        </label>
      )}
    </section>
  );
}
