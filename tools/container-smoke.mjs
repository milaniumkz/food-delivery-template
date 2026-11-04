import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { once } from "node:events";
import { createRequire } from "node:module";
import sharp from "sharp";
import {
  hashPassword,
  encryptSecret,
  totp,
} from "../apps/api/dist/auth-crypto.js";
class SmokeFailure extends Error {}
const check = (value, message) => {
  if (!value) throw new SmokeFailure(message);
};
const require = createRequire(
    new URL("../apps/api/package.json", import.meta.url),
  ),
  { PrismaClient } = require("@prisma/client"),
  { PrismaPg } = require("@prisma/adapter-pg");
check(
  process.env.DATABASE_URL,
  "Run make bootstrap before the container smoke",
);
let root;
try {
  root = new URL(process.env.DATABASE_URL);
} catch {
  throw new SmokeFailure("Expected a local PostgreSQL URL");
}
check(
  ["postgres:", "postgresql:"].includes(root.protocol) &&
    ["127.0.0.1", "localhost", "[::1]"].includes(root.hostname) &&
    ["test", "development"].includes(process.env.NODE_ENV ?? "development"),
  "Only local disposable databases are allowed",
);
const tag = randomBytes(8).toString("hex"),
  name = "food_container_" + tag,
  apiName = "food-container-api-" + tag,
  imageTag = "food-delivery-template:demo",
  volumes = [],
  url = new URL(root);
url.pathname = "/" + name;
// A distinct temporary key never changes the developer's .env or owner credentials.
process.env.AUTH_KEY = randomBytes(32).toString("hex");
const env = {
  ...process.env,
  NODE_ENV: "development",
  PAYMENT_PROVIDER: "mock",
  DATABASE_URL: url.toString(),
  BRAND_CONFIG: "/app/brands/demo/brand.json",
  API_HOST: "127.0.0.1",
  SMS_DIRECTORY: "/app/.local/sms",
  MEDIA_DIRECTORY: "/app/.local/media",
  REDIS_URL: "redis://127.0.0.1:6379",
};
const connect = (connectionString) =>
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      connectionTimeoutMillis: 3000,
      max: 2,
    }),
  });
const admin = connect(root.toString());
let db,
  created = false,
  container = false;
