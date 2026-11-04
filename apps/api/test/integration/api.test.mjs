import test from "node:test";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import {
  hashPassword,
  encryptSecret,
  totp,
  digest,
} from "../../dist/auth-crypto.js";
import { NotificationPump } from "../../dist/outbox.js";
import { OrderService } from "../../dist/orders.js";
import { DevSmsProvider } from "../../dist/auth.js";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../../dist/app.js";
import { Database } from "../../dist/database.js";

process.env.NODE_ENV = "test";
// Every run owns a fresh DB. Never reset, truncate or drop the developer's database.
test("PostgreSQL migrations, seed, public API and readiness lifecycle", async (t) => {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL must point to local/test PostgreSQL",
  );
  assert.notEqual(process.env.NODE_ENV, "production");
  const original = process.env.DATABASE_URL;
  const name = "food_test_" + randomBytes(8).toString("hex");
  const url = new URL(original);
  url.pathname = "/" + name;
  const admin = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: original,
      connectionTimeoutMillis: 3000,
    }),
  });
  const oldMedia = process.env.MEDIA_DIRECTORY,
    mediaDirectory = mkdtempSync(join(tmpdir(), "food-media-test-"));
  process.env.MEDIA_DIRECTORY = mediaDirectory;
  let app;
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    process.env.DATABASE_URL = url.toString();
    app = await createApp();
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const db = app.get(Database);
    const get = (path) => fetch(base + "/v1" + path);
    await t.test(
      "liveness independent of unapplied migrations; readiness is 503",
      async () => {
        assert.deepEqual(await (await get("/health/live")).json(), {
          status: "ok",
        });
        const response = await get("/health/ready");
        assert.equal(response.status, 503);
        const body = await response.json();
        assert.equal(body.code, "NOT_READY");
        assert.ok(body.requestId);
        assert.equal(body.details, null);
        assert.ok(!JSON.stringify(body).includes("_prisma"));
      },
    );
    await t.test("deploy is repeatable; seed preserves data", async () => {
      for (let n = 0; n < 2; n++) {
        const result = spawnSync(
          process.execPath,
          ["../../tools/migrate.mjs"],
          { encoding: "utf8", env: process.env },
        );
        assert.equal(result.status, 0, result.stderr);
      }
      for (let n = 0; n < 2; n++) {
        const result = spawnSync(process.execPath, ["../../tools/seed.mjs"], {
          encoding: "utf8",
          env: process.env,
        });
        assert.equal(result.status, 0, result.stderr);
      }
      assert.equal(await db.branch.count(), 1);
      assert.equal(await db.product.count(), 1);
      assert.equal((await get("/health/ready")).status, 200);
    });
    await t.test(
      "bootstrap brand is public and ordering capability is explicitly exposed for the local mock workflow",
      async () => {
        const body = await (await get("/bootstrap")).json();
        assert.equal(body.brand.currency, "KZT");
        assert.equal(body.brand.schemaVersion, 1);
        assert.equal(body.features.ordering, true);
        assert.ok(!JSON.stringify(body).includes("DATABASE_URL"));
      },
    );
    await t.test(
      "catalog localizes money, paginates, rejects mass assignment and hides inactive products",
      async () => {
        const branchId = "00000000-0000-4000-8000-000000000001";
        for (const [locale, name] of [
          ["ru", "Тестовое блюдо"],
          ["kk", "Сынақ тағамы"],
        ]) {
          const response = await get(
            `/catalog?branchId=${branchId}&locale=${locale}`,
          );
          assert.equal(response.status, 200);
          const page = await response.json();
          assert.equal(page.items[0].name, name);
          assert.equal(page.items[0].priceMinor, 249000);
          assert.equal(page.items[0].currency, "KZT");
        }
        for (const query of [
          "",
          `?branchId=${branchId}&limit=101`,
          `?branchId=bad`,
          `?branchId=${branchId}&role=owner`,
          `?branchId=${branchId}&locale=en`,
        ])
          assert.equal((await get("/catalog" + query)).status, 400);
        await db.product.create({
          data: {
            branchId,
            nameRu: "Архив",
            nameKk: "Мұрағат",
            priceMinor: 100,
            active: false,
          },
        });
        await db.product.create({
          data: {
            branchId,
            nameRu: "Второе блюдо",
            nameKk: "Екінші тағам",
            priceMinor: 1000,
          },
        });
        const page = await (
          await get(`/catalog?branchId=${branchId}&limit=1`)
        ).json();
        assert.ok(page.nextCursor);
        const second = await (
          await get(
            `/catalog?branchId=${branchId}&limit=1&cursor=${page.nextCursor}`,
          )
        ).json();
        assert.equal(second.items.length, 1);
        assert.notEqual(page.items[0].id, second.items[0].id);
        assert.equal(second.nextCursor, null);
        await assert.rejects(
          db.product.create({
            data: {
              branchId,
              nameRu: "Некорректно",
              nameKk: "Қате",
              priceMinor: -1,
            },
          }),
        );
      },
    );
    await t.test(
      "migration loss makes ready fail while live stays healthy",
      async () => {
        await db.$executeRawUnsafe(
          'ALTER TABLE "_prisma_migrations" RENAME TO "_test_hidden_migrations"',
        );
        try {
          assert.equal((await get("/health/ready")).status, 503);
          assert.equal((await get("/health/live")).status, 200);
        } finally {
          await db.$executeRawUnsafe(
            'ALTER TABLE "_test_hidden_migrations" RENAME TO "_prisma_migrations"',
          );
        }
      },
    );
    await t.test(
      "unknown future migration or changed checksum fails readiness",
      async () => {
        const id = crypto.randomUUID();
        await db.orm
          .$executeRaw`INSERT INTO "_prisma_migrations" (id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES (${id},${"0".repeat(64)},'209901010001_unknown',now(),now(),1)`;
        try {
          assert.equal((await get("/health/ready")).status, 503);
          assert.equal((await get("/health/live")).status, 200);
        } finally {
          await db.orm
            .$executeRaw`DELETE FROM "_prisma_migrations" WHERE id=${id}`;
        }
        const migration = await db.orm
          .$queryRaw`SELECT id,checksum FROM "_prisma_migrations" ORDER BY migration_name LIMIT 1`;
        await db.orm
          .$executeRaw`UPDATE "_prisma_migrations" SET checksum=${"1".repeat(64)} WHERE id=${migration[0].id}`;
        try {
          assert.equal((await get("/health/ready")).status, 503);
        } finally {
          await db.orm
            .$executeRaw`UPDATE "_prisma_migrations" SET checksum=${migration[0].checksum} WHERE id=${migration[0].id}`;
        }
        assert.equal((await get("/health/ready")).status, 200);
      },
    );
    await t.test(
      "unknown private endpoints fail closed with safe error envelope",
      async () => {
        const response = await get(
          "/admin/unknown-private-resource?token=private-value",
        );
        assert.equal(response.status, 404);
        const body = await response.json();
        assert.equal(body.code, "NOT_FOUND");
        assert.ok(!JSON.stringify(body).includes("private-value"));
        assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      },
    );
    await t.test(
      "OTP is limited, single-use, expiring; refresh replay revokes the family",
      async () => {
        const post = (path, body, token) =>
          fetch(base + "/v1" + path, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(token ? { authorization: "Bearer " + token } : {}),
            },
            body: JSON.stringify(body),
          });
        const requested = await post("/auth/otp/request", {
          phone: "+77000000001",
        });
        assert.equal(requested.status, 200);
        const challenge = await requested.json();
        assert.ok(!JSON.stringify(challenge).includes("code"));
        assert.equal(
          (await post("/auth/otp/request", { phone: "+77000000001" })).status,
          429,
        );
        const code = app
          .get(DevSmsProvider)
          .deliveries.get(challenge.challengeId);
        assert.match(code, /^[0-9]{6}$/);
        assert.equal(
          (
            await post("/auth/otp/verify", {
              challengeId: challenge.challengeId,
              code: code === "000000" ? "000001" : "000000",
            })
          ).status,
          401,
        );
        const parallel = await Promise.all(
          [1, 2].map(() =>
            post("/auth/otp/verify", {
              challengeId: challenge.challengeId,
              code,
            }),
          ),
        );
        assert.deepEqual(parallel.map((r) => r.status).sort(), [200, 401]);
        const tokens = await parallel.find((r) => r.status === 200).json();
        assert.equal(
          (
            await fetch(base + "/v1/me", {
              headers: { authorization: "Bearer " + tokens.accessToken },
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await post("/auth/otp/verify", {
              challengeId: challenge.challengeId,
              code,
            })
          ).status,
          401,
        );
        const refresh = await post("/auth/refresh", {
          refreshToken: tokens.refreshToken,
        });
        assert.equal(refresh.status, 200);
        const rotated = await refresh.json();
        assert.equal(
          (
            await fetch(base + "/v1/me", {
              headers: { authorization: "Bearer " + tokens.accessToken },
            })
          ).status,
          401,
        );
        assert.equal(
          (await post("/auth/refresh", { refreshToken: tokens.refreshToken }))
            .status,
          401,
        );
        assert.equal(
          (
            await fetch(base + "/v1/me", {
              headers: { authorization: "Bearer " + rotated.accessToken },
            })
          ).status,
          401,
        );
        const expired = await (
          await post("/auth/otp/request", { phone: "+77000000002" })
        ).json();
        await db.orm.otpChallenge.update({
          where: { id: expired.challengeId },
          data: { expiresAt: new Date(0) },
        });
        assert.equal(
          (
            await post("/auth/otp/verify", {
              challengeId: expired.challengeId,
              code: app.get(DevSmsProvider).deliveries.get(expired.challengeId),
            })
          ).status,
          401,
        );
        const exhausted = await (
          await post("/auth/otp/request", { phone: "+77000000003" })
        ).json();
        const actual = app
          .get(DevSmsProvider)
          .deliveries.get(exhausted.challengeId);
        for (let i = 0; i < 5; i++)
          assert.equal(
            (
              await post("/auth/otp/verify", {
                challengeId: exhausted.challengeId,
                code: actual === "111111" ? "111112" : "111111",
              })
            ).status,
            401,
          );
        assert.equal(
          (
            await post("/auth/otp/verify", {
              challengeId: exhausted.challengeId,
              code: actual,
            })
          ).status,
          401,
        );
      },
    );
    await t.test(
      "staff MFA, cookie/CSRF, branch RBAC and optimistic catalog edits",
      async () => {
        const branchId = "00000000-0000-4000-8000-000000000001",
          other = await db.orm.branch.create({
            data: { nameRu: "Другой", nameKk: "Басқа" },
          });
        const password = randomBytes(24).toString("hex"),
          mfa = randomBytes(20).toString("hex");
        const staff = await db.orm.staffUser.create({
          data: {
            email: "manager@example.invalid",
            passwordHash: await hashPassword(password),
            mfaSecret: encryptSecret(mfa),
            roles: { create: { role: "manager", branchId } },
          },
        });
        const request = (path, method = "GET", body, auth = {}) =>
          fetch(base + "/v1" + path, {
            method,
            headers: {
              "content-type": "application/json",
              origin: "http://127.0.0.1:3000",
              ...auth,
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
          });
        assert.equal(
          (
            await request("/admin/auth/login", "POST", {
              email: staff.email,
              password,
              code: "invalid",
            })
          ).status,
          400,
        );
        const code = totp(mfa).code,
          login = await request("/admin/auth/login", "POST", {
            email: staff.email,
            password,
            code,
          });
        assert.equal(login.status, 200);
        const cookie = login.headers.get("set-cookie").split(";")[0],
          { csrfToken } = await login.json(),
          headers = { cookie, "x-csrf-token": csrfToken };
        assert.match(login.headers.get("set-cookie"), /HttpOnly/);
        assert.match(login.headers.get("set-cookie"), /SameSite=Strict/i);
        assert.equal(
          (
            await request("/admin/auth/login", "POST", {
              email: staff.email,
              password,
              code,
            })
          ).status,
          401,
        );
        assert.equal(
          (await request("/admin/auth/session", "GET", null, { cookie }))
            .status,
          200,
        );
        assert.equal(
          (
            await request(
              "/admin/products?branchId=" + other.id,
              "GET",
              null,
              headers,
            )
          ).status,
          403,
        );
        const product = {
          branchId,
          nameRu: "Новое блюдо",
          nameKk: "Жаңа тағам",
          priceMinor: 125000,
        };
        assert.equal(
          (await request("/admin/products", "POST", product, { cookie }))
            .status,
          403,
        );
        assert.equal(
          (
            await request(
              "/admin/products",
              "POST",
              { ...product, role: "owner" },
              headers,
            )
          ).status,
          400,
        );
        const created = await request(
          "/admin/products",
          "POST",
          product,
          headers,
        );
        assert.equal(created.status, 201);
        const row = await created.json();
        const edits = await Promise.all(
          [130000, 140000].map((priceMinor) =>
            request(
              "/admin/products/" + row.id,
              "PATCH",
              { expectedVersion: 1, priceMinor },
              headers,
            ),
          ),
        );
        assert.deepEqual(edits.map((x) => x.status).sort(), [200, 409]);
        assert.equal(
          await db.orm.auditLog.count({ where: { entityId: row.id } }),
          2,
        );
        const current = await db.orm.product.findUniqueOrThrow({
          where: { id: row.id },
        });
        assert.equal(
          (
            await request(
              "/admin/products/" + row.id,
              "PATCH",
              { expectedVersion: current.version, active: false },
              headers,
            )
          ).status,
          200,
        );
        const catalog = await (
          await get("/catalog?branchId=" + branchId)
        ).json();
        assert.ok(!catalog.items.some((x) => x.id === row.id));
        assert.equal(
          (await request("/admin/auth/logout", "POST", {}, headers)).status,
          200,
        );
        assert.equal(
          (await request("/admin/auth/session", "GET", null, headers)).status,
          401,
        );
      },
    );
    await t.test(
      "checkout and restaurant/courier flows with concurrency and durable payments",
      async (flow) => {
        const contract = await (await fetch(base + "/openapi.json")).json(),
          ajv = new Ajv({ strict: false, allErrors: true });
        addFormats(ajv);
        ajv.addSchema({ components: contract.components }, "api-contract");
        const methods = new WeakMap(),
          validators = new Map();
        const request = async (path, method = "GET", body, headers = {}) => {
          const response = await fetch(base + "/v1" + path, {
            method,
            headers: {
              "content-type": "application/json",
              origin: "http://127.0.0.1:3000",
              ...headers,
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          });
          methods.set(response, method.toLowerCase());
          return response;
        };
        const ok = async (response, status = 200) => {
          const value = await response.json();
          assert.equal(
            response.status,
            status,
            JSON.stringify({ code: value.code, message: value.message }),
          );
          const path = new URL(response.url).pathname,
            template = Object.keys(contract.paths).find((p) =>
              new RegExp("^" + p.replace(/\{[^}]+\}/g, "[^/]+") + "$").test(
                path,
              ),
            );
          assert.ok(template, "Response route missing from OpenAPI");
          const item = contract.paths[template],
            method = methods.get(response),
            operation = method
              ? item[method]
              : Object.values(item).find(
                  (op) =>
                    op.responses?.[String(status)]?.content?.[
                      "application/json"
                    ],
                );
          const schema =
            operation?.responses?.[String(status)]?.content?.[
              "application/json"
            ]?.schema;
          assert.ok(
            schema?.$ref,
            "JSON response schema missing for " + template,
          );
          const key = schema.$ref;
          let validate = validators.get(key);
          if (!validate) {
            validate = ajv.compile({ $ref: "api-contract" + schema.$ref });
            validators.set(key, validate);
          }
          const valid = validate(value);
          assert.ok(
            valid,
            JSON.stringify({
              route: template,
              schema: key,
              errors: validate.errors?.map((e) => ({
                path: e.instancePath,
                keyword: e.keyword,
                message: e.message,
              })),
            }),
          );
          return value;
        };
        const branch = await db.orm.branch.create({
          data: {
            nameRu: "Тестовая кухня",
            nameKk: "Сынақ асүйі",
            acceptingOrders: true,
            allowCash: true,
            schedule: Array.from({ length: 7 }, (_, day) => ({
              day,
              startMinute: 0,
              endMinute: 1440,
            })),
          },
        });
        const p = await db.orm.product.create({
          data: {
            branchId: branch.id,
            nameRu: "Боул",
            nameKk: "Боул",
            priceMinor: 249000,
            stockQuantity: 2,
          },
        });
        async function buyer(phone) {
          const challenge = await ok(
            await request("/auth/otp/request", "POST", { phone }),
          );
          const tokens = await ok(
            await request("/auth/otp/verify", "POST", {
              challengeId: challenge.challengeId,
              code: app
                .get(DevSmsProvider)
                .deliveries.get(challenge.challengeId),
            }),
          );
          return { authorization: "Bearer " + tokens.accessToken };
        }
        async function staff(label, role) {
          const password = randomBytes(24).toString("hex"),
            mfa = randomBytes(20).toString("hex"),
            email = label + "@example.invalid";
          const user = await db.orm.staffUser.create({
            data: {
              email,
              passwordHash: await hashPassword(password),
              mfaSecret: encryptSecret(mfa),
              roles: {
                create: {
                  role,
                  ...(role === "owner" ? {} : { branchId: branch.id }),
                },
              },
            },
          });
          const response = await request("/admin/auth/login", "POST", {
              email,
              password,
              code: totp(mfa).code,
            }),
            cookie = response.headers.get("set-cookie")?.split(";")[0],
            body = await ok(response);
          return {
            id: user.id,
            mfa,
            headers: { cookie, "x-csrf-token": body.csrfToken },
          };
        }
        const a = await buyer("+77000000011"),
          b = await buyer("+77000000012"),
          owner = await staff("flow-owner", "owner"),
          kitchen = await staff("flow-kitchen", "kitchen"),
          courier = await staff("flow-courier", "courier"),
          otherCourier = await staff("flow-other-courier", "courier");
        const input = {
          branchId: branch.id,
          fulfilment: "pickup",
          items: [{ productId: p.id, quantity: 1 }],
        };
        const quote = (body = input, auth = a) =>
          request("/checkout/quote", "POST", body, auth).then((r) =>
            ok(r, 201),
          );
        const create = (
          q,
          auth = a,
          paymentMethod = "mock",
          idempotency = randomBytes(16).toString("hex"),
        ) =>
          request(
            "/orders",
            "POST",
            { quoteId: q.quoteId, paymentMethod },
            { ...auth, "idempotency-key": idempotency },
          );
        const command = (order, name, body = {}, auth = owner.headers) =>
          request(
            "/admin/orders/" + order.id + "/" + name,
            "POST",
            { expectedVersion: order.version, ...body },
            auth,
          ).then((r) => ok(r));
        const pay = (
          order,
          auth = a,
          outcome = "paid",
          paymentId = order.payments.at(-1).id,
        ) =>
          request(
            "/payments/" + paymentId + "/mock-result",
            "POST",
            { outcome },
            auth,
          ).then((r) => ok(r));
        await flow.test(
          "configured variants and required modifiers: server validation, quote refresh and immutable snapshot",
          async () => {
            const buyerC = await buyer("+77000000019"),
              id = () => crypto.randomUUID();
            const category = await ok(
              await request(
                "/admin/categories",
                "POST",
                {
                  branchId: branch.id,
                  nameRu: "Основные",
                  nameKk: "Негізгі",
                  active: true,
                  position: 1,
                },
                owner.headers,
              ),
              201,
            );
            const dish = await db.product.create({
                data: {
                  branchId: branch.id,
                  nameRu: "С вариантами",
                  nameKk: "Нұсқалар",
                  priceMinor: 100000,
                },
              }),
              v = id(),
              g = id(),
              c = id();
            let config = {
              variants: [
                {
                  id: v,
                  nameRu: "Большой",
                  nameKk: "Үлкен",
                  priceMinor: 200000,
                  active: true,
                },
              ],
              groups: [
                {
                  id: g,
                  nameRu: "Соус",
                  nameKk: "Тұздық",
                  minimum: 1,
                  maximum: 1,
                  choices: [
                    {
                      id: c,
                      nameRu: "Сыр",
                      nameKk: "Ірімшік",
                      deltaMinor: 10000,
                      active: true,
                    },
                  ],
                },
              ],
            };
            const configured = await ok(
              await request(
                "/admin/products/" + dish.id + "/configuration",
                "POST",
                {
                  expectedVersion: 1,
                  categoryId: category.id,
                  configuration: config,
                },
                owner.headers,
              ),
              201,
            );
            const plain = {
              branchId: branch.id,
              fulfilment: "pickup",
              items: [{ productId: dish.id, quantity: 2 }],
            };
            assert.equal(
              (await request("/checkout/quote", "POST", plain, buyerC)).status,
              422,
            );
            assert.equal(
              (
                await request(
                  "/checkout/quote",
                  "POST",
                  { ...plain, items: [{ ...plain.items[0], variantId: v }] },
                  buyerC,
                )
              ).status,
              422,
            );
            const valid = {
              ...plain,
              items: [{ ...plain.items[0], variantId: v, choiceIds: [c] }],
            };
            assert.equal(
              (
                await request(
                  "/checkout/quote",
                  "POST",
                  {
                    ...valid,
                    items: [{ ...valid.items[0], unitPriceMinor: 1 }],
                  },
                  buyerC,
                )
              ).status,
              400,
            );
            const q = await quote(valid, buyerC);
            assert.equal(q.totalMinor, 420000);
            assert.equal(q.items[0].options.length, 2);
            config = {
              ...config,
              variants: [{ ...config.variants[0], priceMinor: 250000 }],
            };
            await ok(
              await request(
                "/admin/products/" + dish.id + "/configuration",
                "POST",
                { expectedVersion: configured.version, configuration: config },
                owner.headers,
              ),
              201,
            );
            const stale = await create(q, buyerC);
            assert.equal(stale.status, 409);
            const fresh = (await stale.json()).details.quote;
            assert.equal(fresh.totalMinor, 520000);
            let order = await ok(await create(fresh, buyerC), 201);
            assert.equal(order.items[0].options.length, 2);
            assert.equal(order.totalMinor, 520000);
            await db.product.update({
              where: { id: dish.id },
              data: { configuration: {}, version: { increment: 1 } },
            });
            const saved = await ok(
              await request("/orders/" + order.id, "GET", undefined, buyerC),
            );
            assert.deepEqual(saved.items[0].options, order.items[0].options);
            order = await pay(order, buyerC);
            await ok(
              await request(
                "/orders/" + order.id + "/cancel",
                "POST",
                { expectedVersion: order.version, reason: "Test cleanup" },
                buyerC,
              ),
            );
            await ok(
              await request(
                "/admin/categories/" + category.id,
                "PATCH",
                {
                  branchId: branch.id,
                  nameRu: category.nameRu,
                  nameKk: category.nameKk,
                  active: false,
                  position: 1,
                  expectedVersion: category.version,
                },
                owner.headers,
              ),
            );
            const catalog = await (
              await get("/catalog?branchId=" + branch.id + "&limit=100")
            ).json();
            assert.ok(!catalog.items.some((p) => p.id === dish.id));
            assert.equal(
              (await request("/checkout/quote", "POST", plain, buyerC)).status,
              422,
            );
          },
        );

        await flow.test(
          "media upload checks scope, actual format, size and optimistic version; public assets are normalized WebP",
          async () => {
            const { default: sharp } = await import("sharp"),
              image = await sharp({
                create: {
                  width: 8,
                  height: 8,
                  channels: 3,
                  background: "#aabbcc",
                },
              })
                .png()
                .toBuffer();
            const dish = await db.product.create({
              data: {
                branchId: branch.id,
                nameRu: "С фото",
                nameKk: "Суретпен",
                priceMinor: 10000,
              },
            });
            const upload = (
              bytes,
              mime = "image/png",
              version = 1,
              auth = owner.headers,
            ) =>
              fetch(
                base +
                  "/v1/admin/products/" +
                  dish.id +
                  "/image?expectedVersion=" +
                  version,
                {
                  method: "POST",
                  headers: {
                    ...auth,
                    origin: "http://127.0.0.1:3000",
                    "content-type": mime,
                  },
                  body: bytes,
                },
              );
            assert.equal(
              (await upload(image, "image/png", 1, kitchen.headers)).status,
              403,
            );
            assert.equal(
              (await upload(Buffer.from("<svg/>"), "image/svg+xml")).status,
              415,
            );
            assert.equal((await upload(Buffer.from("<svg/>"))).status, 422);
            assert.equal(
              (await upload(Buffer.alloc(5 * 1024 * 1024 + 1))).status,
              413,
            );
            const saved = await ok(await upload(image), 201);
            assert.ok(saved.imageId);
            const media = await get("/media/" + saved.imageId);
            assert.equal(media.status, 200);
            assert.match(media.headers.get("content-type"), /^image\/webp/);
            assert.equal(
              media.headers.get("x-content-type-options"),
              "nosniff",
            );
            const metadata = await sharp(
              Buffer.from(await media.arrayBuffer()),
            ).metadata();
            assert.equal(metadata.format, "webp");
            assert.equal(metadata.width, 8);
            assert.equal(metadata.exif, undefined);
            assert.equal((await upload(image)).status, 409);
            const page = await (
              await get("/catalog?branchId=" + branch.id + "&limit=100")
            ).json();
            assert.equal(
              page.items.find((p) => p.id === dish.id).imageUrl,
              "/v1/media/" + saved.imageId,
            );
            await ok(
              await request(
                "/admin/products/" +
                  dish.id +
                  "/image?expectedVersion=" +
                  saved.version,
                "DELETE",
                undefined,
                owner.headers,
              ),
            );
            assert.equal(
              (await db.product.findUniqueOrThrow({ where: { id: dish.id } }))
                .imageId,
              null,
            );
          },
        );

        await flow.test(
          "cohort reports reconcile confirmed charges and refunds, export aggregates and enforce branch scope",
          async () => {
            const query = new URLSearchParams({
              branchId: branch.id,
              from: new Date(Date.now() - 3600000).toISOString(),
              to: new Date(Date.now() + 3600000).toISOString(),
            });
            const report = await ok(
              await request(
                "/admin/reports?" + query,
                "GET",
                undefined,
                owner.headers,
              ),
            );
            assert.equal(report.kind, "orders_created_cohort_snapshot");
            assert.equal(report.chargedMinor, 520000);
            assert.equal(report.refundedMinor, 520000);
            assert.equal(report.netReceivedMinor, 0);
            assert.equal(
              report.days.reduce((sum, d) => sum + d.count, 0),
              1,
            );
            assert.equal(
              (
                await request(
                  "/admin/reports?" + query,
                  "GET",
                  undefined,
                  kitchen.headers,
                )
              ).status,
              403,
            );
            const manager = await staff("reports-manager", "manager");
            query.set("branchId", "00000000-0000-4000-8000-000000000001");
            assert.equal(
              (
                await request(
                  "/admin/reports?" + query,
                  "GET",
                  undefined,
                  manager.headers,
                )
              ).status,
              403,
            );
            query.set("branchId", branch.id);
            const csv = await request(
              "/admin/reports/export?" + query,
              "GET",
              undefined,
              owner.headers,
            );
            assert.equal(csv.status, 200);
            assert.match(csv.headers.get("content-type"), /^text\/csv/);
            const rows = await csv.text();
            assert.ok(rows.includes("day,orders,totalMinor,currency"));
            assert.ok(rows.includes(",1,520000,KZT"));
            assert.ok(!rows.includes("phone"));
            query.set("from", "2020-01-01T00:00:00Z");
            assert.equal(
              (
                await request(
                  "/admin/reports?" + query,
                  "GET",
                  undefined,
                  owner.headers,
                )
              ).status,
              422,
            );
          },
        );

        await flow.test(
          "customer restrictions are scoped, audited and enforced at quote/order creation",
          async () => {
            const auth = await buyer("+77000000027"),
              q = await quote(input, auth),
              self = await ok(await request("/me", "GET", undefined, auth)),
              manager = await staff("customer-manager", "manager"),
              other = await db.orm.branch.create({
                data: { nameRu: "Другой", nameKk: "Басқа" },
              });
            let listed = await ok(
              await request(
                "/admin/customers?branchId=" + branch.id,
                "GET",
                undefined,
                manager.headers,
              ),
            );
            assert.ok(listed.items.some((c) => c.id === self.id));
            assert.ok(listed.items.every((c) => !("sessions" in c)));
            assert.equal(
              (
                await request(
                  "/admin/customers?branchId=" + other.id,
                  "GET",
                  undefined,
                  manager.headers,
                )
              ).status,
              403,
            );
            const body = {
              branchId: branch.id,
              blocked: true,
              reason: "Synthetic restriction reason",
              expectedVersion: 0,
            };
            assert.equal(
              (
                await request(
                  "/admin/customers/" + self.id + "/restriction",
                  "POST",
                  body,
                  courier.headers,
                )
              ).status,
              403,
            );
            assert.equal(
              (
                await request(
                  "/admin/customers/" + self.id + "/restriction",
                  "POST",
                  { ...body, branchId: other.id },
                  manager.headers,
                )
              ).status,
              403,
            );
            assert.equal(
              (
                await request(
                  "/admin/customers/" + self.id + "/restriction",
                  "POST",
                  { ...body, reason: "" },
                  manager.headers,
                )
              ).status,
              400,
            );
            const restricted = await ok(
              await request(
                "/admin/customers/" + self.id + "/restriction",
                "POST",
                body,
                manager.headers,
              ),
            );
            assert.equal(restricted.blocked, true);
            assert.equal(
              (await request("/checkout/quote", "POST", input, auth)).status,
              403,
            );
            assert.equal((await create(q, auth)).status, 403);
            assert.equal(
              (await request("/me", "GET", undefined, auth)).status,
              200,
              "Blocking new purchases must not hide profile/privacy rights",
            );
            assert.equal(
              (
                await request(
                  "/admin/customers/" + self.id + "/restriction",
                  "POST",
                  body,
                  manager.headers,
                )
              ).status,
              409,
            );
            await ok(
              await request(
                "/admin/customers/" + self.id + "/restriction",
                "POST",
                {
                  ...body,
                  blocked: false,
                  expectedVersion: restricted.version,
                  reason: "Synthetic unblock reason",
                },
                manager.headers,
              ),
            );
            const order = await ok(await create(q, auth), 201);
            await ok(
              await request(
                "/orders/" + order.id + "/cancel",
                "POST",
                {
                  expectedVersion: order.version,
                  reason: "Synthetic test cleanup",
                },
                auth,
              ),
            );
            const audit = await db.orm.auditLog.findMany({
              where: {
                entityId: self.id,
                action: { in: ["customer.blocked", "customer.unblocked"] },
              },
            });
            assert.equal(audit.length, 2);
            assert.equal(audit[0].details.branchId, branch.id);
          },
        );
        await flow.test(
          "incompatible combinations are published, enforced and rechecked before order creation",
          async () => {
            const ids = Array.from({ length: 5 }, () => crypto.randomUUID()),
              [v1, v2, g, c1, c2] = ids;
            const dish = await db.orm.product.create({
              data: {
                branchId: branch.id,
                nameRu: "Совместимость",
                nameKk: "Үйлесімділік",
                priceMinor: 100000,
              },
            });
            const config = {
              variants: [
                {
                  id: v1,
                  nameRu: "Первый",
                  nameKk: "Бірінші",
                  priceMinor: 100000,
                  active: true,
                },
                {
                  id: v2,
                  nameRu: "Второй",
                  nameKk: "Екінші",
                  priceMinor: 200000,
                  active: true,
                },
              ],
              groups: [
                {
                  id: g,
                  nameRu: "Добавки",
                  nameKk: "Қоспалар",
                  minimum: 1,
                  maximum: 2,
                  choices: [
                    {
                      id: c1,
                      nameRu: "Сыр",
                      nameKk: "Ірімшік",
                      deltaMinor: 10000,
                      active: true,
                    },
                    {
                      id: c2,
                      nameRu: "Соус",
                      nameKk: "Тұздық",
                      deltaMinor: 20000,
                      active: true,
                    },
                  ],
                },
              ],
              incompatiblePairs: [
                { firstId: v1, secondId: c1 },
                { firstId: c1, secondId: c2 },
              ],
            };
            const saved = await ok(
              await request(
                "/admin/products/" + dish.id + "/configuration",
                "POST",
                { expectedVersion: 1, configuration: config },
                owner.headers,
              ),
              201,
            );
            const catalog = await (
              await get("/catalog?branchId=" + branch.id + "&limit=100")
            ).json();
            assert.deepEqual(
              catalog.items.find((value) => value.id === dish.id).configuration
                .incompatiblePairs,
              config.incompatiblePairs,
            );
            const subject = await db.orm.customer.create({
                data: { phone: "+77000000028" },
              }),
              token = randomBytes(32).toString("hex");
            await db.orm.authSession.create({
              data: {
                customerId: subject.id,
                accessHash: digest(token),
                familyId: crypto.randomUUID(),
                expiresAt: new Date(Date.now() + 900000),
              },
            });
            const auth = { authorization: "Bearer " + token };
            const make = (variantId, choiceIds) => ({
              ...input,
              items: [
                { productId: dish.id, quantity: 1, variantId, choiceIds },
              ],
            });
            for (const body of [make(v1, [c1]), make(v2, [c1, c2])]) {
              const response = await request(
                "/checkout/quote",
                "POST",
                body,
                auth,
              );
              assert.equal(response.status, 422);
              assert.equal(
                (await response.json()).code,
                "INCOMPATIBLE_OPTIONS",
              );
            }
            const allowed = await quote(make(v2, [c1]), auth);
            assert.equal(allowed.totalMinor, 210000);
            const beforeChange = await quote(make(v1, [c2]), auth);
            assert.equal(
              (
                await request(
                  "/admin/products/" + dish.id + "/configuration",
                  "POST",
                  {
                    expectedVersion: saved.version,
                    configuration: {
                      ...config,
                      incompatiblePairs: [
                        ...config.incompatiblePairs,
                        { firstId: c1, secondId: v1 },
                      ],
                    },
                  },
                  owner.headers,
                )
              ).status,
              422,
            );
            await ok(
              await request(
                "/admin/products/" + dish.id + "/configuration",
                "POST",
                {
                  expectedVersion: saved.version,
                  configuration: {
                    ...config,
                    incompatiblePairs: [
                      ...config.incompatiblePairs,
                      { firstId: v1, secondId: c2 },
                    ],
                  },
                },
                owner.headers,
              ),
              201,
            );
            const denied = await create(beforeChange, auth);
            assert.equal(denied.status, 422);
            assert.equal((await denied.json()).code, "INCOMPATIBLE_OPTIONS");
            assert.equal(
              await db.orm.order.count({
                where: { quoteId: beforeChange.quoteId },
              }),
              0,
            );
          },
        );
        await flow.test(
          "owner diagnostics distinguish fresh and stale workers; dead-letter retry is strict and audited",
          async () => {
            await db.orm.workerHeartbeat.upsert({
              where: { kind: "expiry" },
              create: { kind: "expiry", lastSeenAt: new Date() },
              update: { lastSeenAt: new Date() },
            });
            await db.orm.workerHeartbeat.upsert({
              where: { kind: "notifications" },
              create: { kind: "notifications", lastSeenAt: new Date(0) },
              update: { lastSeenAt: new Date(0) },
            });
            const event = await db.orm.outboxEvent.findFirstOrThrow();
            await db.orm.outboxEvent.update({
              where: { id: event.id },
              data: { attempts: 10 },
            });
            const status = await ok(
              await request("/admin/system", "GET", undefined, owner.headers),
            );
            assert.equal(
              status.workers.find((w) => w.kind === "expiry").healthy,
              true,
            );
            assert.equal(
              status.workers.find((w) => w.kind === "notifications").healthy,
              false,
            );
            assert.ok(status.outbox.deadLetters >= 1);
            assert.ok(!JSON.stringify(status).includes("phone"));
            assert.equal(
              (
                await request(
                  "/admin/system",
                  "GET",
                  undefined,
                  kitchen.headers,
                )
              ).status,
              403,
            );
            assert.equal(
              (
                await request(
                  "/admin/outbox/" + event.id + "/retry",
                  "POST",
                  { force: true },
                  owner.headers,
                )
              ).status,
              400,
            );
            assert.equal(
              (
                await request(
                  "/admin/outbox/" + event.id + "/retry",
                  "POST",
                  {},
                  kitchen.headers,
                )
              ).status,
              403,
            );
            await ok(
              await request(
                "/admin/outbox/" + event.id + "/retry",
                "POST",
                {},
                owner.headers,
              ),
            );
            assert.equal(
              (
                await db.orm.outboxEvent.findUniqueOrThrow({
                  where: { id: event.id },
                })
              ).attempts,
              0,
            );
            assert.ok(
              await db.orm.auditLog.findFirst({
                where: { entityId: event.id, action: "outbox.retry" },
              }),
            );
          },
        );

        await flow.test(
          "different variants share atomic portion stock and one reservation per product",
          async () => {
            const actor = await buyer("+77000000022"),
              v1 = crypto.randomUUID(),
              v2 = crypto.randomUUID(),
              dish = await db.product.create({
                data: {
                  branchId: branch.id,
                  nameRu: "Два варианта",
                  nameKk: "Екі нұсқа",
                  priceMinor: 100000,
                  stockQuantity: 1,
                  configuration: {
                    variants: [
                      {
                        id: v1,
                        nameRu: "Первый",
                        nameKk: "Бірінші",
                        priceMinor: 100000,
                        active: true,
                      },
                      {
                        id: v2,
                        nameRu: "Второй",
                        nameKk: "Екінші",
                        priceMinor: 150000,
                        active: true,
                      },
                    ],
                    groups: [],
                  },
                },
              });
            const body = {
              branchId: branch.id,
              fulfilment: "pickup",
              items: [
                { productId: dish.id, variantId: v1, quantity: 1 },
                { productId: dish.id, variantId: v2, quantity: 1 },
              ],
            };
            assert.equal(
              (await request("/checkout/quote", "POST", body, actor)).status,
              422,
            );
            await db.product.update({
              where: { id: dish.id },
              data: { stockQuantity: 2 },
            });
            assert.equal(
              (
                await request(
                  "/checkout/quote",
                  "POST",
                  { ...body, items: [body.items[0], body.items[0]] },
                  actor,
                )
              ).status,
              422,
            );
            const q = await quote(body, actor);
            assert.equal(q.totalMinor, 250000);
            let order = await ok(await create(q, actor), 201);
            assert.equal(order.items.length, 2);
            const reservations = await db.orm.stockReservation.findMany({
              where: { orderId: order.id },
            });
            assert.equal(reservations.length, 1);
            assert.equal(reservations[0].quantity, 2);
            assert.equal(
              (await db.product.findUniqueOrThrow({ where: { id: dish.id } }))
                .stockQuantity,
              0,
            );
            order = await pay(order, actor);
            await ok(
              await request(
                "/orders/" + order.id + "/cancel",
                "POST",
                {
                  expectedVersion: order.version,
                  reason: "Fixture cancellation",
                },
                actor,
              ),
            );
            assert.equal(
              (await db.product.findUniqueOrThrow({ where: { id: dish.id } }))
                .stockQuantity,
              2,
            );
          },
        );
        await flow.test(
          "zero total explicitly needs no payment/provider attempt and can complete pickup",
          async () => {
            const actor = await buyer("+77000000023"),
              dish = await db.product.create({
                data: {
                  branchId: branch.id,
                  nameRu: "Подарок",
                  nameKk: "Сыйлық",
                  priceMinor: 100000,
                  stockQuantity: 2,
                },
              });
            await db.orm.promotion.create({
              data: {
                branchId: branch.id,
                code: "FREE100",
                basisPoints: 10000,
                startsAt: new Date(Date.now() - 60000),
                endsAt: new Date(Date.now() + 3600000),
              },
            });
            const q = await quote(
              {
                branchId: branch.id,
                fulfilment: "pickup",
                promoCode: "FREE100",
                items: [{ productId: dish.id, quantity: 1 }],
              },
              actor,
            );
            assert.equal(q.totalMinor, 0);
            let order = await ok(await create(q, actor), 201);
            assert.equal(order.status, "placed");
            assert.equal(order.paymentMethod, "no_payment_required");
            assert.equal(order.paymentStatus, "not_required");
            assert.deepEqual(order.payments, []);
            assert.equal(
              await db.orm.paymentAttempt.count({
                where: { orderId: order.id },
              }),
              0,
            );
            order = await command(order, "accept", { preparationMinutes: 15 });
            order = await command(order, "prepare");
            order = await command(order, "ready");
            const customer = await ok(
              await request("/orders/" + order.id, "GET", undefined, actor),
            );
            order = await command(order, "complete-pickup", {
              pickupCode: customer.pickupCode,
            });
            assert.equal(order.status, "completed");
            assert.equal(order.paymentStatus, "not_required");
            assert.equal(
              await db.orm.paymentAttempt.count({
                where: { orderId: order.id },
              }),
              0,
            );
          },
        );
        await flow.test(
          "ambiguous checkout recovers current owned state by key and consumed quote cannot duplicate it",
          async () => {
            const actor = await buyer("+77000000024"),
              key = crypto.randomUUID(),
              q = await quote(input, actor);
            let order = await ok(await create(q, actor, "mock", key), 201);
            order = await pay(order, actor);
            const current = await ok(
              await request("/orders/by-key/" + key, "GET", undefined, actor),
            );
            assert.equal(current.id, order.id);
            assert.equal(current.paymentStatus, "paid");
            assert.equal(current.version, order.version);
            assert.equal(
              (await request("/orders/by-key/" + key, "GET", undefined, b))
                .status,
              404,
            );
            const consumed = await create(q, actor);
            assert.equal(consumed.status, 409);
            const details = (await consumed.json()).details;
            assert.equal(details.order.id, order.id);
            assert.equal(details.order.paymentStatus, "paid");
            await ok(
              await request(
                "/orders/" + order.id + "/cancel",
                "POST",
                {
                  expectedVersion: order.version,
                  reason: "Fixture cancellation",
                },
                actor,
              ),
            );
          },
        );

        let completed;
        await flow.test(
          "server totals, repeated create, foreign IDs and pickup to completed",
          async () => {
            assert.equal(
              (
                await request(
                  "/checkout/quote",
                  "POST",
                  { ...input, totalMinor: 1 },
                  a,
                )
              ).status,
              400,
            );
            const q = await quote();
            assert.equal(q.totalMinor, 249000);
            assert.equal(q.deliveryFeeMinor, 0);
            assert.ok(new Date(q.expiresAt).getTime() <= Date.now() + 300000);
            const idem = randomBytes(16).toString("hex"),
              responses = await Promise.all(
                [1, 2, 3].map(() => create(q, a, "mock", idem)),
              );
            for (const response of responses)
              assert.equal(response.status, 201);
            const rows = await Promise.all(responses.map((r) => r.json()));
            assert.equal(new Set(rows.map((r) => r.id)).size, 1);
            let order = rows[0];
            assert.equal(
              await db.orm.order.count({ where: { quoteId: q.quoteId } }),
              1,
            );
            assert.equal(
              (await db.orm.product.findUniqueOrThrow({ where: { id: p.id } }))
                .stockQuantity,
              1,
            );
            const q2 = await quote();
            assert.equal((await create(q2, a, "mock", idem)).status, 409);
            assert.equal((await create(q)).status, 409);
            assert.equal(
              (await request("/orders/" + order.id, "GET", undefined, b))
                .status,
              404,
            );
            assert.equal(
              (
                await request(
                  "/payments/" + order.payments[0].id + "/mock-result",
                  "POST",
                  { outcome: "paid" },
                  b,
                )
              ).status,
              404,
            );
            order = await pay(order, a, "timeout");
            assert.equal(order.status, "awaiting_payment");
            assert.equal(order.paymentStatus, "pending");
            assert.equal(
              (
                await request(
                  "/orders/" + order.id + "/payment-attempts",
                  "POST",
                  {},
                  { ...a, "idempotency-key": randomBytes(16).toString("hex") },
                )
              ).status,
              409,
            );
            assert.equal(
              (
                await request(
                  "/admin/orders/" + order.id + "/accept",
                  "POST",
                  { expectedVersion: order.version, preparationMinutes: 20 },
                  owner.headers,
                )
              ).status,
              409,
            );
            order = await pay(order);
            assert.equal(order.status, "placed");
            assert.equal(order.paymentStatus, "paid");
            const repeatedPaid = await Promise.all(
              Array.from({ length: 10 }, () => pay(order)),
            );
            assert.ok(
              repeatedPaid.every(
                (value) =>
                  value.version === order.version &&
                  value.paymentStatus === "paid",
              ),
            );
            assert.equal(
              await db.orm.paymentAttempt.count({
                where: { orderId: order.id },
              }),
              1,
            );
            assert.equal(
              await db.orm.outboxEvent.count({
                where: { aggregateId: order.id, type: "payment.confirmed" },
              }),
              1,
            );

            await ok(
              await request(
                "/admin/products/" + p.id,
                "PATCH",
                {
                  expectedVersion: 1,
                  nameRu: "Новая цена",
                  priceMinor: 329000,
                },
                owner.headers,
              ),
            );
            const snapshot = await ok(
              await request("/orders/" + order.id, "GET", undefined, a),
            );
            assert.equal(snapshot.items[0].unitPriceMinor, 249000);
            assert.equal(snapshot.items[0].nameRu, "Боул");
            order = await command(order, "accept", { preparationMinutes: 20 });
            assert.equal(order.status, "accepted");
            assert.equal(
              (
                await request(
                  "/orders/" + order.id + "/cancel",
                  "POST",
                  {
                    expectedVersion: order.version,
                    reason: "Отмена после принятия",
                  },
                  a,
                )
              ).status,
              409,
            );
            const unrelatedManager = await db.orm.roleBinding.create({
              data: {
                staffId: kitchen.id,
                role: "manager",
                branchId: "00000000-0000-4000-8000-000000000001",
              },
            });
            try {
              const detail = await ok(
                await request(
                  "/admin/orders/" + order.id,
                  "GET",
                  undefined,
                  kitchen.headers,
                ),
              );
              const page = await ok(
                await request(
                  "/admin/orders?branchId=" + branch.id,
                  "GET",
                  undefined,
                  kitchen.headers,
                ),
              );
              const restricted = (value) => {
                for (const key of [
                  "contact",
                  "address",
                  "payments",
                  "totalMinor",
                  "paymentStatus",
                ])
                  assert.ok(
                    !(key in value),
                    "Unrelated branch role must not reveal " + key,
                  );
                assert.ok(
                  value.items.every((item) => !("unitPriceMinor" in item)),
                );
              };
              restricted(detail);
              page.items.forEach(restricted);
              assert.equal(
                (
                  await request(
                    "/admin/orders/" + order.id + "/cancel",
                    "POST",
                    {
                      expectedVersion: order.version,
                      reason: "Synthetic unauthorized action",
                    },
                    kitchen.headers,
                  )
                ).status,
                403,
              );
              order = await command(order, "prepare", {}, kitchen.headers);
              restricted(order);
            } finally {
              await db.orm.roleBinding.delete({
                where: { id: unrelatedManager.id },
              });
            }
            assert.equal(order.status, "preparing");
            assert.ok(!("contact" in order));
            assert.ok(!("address" in order));
            order = await command(order, "ready", {}, kitchen.headers);
            const ready = await ok(
              await request("/orders/" + order.id, "GET", undefined, a),
            );
            assert.match(ready.pickupCode, /^[0-9]{6}$/);
            assert.equal(
              (
                await ok(
                  await request(
                    "/admin/orders/" + order.id,
                    "GET",
                    undefined,
                    owner.headers,
                  ),
                )
              ).pickupCode,
              null,
            );
            assert.equal(
              (
                await request(
                  "/admin/orders/" + order.id + "/complete-pickup",
                  "POST",
                  {
                    expectedVersion: order.version,
                    pickupCode:
                      ready.pickupCode === "000000" ? "000001" : "000000",
                  },
                  owner.headers,
                )
              ).status,
              422,
            );
            completed = await command(order, "complete-pickup", {
              pickupCode: ready.pickupCode,
            });
            assert.equal(completed.status, "completed");
          },
        );
        await flow.test(
          "cash pickup requires explicit receipt and no address",
          async () => {
            let order = await ok(await create(await quote(), a, "cash"), 201);
            assert.equal(order.status, "placed");
            assert.equal(order.paymentStatus, "unpaid");
            order = await command(order, "accept", { preparationMinutes: 10 });
            order = await command(order, "prepare");
            order = await command(order, "ready");
            const ready = await ok(
              await request("/orders/" + order.id, "GET", undefined, a),
            );
            assert.equal(
              (
                await request(
                  "/admin/orders/" + order.id + "/complete-pickup",
                  "POST",
                  {
                    expectedVersion: order.version,
                    pickupCode: ready.pickupCode,
                  },
                  owner.headers,
                )
              ).status,
              422,
            );
            order = await command(order, "complete-pickup", {
              pickupCode: ready.pickupCode,
              cashReceived: true,
            });
            assert.equal(order.status, "completed");
            assert.equal(order.paymentStatus, "paid");
          },
        );
        await flow.test(
          "last stock reservation is atomic and cancellation restores once",
          async () => {
            await db.orm.product.update({
              where: { id: p.id },
              data: { stockQuantity: 1 },
            });
            const qa = await quote(),
              qb = await quote(input, b);
            const responses = await Promise.all([create(qa, a), create(qb, b)]);
            assert.deepEqual(responses.map((r) => r.status).sort(), [201, 422]);
            const index = responses.findIndex((r) => r.status === 201),
              order = await responses[index].json(),
              auth = index === 0 ? a : b;
            assert.equal(
              (await db.orm.product.findUniqueOrThrow({ where: { id: p.id } }))
                .stockQuantity,
              0,
            );
            const cancelled = await ok(
              await request(
                "/orders/" + order.id + "/cancel",
                "POST",
                {
                  expectedVersion: order.version,
                  reason: "Тест отмены резерва",
                },
                auth,
              ),
            );
            assert.equal(cancelled.status, "cancelled");
            assert.equal(
              (await db.orm.product.findUniqueOrThrow({ where: { id: p.id } }))
                .stockQuantity,
              1,
            );
            assert.equal(
              (
                await request(
                  "/orders/" + order.id + "/cancel",
                  "POST",
                  {
                    expectedVersion: cancelled.version,
                    reason: "Повторная отмена",
                  },
                  auth,
                )
              ).status,
              409,
            );
            assert.equal(
              (await db.orm.product.findUniqueOrThrow({ where: { id: p.id } }))
                .stockQuantity,
              1,
            );
          },
        );
        await flow.test(
          "expired/changed quote requires explicit new confirmation; stop-list blocks order",
          async () => {
            const expired = await quote();
            await db.orm.quote.update({
              where: { id: expired.quoteId },
              data: { expiresAt: new Date(0) },
            });
            let response = await create(expired);
            assert.equal(response.status, 409);
            assert.ok((await response.json()).details.quote.quoteId);
            const stale = await quote();
            await db.orm.product.update({
              where: { id: p.id },
              data: { priceMinor: 249000, version: { increment: 1 } },
            });
            response = await create(stale);
            assert.equal(response.status, 409);
            assert.equal(
              (await response.json()).details.quote.totalMinor,
              249000,
            );
            assert.equal(
              await db.orm.order.count({ where: { quoteId: stale.quoteId } }),
              0,
            );
            const stopped = await quote();
            await db.orm.product.update({
              where: { id: p.id },
              data: { active: false, version: { increment: 1 } },
            });
            assert.equal((await create(stopped)).status, 422);
            await db.orm.product.update({
              where: { id: p.id },
              data: {
                active: true,
                stockQuantity: null,
                version: { increment: 1 },
              },
            });
          },
        );
        await flow.test(
          "last promotion use is atomic and released by cancellation",
          async () => {
            const promo = await db.orm.promotion.create({
              data: {
                branchId: branch.id,
                code: "LASTONE",
                basisPoints: 1000,
                totalLimit: 1,
                customerLimit: 1,
                startsAt: new Date(Date.now() - 1000),
                endsAt: new Date(Date.now() + 3600000),
              },
            });
            const qa = await quote({ ...input, promoCode: promo.code }),
              qb = await quote({ ...input, promoCode: promo.code }, b),
              responses = await Promise.all([create(qa, a), create(qb, b)]);
            assert.deepEqual(responses.map((r) => r.status).sort(), [201, 422]);
            assert.equal(
              await db.orm.promotionRedemption.count({
                where: { promotionId: promo.id, releasedAt: null },
              }),
              1,
            );
            const index = responses.findIndex((r) => r.status === 201),
              order = await responses[index].json();
            await ok(
              await request(
                "/orders/" + order.id + "/cancel",
                "POST",
                {
                  expectedVersion: order.version,
                  reason: "Освободить промокод",
                },
                index === 0 ? a : b,
              ),
            );
            assert.equal(
              await db.orm.promotionRedemption.count({
                where: { promotionId: promo.id, releasedAt: null },
              }),
              0,
            );
          },
        );
        await flow.test(
          "delivery zone boundaries, post-discount fee threshold, courier RBAC and completion",
          async () => {
            await db.orm.deliveryZone.create({
              data: {
                branchId: branch.id,
                name: "Тестовая зона",
                polygon: [
                  { latitude: 43, longitude: 76 },
                  { latitude: 43, longitude: 77 },
                  { latitude: 44, longitude: 77 },
                  { latitude: 44, longitude: 76 },
                ],
                feeMinor: 50000,
                minimumMinor: 200000,
                freeThresholdMinor: 240000,
              },
            });
            await db.orm.promotion.create({
              data: {
                branchId: branch.id,
                code: "TENOFF",
                basisPoints: 1000,
                startsAt: new Date(Date.now() - 1000),
                endsAt: new Date(Date.now() + 3600000),
              },
            });
            const delivery = {
              ...input,
              fulfilment: "delivery",
              address: {
                text: "Тестовая улица, 1",
                latitude: 43,
                longitude: 76.5,
              },
            };
            const discounted = await quote({
              ...delivery,
              promoCode: "TENOFF",
            });
            assert.equal(discounted.discountMinor, 24900);
            assert.equal(discounted.deliveryFeeMinor, 50000);
            assert.equal(discounted.totalMinor, 274100);
            assert.equal(
              (
                await request(
                  "/checkout/quote",
                  "POST",
                  {
                    ...delivery,
                    address: { ...delivery.address, latitude: 42 },
                  },
                  a,
                )
              ).status,
              422,
            );
            let order = await ok(await create(await quote(delivery)), 201);
            assert.equal(order.deliveryFeeMinor, 0);
            order = await pay(order);
            order = await command(order, "accept", { preparationMinutes: 15 });
            order = await command(order, "prepare");
            order = await command(order, "ready");
            order = await command(order, "assign-courier", {
              courierId: courier.id,
            });
            const hidden = await ok(
              await request(
                "/admin/orders/" + order.id,
                "GET",
                undefined,
                kitchen.headers,
              ),
            );
            assert.ok(!("address" in hidden));
            assert.ok(!("contact" in hidden));
            assert.ok(!("payments" in hidden));
            assert.equal(
              (
                await request(
                  "/courier/assignments/" + order.id + "/collect",
                  "POST",
                  { expectedVersion: order.version },
                  otherCourier.headers,
                )
              ).status,
              404,
            );
            assert.equal(
              (
                await request(
                  "/admin/orders/" + order.id + "/assign-courier",
                  "POST",
                  { expectedVersion: order.version, courierId: courier.id },
                  courier.headers,
                )
              ).status,
              403,
            );
            order = await ok(
              await request(
                "/courier/assignments/" + order.id + "/accept",
                "POST",
                { expectedVersion: order.version },
                courier.headers,
              ),
            );
            order = await ok(
              await request(
                "/courier/assignments/" + order.id + "/collect",
                "POST",
                { expectedVersion: order.version },
                courier.headers,
              ),
            );
            assert.equal(order.status, "out_for_delivery");
            order = await ok(
              await request(
                "/courier/assignments/" + order.id + "/deliver",
                "POST",
                { expectedVersion: order.version },
                courier.headers,
              ),
            );
            assert.equal(order.status, "delivered");
            const assignments = await ok(
              await request(
                "/courier/assignments",
                "GET",
                undefined,
                courier.headers,
              ),
            );
            assert.ok(!assignments.items.some((o) => o.id === order.id));
            assert.equal(
              (
                await request(
                  "/courier/assignments/" + order.id + "/collect",
                  "POST",
                  { expectedVersion: order.version },
                  courier.headers,
                )
              ).status,
              404,
            );
          },
        );
        await flow.test(
          "accept/cancel race has one winner and paid cancellation refunds once",
          async () => {
            let order = await ok(await create(await quote()), 201);
            order = await pay(order);
            const responses = await Promise.all([
              request(
                "/orders/" + order.id + "/cancel",
                "POST",
                {
                  expectedVersion: order.version,
                  reason: "Одновременная отмена",
                },
                a,
              ),
              request(
                "/admin/orders/" + order.id + "/accept",
                "POST",
                { expectedVersion: order.version, preparationMinutes: 20 },
                owner.headers,
              ),
            ]);
            assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
            const state = await ok(
              await request("/orders/" + order.id, "GET", undefined, a),
            );
            assert.ok(["cancelled", "accepted"].includes(state.status));
            if (state.status === "cancelled") {
              assert.equal(state.paymentStatus, "refunded");
              assert.equal(
                await db.orm.refund.count({
                  where: { paymentId: order.payments[0].id },
                }),
                1,
              );
            }
          },
        );
        await flow.test(
          "expiry restores stock; late payment refunds without reviving order",
          async () => {
            const finite = await db.orm.product.create({
              data: {
                branchId: branch.id,
                nameRu: "Последняя порция",
                nameKk: "Соңғы порция",
                priceMinor: 100000,
                stockQuantity: 1,
              },
            });
            const q = await quote({
              ...input,
              items: [{ productId: finite.id, quantity: 1 }],
            });
            let order = await ok(await create(q), 201);
            await db.orm.order.update({
              where: { id: order.id },
              data: { expiresAt: new Date(0) },
            });
            await app.get(OrderService).expireOverdue();
            assert.equal(
              (
                await db.orm.product.findUniqueOrThrow({
                  where: { id: finite.id },
                })
              ).stockQuantity,
              1,
            );
            order = await pay(order);
            assert.equal(order.status, "expired");
            assert.equal(order.paymentStatus, "refunded");
            await pay(order);
            assert.equal(
              await db.orm.refund.count({
                where: { paymentId: order.payments[0].id },
              }),
              1,
            );
            assert.equal(
              (
                await db.orm.product.findUniqueOrThrow({
                  where: { id: finite.id },
                })
              ).stockQuantity,
              1,
            );
          },
        );
        await flow.test(
          "payment retries: late success wins, stale failure never regresses paid, duplicate payment refunds",
          async () => {
            let order = await ok(await create(await quote()), 201),
              first = order.payments[0].id;
            order = await pay(order, a, "failed");
            assert.equal(order.paymentStatus, "failed");
            const retryKey = randomBytes(16).toString("hex");
            order = await ok(
              await request(
                "/orders/" + order.id + "/payment-attempts",
                "POST",
                {},
                { ...a, "idempotency-key": retryKey },
              ),
              201,
            );
            const second = order.payments.at(-1).id;
            assert.notEqual(first, second);
            const repeated = await ok(
              await request(
                "/orders/" + order.id + "/payment-attempts",
                "POST",
                {},
                { ...a, "idempotency-key": retryKey },
              ),
              201,
            );
            assert.equal(repeated.payments.at(-1).id, second);
            order = await pay(order, a, "paid", first);
            assert.equal(order.status, "placed");
            order = await pay(order, a, "failed", second);
            assert.equal(order.paymentStatus, "paid");
            order = await pay(order, a, "paid", second);
            assert.equal(order.paymentStatus, "paid");
            assert.equal(
              order.payments.find((p) => p.id === second).refund.amountMinor,
              order.totalMinor,
            );
            assert.equal(
              await db.orm.refund.count({ where: { paymentId: second } }),
              1,
            );
          },
        );
        await flow.test(
          "amount mismatch is manual review, not paid; refund needs MFA/permission/idempotency",
          async () => {
            let order = await ok(await create(await quote()), 201);
            await db.orm.paymentAttempt.update({
              where: { id: order.payments[0].id },
              data: { amountMinor: 1 },
            });
            order = await pay(order);
            assert.equal(order.status, "awaiting_payment");
            assert.equal(order.paymentStatus, "manual_review");
            const reason = "Полный тестовый возврат",
              code = totp(owner.mfa, Date.now() + 30000).code,
              key = randomBytes(16).toString("hex"),
              path = "/admin/payments/" + completed.payments[0].id + "/refunds";
            assert.equal(
              (await request(path, "POST", { reason, code }, kitchen.headers))
                .status,
              403,
            );
            assert.equal(
              (
                await request(
                  path,
                  "POST",
                  { reason, code, amountMinor: 1 },
                  { ...owner.headers, "idempotency-key": key },
                )
              ).status,
              400,
            );
            const first = await ok(
              await request(
                path,
                "POST",
                { reason, code },
                { ...owner.headers, "idempotency-key": key },
              ),
              201,
            );
            assert.equal(first.amountMinor, 249000);
            assert.equal(first.status, "refunded");
            const second = await ok(
              await request(
                path,
                "POST",
                { reason, code },
                { ...owner.headers, "idempotency-key": key },
              ),
              201,
            );
            assert.equal(first.id, second.id);
            assert.equal(
              await db.orm.refund.count({
                where: { paymentId: completed.payments[0].id },
              }),
              1,
            );
            const events = await db.orm.orderEvent.findMany({
              where: { order: { branchId: branch.id } },
            });
            const pending = await db.orm.outboxEvent.count({
              where: {
                aggregateId: {
                  in: (
                    await db.orm.order.findMany({
                      where: { branchId: branch.id },
                      select: { id: true },
                    })
                  ).map((o) => o.id),
                },
                processedAt: null,
              },
            });
            assert.equal(pending, events.length);
          },
        );
      },
    );
    await t.test(
      "BullMQ delivery deduplicates, restores lost queue jobs and survives worker restart",
      async () => {
        assert.ok(
          process.env.REDIS_URL,
          "REDIS_URL and a local/test Redis are required",
        );
        const prefix = "food-test-" + randomBytes(8).toString("hex");
        let pump = new NotificationPump(db.orm, process.env.REDIS_URL, prefix);
        async function waitFor(check) {
          const deadline = Date.now() + 20000;
          while (Date.now() < deadline) {
            if (await check()) return;
            await new Promise((ok) => setTimeout(ok, 50));
          }
          assert.fail("Outbox recovery did not finish");
        }
        try {
          await pump.start();
          await pump.worker.pause();
          await pump.enqueuePending();
          assert.ok(
            (await db.orm.outboxEvent.count({ where: { processedAt: null } })) >
              0,
          );
          await pump.queue.drain();
          assert.ok(
            (await db.orm.outboxEvent.count({ where: { processedAt: null } })) >
              0,
          );
          await pump.enqueuePending();
          await pump.worker.resume();
          await waitFor(async () => {
            await pump.enqueuePending();
            return (
              (await db.orm.outboxEvent.count({
                where: { processedAt: null },
              })) === 0
            );
          });
          const count = await db.orm.outboxEvent.count();
          assert.equal(await db.orm.notification.count(), count);
          const event = await db.orm.outboxEvent.findFirstOrThrow();
          const duplicate = await pump.queue.add(
            "notify",
            { eventId: event.id },
            { jobId: "duplicate-" + randomBytes(8).toString("hex") },
          );
          await waitFor(
            async () => (await duplicate.getState()) === "completed",
          );
          assert.equal(await db.orm.notification.count(), count);
          await pump.worker.pause();
          const order = await db.orm.order.findFirstOrThrow();
          const recovered = await db.orm.outboxEvent.create({
            data: {
              aggregateId: order.id,
              version: order.version,
              type: "order.recovery.test",
              payload: { orderId: order.id, version: order.version },
            },
          });
          await pump.enqueuePending();
          await pump.close();
          pump = new NotificationPump(db.orm, process.env.REDIS_URL, prefix);
          await pump.start();
          await pump.enqueuePending();
          await waitFor(async () =>
            Boolean(
              (
                await db.orm.outboxEvent.findUniqueOrThrow({
                  where: { id: recovered.id },
                })
              ).processedAt,
            ),
          );
          assert.equal(
            await db.orm.notification.count({
              where: { eventId: recovered.id },
            }),
            1,
          );
        } finally {
          await pump.worker.pause();
          await pump.queue.obliterate({ force: true });
          await pump.close();
        }
      },
    );

    await t.test(
      "owner staff administration, MFA replay, session revocation and branch settings",
      async () => {
        const branchId = "00000000-0000-4000-8000-000000000001",
          mfa = randomBytes(20).toString("hex"),
          password = randomBytes(24).toString("hex");
        const owner = await db.orm.staffUser.create({
          data: {
            email: "settings-owner@example.invalid",
            passwordHash: await hashPassword(password),
            mfaSecret: encryptSecret(mfa),
            roles: { create: { role: "owner" } },
          },
        });
        const request = (path, method = "GET", body, headers = {}) =>
          fetch(base + "/v1" + path, {
            method,
            headers: {
              "content-type": "application/json",
              origin: "http://127.0.0.1:3000",
              ...headers,
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
          });
        const login = await request("/admin/auth/login", "POST", {
          email: owner.email,
          password,
          code: totp(mfa).code,
        });
        assert.equal(login.status, 200);
        const cookie = login.headers.get("set-cookie").split(";")[0],
          headers = { cookie, "x-csrf-token": (await login.json()).csrfToken };
        const code = totp(mfa, Date.now() + 30000).code,
          input = {
            email: "new-courier@example.invalid",
            roles: [{ role: "courier", branchId, refundAllowed: false }],
            code,
          };
        assert.equal(
          (await request("/admin/staff", "POST", input, { cookie })).status,
          403,
        );
        const created = await request("/admin/staff", "POST", input, headers);
        assert.equal(created.status, 201);
        const result = await created.json();
        assert.ok(result.credentials.password);
        assert.ok(result.credentials.totpSecret);
        assert.equal(result.staff.passwordHash, undefined);
        assert.equal(
          (
            await request(
              "/admin/staff",
              "POST",
              { ...input, email: "replay@example.invalid" },
              headers,
            )
          ).status,
          401,
        );
        const listed = await (
          await request("/admin/staff", "GET", null, headers)
        ).json();
        assert.ok(!JSON.stringify(listed).includes("mfaSecret"));
        assert.ok(!JSON.stringify(listed).includes("passwordHash"));
        await db.orm.staffUser.update({
          where: { id: owner.id },
          data: { lastMfaCounter: 0 },
        });
        const updated = await request(
          "/admin/staff/" + result.staff.id,
          "PATCH",
          {
            expectedVersion: 1,
            active: false,
            roles: input.roles,
            code: totp(mfa).code,
          },
          headers,
        );
        assert.equal(updated.status, 200);
        assert.equal((await updated.json()).version, 2);
        let branch = await db.branch.findUniqueOrThrow({
          where: { id: branchId },
        });
        const schedule = Array.from({ length: 7 }, (_, day) => ({
          day,
          startMinute: 0,
          endMinute: 1440,
        }));
        const changed = await request(
          "/admin/branches/" + branchId,
          "PATCH",
          {
            expectedVersion: branch.version,
            schedule,
            acceptingOrders: true,
            allowCash: true,
          },
          headers,
        );
        assert.equal(changed.status, 200);
        branch = await changed.json();
        assert.equal(
          (await (await get("/branches")).json()).items.find(
            (b) => b.id === branchId,
          ).openNow,
          true,
        );
        assert.equal(
          (
            await request(
              "/admin/branches/" + branchId,
              "PATCH",
              {
                expectedVersion: branch.version,
                schedule: [{ day: 0, startMinute: 10, endMinute: 9 }],
              },
              headers,
            )
          ).status,
          422,
        );
        const z = {
          branchId,
          name: "Test zone",
          polygon: [
            { latitude: 43, longitude: 76 },
            { latitude: 44, longitude: 76 },
            { latitude: 44, longitude: 77 },
          ],
          feeMinor: 10000,
          minimumMinor: 0,
          priority: 1,
          active: true,
        };
        const zone = await request("/admin/zones", "POST", z, headers);
        assert.equal(zone.status, 201);
        const zoneData = await zone.json();
        assert.equal(
          (
            await request(
              "/admin/zones/" + zoneData.id,
              "PATCH",
              { ...z, expectedVersion: 1, active: false },
              headers,
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await request(
              "/admin/zones/" + zoneData.id,
              "PATCH",
              { ...z, expectedVersion: 1 },
              headers,
            )
          ).status,
          409,
        );
        const p = {
          branchId,
          code: "SETTINGS10",
          basisPoints: 1000,
          minimumMinor: 0,
          startsAt: new Date(Date.now() - 60000).toISOString(),
          endsAt: new Date(Date.now() + 3600000).toISOString(),
          active: true,
        };
        assert.equal(
          (await request("/admin/promotions", "POST", p, headers)).status,
          201,
        );
        assert.equal(
          (await request("/admin/promotions", "POST", p, headers)).status,
          409,
        );
        assert.equal(
          (
            await request(
              "/admin/promotions",
              "POST",
              { ...p, code: "INVALID", fixedMinor: 100 },
              headers,
            )
          ).status,
          422,
        );
        // Restore the explicit closed demo fixture for later tests.
        await db.branch.update({
          where: { id: branchId },
          data: { acceptingOrders: false, schedule: [], allowCash: false },
        });
      },
    );
    await t.test(
      "privacy export needs fresh session-bound purpose proof, paginates and excludes authentication secrets",
      async () => {
        const subject = await db.orm.customer.create({
            data: { phone: "+77000000888", name: "Synthetic export subject" },
          }),
          foreign = await db.orm.customer.create({
            data: { phone: "+77000000889", name: "Foreign export subject" },
          });
        async function session(customerId) {
          const token = randomBytes(32).toString("hex");
          const row = await db.orm.authSession.create({
            data: {
              customerId,
              accessHash: digest(token),
              familyId: crypto.randomUUID(),
              expiresAt: new Date(Date.now() + 900000),
            },
          });
          return { token, id: row.id };
        }
        const own = await session(subject.id),
          second = await session(subject.id),
          other = await session(foreign.id);
        await db.orm.customerAddress.create({
          data: { customerId: subject.id, text: "Synthetic private address" },
        });
        await db.orm.customerAddress.create({
          data: { customerId: foreign.id, text: "Foreign private address" },
        });
        const call = (path, method = "GET", body, identity = own) =>
          fetch(base + "/v1" + path, {
            method,
            headers: {
              authorization: "Bearer " + identity.token,
              "content-type": "application/json",
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
          });
        assert.equal((await call("/me/privacy/export")).status, 403);
        const challengeResponse = await call(
          "/me/privacy/challenge",
          "POST",
          {},
        );
        assert.equal(challengeResponse.status, 200);
        const challenge = await challengeResponse.json(),
          code = app.get(DevSmsProvider).deliveries.get(challenge.challengeId),
          proof = { challengeId: challenge.challengeId, code };
        assert.equal(
          (await call("/auth/otp/verify", "POST", proof)).status,
          401,
          "Privacy proof cannot create a login session",
        );
        assert.equal(
          (await call("/me/delete", "POST", proof)).status,
          422,
          "Privacy proof cannot delete an account",
        );
        assert.equal(
          (await call("/me/privacy/confirm", "POST", proof, second)).status,
          422,
          "Proof is tied to the exact session",
        );
        const wrong = code === "000000" ? "000001" : "000000";
        assert.equal(
          (await call("/me/privacy/confirm", "POST", { ...proof, code: wrong }))
            .status,
          422,
        );
        assert.equal(
          (
            await db.orm.otpChallenge.findUniqueOrThrow({
              where: { id: challenge.challengeId },
            })
          ).attempts,
          1,
        );
        assert.equal(
          (await call("/me/privacy/confirm", "POST", proof)).status,
          200,
        );
        assert.equal(
          (await call("/me/privacy/confirm", "POST", proof)).status,
          422,
        );
        const exported = await (await call("/me/privacy/export")).json();
        assert.equal(exported.items[0].id, subject.id);
        assert.equal(exported.items[0].addresses.length, 1);
        assert.equal(
          exported.items[0].addresses[0].text,
          "Synthetic private address",
        );
        assert.ok(!JSON.stringify(exported).includes("Foreign"));
        const branchId = "00000000-0000-4000-8000-000000000001";
        const ownQuote = await db.orm.quote.create({
          data: {
            customerId: subject.id,
            branchId,
            input: { comment: "Synthetic own quote" },
            calculation: { totalMinor: 100 },
            signature: "synthetic-no-credential",
            expiresAt: new Date(Date.now() + 300000),
          },
        });
        await db.orm.quote.create({
          data: {
            customerId: foreign.id,
            branchId,
            input: { comment: "Foreign quote" },
            calculation: { totalMinor: 100 },
            signature: "synthetic-no-credential",
            expiresAt: new Date(Date.now() + 300000),
          },
        });
        const ownOrder = await db.orm.order.create({
          data: {
            quoteId: ownQuote.id,
            customerId: subject.id,
            branchId,
            fulfilment: "pickup",
            status: "cancelled",
            paymentMethod: "mock",
            paymentStatus: "failed",
            subtotalMinor: 100,
            discountMinor: 0,
            deliveryFeeMinor: 0,
            totalMinor: 100,
            expiresAt: new Date(Date.now() + 300000),
          },
        });
        await db.orm.customerRestriction.create({
          data: {
            customerId: subject.id,
            branchId,
            blocked: true,
            reason: "Synthetic own restriction",
          },
        });
        const notificationEvent = await db.orm.outboxEvent.create({
          data: {
            aggregateId: ownOrder.id,
            version: 1,
            type: "order.cancelled",
            payload: {},
          },
        });
        await db.orm.notification.create({
          data: {
            eventId: notificationEvent.id,
            customerId: subject.id,
            orderId: ownOrder.id,
            type: "order.cancelled",
          },
        });
        for (const section of [
          "orders",
          "quotes",
          "restrictions",
          "notifications",
        ]) {
          const response = await call("/me/privacy/export?section=" + section);
          assert.equal(response.status, 200);
          const result = await response.json();
          assert.equal(result.items.length, 1);
          assert.equal(result.nextCursor, null);
          assert.ok(!JSON.stringify(result).includes("Foreign"));
        }
        for (let i = 0; i < 12; i++) await session(subject.id);
        const first = await (
          await call("/me/privacy/export?section=sessions")
        ).json();
        assert.equal(first.items.length, 10);
        assert.ok(first.nextCursor);
        assert.ok(
          first.items.every(
            (value) =>
              Object.keys(value).sort().join(",") ===
              "createdAt,expiresAt,id,revokedAt",
          ),
        );
        const next = await (
          await call(
            "/me/privacy/export?section=sessions&cursor=" + first.nextCursor,
          )
        ).json();
        assert.ok(next.items.length > 0 && next.items.length <= 10);
        assert.equal(
          new Set([...first.items, ...next.items].map((row) => row.id)).size,
          14,
        );
        assert.equal(
          (await call("/me/privacy/export", "GET", undefined, other)).status,
          403,
        );
        assert.equal(
          (await call("/me/privacy/export?customerId=" + foreign.id)).status,
          400,
        );
        await db.orm.authSession.update({
          where: { id: own.id },
          data: { privacyVerifiedAt: new Date(Date.now() - 300001) },
        });
        assert.equal((await call("/me/privacy/export")).status, 403);
      },
    );
    await t.test(
      "profile/address ownership, account deletion, all-session revocation and SMS-budget retention",
      async () => {
        const phone = "+77000000444",
          customer = await db.orm.customer.create({
            data: { phone, name: "Тестовый клиент" },
          }),
          token = randomBytes(32).toString("hex"),
          refresh = randomBytes(32).toString("hex");
        await db.orm.authSession.create({
          data: {
            customerId: customer.id,
            accessHash: digest(token),
            refreshHash: digest(refresh),
            familyId: "00000000-0000-4000-8000-000000000099",
            expiresAt: new Date(Date.now() + 900000),
            refreshExpiresAt: new Date(Date.now() + 86400000),
          },
        });
        const other = await db.orm.customer.create({
            data: { phone: "+77000000445" },
          }),
          otherToken = randomBytes(32).toString("hex");
        await db.orm.authSession.create({
          data: {
            customerId: other.id,
            accessHash: digest(otherToken),
            familyId: "00000000-0000-4000-8000-000000000098",
            expiresAt: new Date(Date.now() + 900000),
          },
        });
        const request = (path, method = "GET", body, access = token) =>
          fetch(base + "/v1" + path, {
            method,
            headers: {
              "content-type": "application/json",
              authorization: "Bearer " + access,
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
          });
        await db.orm.idempotencyRecord.create({
          data: {
            actorId: customer.id,
            scope: "privacy-fixture",
            key: crypto.randomUUID(),
            requestHash: digest("synthetic"),
            response: {
              address: { text: "Private demo address" },
              comment: "Private demo note",
            },
          },
        });
        await db.orm.idempotencyRecord.create({
          data: {
            actorId: other.id,
            scope: "privacy-fixture",
            key: crypto.randomUUID(),
            requestHash: digest("synthetic"),
            response: { retained: true },
          },
        });
        let response = await request("/me", "PATCH", {
          name: "Новый профиль",
          locale: "kk",
        });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).locale, "kk");
        assert.equal(
          (await request("/me", "PATCH", { role: "owner" })).status,
          400,
        );
        response = await request("/me/addresses", "POST", {
          label: "Дом",
          text: "Тестовый адрес, 9",
          latitude: 43.2,
          longitude: 76.9,
        });
        assert.equal(response.status, 201);
        const address = await response.json();
        assert.equal(
          (
            await request(
              "/me/addresses/" + address.id,
              "PATCH",
              { expectedVersion: 1, text: "Чужая запись", label: "X" },
              otherToken,
            )
          ).status,
          404,
        );
        const edits = await Promise.all(
          ["Вариант адреса, 1", "Вариант адреса, 2"].map((text) =>
            request("/me/addresses/" + address.id, "PATCH", {
              expectedVersion: 1,
              label: "Дом",
              text,
              latitude: 43.2,
              longitude: 76.9,
            }),
          ),
        );
        assert.deepEqual(edits.map((r) => r.status).sort(), [200, 409]);
        const quote = await db.orm.quote.create({
          data: {
            customerId: customer.id,
            branchId: "00000000-0000-4000-8000-000000000001",
            input: { address: { text: "Private demo address" } },
            calculation: {},
            signature: "deletion-fixture",
            expiresAt: new Date(Date.now() + 300000),
          },
        });
        const order = await db.orm.order.create({
          data: {
            quoteId: quote.id,
            customerId: customer.id,
            branchId: quote.branchId,
            fulfilment: "delivery",
            addressSnapshot: { text: "Private demo address" },
            comment: "Private demo note",
            expiresAt: new Date(Date.now() + 600000),
            status: "placed",
            paymentMethod: "mock",
            paymentStatus: "paid",
            subtotalMinor: 100000,
            discountMinor: 0,
            deliveryFeeMinor: 0,
            totalMinor: 100000,
          },
        });
        await db.orm.customerRestriction.create({
          data: {
            customerId: customer.id,
            branchId: quote.branchId,
            blocked: true,
            reason: "Synthetic private reason",
          },
        });
        await db.orm.auditLog.create({
          data: {
            action: "customer.blocked",
            entityId: customer.id,
            details: { reason: "Synthetic private reason" },
          },
        });
        const challengeResponse = await request(
          "/me/deletion-challenge",
          "POST",
          {},
        );
        assert.equal(challengeResponse.status, 200);
        const challenge = await challengeResponse.json(),
          code = app.get(DevSmsProvider).deliveries.get(challenge.challengeId);
        assert.equal(
          (
            await request("/me/delete", "POST", {
              challengeId: challenge.challengeId,
              code,
            })
          ).status,
          409,
        );
        await db.orm.order.update({
          where: { id: order.id },
          data: { status: "delivered" },
        });
        assert.equal(
          (
            await request("/me/delete", "POST", {
              challengeId: challenge.challengeId,
              code,
            })
          ).status,
          200,
        );
        assert.equal((await request("/me")).status, 401);
        const refreshed = await fetch(base + "/v1/auth/refresh", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ refreshToken: refresh }),
        });
        assert.equal(refreshed.status, 401);
        const erased = await db.orm.customer.findUniqueOrThrow({
          where: { id: customer.id },
        });
        assert.equal(
          (
            await db.orm.customerRestriction.findUniqueOrThrow({
              where: {
                customerId_branchId: {
                  customerId: customer.id,
                  branchId: quote.branchId,
                },
              },
            })
          ).reason,
          "",
        );
        assert.ok(
          (
            await db.orm.auditLog.findMany({
              where: { entityId: customer.id, action: "customer.blocked" },
            })
          ).every((log) => log.details === null),
        );
        assert.equal(
          await db.orm.idempotencyRecord.count({
            where: { actorId: customer.id },
          }),
          0,
        );
        assert.equal(
          await db.orm.idempotencyRecord.count({
            where: { actorId: other.id },
          }),
          1,
        );
        assert.equal(erased.phone, null);
        assert.equal(erased.name, null);
        assert.ok(erased.deletedAt);
        assert.equal(
          await db.orm.customerAddress.count({
            where: { customerId: customer.id },
          }),
          0,
        );
        assert.equal(
          await db.orm.authSession.count({
            where: { customerId: customer.id, revokedAt: null },
          }),
          0,
        );
        const kept = await db.orm.order.findUniqueOrThrow({
          where: { id: order.id },
        });
        assert.equal(kept.totalMinor, 100000);
        assert.equal(kept.addressSnapshot, null);
        assert.equal(kept.comment, "");
        assert.equal(await db.orm.otpChallenge.count({ where: { phone } }), 0);
        assert.equal(
          (
            await fetch(base + "/v1/auth/otp/request", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ phone }),
            })
          ).status,
          429,
        );
        assert.equal(
          (await request("/orders/" + order.id, "GET", undefined, otherToken))
            .status,
          404,
        );
      },
    );
    await t.test(
      "wrong-brand database fails closed; second brand uses independent data and sessions",
      async () => {
        const savedBrand = process.env.BRAND_CONFIG,
          savedUrl = process.env.DATABASE_URL,
          secondName = "food_brand_test_" + randomBytes(8).toString("hex"),
          secondUrl = new URL(original);
        secondUrl.pathname = "/" + secondName;
        let alternate;
        try {
          process.env.BRAND_CONFIG = new URL(
            "../../../../brands/demo-alt/brand.json",
            import.meta.url,
          ).pathname;
          alternate = await createApp();
          await alternate.listen(0, "127.0.0.1");
          let alternateBase = await alternate.getUrl();
          assert.equal(
            (await fetch(alternateBase + "/v1/health/ready")).status,
            503,
          );
          assert.equal(
            (await fetch(alternateBase + "/v1/branches")).status,
            503,
          );
          assert.equal(
            (await (await fetch(alternateBase + "/v1/bootstrap")).json()).brand
              .id,
            "demo-alt",
          );
          await alternate.close();
          alternate = null;
          await admin.$executeRawUnsafe(`CREATE DATABASE "${secondName}"`);
          process.env.DATABASE_URL = secondUrl.toString();
          for (const script of [
            "../../tools/migrate.mjs",
            "../../tools/seed.mjs",
          ]) {
            const run = spawnSync(process.execPath, [script], {
              env: process.env,
              encoding: "utf8",
            });
            assert.equal(run.status, 0, run.stderr);
          }
          alternate = await createApp();
          await alternate.listen(0, "127.0.0.1");
          alternateBase = await alternate.getUrl();
          assert.equal(
            (await fetch(alternateBase + "/v1/health/ready")).status,
            200,
          );
          const branches = await (
            await fetch(alternateBase + "/v1/branches")
          ).json();
          assert.equal(branches.items.length, 1);
          const ownCustomer = await db.orm.customer.create({
              data: { phone: "+77000000555" },
            }),
            ownToken = randomBytes(32).toString("hex");
          await db.orm.authSession.create({
            data: {
              customerId: ownCustomer.id,
              accessHash: digest(ownToken),
              familyId: "00000000-0000-4000-8000-000000000097",
              expiresAt: new Date(Date.now() + 900000),
            },
          });
          assert.equal(
            (
              await fetch(alternateBase + "/v1/me", {
                headers: { authorization: "Bearer " + ownToken },
              })
            ).status,
            401,
          );
          assert.equal(
            (
              await fetch(base + "/v1/me", {
                headers: { authorization: "Bearer " + ownToken },
              })
            ).status,
            200,
          );
        } finally {
          if (alternate) await alternate.close();
          process.env.DATABASE_URL = savedUrl;
          if (savedBrand === undefined) delete process.env.BRAND_CONFIG;
          else process.env.BRAND_CONFIG = savedBrand;
          if (/^food_brand_test_[0-9a-f]{16}$/.test(secondName))
            await admin.$executeRawUnsafe(
              `DROP DATABASE IF EXISTS "${secondName}" WITH (FORCE)`,
            );
        }
      },
    );
  } finally {
    rmSync(mediaDirectory, { recursive: true, force: true });
    if (oldMedia === undefined) delete process.env.MEDIA_DIRECTORY;
    else process.env.MEDIA_DIRECTORY = oldMedia;
    if (app) await app.close();
    process.env.DATABASE_URL = original;
    if (/^food_test_[0-9a-f]{16}$/.test(name))
      await admin.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`,
      );
    await admin.$disconnect();
  }
});
