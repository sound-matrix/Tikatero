import {
  categoryFields,
  choiceLabel,
  isTextItem,
  knownCategory,
  readCategoryDetails,
} from "@/lib/events/category-details";

export function CategoryDetailsView({
  category,
  details,
  showAge = false,
}: {
  category: string | null;
  details: unknown;
  showAge?: boolean;
}) {
  const known = knownCategory(category);
  if (!known) return null;
  const values = readCategoryDetails(category, details);
  const filled = Object.entries(categoryFields[known]).filter(
    ([key]) => Object.hasOwn(values, key) && (showAge || key !== "age_limit"),
  );
  if (!filled.length) return null;
  return (
    <dl className="mt-4 grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-2">
      {filled.map(([key, field]) => {
        const value = values[key];
        if (field.kind === "flag") {
          return (
            <div key={key} className="rounded-lg bg-teal-soft p-3">
              <dt className="font-bold text-ink">
                {value === true && (
                  <span aria-hidden="true" className="mr-1 text-teal">
                    ✓
                  </span>
                )}
                {field.label}
              </dt>
              <dd className={value === true ? "sr-only" : "text-sm text-muted"}>
                {value === true ? "Yes" : "No"}
              </dd>
            </div>
          );
        }
        return (
          <div
            key={key}
            className={`min-w-0 ${field.kind === "list" || field.kind === "long" ? "sm:col-span-2" : ""}`}
          >
            <dt className="font-bold">{field.label}</dt>
            <dd className="mt-1 whitespace-pre-wrap text-muted wrap-break-word">
              {field.kind === "list" && Array.isArray(value) ? (
                key === "agenda" ? (
                  <ol className="mt-2 space-y-3 border-l-2 border-teal/40 pl-4">
                    {value.map(
                      (row, index) =>
                        typeof row !== "string" && (
                          <li key={index}>
                            {row.time && (
                              <time
                                dateTime={row.time}
                                className="block text-sm font-bold text-ink"
                              >
                                {row.time} IST
                              </time>
                            )}
                            {row.title && <p className="font-semibold text-ink">{row.title}</p>}
                            {row.speaker && <p>{row.speaker}</p>}
                          </li>
                        ),
                    )}
                  </ol>
                ) : (
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {value.map((row, index) => (
                      <li key={index}>
                        {typeof row === "string" ? (
                          row
                        ) : key === "extra" ? (
                          <>
                            {row.label && <strong className="block text-ink">{row.label}</strong>}
                            {row.value}
                          </>
                        ) : (
                          !isTextItem(field.item) &&
                          Object.keys(field.item)
                            .flatMap((part) => {
                              const answer = row[part];
                              return answer ? [part === "time" ? `${answer} IST` : answer] : [];
                            })
                            .join(" · ")
                        )}
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                typeof value === "string" &&
                (field.kind === "choice" ? choiceLabel(field, value) : value)
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
