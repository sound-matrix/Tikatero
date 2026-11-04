import "server-only";
import type { PaymentProvider, ProviderOrder } from "./model";
export class MockPayment implements PaymentProvider {
  readonly mode = "mock" as const;
  async create(order: ProviderOrder) {
    return { sessionId: order.id };
  }
  async get(order: ProviderOrder) {
    return { state: "pending" as const, amount: order.total_paise, currency: "INR" };
  }
}
