import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { resolve } from "node:path";
const executable = resolve("apps/admin/node_modules/next/dist/bin/next");
for (const [brand, name] of [
  ["demo", "TAMAK"],
  ["demo-alt", "DÄM"],
]) {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((ok, fail) =>
    socket.close((error) => (error ? fail(error) : ok())),
  );
  const child = spawn(
    process.execPath,
    [executable, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: resolve("apps/admin"),
      env: {
        ...process.env,
        BRAND_CONFIG: resolve(`brands/${brand}/brand.json`),
        ADMIN_API_URL: "http://127.0.0.1:1",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  try {
    let html;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw Error("Next.js exited: " + output);
      try {
        const response = await fetch(`http://127.0.0.1:${port}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (response.status !== 200)
          throw Error("Unexpected HTTP status " + response.status);
        html = await response.text();
        break;
      } catch {
        await new Promise((ok) => setTimeout(ok, 100));
      }
    }
    if (
      !html?.includes(name) ||
      !html.includes("недоступны") ||
      (!html.includes("Вход") && !html.includes("Загрузка панели"))
    )
      throw Error("Admin brand/unavailable-state smoke failed: " + output);
    console.log(
      `Admin HTTP smoke passed: ${brand}, correct identity, unavailable API is visible; no claim of working order management.`,
    );
  } finally {
    const exit = once(child, "exit");
    child.kill("SIGTERM");
    await exit;
  }
}
