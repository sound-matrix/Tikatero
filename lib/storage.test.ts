import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({
  bucket: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
  signed: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ storage: { from: mock.bucket } }),
}));
import {
  signUpload,
  readUploadTicket,
  putUploadChunk,
  putPrivatePdf,
  getSignedReadUrl,
  signTicketPdf,
  validateBytes,
} from "./storage";
import { storagePublicBase } from "./uploads/public-base";
import { UPLOAD_CHUNK_BYTES, MAX_DOCUMENT_BYTES, type UploadInput } from "./uploads/policy";
const id = "f1111111-1111-4111-8111-111111111111";
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const input: UploadInput = { kind: "poster", entityId: id, mime: "image/png", size: png.length };
const pdfKey = `tickets/${id}/TK-ABCDE-01.pdf`;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", crypto.randomUUID());
  mock.bucket.mockReturnValue({
    upload: mock.upload,
    download: mock.download,
    remove: mock.remove,
    createSignedUrl: mock.signed,
  });
  mock.upload.mockResolvedValue({ data: {}, error: null });
  mock.remove.mockResolvedValue({ data: [], error: null });
  mock.signed.mockResolvedValue({ data: { signedUrl: "signed-url" }, error: null });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it("builds public paths using only a valid project URL and rejects legacy URLs", () => {
  expect(storagePublicBase("https://project.supabase.co")).toBe(
    "https://project.supabase.co/storage/v1/object/public/event-media/",
  );
  expect(storagePublicBase("http://127.0.0.1:54321")).toContain("event-media/");
  for (const url of [
    "https://user:pass@project.supabase.co",
    "http://evil.test",
    "https://project.supabase.co/?q=1",
    "not-a-url",
  ])
    expect(storagePublicBase(url)).toBeNull();
});
it("signs immutable metadata for five minutes without exposing credentials", async () => {
  const signed = await signUpload(input);
  expect(signed.publicUrl).toContain("/event-media/media/poster/");
  expect(JSON.stringify(signed)).not.toContain(process.env.SUPABASE_SERVICE_ROLE_KEY);
  expect(readUploadTicket(signed.headers!["x-upload-token"]).input).toEqual(input);
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 301000);
  expect(() => readUploadTicket(signed.headers!["x-upload-token"])).toThrow("expired");
});
it("sniffs supported files and rejects MIME lies and size mismatches", () => {
  expect(() => validateBytes(input, png)).not.toThrow();
  expect(() => validateBytes(input, Buffer.from("<script>"))).toThrow("contents");
  expect(() => validateBytes(input, Buffer.concat([png, png]))).toThrow("size");
  expect(() => validateBytes({ ...input, size: 5 * 1024 * 1024 + 1 }, png)).toThrow("too big");
});
it("assembles large images in private staging before public upload and removes parts", async () => {
  const bytes = Buffer.concat([png, Buffer.alloc(UPLOAD_CHUNK_BYTES)]);
  const signed = await signUpload({ ...input, size: bytes.length });
  const ticket = readUploadTicket(signed.headers!["x-upload-token"]);
  await putUploadChunk(ticket, 0, bytes.subarray(0, UPLOAD_CHUNK_BYTES));
  expect(mock.bucket).not.toHaveBeenCalledWith("event-media");
  mock.download
    .mockResolvedValueOnce({ data: new Blob([bytes.subarray(0, UPLOAD_CHUNK_BYTES)]), error: null })
    .mockResolvedValueOnce({ data: new Blob([bytes.subarray(UPLOAD_CHUNK_BYTES)]), error: null });
  await putUploadChunk(ticket, 1, bytes.subarray(UPLOAD_CHUNK_BYTES));
  expect(mock.bucket).toHaveBeenCalledWith("event-media");
  const [path, uploaded, options] = mock.upload.mock.calls.at(-1)!;
  expect(path).toBe(signed.key);
  expect(Buffer.from(uploaded).equals(bytes)).toBe(true);
  expect(options.contentType).toBe("image/png");
  expect(mock.remove).toHaveBeenCalledWith(
    expect.arrayContaining([expect.stringContaining("upload-parts/")]),
  );
});
it("does not publish a file with missing parts", async () => {
  const signed = await signUpload({ ...input, size: UPLOAD_CHUNK_BYTES + 8 });
  mock.download.mockResolvedValue({ data: null, error: { message: "missing" } });
  await expect(
    putUploadChunk(readUploadTicket(signed.headers!["x-upload-token"]), 1, png),
  ).rejects.toThrow("missing");
  expect(mock.bucket).not.toHaveBeenCalledWith("event-media");
});
it("keeps KYC private and caps signed download URLs at five minutes", async () => {
  const signed = await signUpload({ ...input, kind: "kyc_doc" });
  expect(signed.publicUrl).toBeUndefined();
  await putUploadChunk(readUploadTicket(signed.headers!["x-upload-token"]), 0, png);
  expect(mock.bucket).toHaveBeenCalledWith("private-files");
  await getSignedReadUrl(`kyc_doc/${id}/${id}.pdf`, 300);
  expect(mock.signed).toHaveBeenCalledWith(`kyc_doc/${id}/${id}.pdf`, 300, {
    download: "verification-document.pdf",
  });
  await expect(getSignedReadUrl(`kyc_doc/${id}/${id}.pdf`, 601)).rejects.toThrow();
});
it("validates ticket PDFs before upload and issues attachment links", async () => {
  const pdf = Buffer.from("%PDF-1.7 test");
  await putPrivatePdf(pdfKey, pdf);
  expect(mock.upload).toHaveBeenCalledWith(
    pdfKey,
    pdf,
    expect.objectContaining({ contentType: "application/pdf", upsert: true }),
  );
  await signTicketPdf(pdfKey, "TK-ABCDE-01.pdf");
  expect(mock.signed).toHaveBeenCalledWith(pdfKey, 300, { download: "TK-ABCDE-01.pdf" });
  await expect(putPrivatePdf(pdfKey, png)).rejects.toThrow("invalid");
  await expect(putPrivatePdf(pdfKey, Buffer.alloc(MAX_DOCUMENT_BYTES + 1))).rejects.toThrow(
    "large",
  );
  await expect(signTicketPdf("../../bad", "TK-ABCDE-01.pdf")).rejects.toThrow();
});
