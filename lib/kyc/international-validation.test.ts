import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  futureDocumentDate,
  internationalDetailsInput,
  internationalDocumentInput,
  internationalIdFiles,
} from "./international-validation";
import { assertVerificationRegion, COUNTRY_LOCKED, type Application } from "./model";
import { internationalPaidTicketError, INTERNATIONAL_PAID_TICKETS } from "./paid-tickets";
import { buildUploadKey, validateFile } from "@/lib/uploads/policy";

const owner = "a7240001-0000-4000-8000-000000000001";
const application = "a7240002-0000-4000-8000-000000000002";
const front = `kyc/${owner}/${application}/a7240003-0000-4000-8000-000000000003.jpg`;
const back = `kyc/${owner}/${application}/a7240004-0000-4000-8000-000000000004.pdf`;
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
const person = {
  displayName: "Example Events",
  legalName: "Alex Rivera",
  city: "London",
  phone: "+44 20 7946 0123",
};

it("requires an ISO country outside India and saves an E.164 phone", () => {
  for (const country of ["IN", "ZZ", ""]) {
    expect(() => internationalDetailsInput(form({ ...person, country }))).toThrow("outside India");
  }
  expect(internationalDetailsInput(form({ ...person, country: "GB" }))).toMatchObject({
    country: "GB",
    phone: "+442079460123",
  });
  expect(() =>
    internationalDetailsInput(form({ ...person, country: "GB", phone: "02079460123" })),
  ).toThrow("country code");
});

it("prevents changing saved country or crossing between India and international KYC", () => {
  expect(() => internationalDetailsInput(form({ ...person, country: "FR" }), "GB")).toThrow(
    COUNTRY_LOCKED,
  );
  expect(() => assertVerificationRegion({ region: "INTL" } as Application, "IN")).toThrow(
    COUNTRY_LOCKED,
  );
  expect(() => assertVerificationRegion({ region: "IN" } as Application, "INTL")).toThrow(
    COUNTRY_LOCKED,
  );
  expect(() => assertVerificationRegion(null, "INTL")).not.toThrow();
});

it("stores only the last four characters of an ID and accepts real future dates", () => {
  const document = internationalDocumentInput(
    form({
      documentType: "passport",
      number: "EX-123456",
      expiry: "2090-01-01",
    }),
  );
  expect(document).toEqual({ type: "passport", last4: "3456", expiry: "2090-01-01" });
  expect(futureDocumentDate("2028-02-29", "2028-02-28")).toBe(true);
  expect(futureDocumentDate("2028-02-29", "2028-02-29")).toBe(false);
  expect(futureDocumentDate("2029-02-29", "2028-02-29")).toBe(false);
  expect(() =>
    internationalDocumentInput(
      form({ documentType: "passport", number: "1234", expiry: "2000-01-01" }),
    ),
  ).toThrow("in the future");
});

it("requires two sides except for passports and scopes keys to the application", () => {
  expect(internationalIdFiles("passport", front, "", owner, application)).toEqual({
    idFront: front,
    idBack: undefined,
  });
  expect(internationalIdFiles("driving_licence", front, back, owner, application)).toMatchObject({
    idBack: back,
  });
  for (const type of ["national_id", "driving_licence", "residence_permit"] as const)
    expect(() => internationalIdFiles(type, front, "", owner, application)).toThrow();
  expect(() => internationalIdFiles("passport", front, "", owner, owner)).toThrow();
});

it("allows only supported international uploads within the private 10 MB limit", () => {
  const size = 10 * 1024 * 1024;
  expect(
    buildUploadKey({
      kind: "intl_id",
      entityId: owner,
      applicationId: application,
      mime: "application/pdf",
      size,
    }),
  ).toMatch(new RegExp(`^kyc/${owner}/${application}/[a-f0-9-]+[.]pdf$`));
  expect(() => validateFile("intl_id", "image/webp", 1)).toThrow();
  expect(() => validateFile("intl_selfie", "application/pdf", 1)).toThrow();
  expect(() => validateFile("intl_id", "image/jpeg", size + 1)).toThrow("10 MB");
});

it("allows only free RSVP for international organisers", () => {
  expect(internationalPaidTicketError(true, false)).toBe(INTERNATIONAL_PAID_TICKETS);
  expect(internationalPaidTicketError(true, true, [0, 100])).toBe(INTERNATIONAL_PAID_TICKETS);
  expect(internationalPaidTicketError(true, true, [0])).toBeUndefined();
  expect(internationalPaidTicketError(false, false, [100])).toBeUndefined();
});
