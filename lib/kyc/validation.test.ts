import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { detailsInput, offlineLast4 } from "./validation";
it("requires a valid phone and rejects ID numbers in free text", () => {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    displayName: "Riverfront",
    legalName: "Alex Shah",
    phone: "+91 98765 43210",
    type: "individual",
    city: "Pune",
  }))
    data.set(key, value);
  expect(detailsInput(data).city).toBe("Pune");
  data.set("legalName", ["ABCDE", "1234", "F"].join(""));
  expect(() => detailsInput(data)).toThrow("keep ID");
});
it("offline XML extracts only a masked suffix, never expands entities or retains raw XML", async () => {
  const data = new FormData();
  data.set(
    "xml",
    new File(
      ['<OfflinePaperlessKyc referenceId="123420261029120000"><UidData /></OfflinePaperlessKyc>'],
      "offline.xml",
    ),
  );
  expect(await offlineLast4(data.get("xml"))).toBe("1234");
  await expect(
    offlineLast4(
      new File(
        ['<!DOCTYPE unsafe><OfflinePaperlessKyc referenceId="123420261029120000"/>'],
        "offline.xml",
      ),
    ),
  ).rejects.toThrow("offline XML");
  await expect(offlineLast4(new File(["<not-aadhaar/>"], "other.xml"))).rejects.toThrow();
});
