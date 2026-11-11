// Every file in supabase/migrations must have a schema_migrations row.
// Local: node scripts/check-schema-migrations.mjs
//   (uses the running supabase_db_tikatero container, or SUPABASE_DB_URL with psql).
// Production: in the Supabase SQL editor, run
//   select version from supabase_migrations.schema_migrations order by version;
// and compare those versions to the 14-digit prefixes of supabase/migrations/*.sql.
// Do not rewrite or delete applied history.

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";

export function migrationVersions(names) {
  return names
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .map((name) => name.slice(0, 14))
    .sort();
}

export function diffVersions(files, applied) {
  const fileSet = new Set(files);
  const appliedSet = new Set(applied);
  return {
    missingInDb: files.filter((version) => !appliedSet.has(version)),
    missingOnDisk: applied.filter((version) => !fileSet.has(version)),
  };
}

function appliedVersions() {
  const sql = "select version from supabase_migrations.schema_migrations order by version";
  const output = process.env.SUPABASE_DB_URL
    ? execFileSync("psql", [process.env.SUPABASE_DB_URL, "-tA", "-c", sql], { encoding: "utf8" })
    : execFileSync(
        "docker",
        [
          "exec",
          "supabase_db_tikatero",
          "psql",
          "-U",
          "postgres",
          "-d",
          "postgres",
          "-tA",
          "-c",
          sql,
        ],
        { encoding: "utf8" },
      );
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function main() {
  const files = migrationVersions(readdirSync("supabase/migrations"));
  const applied = appliedVersions();
  const { missingInDb, missingOnDisk } = diffVersions(files, applied);
  if (missingInDb.length || missingOnDisk.length) {
    if (missingInDb.length) console.error(`Missing in schema_migrations: ${missingInDb.join(", ")}`);
    if (missingOnDisk.length)
      console.error(`Missing on disk: ${missingOnDisk.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${files.length} migrations match schema_migrations.`);
}

if (process.argv[1]?.endsWith("check-schema-migrations.mjs")) main();
