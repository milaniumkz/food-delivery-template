import {
  Body,
  Controller,
  HttpCode,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from "@nestjs/common";
import { Queue, Worker, type Job } from "bullmq";
import type { PrismaClient } from "@prisma/client";
import type { Request } from "express";
import { AuthService } from "./auth.js";
import { Database } from "./database.js";
import { BusinessError } from "./business-error.js";
export class NotificationPump {
  readonly queue: Queue<{ eventId: string }>;
  readonly worker: Worker<{ eventId: string }>;
  constructor(
    private readonly db: PrismaClient,
    redisUrl: string,
    prefix: string,
  ) {
    const connection = { url: redisUrl, maxRetriesPerRequest: null };
    this.queue = new Queue("notifications", {
      connection: {
        ...connection,
        maxRetriesPerRequest: 1,
        commandTimeout: 2000,
        connectTimeout: 1000,
      },
      prefix,
    });
    this.worker = new Worker(
      "notifications",
      async (job) => this.deliver(job),
      { connection, prefix, concurrency: 2 },
    );
    this.queue.on("error", () => {});
    this.worker.on("error", () => {});
    this.worker.on("failed", (job) => {
      if (job && /^[0-9a-f-]{36}$/.test(job.data.eventId))
        void this.db.outboxEvent
          .updateMany({
            where: { id: job.data.eventId, processedAt: null },
            data: {
              attempts: { increment: 1 },
              nextAttemptAt: new Date(Date.now() + 30000),
            },
          })
          .catch(() => {});
    });
  }
  async start() {
    await Promise.all([
      this.queue.waitUntilReady(),
      this.worker.waitUntilReady(),
    ]);
  }
  async enqueuePending() {
    const events = await this.db.outboxEvent.findMany({
      where: {
        processedAt: null,
        attempts: { lt: 10 },
        nextAttemptAt: { lte: new Date() },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
    });
    for (const event of events) {
      const existing = await this.queue.getJob(event.id);
      if (existing && (await existing.getState()) === "failed")
        await existing.retry();
      else
        await this.queue.add(
          "notify",
          { eventId: event.id },
          {
            jobId: event.id,
            attempts: 5,
            backoff: { type: "exponential", delay: 1000 },
            removeOnComplete: 1000,
            removeOnFail: false,
          },
        );
    }
    return events.length;
  }
  private async deliver(job: Job<{ eventId: string }>) {
    if (!/^[0-9a-f-]{36}$/.test(job.data.eventId))
      throw new Error("INVALID_EVENT");
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "OutboxEvent" WHERE id=${job.data.eventId}::uuid FOR UPDATE`;
      const event = await tx.outboxEvent.findUnique({
        where: { id: job.data.eventId },
      });
      if (!event || event.processedAt) return;
      const order = await tx.order.findUnique({
        where: { id: event.aggregateId },
        select: {
          id: true,
          customerId: true,
          customer: { select: { deletedAt: true } },
        },
      });
      if (order && !order.customer.deletedAt)
        await tx.notification.upsert({
          where: { eventId: event.id },
          update: {},
          create: {
            eventId: event.id,
            customerId: order.customerId,
            orderId: order.id,
            type: event.type,
            provider: "local-demo",
          },
        });
      await tx.outboxEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });
    });
  }
  async close(force = false) {
    await this.worker.close(force);
    if (force) await this.queue.disconnect();
    await this.queue.close();
  }
}
class EmptyInput {}
@Controller()
export class NotificationController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get("me/notifications") async mine(@Req() request: Request) {
    const session = await this.auth.customer(request);
    return {
      items: await this.db.orm.notification.findMany({
        where: { customerId: session.customerId! },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 100,
        select: {
          id: true,
          orderId: true,
          type: true,
          provider: true,
          createdAt: true,
        },
      }),
    };
  }
  @Get("admin/outbox") async pending(@Req() request: Request) {
    await this.auth.staff(request, ["owner"]);
    return {
      pending: await this.db.orm.outboxEvent.count({
        where: { processedAt: null, attempts: { lt: 10 } },
      }),
      deadLetters: await this.db.orm.outboxEvent.findMany({
        where: { processedAt: null, attempts: { gte: 10 } },
        take: 100,
        orderBy: { createdAt: "asc" },
        select: { id: true, type: true, attempts: true, createdAt: true },
      }),
    };
  }
  @Post("admin/outbox/:id/retry") @HttpCode(200) async retry(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() _body: EmptyInput,
  ) {
    const { session } = await this.auth.staff(
      request,
      ["owner"],
      undefined,
      true,
    );
    return this.db.orm.$transaction(async (tx) => {
      const changed = await tx.outboxEvent.updateMany({
        where: { id, processedAt: null },
        data: { attempts: 0, nextAttemptAt: new Date() },
      });
      if (!changed.count)
        throw new BusinessError(
          "RETRY_UNAVAILABLE",
          "Событие уже обработано или не найдено.",
          409,
        );
      await tx.auditLog.create({
        data: {
          actorId: session.staffId,
          action: "outbox.retry",
          entityId: id,
        },
      });
      return { ok: true };
    });
  }
}
