import test from "node:test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { once } from "node:events";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  digest,
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
test(
  "browser: MFA → catalog CRUD → customer API mock order → restaurant pickup, desktop/mobile",
  { timeout: 120000 },
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
    let db, api, admin, browser;
    try {
      await adminDb.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
      const apiPort = await port(),
        adminPort = await port(),
        apiUrl = `http://127.0.0.1:${apiPort}`,
        adminUrl = `http://127.0.0.1:${adminPort}`;
      const env = {
        ...process.env,
        NODE_ENV: "test",
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
      const accessible = async () => {
        const result = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        assert.deepEqual(
          result.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            targets: v.nodes.map((n) => n.target),
          })),
          [],
        );
      };
      await page.goto(adminUrl);
      await expect(page.getByLabel("Электронная почта")).toBeVisible();
      await accessible();
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
      await accessible();
      const cookie = (await context.cookies()).find(
        (c) => c.name === "food_session",
      );
      assert.ok(cookie.httpOnly);
      assert.equal(cookie.sameSite, "Strict");
      await page
        .getByRole("button", { name: "Настройки", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Настройки филиала", exact: true }),
      ).toBeVisible();
      await page
        .getByLabel("Адрес RU", { exact: true })
        .fill("Демонстрационный адрес");
      await page
        .getByLabel("Адрес KK", { exact: true })
        .fill("Демонстрациялық мекенжай");
      await page.getByLabel("Широта филиала", { exact: true }).fill("43.25");
      await page.getByLabel("Долгота филиала", { exact: true }).fill("76.9");
      await page.getByLabel("Принимать заказы", { exact: true }).check();
      for (let day = 0; day < 7; day++) {
        await page
          .getByRole("button", {
            name: "Добавить рабочий интервал",
            exact: true,
          })
          .click();
        const interval = page
          .getByText("Интервал " + (day + 1), { exact: true })
          .locator("..");
        await expect(interval).toBeVisible();
        await interval.getByRole("combobox").selectOption(String(day));
        await interval.getByLabel("С", { exact: true }).fill("00:00");
        await interval.getByLabel("До конца суток", { exact: true }).check();
      }
      await accessible();
      await page
        .getByRole("button", { name: "Сохранить работу филиала", exact: true })
        .click();
      await expect(page.getByText("Сохранено.", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Меню", exact: true }).click();
      await page.getByRole("button", { name: "Добавить блюдо" }).click();
      await page
        .getByLabel("Название на русском", { exact: true })
        .fill("Проверочный боул");
      await page
        .getByLabel("Название на казахском", { exact: true })
        .fill("Сынақ боулы");
      await page.getByLabel("Цена, ₸").fill("1875.50");
      await page
        .getByRole("button", { name: "Сохранить", exact: true })
        .click();
      let card = page.locator("article").filter({
        has: page.getByRole("heading", {
          name: "Проверочный боул",
          exact: true,
        }),
      });
      await expect(card).toBeVisible();
      const branchId = "00000000-0000-4000-8000-000000000001";
      let menu = await (
        await fetch(apiUrl + "/v1/catalog?branchId=" + branchId)
      ).json();
      const created = menu.items.find((p) => p.name === "Проверочный боул");
      assert.ok(created);
      assert.equal(created.priceMinor, 187550);
      await card.getByRole("button", { name: "Изменить", exact: true }).click();
      await page.getByLabel("Цена, ₸").fill("1990.00");
      await page
        .getByRole("button", { name: "Сохранить", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Изменить блюдо" }),
      ).not.toBeVisible();
      menu = await (
        await fetch(apiUrl + "/v1/catalog?branchId=" + branchId)
      ).json();
      assert.equal(
        menu.items.find((p) => p.id === created.id).priceMinor,
        199000,
      );
      await card.getByRole("button", { name: "Изменить", exact: true }).click();
      const sharp = require("sharp"),
        image = await sharp({
          create: { width: 16, height: 16, channels: 3, background: "#b9381b" },
        })
          .png()
          .toBuffer();
      await page
        .getByLabel("Загрузить JPEG, PNG или WebP (до 5 MiB)")
        .setInputFiles({
          name: "synthetic-food.png",
          mimeType: "image/png",
          buffer: image,
        });
      await expect(page.getByAltText("Текущая фотография блюда")).toBeVisible();
      const photo = await fetch(apiUrl + "/v1/catalog?branchId=" + branchId);
      const photoItem = (await photo.json()).items.find(
        (p) => p.id === created.id,
      );
      assert.ok(photoItem.imageUrl);
      const asset = await context.request.get(
        adminUrl + "/api" + photoItem.imageUrl.replace("/v1", ""),
      );
      assert.equal(asset.status(), 200);
      assert.match(asset.headers()["content-type"], /^image\/webp/);
      await page.getByRole("button", { name: "Отмена", exact: true }).click();
      await card
        .getByRole("button", { name: "В стоп-лист", exact: true })
        .click();
      await expect(card.getByText("Стоп-лист", { exact: true })).toBeVisible();
      menu = await (
        await fetch(apiUrl + "/v1/catalog?branchId=" + branchId)
      ).json();
      assert.ok(!menu.items.some((p) => p.id === created.id));
      await card
        .getByRole("button", { name: "Вернуть в меню", exact: true })
        .click();
      await expect(card.getByText("В меню", { exact: true })).toBeVisible();
      assert.deepEqual(
        await page.evaluate(() => Object.keys(localStorage)),
        [],
      );
      const csrfFailure = await context.request.post(
        adminUrl + "/api/admin/products",
        {
          headers: { origin: "http://attacker.invalid" },
          data: { branchId, nameRu: "X", nameKk: "X", priceMinor: 1 },
        },
      );
      assert.equal(csrfFailure.status(), 403);

      // The customer uses the real API; OTP itself is covered separately in integration tests.
      const opened = (
        await (await fetch(apiUrl + "/v1/branches")).json()
      ).items.find((b) => b.id === branchId);
      assert.equal(opened.openNow, true);
      assert.equal(opened.latitude, 43.25);
      const customer = await db.customer.create({
          data: { phone: "+77000000333" },
        }),
        token = randomBytes(32).toString("hex");
      await db.authSession.create({
        data: {
          customerId: customer.id,
          accessHash: digest(token),
          familyId: randomUUID(),
          expiresAt: new Date(Date.now() + 900000),
        },
      });
      const customerRequest = (path, method = "GET", body) =>
        fetch(apiUrl + "/v1" + path, {
          method,
          headers: {
            "content-type": "application/json",
            authorization: "Bearer " + token,
            "idempotency-key": randomUUID(),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      const quoteResponse = await customerRequest("/checkout/quote", "POST", {
        branchId,
        fulfilment: "pickup",
        items: [{ productId: created.id, quantity: 1 }],
      });
      assert.equal(quoteResponse.status, 201);
      const quote = await quoteResponse.json();
      const orderResponse = await customerRequest("/orders", "POST", {
        quoteId: quote.quoteId,
        paymentMethod: "mock",
      });
      assert.equal(orderResponse.status, 201);
      let order = await orderResponse.json();
      assert.equal(order.totalMinor, 199000);
      const paid = await customerRequest(
        "/payments/" + order.payments[0].id + "/mock-result",
        "POST",
        { outcome: "paid" },
      );
      assert.equal(paid.status, 200);
      order = await paid.json();
      assert.equal(order.status, "placed");
      await page.getByRole("button", { name: "Заказы", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Заказы ресторана" }),
      ).toBeVisible();
      const orderCard = page.locator("article").filter({
        has: page.getByRole("heading", {
          name: "Заказ " + order.id.slice(-8).toUpperCase(),
          exact: true,
        }),
      });
      await expect(orderCard).toBeVisible();
      const action = async (name) => {
        await orderCard.getByRole("button", { name, exact: true }).click();
        const form = page.getByRole("region", { name: "Действие с заказом" });
        await expect(form).toBeVisible();
        return form;
      };
      let actionForm = await action("Принять заказ");
      await actionForm.getByLabel("Время приготовления, минут").fill("20");
      await actionForm
        .getByRole("button", { name: "Принять заказ", exact: true })
        .click();
      await expect(
        orderCard.getByText("Принят", { exact: true }),
      ).toBeVisible();
      actionForm = await action("Начать приготовление");
      await actionForm
        .getByRole("button", { name: "Начать приготовление", exact: true })
        .click();
      await expect(
        orderCard.getByText("Готовится", { exact: true }),
      ).toBeVisible();
      actionForm = await action("Заказ готов");
      await actionForm
        .getByRole("button", { name: "Заказ готов", exact: true })
        .click();
      await expect(
        orderCard.getByText("Готов к выдаче", { exact: true }),
      ).toBeVisible();
      const ready = await (await customerRequest("/orders/" + order.id)).json();
      assert.match(ready.pickupCode, /^[0-9]{6}$/);
      actionForm = await action("Подтвердить выдачу");
      await actionForm
        .getByLabel("Код получения из приложения клиента")
        .fill(ready.pickupCode);
      await actionForm
        .getByRole("button", { name: "Подтвердить выдачу", exact: true })
        .click();
      await expect(orderCard.getByText("Выдан", { exact: true })).toBeVisible();
      assert.equal(
        (await (await customerRequest("/orders/" + order.id)).json()).status,
        "completed",
      );
      await page.getByRole("button", { name: "Клиенты", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Клиенты филиала" }),
      ).toBeVisible();
      const customerCard = page
        .locator("article")
        .filter({ hasText: "+77000000333" });
      await expect(customerCard).toBeVisible();
      await customerCard
        .getByLabel("Причина ограничения или снятия")
        .fill("Synthetic browser restriction");
      await customerCard
        .getByRole("button", {
          name: "Приостановить новые заказы",
          exact: true,
        })
        .click();
      await expect(
        customerCard.getByText("Новые заказы приостановлены", { exact: true }),
      ).toBeVisible();
      assert.equal(
        (
          await customerRequest("/checkout/quote", "POST", {
            branchId,
            fulfilment: "pickup",
            items: [{ productId: created.id, quantity: 1 }],
          })
        ).status,
        403,
      );
      await customerCard
        .getByLabel("Причина ограничения или снятия")
        .fill("Synthetic browser unblock");
      await customerCard
        .getByRole("button", { name: "Снять ограничение", exact: true })
        .click();
      await expect(
        customerCard.getByText("Новые заказы разрешены", { exact: true }),
      ).toBeVisible();
      await accessible();
      await page.getByRole("button", { name: "Отчёты", exact: true }).click();
      await page
        .getByRole("button", { name: "Построить отчёт", exact: true })
        .click();
      await expect(
        page.getByText("Получено за вычетом возвратов", { exact: true }),
      ).toBeVisible();
      const exported = await context.request.get(
        await page
          .getByRole("link", { name: "Скачать агрегаты CSV (суммы в тиынах)" })
          .getAttribute("href")
          .then((path) => adminUrl + path),
      );
      assert.equal(exported.status(), 200);
      assert.ok((await exported.text()).includes("199000,KZT"));
      await page.getByRole("button", { name: "Система", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Состояние системы", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Нет событий в этом списке.", { exact: true }),
      ).toBeVisible();
      mkdirSync(".generated/screenshots", { recursive: true });
      await page.screenshot({
        path: ".generated/screenshots/admin-catalog-desktop.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
      );
      await accessible();
      await page.screenshot({
        path: ".generated/screenshots/admin-catalog-mobile.png",
        fullPage: true,
      });
      await page.getByRole("button", { name: "Выйти", exact: true }).click();
      await expect(page.getByLabel("Электронная почта")).toBeVisible();
      assert.equal(
        (
          await context.request.get(
            adminUrl + "/api/admin/products?branchId=" + branchId,
          )
        ).status(),
        401,
      );
      assert.deepEqual(errors, []);
    } finally {
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
