import { randomUUID } from "node:crypto";
import {
  validatePayment,
  type CreatePaymentInput,
  type Payment,
  type PaymentProvider,
  type Refund,
} from "./contract.js";
/** Test adapter only. Durable business idempotency belongs in PostgreSQL, not this Map. */
export class MockPaymentProvider implements PaymentProvider {
  private payments = new Map<string, Payment>();
  private keys = new Map<string, { signature: string; id: string }>();
  private refunds = new Map<string, { signature: string; refund: Refund }>();
  constructor(environment = process.env.NODE_ENV ?? "development") {
    if (!["development", "test"].includes(environment))
      throw new Error("Mock forbidden outside development/test");
  }
  capabilities() {
    return {
      polling: true,
      webhook: false,
      automatedRefunds: true,
      sandbox: true,
      paymentLink: false,
      cancel: false,
    };
  }
  async createPayment(input: CreatePaymentInput): Promise<Payment> {
    validatePayment(input);
    const signature = JSON.stringify([
      input.orderId,
      input.amountMinor,
      input.currency,
    ]);
    const previous = this.keys.get(input.idempotencyKey);
    if (previous) {
      if (previous.signature !== signature)
        throw new Error("Idempotency conflict");
      return this.getPayment(previous.id);
    }
    const payment: Payment = {
      id: `mock_${randomUUID()}`,
      orderId: input.orderId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: "pending",
      provider: "mock",
    };
    this.payments.set(payment.id, payment);
    this.keys.set(input.idempotencyKey, { signature, id: payment.id });
    return { ...payment };
  }
  async getPayment(id: string): Promise<Payment> {
    const p = this.payments.get(id);
    if (!p) throw new Error("Payment not found");
    return { ...p };
  }
  async simulateResult(
    id: string,
    status: "paid" | "failed",
  ): Promise<Payment> {
    if (!["paid", "failed"].includes(status)) throw new Error("Invalid result");
    const p = this.payments.get(id);
    if (!p) throw new Error("Payment not found");
    if (p.status === status) return { ...p }; // Explicit repeated confirmation is idempotent.
    if (p.status !== "pending") throw new Error("Invalid transition");
    const next = { ...p, status };
    this.payments.set(id, next);
    return { ...next };
  }
  async refundPayment(input: {
    paymentId: string;
    amountMinor: number;
    idempotencyKey: string;
  }): Promise<Refund> {
    if (
      !input ||
      typeof input.idempotencyKey !== "string" ||
      !input.idempotencyKey.trim()
    )
      throw new Error("Refund key required");
    const signature = JSON.stringify([input.paymentId, input.amountMinor]);
    const previous = this.refunds.get(input.idempotencyKey);
    if (previous) {
      if (previous.signature !== signature)
        throw new Error("Idempotency conflict");
      return { ...previous.refund };
    }
    const p = this.payments.get(input.paymentId);
    if (!p) throw new Error("Payment not found");
    if (p.status !== "paid" || input.amountMinor !== p.amountMinor)
      throw new Error("Only full paid-payment refunds are supported");
    const refund: Refund = {
      id: `mock_refund_${randomUUID()}`,
      paymentId: p.id,
      amountMinor: p.amountMinor,
      status: "refunded",
    };
    this.payments.set(p.id, { ...p, status: "refunded" });
    this.refunds.set(input.idempotencyKey, { signature, refund });
    return { ...refund };
  }
  async verifyAndParseWebhook(): Promise<never> {
    throw new Error("Mock accepts no external notifications");
  }
}
