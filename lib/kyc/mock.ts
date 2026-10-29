import "server-only";
import { randomUUID } from "node:crypto";
import { maskLast4, nameMatch, type Check } from "./model";
import type { KycProvider } from "./provider";
// Synthetic simulation only. Never queries government records or moves money.
export class MockKycProvider implements KycProvider {
  readonly mode = "mock" as const;
  private check(extra: Partial<Check> = {}): Check {
    return {
      completed: true,
      passed: true,
      mode: this.mode,
      ref: `mock-${randomUUID()}`,
      ...extra,
    };
  }
  async pan(number: string, name: string) {
    return this.check({ last4: maskLast4(number), name, score: nameMatch(name, name) });
  }
  async gstin(number: string, name: string) {
    return this.check({ last4: maskLast4(number), name });
  }
  async bank(number: string, ifsc: string, name: string) {
    return this.check({ last4: maskLast4(number), ifsc, name, score: 100 });
  }
  async startAadhaar() {
    return { ref: `mock-${randomUUID()}` };
  }
  async aadhaar(ref: string) {
    return { ...this.check({ last4: "1234" }), ref };
  }
  async selfie() {
    return this.check({ score: 99, faceScore: 99 });
  }
}
