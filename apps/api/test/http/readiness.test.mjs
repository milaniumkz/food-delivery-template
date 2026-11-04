import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../dist/app.js";
test("HTTP foundation: brand, liveness, unavailable DB, strict DTO and sanitized errors", async (t) => {
  const original = process.env.DATABASE_URL;
  process.env.DATABASE_URL =
    "postgresql://test:do-not-expose@127.0.0.1:1/unavailable?connect_timeout=1&socket_timeout=1";
  const app = await createApp();
  try {
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    await t.test(
      "live and public brand bootstrap work independently of DB",
      async () => {
        const live = await fetch(base + "/v1/health/live");
        assert.equal(live.status, 200);
        assert.deepEqual(await live.json(), { status: "ok" });
        const boot = await fetch(base + "/v1/bootstrap");
        assert.equal(boot.status, 200);
        const body = await boot.json();
        assert.equal(body.brand.schemaVersion, 1);
        assert.equal(body.features.ordering, true);
      },
    );
    await t.test(
      "ready returns 503 with safe envelope on unavailable database",
      async () => {
        const response = await fetch(base + "/v1/health/ready");
        assert.equal(response.status, 503);
        const text = await response.text();
        assert.ok(!text.includes("do-not-expose"));
        assert.ok(!text.includes("prisma"));
        const body = JSON.parse(text);
        assert.equal(body.code, "NOT_READY");
        assert.equal(body.requestId, response.headers.get("x-request-id"));
      },
    );
    await t.test(
      "unknown fields and invalid identifiers rejected before DB access",
      async () => {
        for (const query of [
          "",
          "?branchId=invalid",
          "?branchId=00000000-0000-4000-8000-000000000001&role=owner",
          "?branchId=00000000-0000-4000-8000-000000000001&limit=101",
        ])
          assert.equal((await fetch(base + "/v1/catalog" + query)).status, 400);
      },
    );
    await t.test(
      "unknown private route is 404 and errors do not reflect query secrets",
      async () => {
        const response = await fetch(
          base + "/v1/admin/unknown-private-resource?secret=do-not-reflect",
        );
        assert.equal(response.status, 404);
        assert.equal(response.headers.get("x-content-type-options"), "nosniff");
        assert.ok(!(await response.text()).includes("do-not-reflect"));
      },
    );
    await t.test(
      "invalid JSON and oversized body are rejected safely",
      async () => {
        for (const [body, status] of [
          ['{"secret":', 400],
          ['"' + "x".repeat(40000) + '"', 413],
        ]) {
          const response = await fetch(base + "/v1/bootstrap", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
          });
          assert.equal(response.status, status);
          assert.ok(!(await response.text()).includes(body));
        }
      },
    );
  } finally {
    await app.close();
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  }
});
