import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
async function main() {
  const config = loadConfig();
  const app = await createApp();
  await app.listen(config.port, config.host);
  console.log(
    JSON.stringify({
      event: "api_started",
      port: config.port,
      paymentProvider: "mock",
      environment: "local-only",
    }),
  );
}
main().catch(() => {
  console.error(
    "API startup failed: check configuration and required services (secret values omitted)",
  );
  process.exitCode = 1;
});
