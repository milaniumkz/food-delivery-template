import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { digest } from "../apps/api/dist/auth-crypto.js";
const require = createRequire(
    new URL("../apps/api/package.json", import.meta.url),
  ),
  { PrismaClient } = require("@prisma/client"),
  { PrismaPg } = require("@prisma/adapter-pg");
const seconds = Number(
  process.argv.find((a) => a.startsWith("--seconds="))?.split("=")[1] ?? 1800,
);
if (!Number.isInteger(seconds) || seconds < 10 || seconds > 1800)
  throw Error("Duration 10..1800 seconds; acceptance profile requires 1800");
const original = process.env.DATABASE_URL,
  root = new URL(original);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(root.hostname) ||
  !["test", "development"].includes(process.env.NODE_ENV ?? "development")
)
  throw Error("Local/test disposable DB only");
const name = "food_load_" + randomBytes(8).toString("hex"),
  url = new URL(root);
url.pathname = "/" + name;
const connect = (connectionString) =>
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      connectionTimeoutMillis: 3000,
      max: 5,
    }),
  });
const admin = connect(original);
let db, api, worker;
const controller = new AbortController(),
  stop = () => controller.abort();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
function command(script, env) {
  const r = spawnSync(process.execPath, [resolve("tools", script)], {
    cwd: resolve("apps/api"),
    env,
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
}
function child(file, env) {
  const c = spawn(process.execPath, ["--max-old-space-size=512", file], {
    cwd: resolve("apps/api"),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  c.logs = "";
  for (const stream of [c.stdout, c.stderr])
    stream.on("data", (d) => {
      c.logs = (c.logs + d).slice(-10000);
    });
  return c;
}
async function close(c) {
  if (c && c.exitCode === null) {
    const exiting = once(c, "exit");
    c.kill("SIGTERM");
    const timer = setTimeout(() => c.kill("SIGKILL"), 5000);
    try {
      await exiting;
    } finally {
      clearTimeout(timer);
    }
  }
}
async function freePort() {
  const s = createServer();
  s.listen(0, "127.0.0.1");
  await once(s, "listening");
  const p = s.address().port;
  await new Promise((ok, fail) => s.close((e) => (e ? fail(e) : ok())));
  return p;
}
function percentile(samples, p) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return (
    Math.round(
      sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] *
        100,
    ) / 100
  );
}
try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  const port = await freePort(),
    base = "http://127.0.0.1:" + port,
    env = {
      ...process.env,
      NODE_ENV: "test",
      PAYMENT_PROVIDER: "mock",
      DATABASE_URL: url.toString(),
      PORT: String(port),
      BRAND_CONFIG: resolve("brands/demo/brand.json"),
    };
  command("migrate.mjs", env);
  command("seed.mjs", env);
  db = connect(url.toString());
  const branchId = "00000000-0000-4000-8000-000000000001",
    productId = "00000000-0000-4000-8000-000000000002";
  await db.branch.update({
    where: { id: branchId },
    data: {
      acceptingOrders: true,
      maxActiveOrders: 1000,
      schedule: Array.from({ length: 7 }, (_, day) => ({
        day,
        startMinute: 0,
        endMinute: 1440,
      })),
    },
  });
  await db.product.createMany({
    data: Array.from({ length: 29 }, (_, i) => ({
      branchId,
      nameRu: "Блюдо " + i,
      nameKk: "Тағам " + i,
      priceMinor: 100000 + i * 1000,
    })),
  });
  const actors = [];
  for (let i = 0; i < 100; i++) {
    const customer = await db.customer.create({
        data: { phone: "+7700001" + String(i).padStart(4, "0") },
      }),
      access = randomBytes(32).toString("hex"),
      refresh = randomBytes(32).toString("hex"),
      expiresAt = Date.now() + 900000;
    await db.authSession.create({
      data: {
        customerId: customer.id,
        accessHash: digest(access),
        refreshHash: digest(refresh),
        familyId: randomUUID(),
        expiresAt: new Date(expiresAt),
        refreshExpiresAt: new Date(Date.now() + 3600000),
      },
    });
    actors.push({ access, refresh, expiresAt });
  }
  api = child(resolve("apps/api/dist/main.js"), env);
  const deadline = Date.now() + 15000;
  let ready = false;
  while (Date.now() < deadline) {
    if (api.exitCode !== null) throw Error("Load API startup failed");
    try {
      ready = (await fetch(base + "/v1/health/ready")).ok;
      if (ready) break;
    } catch {
      /* Bounded startup retry. */
    }
    await delay(100);
  }
  assert.ok(ready);
  worker = child(resolve("apps/api/dist/worker.js"), env);
  const measurements = {
      catalog: [],
      quote: [],
      create: [],
      checkoutWithoutProvider: [],
      mockResult: [],
      refresh: [],
    },
    errors = {},
    counts = { catalog: 0, orders: 0, refreshed: 0 },
    start = performance.now(),
    durationMs = seconds * 1000,
    end = start + durationMs;
  const fail = (key) => {
    errors[key] = (errors[key] ?? 0) + 1;
  };
  async function request(path, method = "GET", body, actor, key) {
    const t = performance.now(),
      response = await fetch(base + "/v1" + path, {
        method,
        headers: {
          "content-type": "application/json",
          ...(actor ? { authorization: "Bearer " + actor.access } : {}),
          ...(key ? { "idempotency-key": key } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10000),
      });
    const data = await response.json();
    if (!response.ok) {
      fail(
        String(response.status) +
          ":" +
          (typeof data.code === "string" ? data.code : "UNKNOWN"),
      );
      throw Error("HTTP failure");
    }
    return { data, ms: performance.now() - t };
  }
  async function refresh(actor) {
    if (actor.expiresAt > Date.now() + 30000) return;
    const r = await request("/auth/refresh", "POST", {
      refreshToken: actor.refresh,
    });
    actor.access = r.data.accessToken;
    actor.refresh = r.data.refreshToken;
    actor.expiresAt = Date.now() + r.data.expiresIn * 1000;
    measurements.refresh.push(r.ms);
    counts.refreshed++;
  }
  async function until(target) {
    const wait = target - performance.now();
    if (wait > 0)
      await delay(wait, undefined, { signal: controller.signal }).catch(
        () => {},
      );
  }
  const clients = actors.map(async (actor, index) => {
    let tick = 0;
    while (!controller.signal.aborted) {
      const at = start + index * 50 + tick++ * 5000;
      if (at >= end) break;
      await until(at);
      if (controller.signal.aborted) break;
      try {
        const r = await request(
          "/catalog?branchId=" +
            branchId +
            "&locale=" +
            (index % 2 ? "kk" : "ru") +
            "&limit=20",
        );
        assert.equal(r.data.items.length, 20);
        measurements.catalog.push(r.ms);
        counts.catalog++;
      } catch {
        fail("catalog_operation");
      }
    }
  });
  const ordering = (async () => {
    let tick = 0;
    while (!controller.signal.aborted) {
      const at = start + tick * 3000;
      if (at >= end) break;
      const actor = actors[tick++ % actors.length];
      await until(at);
      if (controller.signal.aborted) break;
      try {
        await refresh(actor);
        const began = performance.now(),
          q = await request(
            "/checkout/quote",
            "POST",
            {
              branchId,
              fulfilment: "pickup",
              items: [{ productId, quantity: 1 }],
            },
            actor,
          ),
          created = await request(
            "/orders",
            "POST",
            { quoteId: q.data.quoteId, paymentMethod: "mock" },
            actor,
            randomUUID(),
          );
        assert.equal(created.data.totalMinor, 249000);
        measurements.quote.push(q.ms);
        measurements.create.push(created.ms);
        measurements.checkoutWithoutProvider.push(performance.now() - began);
        const paid = await request(
          "/payments/" + created.data.payments[0].id + "/mock-result",
          "POST",
          { outcome: "paid" },
          actor,
        );
        assert.equal(paid.data.paymentStatus, "paid");
        measurements.mockResult.push(paid.ms);
        counts.orders++;
      } catch {
        fail("order_operation");
      }
    }
  })();
  console.log(
    "Load profile started: 100 virtual clients, catalog 20 rps, 20 orders/min, " +
      seconds +
      " seconds; mock only; disposable DB.",
  );
  const progress = setInterval(
    () =>
      console.log(
        JSON.stringify({
          event: "load_progress",
          elapsedSeconds: Math.round((performance.now() - start) / 1000),
          catalog: counts.catalog,
          orders: counts.orders,
          errors: Object.values(errors).reduce((a, b) => a + b, 0),
        }),
      ),
    60000,
  );
  try {
    await Promise.all([...clients, ordering]);
  } finally {
    clearInterval(progress);
  }
  const latency = Object.fromEntries(
    Object.entries(measurements).map(([kind, values]) => [
      kind,
      {
        samples: values.length,
        p50Ms: percentile(values, 0.5),
        p95Ms: percentile(values, 0.95),
        p99Ms: percentile(values, 0.99),
        maxMs: values.length
          ? Math.round(Math.max(...values) * 100) / 100
          : null,
      },
    ]),
  );
  const dbOrders = await db.order.count(),
    dbPayments = await db.paymentAttempt.count(),
    oldPending = await db.outboxEvent.count({
      where: {
        processedAt: null,
        createdAt: { lt: new Date(Date.now() - 10000) },
      },
    });
  const result = {
    profile: {
      virtualClients: 100,
      catalogRps: 20,
      ordersPerMinute: 20,
      durationSeconds: seconds,
      acceptanceDuration: seconds === 1800,
    },
    completed: !controller.signal.aborted,
    counts,
    latency,
    errors,
    invariants: {
      dbOrders,
      dbPayments,
      expectedOrders: counts.orders,
      oldPendingOutbox: oldPending,
    },
    runtime: {
      node: process.versions.node,
      scope: "local disposable environment; no production-hardware equivalence",
    },
    passed:
      !controller.signal.aborted &&
      Object.keys(errors).length === 0 &&
      counts.catalog >= seconds * 20 * 0.99 &&
      counts.orders >= Math.floor(seconds / 3) * 0.99 &&
      latency.catalog.p95Ms < 500 &&
      latency.create.p95Ms < 1000 &&
      dbOrders === counts.orders &&
      dbPayments === counts.orders &&
      oldPending === 0,
  };
  const folder = resolve(".generated/load", name);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  writeFileSync(
    resolve(folder, "result.json"),
    JSON.stringify(result, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(JSON.stringify(result));
  assert.ok(result.passed, "Load profile did not meet its declared checks");
} finally {
  controller.abort();
  await close(worker);
  await close(api);
  if (db) await db.$disconnect();
  if (/^food_load_[0-9a-f]{16}$/.test(name))
    await admin.$executeRawUnsafe(
      `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`,
    );
  await admin.$disconnect();
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
}
