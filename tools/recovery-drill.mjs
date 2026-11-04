import assert from "node:assert/strict";
import { createServer } from "node:net";
import { once } from "node:events";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  openSync,
  closeSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
} from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { createApp } from "../apps/api/dist/app.js";
import { NotificationPump } from "../apps/api/dist/outbox.js";
import { OrderService } from "../apps/api/dist/orders.js";
import { runWorkerCycle } from "../apps/api/dist/worker-cycle.js";
import { digest } from "../apps/api/dist/auth-crypto.js";
const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { PrismaClient } = require("@prisma/client"),
  { PrismaPg } = require("@prisma/adapter-pg");
if (!["development", "test"].includes(process.env.NODE_ENV ?? "development"))
  throw Error("Recovery drill only allowed locally/test");
const originalBrand = process.env.BRAND_CONFIG,
  originalMedia = process.env.MEDIA_DIRECTORY;
process.env.BRAND_CONFIG = resolve("brands/demo/brand.json");
const original = process.env.DATABASE_URL,
  url = new URL(original);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
  throw Error("Recovery drill requires explicit loopback database");
const tag = randomBytes(8).toString("hex"),
  sourceName = "food_restore_src_" + tag,
  targetName = "food_restore_dst_" + tag,
  sourceUrl = new URL(url),
  targetUrl = new URL(url);
sourceUrl.pathname = "/" + sourceName;
targetUrl.pathname = "/" + targetName;
const connect = (connectionString) =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 3000 }),
  });
const admin = connect(original),
  folder = resolve(".generated/recovery", tag);
mkdirSync(folder, { recursive: true, mode: 0o700 });
const sourceMedia = resolve(folder, "source-media"),
  targetMedia = resolve(folder, "restored-media");
