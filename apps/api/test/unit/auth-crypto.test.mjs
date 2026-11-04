import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  hashPassword,
  verifyPassword,
  encryptSecret,
  decryptSecret,
  totp,
  verifyTotp,
  base32,
} from "../../dist/auth-crypto.js";
test("password KDF uses fresh salt and rejects wrong passwords", async () => {
  const password = randomBytes(24).toString("hex"),
    a = await hashPassword(password),
    b = await hashPassword(password);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword(password + "!", a), false);
  assert.equal(await verifyPassword(password, "bad"), false);
});
test("TOTP matches RFC 6238 SHA-1 vectors and rejects replay", () => {
  const secret = Buffer.from("12345678901234567890").toString("hex");
  for (const [seconds, expected] of [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
  ])
    assert.equal(totp(secret, seconds * 1000, 8).code, expected);
  const current = totp(secret, 1234567890000);
  assert.equal(
    verifyTotp(secret, current.code, 0n, 1234567890000),
    BigInt(current.counter),
  );
  assert.equal(
    verifyTotp(secret, current.code, BigInt(current.counter), 1234567890000),
    null,
  );
  assert.equal(base32(Buffer.from("foobar").toString("hex")), "MZXW6YTBOI");
});
test("MFA secrets are authenticated encrypted and require configured AUTH_KEY", () => {
  const old = process.env.AUTH_KEY;
  process.env.AUTH_KEY = randomBytes(32).toString("hex");
  try {
    const secret = randomBytes(20).toString("hex"),
      a = encryptSecret(secret),
      b = encryptSecret(secret);
    assert.notEqual(a, b);
    assert.equal(decryptSecret(a), secret);
    assert.ok(!a.includes(secret));
    assert.throws(() =>
      decryptSecret(a.slice(0, -2) + (a.endsWith("00") ? "01" : "00")),
    );
    delete process.env.AUTH_KEY;
    assert.throws(() => encryptSecret(secret), /AUTH_KEY/);
  } finally {
    if (old === undefined) delete process.env.AUTH_KEY;
    else process.env.AUTH_KEY = old;
  }
});