function docker(args, strict = true) {
  const result = spawnSync("docker", args, {
    env,
    encoding: "utf8",
    timeout: 60000,
  });
  if (strict)
    check(result.status === 0, "Docker smoke command failed: " + args[0]);
  return result.stdout?.trim() ?? "";
}
async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((ok) => server.close(ok));
  return port;
}
async function main() {
  const image = docker(["image", "inspect", imageTag, "--format", "{{.Id}}"]);
  check(
    /^sha256:[0-9a-f]{64}$/.test(image),
    "Expected an immutable local image ID",
  );
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    created = true;
    env.PORT = String(await freePort());
    const base = "http://127.0.0.1:" + env.PORT;
    env.ADMIN_ORIGIN = base;
    const flags = [
      "--network=host",
      ...[
        "NODE_ENV",
        "PAYMENT_PROVIDER",
        "AUTH_KEY",
        "DATABASE_URL",
        "BRAND_CONFIG",
        "API_HOST",
        "PORT",
        "ADMIN_ORIGIN",
        "SMS_DIRECTORY",
        "MEDIA_DIRECTORY",
        "REDIS_URL",
      ].flatMap((key) => ["--env", key]),
    ];
    // Host networking is used only for the explicitly loopback PostgreSQL test dependency, never to bypass egress policy.
    docker([
      "run",
      "--rm",
      ...flags,
      image,
      "node",
      "../../tools/container-init.mjs",
    ]);
    db = connect(url.toString());
    const branchId = "00000000-0000-4000-8000-000000000001",
      productId = "00000000-0000-4000-8000-000000000002";
    await db.branch.update({
      where: { id: branchId },
      data: {
        acceptingOrders: true,
        schedule: Array.from({ length: 7 }, (_, day) => ({
          day,
          startMinute: 0,
          endMinute: 1440,
        })),
      },
    });
    for (const kind of ["sms", "media"]) {
      const volume = "food-container-" + kind + "-" + tag;
      docker([
        "volume",
        "create",
        "--label",
        "food.delivery.smoke=" + tag,
        volume,
      ]);
      volumes.push(volume);
    }
    container = true;
    docker([
      "run",
      "--detach",
      "--name",
      apiName,
      "--init",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      ...flags,
      "--mount",
      "type=volume,src=" + volumes[0] + ",dst=/app/.local/sms",
      "--mount",
      "type=volume,src=" + volumes[1] + ",dst=/app/.local/media",
      image,
    ]);
    let ready = false;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      try {
        ready = (
          await fetch(base + "/v1/health/ready", {
            signal: AbortSignal.timeout(1000),
          })
        ).ok;
        if (ready) break;
      } catch {
        /* Bounded readiness retry. */
      }
      await new Promise((ok) => setTimeout(ok, 100));
    }
    check(ready, "Container API readiness failed");
    const state = JSON.parse(
      docker([
        "exec",
        apiName,
        "node",
        "-e",
        "const fs=require('fs');process.stdout.write(JSON.stringify({uid:process.getuid(),smsUid:fs.statSync('/app/.local/sms').uid,smsMode:fs.statSync('/app/.local/sms').mode&511,embedded:fs.existsSync('/app/.env')||fs.existsSync('/app/.local/owner-credentials.json')}))",
      ]),
    );
    check(
      state.uid !== 0 &&
        state.uid === state.smsUid &&
        state.smsMode === 448 &&
        !state.embedded,
      "Non-root/SMS ownership/private-image check failed",
    );
    async function request(path, method = "GET", body, headers = {}) {
      const response = await fetch(base + "/v1" + path, {
        method,
        headers: { "content-type": "application/json", ...headers },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10000),
      });
      let value;
      try {
        value = await response.json();
      } catch {
        throw new SmokeFailure("Unexpected non-JSON API response");
      }
      check(
        response.ok,
        "Container API returned HTTP " + response.status + " for " + path,
      );
      return value;
    }
    const phone = "+77000000666",
      challenge = await request("/auth/otp/request", "POST", { phone });
    check(
      /^[0-9a-f-]{36}$/.test(challenge.challengeId),
      "Unexpected challenge identity",
    );
    const code = docker([
      "exec",
      apiName,
      "node",
      "-e",
      "const fs=require('fs');process.stdout.write(fs.readFileSync(" +
        JSON.stringify("/app/.local/sms/" + challenge.challengeId + ".txt") +
        ",'utf8'))",
    ]);
    check(/^\d{6}$/.test(code), "Local SMS was not privately persisted");
    const token = await request("/auth/otp/verify", "POST", {
        challengeId: challenge.challengeId,
        code,
      }),
      customer = { authorization: "Bearer " + token.accessToken };
    check(
      (await request("/me", "GET", undefined, customer)).phone === phone,
      "Container identity flow failed",
    );
    const password = randomBytes(24).toString("hex"),
      mfa = randomBytes(20).toString("hex"),
      email = "container-owner@example.invalid";
    await db.staffUser.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        mfaSecret: encryptSecret(mfa),
        roles: { create: { role: "owner" } },
      },
    });
    const login = await fetch(base + "/v1/admin/auth/login", {
      method: "POST",
      headers: { origin: base, "content-type": "application/json" },
      body: JSON.stringify({ email, password, code: totp(mfa).code }),
      signal: AbortSignal.timeout(10000),
    });
    check(login.ok, "Container MFA login failed");
    const staff = await login.json(),
      cookie = login.headers.get("set-cookie")?.split(";")[0];
    check(cookie, "Missing staff cookie");
    const bytes = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#B9381B" },
    })
      .png()
      .toBuffer();
    const upload = await fetch(
      base + "/v1/admin/products/" + productId + "/image?expectedVersion=1",
      {
        method: "POST",
        headers: {
          origin: base,
          cookie,
          "x-csrf-token": staff.csrfToken,
          "content-type": "image/png",
        },
        body: bytes,
        signal: AbortSignal.timeout(10000),
      },
    );
    check(upload.ok, "Container image normalization/upload failed");
    const product = await upload.json();
    const photo = await fetch(base + "/v1/media/" + product.imageId);
    check(
      photo.ok &&
        photo.headers.get("content-type")?.startsWith("image/webp") &&
        (await photo.arrayBuffer()).byteLength > 0,
      "Container public WebP read failed",
    );
    const quote = await request(
      "/checkout/quote",
      "POST",
      { branchId, fulfilment: "pickup", items: [{ productId, quantity: 1 }] },
      customer,
    );
    let order = await request(
      "/orders",
      "POST",
      { quoteId: quote.quoteId, paymentMethod: "mock" },
      { ...customer, "idempotency-key": randomUUID() },
    );
    check(
      order.totalMinor === 249000,
      "Server-authoritative container pricing failed",
    );
    order = await request(
      "/payments/" + order.payments[0].id + "/mock-result",
      "POST",
      { outcome: "paid" },
      customer,
    );
    check(order.paymentStatus === "paid", "Container mock payment failed");
    order = await request(
      "/orders/" + order.id + "/cancel",
      "POST",
      {
        expectedVersion: order.version,
        reason: "Synthetic container smoke cleanup",
      },
      customer,
    );
    check(
      order.status === "cancelled" && order.paymentStatus === "refunded",
      "Container full mock refund failed",
    );
  } finally {
    if (container) docker(["rm", "--force", apiName]);
    for (const volume of volumes) docker(["volume", "rm", volume]);
    if (db) await db.$disconnect();
    if (created && /^food_container_[0-9a-f]{16}$/.test(name))
      await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.$disconnect();
  }
  console.log(
    "Container smoke passed: non-root/private image, fresh SMS/media volumes, real OTP/session, staff MFA, WebP upload/read, server quote and one mock payment/refund; disposable resources removed. Image " +
      image,
  );
}
main().catch((error) => {
  console.error(
    error instanceof SmokeFailure
      ? error.message
      : "Container smoke failed (" + error.name + "); secret values omitted",
  );
  process.exitCode = 1;
});
