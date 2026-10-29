import "server-only";
import { Cashfree } from "./cashfree";
import { MockPayment } from "./mock";
export function paymentProvider() {
  const env = process.env.CASHFREE_ENV;
  if (env && !["mock", "sandbox", "production"].includes(env))
    throw new Error("Payment environment is not configured correctly.");
  if (env === "mock" || (!env && !process.env.CASHFREE_APP_ID && !process.env.CASHFREE_SECRET_KEY))
    return new MockPayment();
  if (!process.env.CASHFREE_APP_ID || !process.env.CASHFREE_SECRET_KEY)
    throw new Error("Payment credentials are not configured.");
  return new Cashfree();
}
