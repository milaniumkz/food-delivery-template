import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import {
  readdirSync,
  readFileSync,
  statSync,
  mkdirSync,
  writeFileSync,
  openSync,
  closeSync,
  existsSync,
} from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createApp } from "../apps/api/dist/app.js";
import { digest } from "../apps/api/dist/auth-crypto.js";
const require = createRequire(
    new URL("../apps/api/package.json", import.meta.url),
  ),
  { PrismaClient } = require("@prisma/client"),
  { PrismaPg } = require("@prisma/adapter-pg");
if (!["development", "test"].includes(process.env.NODE_ENV ?? "development"))
  throw Error("Disposable local PITR drill only");
const root = resolve(".generated/recovery");
assert.ok(
  existsSync(root),
  "Run pnpm test:recovery to produce an owned synthetic snapshot first",
);
const candidates = readdirSync(root)
  .filter(
    (n) =>
      /^[0-9a-f]{16}$/.test(n) &&
      existsSync(resolve(root, n, "result.json")) &&
      existsSync(resolve(root, n, "snapshot.dump")),
  )
  .sort(
    (a, b) =>
      statSync(resolve(root, b, "result.json")).mtimeMs -
      statSync(resolve(root, a, "result.json")).mtimeMs,
  );
assert.ok(candidates.length, "No successful disposable recovery snapshot");
const snapshot = resolve(root, candidates[0], "snapshot.dump"),
  manifest = JSON.parse(
    readFileSync(resolve(root, candidates[0], "result.json"), "utf8"),
  );
assert.equal(manifest.passed, true);
assert.equal(manifest.kind, "isolated logical PostgreSQL restore");
const tag = randomBytes(8).toString("hex"),
  sourceName = "food-pitr-source-" + tag,
  targetName = "food-pitr-target-" + tag,
  archive = "food-pitr-wal-" + tag,
  baseVolume = "food-pitr-base-" + tag,
  targetVolume = "food-pitr-data-" + tag,
  image = "postgres:17.6-bookworm",
  password = randomBytes(32).toString("hex");
const volumes = [],
  containers = [],
  oldDatabase = process.env.DATABASE_URL,
  oldBrand = process.env.BRAND_CONFIG;
