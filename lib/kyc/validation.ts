import "server-only";
import { KycError } from "./model";
import type { Details } from "./model";
export function field(data: FormData, name: string) {
  const value = data.get(name);
  if (typeof value !== "string" || value.length > 200 || /[\x00-\x1f]/.test(value))
    throw new KycError("Please check the details you entered.");
  return value.trim();
}
export function detailsInput(data: FormData): Details {
  const displayName = field(data, "displayName"),
    legalName = field(data, "legalName"),
    phone = field(data, "phone"),
    city = field(data, "city"),
    type = field(data, "type");
  if (
    !displayName ||
    displayName.length > 100 ||
    !legalName ||
    legalName.length > 150 ||
    !city ||
    city.length > 80
  )
    throw new KycError("Please enter your organiser name, legal name and city.");
  if (
    /[A-Z]{5}\d{4}[A-Z]|\d{6,}/i.test(`${displayName} ${legalName} ${city}`.replace(/[\s-]/g, ""))
  )
    throw new KycError("Please keep ID and account numbers out of names and city details.");
  if (
    !/^(?:\+91[ -]?)?[6-9][0-9 -]{9,13}$/.test(phone) ||
    phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "").length !== 10
  )
    throw new KycError("Enter a 10-digit Indian mobile number.");
  if (type !== "individual" && type !== "business")
    throw new KycError("Choose individual or business.");
  return { displayName, legalName, phone, city, type };
}
export function docKey(value: string, organiserId: string, photoOnly = false) {
  if (photoOnly && /\.pdf$/i.test(value))
    throw new KycError("Please use a JPG, PNG or WebP photo for your selfie.");
  if (
    !new RegExp(
      `^kyc_doc/${organiserId}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(jpg|png|webp|pdf)$`,
      "i",
    ).test(value)
  )
    throw new KycError("Upload a document for this organiser first.");
  return value;
}
export async function offlineLast4(file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size < 1 || file.size > 1024 * 1024)
    throw new KycError("Choose an offline XML file under 1 MB.");
  const text = await file.text();
  // No XML parser, entity expansion or document persistence. UIDAI referenceId starts
  // with the last four; only that suffix is retained. Authenticity requires review.
  if (/<!DOCTYPE|<!ENTITY/i.test(text) || !/<OfflinePaperlessKyc\b/.test(text))
    throw new KycError("Please choose an Aadhaar offline XML file.");
  const match = text.match(/\breferenceId\s*=\s*["'](\d{4})\d{10,}["']/);
  if (!match) throw new KycError("The masked Aadhaar details could not be read.");
  return match[1];
}