mkdirSync(sourceMedia, { recursive: true, mode: 0o700 });
mkdirSync(targetMedia, { recursive: true, mode: 0o700 });
process.env.MEDIA_DIRECTORY = sourceMedia;
let source, target, app, pump;
const redisName = "food-queue-drill-" + tag;
let redisCreated = false;
function docker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  assert.equal(result.status, 0, "Isolated Redis container operation failed");
  return result.stdout.trim();
}
async function redisReady() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const result = spawnSync(
      "docker",
      ["exec", redisName, "redis-cli", "ping"],
      { encoding: "utf8" },
    );
    if (result.status === 0 && result.stdout.trim() === "PONG") return;
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw Error("Isolated Redis not ready");
}
async function waitFor(predicate) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw Error("Recovery verification deadline");
}
function node(script, connection) {
  const result = spawnSync(process.execPath, [resolve("tools", script)], {
    cwd: resolve("apps/api"),
    env: { ...process.env, DATABASE_URL: connection },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
}
function postgres(command, dbname, io) {
  const result = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "--network=host",
      "-i",
      "-e",
      "PGPASSWORD",
      "postgres:17.6-bookworm",
      command,
      "--host",
      url.hostname,
      "--port",
      url.port || "5432",
      "--username",
      decodeURIComponent(url.username),
      "--dbname",
      dbname,
      ...(command === "pg_dump"
        ? ["--format=custom", "--no-owner", "--no-privileges"]
        : ["--no-owner", "--no-privileges", "--exit-on-error"]),
    ],
    {
      env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
      stdio: io,
    },
  );
  assert.equal(result.status, 0, command + " failed");
}
try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${sourceName}"`);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${targetName}"`);
  node("migrate.mjs", sourceUrl.toString());
  node("seed.mjs", sourceUrl.toString());
  source = connect(sourceUrl.toString());
  const branchId = "00000000-0000-4000-8000-000000000001",
    productId = "00000000-0000-4000-8000-000000000002";
  await source.branch.update({
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
  await source.product.update({
    where: { id: productId },
    data: { stockQuantity: 5 },
  });
  const assetId = randomUUID(),
    filename = assetId + ".webp";
  const mediaBytes = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "#B9381B" },
  })
    .webp()
    .toBuffer();
  writeFileSync(resolve(sourceMedia, filename), mediaBytes, {
    mode: 0o600,
    flag: "wx",
  });
  await source.mediaAsset.create({
    data: {
      id: assetId,
      branchId,
      filename,
      mime: "image/webp",
      width: 4,
      height: 4,
      bytes: mediaBytes.length,
    },
  });
  await source.product.update({
    where: { id: productId },
    data: { imageId: assetId },
  });
  const customer = await source.customer.create({
      data: { phone: "+77000000999" },
    }),
    token = randomBytes(32).toString("hex");
  await source.authSession.create({
    data: {
      customerId: customer.id,
      accessHash: digest(token),
      familyId: randomUUID(),
      expiresAt: new Date(Date.now() + 900000),
    },
  });
  process.env.DATABASE_URL = sourceUrl.toString();
  app = await createApp();
  await app.listen(0, "127.0.0.1");
  let base = await app.getUrl();
  const request = async (path, method = "GET", body) => {
    const response = await fetch(base + "/v1" + path, {
      method,
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const value = await response.json();
    assert.ok(
      response.ok,
      JSON.stringify({ code: value.code, status: response.status }),
    );
    return value;
  };
  const quote = await request("/checkout/quote", "POST", {
      branchId,
      fulfilment: "pickup",
      items: [{ productId, quantity: 1 }],
    }),
    order = await request("/orders", "POST", {
      quoteId: quote.quoteId,
      paymentMethod: "mock",
    }),
    paymentId = order.payments[0].id;
  const paid = await request(
    "/payments/" + paymentId + "/mock-result",
    "POST",
    { outcome: "paid" },
  );
  assert.equal(paid.paymentStatus, "paid");
  console.log("Recovery: queue outage verification starting");
  const expiringQuote = await request("/checkout/quote", "POST", {
      branchId,
      fulfilment: "pickup",
      items: [{ productId, quantity: 1 }],
    }),
    expiring = await request("/orders", "POST", {
      quoteId: expiringQuote.quoteId,
      paymentMethod: "mock",
    });
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const redisPort = socket.address().port;
  await new Promise((ok, fail) =>
    socket.close((error) => (error ? fail(error) : ok())),
  );
  docker([
    "run",
    "-d",
    "--name",
    redisName,
    "-p",
    "127.0.0.1:" + redisPort + ":6379",
    "redis:8.2.2-bookworm",
    "redis-server",
    "--appendonly",
    "yes",
  ]);
  redisCreated = true;
  await redisReady();
  pump = new NotificationPump(
    source,
    "redis://127.0.0.1:" + redisPort,
    "drill:" + tag,
  );
  await pump.start();
  await waitFor(async () => {
    await pump.enqueuePending().catch(() => {});
    return (
      (await source.outboxEvent.count({ where: { processedAt: null } })) === 0
    );
  });
  const notified = await source.notification.count();
  assert.ok(notified >= 2);
  console.log("Recovery: Redis stopping");
  docker(["stop", "-t", "1", redisName]);
  await source.order.update({
    where: { id: expiring.id },
    data: { expiresAt: new Date(0) },
  });
  const interrupted = await source.outboxEvent.create({
    data: {
      aggregateId: order.id,
      version: 100,
      type: "recovery.notification",
      payload: {},
    },
  });
  const controller = new AbortController();
  let expiryCycles = 0;
  await runWorkerCycle(
    async () => {
      await app.get(OrderService).expireOverdue();
      if (++expiryCycles === 5) controller.abort();
    },
    () => pump.enqueuePending(),
    controller.signal,
    () => {},
    50,
  );
  assert.equal(
    (await source.order.findUniqueOrThrow({ where: { id: expiring.id } }))
      .status,
    "expired",
  );
  assert.equal(
    (
      await source.outboxEvent.findUniqueOrThrow({
        where: { id: interrupted.id },
      })
    ).processedAt,
    null,
  );
  console.log("Recovery: expiry continued; Redis reconnecting");
  docker(["start", redisName]);
  await redisReady();
  assert.equal(
    docker(["port", redisName, "6379/tcp"]),
    "127.0.0.1:" + redisPort,
  );
  await pump.start();
  await waitFor(async () => {
    await pump.enqueuePending().catch(() => {});
    return (
      (await source.outboxEvent.count({ where: { processedAt: null } })) === 0
    );
  });
  assert.equal(
    await source.notification.count({ where: { eventId: interrupted.id } }),
    1,
  );
  const duplicate = await pump.queue.add(
    "notify",
    { eventId: interrupted.id },
    { jobId: "duplicate-" + randomUUID() },
  );
  await waitFor(async () => (await duplicate.getState()) === "completed");
  assert.equal(
    await source.notification.count({ where: { eventId: interrupted.id } }),
    1,
  );
  console.log("Recovery: deliveries verified; closing isolated worker");
  await pump.close(true);
  pump = null;
  docker(["rm", "-f", redisName]);
  redisCreated = false;
  await app.close();
  app = null;
  const before = {
    orders: await source.order.count(),
    payments: await source.paymentAttempt.count(),
    outbox: await source.outboxEvent.count(),
    stock: (
      await source.product.findUniqueOrThrow({ where: { id: productId } })
    ).stockQuantity,
  };
  const backup = resolve(folder, "snapshot.dump"),
    out = openSync(backup, "wx", 0o600);
  try {
    postgres("pg_dump", sourceName, ["ignore", out, "inherit"]);
  } finally {
    closeSync(out);
  }
  const input = openSync(backup, "r");
  try {
    postgres("pg_restore", targetName, [input, "inherit", "inherit"]);
  } finally {
    closeSync(input);
  }
  // This synthetic immutable asset is copied alongside its DB snapshot; production needs coordinated object-store snapshots.
  copyFileSync(resolve(sourceMedia, filename), resolve(folder, filename));
  copyFileSync(resolve(folder, filename), resolve(targetMedia, filename));
  const mediaHash = createHash("sha256").update(mediaBytes).digest("hex");
  assert.equal(
    createHash("sha256")
      .update(readFileSync(resolve(targetMedia, filename)))
      .digest("hex"),
    mediaHash,
  );
  process.env.MEDIA_DIRECTORY = targetMedia;
  target = connect(targetUrl.toString());
  const after = {
    orders: await target.order.count(),
    payments: await target.paymentAttempt.count(),
    outbox: await target.outboxEvent.count(),
    stock: (
      await target.product.findUniqueOrThrow({ where: { id: productId } })
    ).stockQuantity,
  };
  assert.deepEqual(after, before);
  process.env.DATABASE_URL = targetUrl.toString();
  app = await createApp();
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  assert.equal((await fetch(base + "/v1/health/ready")).status, 200);
  assert.equal(
    (await target.product.findUniqueOrThrow({ where: { id: productId } }))
      .imageId,
    assetId,
  );
  const restoredMedia = await fetch(base + "/v1/media/" + assetId);
  assert.equal(restoredMedia.status, 200);
  assert.equal(
    createHash("sha256")
      .update(Buffer.from(await restoredMedia.arrayBuffer()))
      .digest("hex"),
    mediaHash,
  );
  const restored = await request("/orders/" + order.id);
  assert.equal(restored.totalMinor, paid.totalMinor);
  assert.equal(restored.paymentStatus, "paid");
  for (let n = 0; n < 3; n++)
    assert.equal(
      (
        await request("/payments/" + paymentId + "/mock-result", "POST", {
          outcome: "paid",
        })
      ).paymentStatus,
      "paid",
    );
  assert.equal(await target.paymentAttempt.count(), before.payments);
  assert.equal(await target.outboxEvent.count(), before.outbox);
  assert.equal(await target.refund.count(), 0);
  writeFileSync(
    resolve(folder, "result.json"),
    JSON.stringify(
      {
        passed: true,
        kind: "isolated logical PostgreSQL restore",
        before,
        after,
        readiness: 200,
        replayedPaymentEffects: 0,
        realProviderReconciliation: false,
        pitr: false,
        media: { assets: 1, restoredByteHashMatches: true, publicRead: 200 },
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  console.log(
    "Recovery drill passed: isolated PostgreSQL dump/restore, migration readiness, order/payment/stock/outbox consistency and duplicate-result safety. Physical isolated Redis outage/restart, continued expiry and notification dedup passed. Logical restore only; PITR/live-provider reconciliation not verified.",
  );
} finally {
  if (redisCreated) {
    docker(["start", redisName]);
    await redisReady();
  }
  if (pump) await pump.close(true);
  if (redisCreated) docker(["rm", "-f", redisName]);
  if (app) await app.close();
  if (source) await source.$disconnect();
  if (target) await target.$disconnect();
  process.env.DATABASE_URL = original;
  if (originalMedia === undefined) delete process.env.MEDIA_DIRECTORY;
  else process.env.MEDIA_DIRECTORY = originalMedia;
  if (originalBrand === undefined) delete process.env.BRAND_CONFIG;
  else process.env.BRAND_CONFIG = originalBrand;
  for (const name of [sourceName, targetName])
    if (/^food_restore_(src|dst)_[0-9a-f]{16}$/.test(name))
      await admin.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`,
      );
  await admin.$disconnect();
}