let source, target, app;
function docker(args, io) {
  const r = spawnSync("docker", args, {
    encoding: io ? undefined : "utf8",
    stdio: io,
    env: { ...process.env, POSTGRES_PASSWORD: password },
  });
  assert.equal(r.status, 0, "Owned PITR Docker operation failed");
  return typeof r.stdout === "string" ? r.stdout.trim() : "";
}
async function port() {
  const s = createServer();
  s.listen(0, "127.0.0.1");
  await once(s, "listening");
  const value = s.address().port;
  await new Promise((ok, fail) => s.close((e) => (e ? fail(e) : ok())));
  return value;
}
function connect(p) {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString:
        "postgresql://postgres:" + password + "@127.0.0.1:" + p + "/food_pitr",
      connectionTimeoutMillis: 1000,
      max: 2,
    }),
  });
}
async function waitFor(predicate, description) {
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    try {
      if (await predicate()) return;
    } catch {
      /* Bounded startup/recovery retry; never print connection values. */
    }
    await delay(100);
  }
  throw Error(description + " deadline");
}
async function server(db) {
  const p = await port();
  docker([
    "run",
    "-d",
    "--name",
    db,
    "-p",
    "127.0.0.1:" + p + ":5432",
    "-e",
    "POSTGRES_PASSWORD",
    "-e",
    "POSTGRES_DB=food_pitr",
    ...(db === sourceName
      ? [
          "-v",
          archive + ":/archive",
          "-v",
          baseVolume + ":/basebackup",
          image,
          "postgres",
          "-c",
          "wal_level=replica",
          "-c",
          "archive_mode=on",
          "-c",
          "archive_command=test ! -f /archive/%f && cp %p /archive/%f",
          "-c",
          "archive_timeout=5s",
        ]
      : [
          "-v",
          archive + ":/archive:ro",
          "-v",
          targetVolume + ":/var/lib/postgresql/data",
          image,
          "postgres",
          "-c",
          "archive_mode=off",
          "-c",
          "restore_command=cp /archive/%f %p",
          "-c",
          "recovery_target_time=" + recoveryTarget,
          "-c",
          "recovery_target_action=promote",
        ]),
  ]);
  containers.push(db);
  return p;
}
let recoveryTarget;
try {
  for (const volume of [archive, baseVolume, targetVolume]) {
    docker(["volume", "create", volume]);
    volumes.push(volume);
    docker([
      "run",
      "--rm",
      "-v",
      volume + ":/owned",
      "--entrypoint",
      "chown",
      image,
      "postgres:postgres",
      "/owned",
    ]);
  }
  const sourcePort = await server(sourceName);
  source = connect(sourcePort);
  await waitFor(async () => {
    await source.$queryRaw`SELECT 1`;
    return true;
  }, "Source PostgreSQL");
  const fd = openSync(snapshot, "r");
  try {
    docker(
      [
        "exec",
        "-i",
        "-u",
        "postgres",
        sourceName,
        "pg_restore",
        "--no-owner",
        "--no-privileges",
        "--exit-on-error",
        "-U",
        "postgres",
        "-d",
        "food_pitr",
      ],
      [fd, "inherit", "inherit"],
    );
  } finally {
    closeSync(fd);
  }
  const sourceUrl =
    "postgresql://postgres:" +
    password +
    "@127.0.0.1:" +
    sourcePort +
    "/food_pitr";
  const migrated = spawnSync(process.execPath, [resolve("tools/migrate.mjs")], {
    cwd: resolve("apps/api"),
    env: { ...process.env, DATABASE_URL: sourceUrl },
    encoding: "utf8",
  });
  assert.equal(migrated.status, 0, "PITR source migration failed");
  process.env.DATABASE_URL = sourceUrl;
  process.env.BRAND_CONFIG = resolve("brands/demo/brand.json");
  const paid = await source.order.findFirstOrThrow({
      where: { paymentStatus: "paid", status: "placed" },
    }),
    token = randomBytes(32).toString("hex");
  await source.authSession.create({
    data: {
      customerId: paid.customerId,
      accessHash: digest(token),
      familyId: randomUUID(),
      expiresAt: new Date(Date.now() + 900000),
    },
  });
  const before = {
    orders: await source.order.count(),
    payments: await source.paymentAttempt.count(),
    refunds: await source.refund.count(),
    totalMinor: paid.totalMinor,
    paymentStatus: paid.paymentStatus,
  };
  app = await createApp();
  await app.listen(0, "127.0.0.1");
  let api = await app.getUrl();
  assert.equal((await fetch(api + "/v1/health/ready")).status, 200);
  console.log("PITR: base backup of disposable synthetic application DB");
  docker([
    "exec",
    "-u",
    "postgres",
    sourceName,
    "pg_basebackup",
    "-U",
    "postgres",
    "-D",
    "/basebackup",
    "-X",
    "stream",
    "--checkpoint=fast",
  ]);
  await source.auditLog.create({
    data: { entityId: paid.id, action: "pitr.before" },
  });
  recoveryTarget = (
    await source.$queryRaw`SELECT to_char(clock_timestamp(),'YYYY-MM-DD"T"HH24:MI:SS.USOF') AS target`
  )[0].target;
  assert.match(recoveryTarget, /^\d{4}-\d{2}-\d{2}T/);
  await source.$queryRaw`SELECT 1 AS waited FROM pg_sleep(0.1)`;
  const cancelled = await fetch(api + "/v1/orders/" + paid.id + "/cancel", {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      expectedVersion: paid.version,
      reason: "Synthetic PITR after-target mutation",
    }),
  });
  assert.equal(cancelled.status, 200);
  assert.equal((await cancelled.json()).paymentStatus, "refunded");
  await source.auditLog.create({
    data: { entityId: paid.id, action: "pitr.after" },
  });
  const wal = (
    await source.$queryRaw`SELECT pg_walfile_name(pg_current_wal_lsn()) AS file`
  )[0].file;
  assert.match(wal, /^[0-9A-F]{24}$/);
  await source.$queryRaw`SELECT pg_switch_wal()::text AS switched`;
  await waitFor(
    async () =>
      spawnSync("docker", ["exec", sourceName, "test", "-s", "/archive/" + wal])
        .status === 0,
    "WAL archive",
  );
  await app.close();
  app = null;
  await source.$disconnect();
  source = null;
  docker(["stop", "-t", "5", sourceName]);
  docker([
    "run",
    "--rm",
    "-v",
    baseVolume + ":/source:ro",
    "-v",
    targetVolume + ":/target",
    "--entrypoint",
    "sh",
    image,
    "-c",
    "cp -a /source/. /target/ && chown -R postgres:postgres /target && touch /target/recovery.signal",
  ]);
  const recoveryStarted = performance.now(),
    targetPort = await server(targetName);
  target = connect(targetPort);
  await waitFor(async () => {
    const value =
      await target.$queryRaw`SELECT pg_is_in_recovery() AS recovering`;
    return !value[0].recovering;
  }, "PITR promotion");
  const restored = await target.order.findUniqueOrThrow({
    where: { id: paid.id },
  });
  assert.equal(restored.paymentStatus, "paid");
  assert.equal(restored.status, "placed");
  assert.equal(restored.totalMinor, before.totalMinor);
  assert.equal(await target.refund.count(), before.refunds);
  assert.equal(
    await target.auditLog.count({ where: { action: "pitr.before" } }),
    1,
  );
  assert.equal(
    await target.auditLog.count({ where: { action: "pitr.after" } }),
    0,
  );
  process.env.DATABASE_URL =
    "postgresql://postgres:" +
    password +
    "@127.0.0.1:" +
    targetPort +
    "/food_pitr";
  app = await createApp();
  await app.listen(0, "127.0.0.1");
  api = await app.getUrl();
  assert.equal((await fetch(api + "/v1/health/ready")).status, 200);
  const own = await fetch(api + "/v1/orders/" + paid.id, {
    headers: { authorization: "Bearer " + token },
  });
  assert.equal(own.status, 200);
  assert.equal((await own.json()).paymentStatus, "paid");
  const payment = await target.paymentAttempt.findFirstOrThrow({
      where: { orderId: paid.id, status: "paid" },
    }),
    outbox = await target.outboxEvent.count();
  const replay = await fetch(
    api + "/v1/payments/" + payment.id + "/mock-result",
    {
      method: "POST",
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
      },
      body: JSON.stringify({ outcome: "paid" }),
    },
  );
  assert.equal(replay.status, 200);
  assert.equal(await target.paymentAttempt.count(), before.payments);
  assert.equal(await target.outboxEvent.count(), outbox);
  const folder = resolve(".generated/pitr", tag);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  writeFileSync(
    resolve(folder, "result.json"),
    JSON.stringify(
      {
        passed: true,
        kind: "isolated physical basebackup + WAL PITR",
        sourceSnapshot: candidates[0],
        recoveryTarget,
        restoreSeconds:
          Math.round((performance.now() - recoveryStarted) / 100) / 10,
        before,
        verified: {
          beforeTargetPresent: true,
          afterTargetAbsent: true,
          readiness: 200,
          duplicateFinancialEffects: 0,
        },
        realProviderReconciliation: false,
        offsiteStorage: false,
        productionRpoRtoAccepted: false,
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  console.log(
    "PITR passed: physical basebackup + archived WAL promoted at the chosen time; after-target mock refund excluded, financial state and API readiness restored, replay has no extra effect. Production offsite storage/reconciliation still require client infrastructure.",
  );
} finally {
  if (app) await app.close();
  if (source) await source.$disconnect();
  if (target) await target.$disconnect();
  for (const name of containers.reverse())
    spawnSync("docker", ["rm", "-fv", name], { stdio: "ignore" });
  for (const volume of volumes.reverse())
    spawnSync("docker", ["volume", "rm", volume], { stdio: "ignore" });
  if (oldDatabase === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = oldDatabase;
  if (oldBrand === undefined) delete process.env.BRAND_CONFIG;
  else process.env.BRAND_CONFIG = oldBrand;
}
