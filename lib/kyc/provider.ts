import "server-only";
import type { Check } from "./model";
export interface KycProvider {
  readonly mode: "mock" | "cashfree";
  pan(number: string, name: string): Promise<Check>;
  gstin(number: string, name: string): Promise<Check>;
  bank(number: string, ifsc: string, name: string): Promise<Check>;
  startAadhaar(returnUrl: string): Promise<{ ref: string; url?: string }>;
  aadhaar(ref: string): Promise<Check>;
  selfie(): Promise<Check>;
}
