import { Controller, Get, Inject, Req } from "@nestjs/common";
import type { Request } from "express";
import { Database } from "./database.js";
import { AuthService } from "./auth.js";
@Controller("admin/system")
export class SystemController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get() async get(@Req() request: Request) {
    await this.auth.staff(request, ["owner"]);
    const now = new Date();
    const [heartbeats, pending, deadLetters, oldest] = await Promise.all([
      this.db.orm.workerHeartbeat.findMany({
        where: { kind: { in: ["expiry", "notifications"] } },
        select: { kind: true, lastSeenAt: true },
      }),
      this.db.orm.outboxEvent.count({
        where: { processedAt: null, attempts: { lt: 10 } },
      }),
      this.db.orm.outboxEvent.count({
        where: { processedAt: null, attempts: { gte: 10 } },
      }),
      this.db.orm.outboxEvent.findFirst({
        where: { processedAt: null },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
    ]);
    return {
      asOf: now.toISOString(),
      provider: "local-demo",
      workers: ["expiry", "notifications"].map((kind) => {
        const seen =
          heartbeats.find((h) => h.kind === kind)?.lastSeenAt ?? null;
        return {
          kind,
          lastSeenAt: seen?.toISOString() ?? null,
          healthy:
            seen !== null &&
            now.getTime() - seen.getTime() <= 15000 &&
            now >= seen,
        };
      }),
      outbox: {
        pending,
        deadLetters,
        oldestAgeSeconds: oldest
          ? Math.max(
              0,
              Math.floor((now.getTime() - oldest.createdAt.getTime()) / 1000),
            )
          : null,
      },
    };
  }
}
