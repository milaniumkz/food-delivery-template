import test from "node:test";
import assert from "node:assert/strict";
import { MockPaymentProvider } from "../../dist/payments/mock.js";
import { KaspiPaymentProvider } from "../../dist/payments/kaspi.js";
import { loadConfig } from "../../dist/config.js";
const input = {
  orderId: "demo",
  amountMinor: 249000,
  currency: "KZT",
  idempotencyKey: "one",
};
test("typed mock preserves money/idempotency and immutable snapshots", async () => {
  const p = new MockPaymentProvider("test");
  const first = await p.createPayment(input);
  first.status = "paid";
  const parallel = await Promise.all(
    Array.from({ length: 10 }, () => p.createPayment(input)),
  );
  assert.equal(new Set(parallel.map((x) => x.id)).size, 1);
  assert.equal(parallel[0].status, "pending");
  await assert.rejects(
    p.createPayment({ ...input, amountMinor: 250000 }),
    /conflict/,
  );
  for (const amountMinor of [0, -1, 1.2, NaN, Number.MAX_SAFE_INTEGER + 1])
    await assert.rejects(p.createPayment({ ...input, amountMinor }), /money/);
  await assert.rejects(p.createPayment({ ...input, currency: "USD" }), /money/);
});
test("mock full refund is explicit, repeatable and cannot refund twice", async () => {
  const p = new MockPaymentProvider("test");
  const payment = await p.createPayment(input);
  const refund = {
    paymentId: payment.id,
    amountMinor: input.amountMinor,
    idempotencyKey: "refund",
  };
  await assert.rejects(p.refundPayment(refund), /paid-payment/);
  await p.simulateResult(payment.id, "paid");
  await p.simulateResult(payment.id, "paid");
  await assert.rejects(p.refundPayment({ ...refund, amountMinor: 1 }), /full/);
  const rs = await Promise.all(
    Array.from({ length: 10 }, () => p.refundPayment(refund)),
  );
  assert.equal(new Set(rs.map((x) => x.id)).size, 1);
  await assert.rejects(
    p.refundPayment({ ...refund, idempotencyKey: "different" }),
    /paid-payment/,
  );
  await assert.rejects(
    p.refundPayment({ ...refund, amountMinor: 1 }),
    /conflict/,
  );
  await assert.rejects(p.simulateResult(payment.id, "paid"), /transition/);
  assert.equal((await p.getPayment(payment.id)).status, "refunded");
});
test("failed mock payments remain terminal; external notifications/Kaspi disabled", async () => {
  const p = new MockPaymentProvider("test");
  const payment = await p.createPayment(input);
  await p.simulateResult(payment.id, "failed");
  await assert.rejects(p.simulateResult(payment.id, "paid"), /transition/);
  await assert.rejects(p.verifyAndParseWebhook(), /no external/);
  assert.deepEqual(p.capabilities(), {
    polling: true,
    webhook: false,
    automatedRefunds: true,
    sandbox: true,
    paymentLink: false,
    cancel: false,
  });
  assert.throws(() => new MockPaymentProvider("production"), /forbidden/);
  assert.throws(() => new KaspiPaymentProvider(), /disabled/);
});
test("startup rejects production, Kaspi, missing DB and invalid port without exposing secrets", () => {
  const base = {
    AUTH_KEY: "a".repeat(64),
    DATABASE_URL: "postgresql://local:secret@localhost/db",
  };
  assert.equal(loadConfig(base).port, 3001);
  for (const env of [
    {},
    { ...base, NODE_ENV: "production" },
    { ...base, PAYMENT_PROVIDER: "kaspi" },
    { ...base, PORT: "NaN" },
    { ...base, PORT: "0" },
    { DATABASE_URL: "https://secret.invalid" },
  ]) {
    assert.throws(
      () => loadConfig(env),
      (error) =>
        !error.message.includes("local:secret") &&
        !error.message.includes("secret.invalid"),
    );
  }
});
