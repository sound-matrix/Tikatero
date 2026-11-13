import "server-only";
import type { PaymentGateway } from "./model";

export class Instamojo implements PaymentGateway {
  readonly name = "instamojo" as const;
  readonly mode = this.name;

  async createOrder(): Promise<never> {
    throw new Error("Instamojo is not configured.");
  }
  async fetchOrderStatus(): Promise<never> {
    throw new Error("Instamojo is not configured.");
  }
  verifyWebhook(): boolean {
    throw new Error("Instamojo is not configured.");
  }
  async refund(): Promise<never> {
    throw new Error("Instamojo is not configured.");
  }
}
