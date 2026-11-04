import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
test(
  "BFF verifies brand before forwarding a login, cookie or public media request",
  { timeout: 45000 },
  async () => {
    let forwarded = 0;
    const backend = createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      if (request.url === "/v1/bootstrap")
        response.end(JSON.stringify({ brand: { id: "different-brand" } }));
      else {
        forwarded++;
        response.end(JSON.stringify({ ok: true }));
      }
    });
    backend.listen(0, "127.0.0.1");
    await once(backend, "listening");
    const apiUrl = "http://127.0.0.1:" + backend.address().port;
    const probe = createServer();
    probe.listen(0, "127.0.0.1");
    await once(probe, "listening");
    const port = probe.address().port;
    await new Promise((ok) => probe.close(ok));
    const origin = "http://127.0.0.1:" + port;
    const next = spawn(
      process.execPath,
      [
        resolve("apps/admin/node_modules/next/dist/bin/next"),
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        cwd: resolve("apps/admin"),
        env: {
          ...process.env,
          ADMIN_API_URL: apiUrl,
          ADMIN_ORIGIN: origin,
          BRAND_CONFIG: resolve("brands/demo/brand.json"),
          NEXT_TELEMETRY_DISABLED: "1",
        },
        stdio: "ignore",
      },
    );
    try {
      const deadline = Date.now() + 15000;
      let started = false;
      while (Date.now() < deadline) {
        try {
          started = (await fetch(origin)).ok;
          if (started) break;
        } catch {
          /* Bounded startup retry. */
        }
        await new Promise((ok) => setTimeout(ok, 100));
      }
      assert.ok(started);
      const headers = {
        origin,
        "content-type": "application/json",
        cookie: "food_session=" + "a".repeat(64),
      };
      assert.equal(
        (
          await fetch(origin + "/api/admin/auth/login", {
            method: "POST",
            headers,
            body: JSON.stringify({
              email: "synthetic@example.invalid",
              password: "synthetic-not-a-credential",
              code: "123456",
            }),
          })
        ).status,
        503,
      );
      assert.equal(
        (await fetch(origin + "/api/admin/auth/session", { headers })).status,
        503,
      );
      assert.equal(
        (
          await fetch(
            origin + "/api/media/00000000-0000-4000-8000-000000000001",
            { headers },
          )
        ).status,
        503,
      );
      assert.equal(
        forwarded,
        0,
        "No private request may reach the mismatched upstream",
      );
    } finally {
      if (next.exitCode === null) {
        const exited = once(next, "exit");
        next.kill("SIGTERM");
        await exited;
      }
      await new Promise((ok) => backend.close(ok));
    }
  },
);
