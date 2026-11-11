import { expect, it } from "vitest";
import { diffVersions, migrationVersions } from "./check-schema-migrations.mjs";

it("pairs migration filenames with schema_migrations versions", () => {
  expect(
    migrationVersions(["20261111120000_security_launch.sql", "README.md", "notes.sql"]),
  ).toEqual(["20261111120000"]);
  expect(diffVersions(["20261110140100", "20261111120000"], ["20261110140100"])).toEqual({
    missingInDb: ["20261111120000"],
    missingOnDisk: [],
  });
  expect(diffVersions(["20261110140100"], ["20261110140100", "20260101000000"])).toEqual({
    missingInDb: [],
    missingOnDisk: ["20260101000000"],
  });
});
