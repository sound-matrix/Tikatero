import "server-only";
import type { PaymentProvider, ProviderOrder, ProviderRefund } from "./model";
export class MockPayment implements PaymentProvider {
  readonly mode = "mock" as const;
  async create(order: ProviderOrder) {
    return { sessionId: order.id };
  }
  async get(order: ProviderOrder) {
    return { state: "pending" as const, amount: order.total_paise, currency: "INR" };
  }
  async refund(input: ProviderRefund) {
    return { cfRefundId: `test_${input.refundId}`, status: "processed" as const };
  }
}
