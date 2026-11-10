import { expect, it } from "vitest";
import { earliestWins } from "./conflict";

const code = "TK-SC001-01";

it("keeps the earliest offline scan and reports the later one in IST", () => {
  const [later, earlier] = earliestWins([
    { code, scannedAt: "2026-11-07T13:00:00.000Z", result: "Valid" },
    { code, scannedAt: "2026-11-07T12:30:00.000Z", result: "Valid" },
  ]);
  expect(earlier.result).toBe("Valid");
  expect(later.result).toBe("Already checked in at 7 Nov 2026, 6:00 PM IST");
});

it("leaves test tickets and invalid scans unchanged", () => {
  const items = earliestWins([
    { code, scannedAt: "2026-11-07T12:30:00.000Z", result: "Test ticket" },
    { code, scannedAt: "2026-11-07T13:00:00.000Z", result: "Test ticket" },
    { code: "TK-SC001-02", scannedAt: "2026-11-07T13:00:00.000Z", result: "Invalid" },
  ]);
  expect(items.map((item) => item.result)).toEqual(["Test ticket", "Test ticket", "Invalid"]);
});
