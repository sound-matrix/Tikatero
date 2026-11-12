import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey() {
  const configured = process.env.PAYOUT_BANK_ENCRYPTION_KEY?.trim();
  if (!configured || !/^[A-Za-z0-9_-]{43}$/.test(configured))
    throw new Error("Bank account storage is unavailable.");
  return Buffer.from(configured, "base64url");
}

export function encryptBankNumber(number: string, organiserId: string) {
  if (!/^\d{6,20}$/.test(number)) throw new Error("Invalid bank account number.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`tikatero/payout-bank/v1/${organiserId}`));
  const ciphertext = Buffer.concat([cipher.update(number), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptBankNumber(value: string, organiserId: string) {
  const [iv, tag, ciphertext] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAAD(Buffer.from(`tikatero/payout-bank/v1/${organiserId}`));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString();
}
