import "server-only";
import { isInternationalCountry } from "./countries";
import {
  COUNTRY_LOCKED,
  documentTypes,
  KycError,
  type InternationalDetails,
  type InternationalDocument,
} from "./model";
import { field } from "./validation";
import { validatePrivateKey } from "@/lib/uploads/policy";

export function internationalDetailsInput(
  data: FormData,
  savedCountry?: string,
): InternationalDetails {
  const displayName = field(data, "displayName");
  const legalName = field(data, "legalName");
  const city = field(data, "city");
  const phone = field(data, "phone").replace(/[ ()-]/g, "");
  const country = field(data, "country").toUpperCase();
  if (savedCountry && country !== savedCountry) throw new KycError(COUNTRY_LOCKED);
  if (!isInternationalCountry(country)) throw new KycError("Choose a country outside India.");
  if (
    !displayName ||
    displayName.length > 100 ||
    !legalName ||
    legalName.length > 150 ||
    !city ||
    city.length > 80
  )
    throw new KycError("Please enter your organiser name, legal name and city.");
  if (!/^\+[1-9][0-9]{6,14}$/.test(phone))
    throw new KycError("Enter a phone number with its country code, such as +442079460123.");
  return { displayName, legalName, city, phone, country };
}

export function futureDocumentDate(value: string, today = new Date().toISOString().slice(0, 10)) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value <= today) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function internationalDocumentInput(
  data: FormData,
  saved?: InternationalDocument,
): InternationalDocument {
  const type = field(data, "documentType") as InternationalDocument["type"];
  const number = field(data, "number").replace(/[\s-]/g, "");
  const expiry = field(data, "expiry");
  if (!Object.hasOwn(documentTypes, type)) throw new KycError("Choose your ID document type.");
  if (!futureDocumentDate(expiry)) throw new KycError("Enter an expiry date in the future.");
  if (!number && saved?.type === type) return { type, last4: saved.last4, expiry };
  if (!/^[\p{L}\p{N}]{1,60}$/u.test(number)) throw new KycError("Enter a valid document number.");
  return { type, last4: Array.from(number).slice(-4).join(""), expiry };
}

export function internationalUploadKey(
  value: string,
  organiserId: string,
  applicationId: string,
  photoOnly = false,
) {
  try {
    validatePrivateKey(value);
  } catch {
    throw new KycError("Upload the requested file first.");
  }
  if (
    !value.startsWith(`kyc/${organiserId}/${applicationId}/`) ||
    (photoOnly && value.endsWith(".pdf"))
  )
    throw new KycError("Upload the requested file first.");
  return value;
}

export function internationalIdFiles(
  type: InternationalDocument["type"],
  front: string,
  back: string,
  organiserId: string,
  applicationId: string,
) {
  return {
    idFront: internationalUploadKey(front, organiserId, applicationId),
    idBack:
      type === "passport" ? undefined : internationalUploadKey(back, organiserId, applicationId),
  };
}
