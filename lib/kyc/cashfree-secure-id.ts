import "server-only";
import { KycError } from "./model";
import { randomUUID } from "node:crypto";
import { maskLast4, nameMatch, type Check } from "./model";
import type { KycProvider } from "./provider";
export class CashfreeSecureId implements KycProvider {
  readonly mode = "cashfree" as const;
  private async request(path: string, body?: Record<string, unknown>) {
    const env = process.env.CASHFREE_SECURE_ID_ENV || "sandbox";
    if (env !== "sandbox" && env !== "production")
      throw new KycError("Verification settings need attention. Please contact support.");
    const host = env === "production" ? "api.cashfree.com" : "sandbox.cashfree.com";
    try {
      const response = await fetch(`https://${host}/verification${path}`, {
        method: body ? "POST" : "GET",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "Content-Type": "application/json",
          "x-client-id": process.env.CASHFREE_SECURE_ID_CLIENT_ID!,
          "x-client-secret": process.env.CASHFREE_SECURE_ID_CLIENT_SECRET!,
          "x-api-version": "2023-12-18",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw new KycError();
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || Array.isArray(result)) throw new KycError();
      return result as Record<string, unknown>;
    } catch {
      throw new KycError("The verification service is busy. Please try again shortly.");
    }
  }
  private ref(data: Record<string, unknown>): string {
    const value = String(data.reference_id ?? "");
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value))
      throw new KycError("Verification could not be confirmed. Please try again.");
    return value;
  }
  private person(value: unknown): string {
    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.length > 150 ||
      /[\x00-\x1f]|[A-Z]{5}\d{4}[A-Z]|\d{6,}/i.test(value)
    )
      throw new KycError("The name on the records could not be checked.");
    return value.trim();
  }
  async pan(number: string, name: string): Promise<Check> {
    const result = await this.request("/pan", { pan: number, name });
    const valid = result.valid === true && result.pan_status === "VALID";
    const registeredName = valid ? this.person(result.registered_name) : undefined;
    return {
      completed: true,
      passed: valid,
      mode: this.mode,
      ref: this.ref(result),
      last4: maskLast4(number),
      name: registeredName,
      score: registeredName ? nameMatch(name, registeredName) : 0,
    };
  }
  async gstin(number: string, name: string): Promise<Check> {
    const result = await this.request("/gstin", { GSTIN: number, business_name: name });
    return {
      completed: true,
      passed: result.valid === true && result.gst_in_status === "Active",
      mode: this.mode,
      ref: this.ref(result),
      last4: maskLast4(number),
    };
  }
  async bank(number: string, ifsc: string, name: string): Promise<Check> {
    const result = await this.request("/bank-account/sync", {
      bank_account: number,
      ifsc,
      name,
      verification_id: randomUUID(),
    });
    const valid = result.account_status === "VALID";
    const holder = valid ? this.person(result.name_at_bank) : undefined;
    return {
      completed: true,
      passed: valid,
      mode: this.mode,
      ref: this.ref(result),
      last4: maskLast4(number),
      ifsc,
      name: holder,
      score: holder ? nameMatch(name, holder) : 0,
    };
  }
  async startAadhaar(returnUrl: string) {
    const ref = randomUUID();
    const result = await this.request("/digilocker", {
      verification_id: ref,
      document_requested: ["AADHAAR"],
      redirect_url: returnUrl,
      user_flow: "signup",
    });
    const url = new URL(String(result.url ?? ""));
    if (
      url.protocol !== "https:" ||
      !["verification.cashfree.com", "verification-test.cashfree.com"].includes(url.hostname) ||
      url.username ||
      url.password
    )
      throw new KycError("The secure sign-in link could not be created.");
    return { ref, url: url.toString() };
  }
  async aadhaar(ref: string): Promise<Check> {
    const query = `?verification_id=${encodeURIComponent(ref)}`;
    const status = await this.request(`/digilocker${query}`);
    if (status.status !== "AUTHENTICATED")
      throw new KycError("Please finish the DigiLocker step, then check again.");
    const data = await this.request(`/digilocker/document/AADHAAR${query}`);
    const number = String(data.aadhaar_number ?? "").replace(/[\s-]/g, "");
    if (!/^(?:X{8}|\d{8})\d{4}$/i.test(number))
      throw new KycError("Aadhaar could not be confirmed. Please try again.");
    return { completed: true, passed: true, mode: this.mode, ref, last4: number.slice(-4) };
  }
  async selfie(): Promise<Check> {
    // Live biometric capture is provider-specific. Still images always go to manual review.
    throw new KycError("Please upload a selfie below for the verification team to check.");
  }
}
