import { describe, expect, it } from "vitest";
import {
  buildUploadKey,
  validateUpload,
  validatePrivateKey,
  validateReadTtl,
  MAX_IMAGE_BYTES,
  MAX_DOCUMENT_BYTES,
  type UploadInput,
} from "./policy";
import { parsePublicBaseUrl } from "./public-base";
const id = "f1111111-1111-4111-8111-111111111111";
const fileId = "f2222222-2222-4222-8222-222222222222";
const input: UploadInput = { kind: "poster", entityId: id, mime: "image/jpeg", size: 1234 };

describe("upload policy", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])(
    "accepts %s at the image size limit",
    (mime) => {
      expect(validateUpload({ ...input, mime, size: MAX_IMAGE_BYTES }).mime).toBe(mime);
    },
  );
  it("allows PDFs only as private KYC documents", () => {
    expect(
      validateUpload({
        ...input,
        kind: "kyc_doc",
        mime: "application/pdf",
        size: MAX_DOCUMENT_BYTES,
      }).kind,
    ).toBe("kyc_doc");
    expect(() => validateUpload({ ...input, mime: "application/pdf" })).toThrow("JPG, PNG or WebP");
  });
  it.each(["image/svg+xml", "text/html", "application/octet-stream", "image/gif", "__proto__"])(
    "rejects %s",
    (mime) => {
      expect(() => validateUpload({ ...input, mime })).toThrow();
    },
  );
  it.each([0, -1, 0.5, "100", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid size %s",
    (size) => {
      expect(() => validateUpload({ ...input, size })).toThrow();
    },
  );
  it("has friendly size errors for both limits", () => {
    expect(() => validateUpload({ ...input, size: MAX_IMAGE_BYTES + 1 })).toThrow(
      "This photo is too big — please use one under 5 MB",
    );
    expect(() =>
      validateUpload({ ...input, kind: "kyc_doc", size: MAX_DOCUMENT_BYTES + 1 }),
    ).toThrow("This document is too big — please use one under 10 MB");
  });
  it.each([null, [], {}, { ...input, kind: "other" }, { ...input, entityId: "../../secret" }])(
    "rejects malformed metadata %#",
    (body) => {
      expect(() => validateUpload(body)).toThrow();
    },
  );
  it.each([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["application/pdf", "pdf"],
  ])("builds a safe key for %s", (mime, ext) => {
    const upload = validateUpload({
      ...input,
      kind: "kyc_doc",
      mime,
      entityId: id.toUpperCase(),
      filename: "../../../private.html",
    });
    expect(buildUploadKey(upload, fileId)).toBe(`kyc_doc/${id}/${fileId}.${ext}`);
  });
  it("uses a different random UUID for each key", () => {
    expect(buildUploadKey(input)).not.toBe(buildUploadKey(input));
    expect(() => buildUploadKey(input, "../bad")).toThrow();
  });
  it("only permits canonical private document keys and short read TTLs", () => {
    expect(() => validatePrivateKey(`kyc_doc/${id}/${fileId}.pdf`)).not.toThrow();
    for (const key of [
      `poster/${id}/${fileId}.png`,
      `kyc_doc/${id}/../${fileId}.pdf`,
      `kyc_doc/${id}/${fileId}.svg`,
      `kyc_doc/${id}/${fileId}.pdf?x=1`,
      "https://example.test/private.pdf",
    ])
      expect(() => validatePrivateKey(key)).toThrow();
    expect(() => validateReadTtl(1)).not.toThrow();
    expect(() => validateReadTtl(300)).not.toThrow();
    for (const ttl of [0, -1, 301, 1.5, "300"]) expect(() => validateReadTtl(ttl)).toThrow();
  });
  it("limits public image URLs to an HTTPS origin and fixed prefix", () => {
    expect(parsePublicBaseUrl("https://media.example.test/assets").href).toBe(
      "https://media.example.test/assets/",
    );
    for (const base of [
      "http://example.test",
      "https://user:pass@example.test",
      "https://example.test?query=1",
      "https://*.example.test",
      "https://example.test/#secret",
    ])
      expect(() => parsePublicBaseUrl(base)).toThrow();
  });
});
