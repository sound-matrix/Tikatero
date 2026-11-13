import "server-only";
import type { PaymentGateway, ProviderOrder, ProviderRefund } from "./model";
export class MockPayment implements PaymentGateway {
  readonly name = "mock" as const;
  readonly mode = this.name;
  verifyWebhook() {
    return false;
  }
  async createOrder(order: ProviderOrder) {
    return { sessionId: order.id };
  }
  async fetchOrderStatus(order: ProviderOrder) {
    return { state: "pending" as const, amount: order.total_paise, currency: "INR" };
  }
  async refund(input: ProviderRefund) {
    return { cfRefundId: `test_${input.refundId}`, status: "processed" as const };
  }
}
