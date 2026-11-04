import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function authKey() {
  const key = process.env.AUTH_KEY;
  if (!key || !/^[0-9a-f]{64}$/i.test(key))
    throw new Error("AUTH_KEY must be a generated 32-byte hex secret");
  return Buffer.from(key, "hex");
}
export const keyedDigest = (value: string) =>
  createHmac("sha256", authKey()).update(value).digest("hex");
export function equalSecret(a: string, b: string) {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = await new Promise<Buffer>((ok, fail) =>
    scrypt(
      password,
      salt,
      64,
      { N: 65536, r: 8, p: 2, maxmem: 128 * 1024 * 1024 },
      (error, key) => (error ? fail(error) : ok(key)),
    ),
  );
  return `${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [salt, expected] = encoded.split(":");
  if (
    !/^[0-9a-f]{32}$/.test(salt ?? "") ||
    !/^[0-9a-f]{128}$/.test(expected ?? "")
  )
    return false;
  const hash = await new Promise<Buffer>((ok, fail) =>
    scrypt(
      password,
      salt,
      64,
      { N: 65536, r: 8, p: 2, maxmem: 128 * 1024 * 1024 },
      (error, key) => (error ? fail(error) : ok(key)),
    ),
  );
  return equalSecret(hash.toString("hex"), expected);
}
export function encryptSecret(secret: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", authKey(), iv);
  const body = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    body.toString("hex"),
  ].join(".");
}
export function decryptSecret(encoded: string) {
  const [iv, tag, body] = encoded.split(".");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    authKey(),
    Buffer.from(iv, "hex"),
  );
  cipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([
    cipher.update(Buffer.from(body, "hex")),
    cipher.final(),
  ]).toString("utf8");
}
export function totp(secretHex: string, timeMs = Date.now(), digits = 6) {
  const counter = Math.floor(timeMs / 30000),
    buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", Buffer.from(secretHex, "hex"))
    .update(buffer)
    .digest();
  const offset = mac[mac.length - 1] & 15;
  return {
    code: String(
      (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits,
    ).padStart(digits, "0"),
    counter,
  };
}
export function verifyTotp(
  secret: string,
  code: string,
  lastCounter: bigint,
  timeMs = Date.now(),
) {
  for (const delta of [-30000, 0, 30000]) {
    const candidate = totp(secret, timeMs + delta);
    if (
      BigInt(candidate.counter) > lastCounter &&
      equalSecret(candidate.code, code)
    )
      return BigInt(candidate.counter);
  }
  return null;
}
export function base32(hex: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0,
    value = 0,
    result = "";
  for (const byte of Buffer.from(hex, "hex")) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
