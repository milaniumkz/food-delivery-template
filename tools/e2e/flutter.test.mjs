import test from "node:test";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { once } from "node:events";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import {
  hashPassword,
  encryptSecret,
  totp,
} from "../../apps/api/dist/auth-crypto.js";
const require = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const { PrismaClient } = require("@prisma/client"),
  { PrismaPg } = require("@prisma/adapter-pg");
async function port() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const value = server.address().port;
  await new Promise((ok, fail) => server.close((e) => (e ? fail(e) : ok())));
  return value;
}
function run(script, env) {
  const result = spawnSync(process.execPath, [resolve("tools", script)], {
    cwd: resolve("apps/api"),
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
}
function start(script, args, env, cwd) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.logs = "";
  child.stdout.on("data", (d) => (child.logs += d));
  child.stderr.on("data", (d) => (child.logs += d));
  return child;
}
async function wait(url, child) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw Error("Service exited: " + child.logs);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      /* Retry only until the bounded readiness deadline. */
    }
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw Error("Service not ready: " + child.logs);
}
async function stop(child) {
  if (child && child.exitCode === null) {
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  }
}
for (const fulfilment of ["pickup", "delivery"])
  test(
    `real Flutter UI → PostgreSQL/API → browser restaurant/courier → ${fulfilment}`,
    { timeout: 180000 },
    async () => {
      assert.ok(process.env.DATABASE_URL);
      assert.ok(process.env.AUTH_KEY);
      const name = "food_e2e_" + randomBytes(8).toString("hex"),
        rootUrl = process.env.DATABASE_URL,
        url = new URL(rootUrl);
      url.pathname = "/" + name;
      const adminDb = new PrismaClient({
        adapter: new PrismaPg({
          connectionString: rootUrl,
          connectionTimeoutMillis: 3000,
        }),
      });
      let db, api, admin, browser, flutter;
      const directory = resolve(
        ".generated/flutter-e2e-" + randomBytes(8).toString("hex"),
      );
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      try {
        await adminDb.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
        const apiPort = await port(),
          adminPort = await port(),
          apiUrl = `http://127.0.0.1:${apiPort}`,
          adminUrl = `http://127.0.0.1:${adminPort}`;
        const env = {
          ...process.env,
          NODE_ENV: "development",
          DATABASE_URL: url.toString(),
          PORT: String(apiPort),
          ADMIN_ORIGIN: adminUrl,
          ADMIN_API_URL: apiUrl,
          NEXT_TELEMETRY_DISABLED: "1",
        };
        run("migrate.mjs", env);
        run("seed.mjs", env);
        db = new PrismaClient({
          adapter: new PrismaPg({
            connectionString: url.toString(),
            connectionTimeoutMillis: 3000,
          }),
        });
        const password = randomBytes(24).toString("hex"),
          mfa = randomBytes(20).toString("hex"),
          email = "owner@example.invalid";
        await db.staffUser.create({
          data: {
            email,
            passwordHash: await hashPassword(password),
            mfaSecret: encryptSecret(mfa),
            roles: { create: { role: "owner" } },
          },
        });
        await db.branch.update({
          where: { id: "00000000-0000-4000-8000-000000000001" },
          data: {
            acceptingOrders: true,
            schedule: Array.from({ length: 7 }, (_, day) => ({
              day,
              startMinute: 0,
              endMinute: 1440,
            })),
          },
        });
        const courierMfa = randomBytes(20).toString("hex");
        const courier = await db.staffUser.create({
          data: {
            email: "courier@example.invalid",
            passwordHash: await hashPassword(password),
            mfaSecret: encryptSecret(courierMfa),
            roles: {
              create: {
                role: "courier",
                branchId: "00000000-0000-4000-8000-000000000001",
              },
            },
          },
        });
        await db.deliveryZone.create({
          data: {
            branchId: "00000000-0000-4000-8000-000000000001",
            name: "Synthetic delivery area",
            feeMinor: 0,
            polygon: [
              { latitude: 43, longitude: 76 },
              { latitude: 43, longitude: 77 },
              { latitude: 44, longitude: 77 },
              { latitude: 44, longitude: 76 },
            ],
          },
        });
        api = start(
          resolve("apps/api/dist/main.js"),
          [],
          env,
          resolve("apps/api"),
        );
        await wait(apiUrl + "/v1/health/ready", api);
        admin = start(
          resolve("apps/admin/node_modules/next/dist/bin/next"),
          ["start", "--hostname", "127.0.0.1", "--port", String(adminPort)],
          env,
          resolve("apps/admin"),
        );
        await wait(adminUrl, admin);
        browser = await chromium.launch({
          headless: true,
          executablePath:
            process.env.CHROMIUM_PATH ??
            (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
          args: ["--no-sandbox"],
        });
        const context = await browser.newContext({
            viewport: { width: 1440, height: 1000 },
          }),
          page = await context.newPage(),
          errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(adminUrl);
        await expect(page.getByLabel("Электронная почта")).toBeVisible();
        await page.getByLabel("Электронная почта").focus();
        await page.keyboard.press("Tab");
        await expect(page.getByLabel("Пароль", { exact: true })).toBeFocused();
        await page.getByLabel("Электронная почта").fill(email);
        await page.getByLabel("Пароль", { exact: true }).fill(password);
        await page.getByLabel("Код подтверждения").fill(totp(mfa).code);
        await page.getByRole("button", { name: "Войти в панель" }).click();
        await expect(
          page.getByRole("heading", { name: "Меню ресторана" }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", { name: "Тестовое блюдо", exact: true }),
        ).toBeVisible();
        const cookie = (await context.cookies()).find(
          (c) => c.name === "food_session",
        );
        assert.ok(cookie.httpOnly);
        assert.equal(cookie.sameSite, "Strict");

        flutter = spawn(
          resolve(
            process.env.FLUTTER_SDK ?? "/workspace/.toolchains/flutter-3.44.0",
            "bin/flutter",
          ),
          [
            "test",
            "test_live/live_checkout_test.dart",
            "--dart-define=LIVE_API_URL=" + apiUrl,
            "--dart-define=LIVE_FULFILMENT=" + fulfilment,
            "--dart-define=E2E_DIRECTORY=" + directory,
            "--dart-define=SMS_DIRECTORY=" + resolve(".local/sms"),
          ],
          {
            cwd: resolve("apps/mobile"),
            env,
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        flutter.logs = "";
        flutter.stdout.on("data", (d) => (flutter.logs += d));
        flutter.stderr.on("data", (d) => (flutter.logs += d));
        const file = async (name) => {
          const path = resolve(directory, name),
            deadline = Date.now() + 70000;
          while (!existsSync(path) && Date.now() < deadline) {
            if (flutter.exitCode !== null)
              throw Error("Flutter exited: " + flutter.logs);
            await new Promise((ok) => setTimeout(ok, 100));
          }
          assert.ok(
            existsSync(path),
            "Flutter handshake deadline: " + flutter.logs,
          );
          return readFileSync(path, "utf8");
        };
        const order = JSON.parse(await file("order.json"));
        await page.getByRole("button", { name: "Заказы", exact: true }).click();
        const card = page.locator("article").filter({
          has: page.getByRole("heading", {
            name: "Заказ " + order.id.slice(-8).toUpperCase(),
            exact: true,
          }),
        });
        await expect(card).toBeVisible();
        const action = async (name) => {
          await card.getByRole("button", { name, exact: true }).click();
          const form = page.getByRole("region", { name: "Действие с заказом" });
          await expect(form).toBeVisible();
          return form;
        };
        let form = await action("Принять заказ");
        await form.getByLabel("Время приготовления, минут").fill("20");
        await form
          .getByRole("button", { name: "Принять заказ", exact: true })
          .click();
        await expect(card.getByText("Принят", { exact: true })).toBeVisible();
        form = await action("Начать приготовление");
        await form
          .getByRole("button", { name: "Начать приготовление", exact: true })
          .click();
        await expect(
          card.getByText("Готовится", { exact: true }),
        ).toBeVisible();
        form = await action("Заказ готов");
        await form
          .getByRole("button", { name: "Заказ готов", exact: true })
          .click();
        await expect(
          card.getByText("Готов к выдаче", { exact: true }),
        ).toBeVisible();
        if (fulfilment === "pickup") {
          const code = await file("pickup.txt");
          assert.match(code, /^[0-9]{6}$/);
          form = await action("Подтвердить выдачу");
          await form
            .getByLabel("Код получения из приложения клиента")
            .fill(code);
          await form
            .getByRole("button", { name: "Подтвердить выдачу", exact: true })
            .click();
          await expect(card.getByText("Выдан", { exact: true })).toBeVisible();
        } else {
          form = await action("Назначить курьера");
          await form.getByRole("combobox").selectOption(courier.id);
          await form
            .getByRole("button", { name: "Назначить курьера", exact: true })
            .click();
          await expect(form).toBeHidden();
          const courierContext = await browser.newContext({
            viewport: { width: 390, height: 844 },
          });
          const courierPage = await courierContext.newPage();
          courierPage.on("pageerror", (e) => errors.push(e.message));
          await courierPage.goto(adminUrl);
          await courierPage.getByLabel("Электронная почта").fill(courier.email);
          await courierPage
            .getByLabel("Пароль", { exact: true })
            .fill(password);
          await courierPage
            .getByLabel("Код подтверждения")
            .fill(totp(courierMfa).code);
          await courierPage
            .getByRole("button", { name: "Войти в панель" })
            .click();
          await expect(
            courierPage.getByRole("heading", {
              name: "Мои доставки",
              exact: true,
            }),
          ).toBeVisible();
          const deliveryCard = courierPage.locator("article").filter({
            has: courierPage.getByRole("heading", {
              name: "Заказ " + order.id.slice(-8).toUpperCase(),
              exact: true,
            }),
          });
          await expect(deliveryCard).toBeVisible();
          await expect(
            deliveryCard.getByText("Адрес: Synthetic E2E address", {
              exact: true,
            }),
          ).toBeVisible();
          for (const name of [
            "Принять доставку",
            "Забрать заказ",
            "Заказ доставлен",
          ]) {
            await deliveryCard
              .getByRole("button", { name, exact: true })
              .click();
            const commandForm = courierPage.getByRole("region", {
              name: "Действие с заказом",
            });
            await expect(commandForm).toBeVisible();
            await commandForm
              .getByRole("button", { name, exact: true })
              .click();
            await expect(commandForm).toBeHidden();
          }
          await courierContext.close();
        }
        if (flutter.exitCode === null) await once(flutter, "exit");
        assert.equal(flutter.exitCode, 0, flutter.logs);
        assert.deepEqual(errors, []);
      } finally {
        await stop(flutter);
        rmSync(directory, { recursive: true, force: true });
        if (browser) await browser.close();
        await stop(admin);
        await stop(api);
        if (db) await db.$disconnect();
        if (/^food_e2e_[0-9a-f]{16}$/.test(name))
          await adminDb.$executeRawUnsafe(
            `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`,
          );
        await adminDb.$disconnect();
      }
    },
  );
