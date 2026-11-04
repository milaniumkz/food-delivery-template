import { queueScope } from "./queue-scope.js";
import { runWorkerCycle } from "./worker-cycle.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { Database } from "./database.js";
import { HealthController } from "./health.js";
import { Branding } from "./public.js";
import { OrderService } from "./orders.js";
import { NotificationPump } from "./outbox.js";
async function main() {
  loadConfig();
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required");
  const app = await createApp();
  await app.get(HealthController).ready();
  const pump = new NotificationPump(
    app.get(Database).orm,
    process.env.REDIS_URL,
    queueScope(app.get(Branding).brand.id, process.env.DATABASE_URL!),
  );
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  const ready = pump
    .start()
    .then(() => {
      if (!controller.signal.aborted)
        console.log(
          JSON.stringify({
            event: "notifications_ready",
            provider: "local-demo",
          }),
        );
    })
    .catch(() => {});
  try {
    console.log(
      JSON.stringify({ event: "worker_started", provider: "local-demo" }),
    );
    const heartbeat = (kind: string) =>
      app.get(Database).orm.workerHeartbeat.upsert({
        where: { kind },
        create: { kind, lastSeenAt: new Date() },
        update: { lastSeenAt: new Date() },
      });
    await runWorkerCycle(
      async () => {
        await app.get(OrderService).expireOverdue();
        await heartbeat("expiry");
      },
      async () => {
        await pump.enqueuePending();
        await heartbeat("notifications");
      },
      controller.signal,
      (task) =>
        console.error(
          JSON.stringify({
            event: "worker_retry",
            task,
            code: "DEPENDENCY_UNAVAILABLE",
          }),
        ),
    );
  } finally {
    await pump.close(true);
    await ready;
    await app.close();
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
  }
}
main().catch(() => {
  console.error(
    "Worker startup failed; check required services (secret values omitted)",
  );
  process.exitCode = 1;
});
