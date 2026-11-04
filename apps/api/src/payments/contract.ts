export interface CreatePaymentInput {
  orderId: string;
  amountMinor: number;
  currency: "KZT";
  idempotencyKey: string;
}
export interface Payment {
  id: string;
  orderId: string;
  amountMinor: number;
  currency: "KZT";
  status: "pending" | "paid" | "failed" | "refunded";
  provider: "mock";
}
export interface Refund {
  id: string;
  paymentId: string;
  amountMinor: number;
  status: "refunded";
}
export interface PaymentCapabilities {
  polling: boolean;
  webhook: boolean;
  automatedRefunds: boolean;
  sandbox: boolean;
  paymentLink: boolean;
  cancel: boolean;
}
export interface PaymentProvider {
  capabilities(): PaymentCapabilities;
  createPayment(input: CreatePaymentInput): Promise<Payment>;
  getPayment(id: string): Promise<Payment>;
  refundPayment(input: {
    paymentId: string;
    amountMinor: number;
    idempotencyKey: string;
  }): Promise<Refund>;
}
export function validatePayment(input: CreatePaymentInput): void {
  if (
    !input ||
    typeof input.orderId !== "string" ||
    !input.orderId.trim() ||
    typeof input.idempotencyKey !== "string" ||
    !input.idempotencyKey.trim()
  )
    throw new Error("Order and idempotency key required");
  if (
    input.currency !== "KZT" ||
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor <= 0
  )
    throw new Error("Invalid money");
}
