import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiProperty, ApiTags } from "@nestjs/swagger";
import {
  IsBoolean,
  IsIn,
  IsInt,
  ValidateIf,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import type { Request } from "express";
import type { OrderStatus, Prisma, StaffRole } from "@prisma/client";
import { randomInt, randomUUID } from "node:crypto";
import { Database } from "./database.js";
import { AuthService, type StaffContext } from "./auth.js";
import {
  decryptSecret,
  digest,
  encryptSecret,
  equalSecret,
  verifyTotp,
} from "./auth-crypto.js";
import { QuoteService, type QuoteInput, json } from "./quotes.js";
import { canonical } from "./pricing.js";
import { BusinessError } from "./business-error.js";
const include = {
  items: true,
  payments: { include: { refund: true }, orderBy: { createdAt: "asc" } },
  events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
  customer: { select: { phone: true, name: true } },
} satisfies Prisma.OrderInclude;
type FullOrder = Prisma.OrderGetPayload<{ include: typeof include }>;
const terminal: OrderStatus[] = [
  "delivered",
  "completed",
  "cancelled",
  "rejected",
  "expired",
];
class EmptyCommand {}
class CreateOrder {
  @ApiProperty() @IsUUID() quoteId!: string;
  @ApiProperty({ enum: ["mock", "cash"] })
  @IsIn(["mock", "cash"])
  paymentMethod!: "mock" | "cash";
}
class VersionCommand {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
}
class ReasonCommand extends VersionCommand {
  @ApiProperty() @IsString() @Length(3, 500) reason!: string;
}
class AcceptCommand extends VersionCommand {
  @ApiProperty() @IsInt() @Min(1) @Max(180) preparationMinutes!: number;
}
class AssignCommand extends VersionCommand {
  @ApiProperty() @IsUUID() courierId!: string;
}
class CompleteCommand extends VersionCommand {
  @ApiProperty() @Matches(/^[0-9]{6}$/) pickupCode!: string;
  @ApiProperty({ required: false, type: Boolean })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  cashReceived?: boolean;
}
class DeliverCommand extends VersionCommand {
  @ApiProperty({ required: false, type: Boolean })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  cashReceived?: boolean;
}
class SimulateCommand {
  @ApiProperty({ enum: ["paid", "failed", "timeout"] })
  @IsIn(["paid", "failed", "timeout"])
  outcome!: "paid" | "failed" | "timeout";
}
class RefundCommand {
  @ApiProperty() @IsString() @Length(3, 500) reason!: string;
  @ApiProperty() @Matches(/^[0-9]{6}$/) code!: string;
}
class ListOrders {
  @ApiProperty({
    required: false,
    type: "integer",
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
  @ApiProperty({ required: false, type: String, format: "uuid" })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  cursor?: string;
}
class AdminOrders extends ListOrders {
  @ApiProperty() @IsUUID() branchId!: string;
  @ApiProperty({
    required: false,
    enum: [
      "awaiting_payment",
      "placed",
      "accepted",
      "preparing",
      "ready",
      "out_for_delivery",
      "delivered",
      "completed",
      "rejected",
      "cancelled",
      "expired",
    ],
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn([
    "awaiting_payment",
    "placed",
    "accepted",
    "preparing",
    "ready",
    "out_for_delivery",
    "delivered",
    "completed",
    "rejected",
    "cancelled",
    "expired",
  ])
  status?: OrderStatus;
}
function key(request: Request) {
  const value = request.headers["idempotency-key"];
  if (typeof value !== "string" || !/^[A-Za-z0-9_.:-]{8,128}$/.test(value))
    throw new BusinessError(
      "IDEMPOTENCY_REQUIRED",
      "Нужен корректный ключ повторной операции.",
      400,
    );
  return value;
}
@Injectable()
export class OrderService {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(QuoteService) private readonly quotes: QuoteService,
  ) {}
  private async lock(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${id}::uuid FOR UPDATE`;
  }
  private get(tx: Prisma.TransactionClient, id: string) {
    return tx.order.findUniqueOrThrow({ where: { id }, include });
  }
  present(order: FullOrder, customer = false, kitchen = false) {
    const basic = {
      id: order.id,
      branchId: order.branchId,
      fulfilment: order.fulfilment,
      status: order.status,
      version: order.version,
      preparationMinutes: order.preparationMinutes,
      createdAt: order.createdAt,
      items: order.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        options: i.optionsSnapshot,
        nameRu: i.nameRu,
        nameKk: i.nameKk,
        quantity: i.quantity,
        ...(!kitchen
          ? {
              unitPriceMinor: i.unitPriceMinor,
              lineTotalMinor: i.lineTotalMinor,
            }
          : {}),
      })),
      comment: order.comment,
    };
    if (kitchen) return basic;
    return {
      ...basic,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      currency: order.currency,
      subtotalMinor: order.subtotalMinor,
      discountMinor: order.discountMinor,
      deliveryFeeMinor: order.deliveryFeeMinor,
      totalMinor: order.totalMinor,
      address: order.addressSnapshot,
      courierId: order.courierId,
      courierAccepted: order.courierAccepted,
      pickupCode:
        customer &&
        order.fulfilment === "pickup" &&
        order.status === "ready" &&
        order.pickupSecret
          ? decryptSecret(order.pickupSecret)
          : null,
      ...(!customer ? { contact: order.customer } : {}),
      payments: order.payments.map((p) => ({
        id: p.id,
        provider: p.provider,
        status: p.status,
        amountMinor: p.amountMinor,
        refund: p.refund
          ? {
              id: p.refund.id,
              status: p.refund.status,
              amountMinor: p.refund.amountMinor,
              provider: p.refund.provider,
            }
          : null,
      })),
      events: order.events.map((e) => ({
        id: e.id,
        action: e.action,
        version: e.version,
        createdAt: e.createdAt,
        reason: e.reason,
      })),
    };
  }
  async event(
    tx: Prisma.TransactionClient,
    order: {
      id: string;
      version: number;
      status: OrderStatus;
      paymentStatus: string;
    },
    action: string,
    actorId: string | null,
    reason?: string,
  ) {
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        actorId,
        action,
        version: order.version,
        reason,
      },
    });
    await tx.auditLog.create({ data: { actorId, action, entityId: order.id } });
    await tx.outboxEvent.create({
      data: {
        aggregateId: order.id,
        version: order.version,
        type: action,
        payload: {
          orderId: order.id,
          version: order.version,
          status: order.status,
          paymentStatus: order.paymentStatus,
        },
      },
    });
  }
  private async release(tx: Prisma.TransactionClient, orderId: string) {
    const redemption = await tx.promotionRedemption.findUnique({
      where: { orderId },
    });
    if (redemption && !redemption.releasedAt) {
      await tx.$queryRaw`SELECT id FROM "Promotion" WHERE id=${redemption.promotionId}::uuid FOR UPDATE`;
      await tx.promotionRedemption.updateMany({
        where: { orderId, releasedAt: null },
        data: { releasedAt: new Date() },
      });
    }
    const reservations = await tx.stockReservation.findMany({
      where: { orderId, releasedAt: null },
      orderBy: { productId: "asc" },
    });
    for (const reservation of reservations) {
      const changed = await tx.stockReservation.updateMany({
        where: { orderId, productId: reservation.productId, releasedAt: null },
        data: { releasedAt: new Date() },
      });
      if (changed.count)
        await tx.product.updateMany({
          where: { id: reservation.productId, stockQuantity: { not: null } },
          data: { stockQuantity: { increment: reservation.quantity } },
        });
    }
  }
  private async mockRefund(
    tx: Prisma.TransactionClient,
    paymentId: string,
    reason: string,
  ) {
    const payment = await tx.paymentAttempt.findUniqueOrThrow({
      where: { id: paymentId },
    });
    if (
      payment.provider !== "mock" ||
      !["paid", "refunded"].includes(payment.status)
    )
      throw new BusinessError(
        "REFUND_UNAVAILABLE",
        "Нет подтверждённой тестовой оплаты для возврата.",
        409,
      );
    const previous = await tx.refund.findUnique({ where: { paymentId } });
    if (previous) return previous;
    const refund = await tx.refund.create({
      data: {
        paymentId,
        amountMinor: payment.amountMinor,
        reason,
        status: "refunded",
        provider: "mock",
        confirmedAt: new Date(),
      },
    });
    await tx.paymentAttempt.update({
      where: { id: paymentId },
      data: { status: "refunded" },
    });
    return refund;
  }
  private async expire(tx: Prisma.TransactionClient, order: FullOrder) {
    if (
      order.status !== "awaiting_payment" ||
      order.expiresAt.getTime() > Date.now() ||
      order.paymentStatus === "manual_review"
    )
      return order;
    await this.release(tx, order.id);
    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        status: "expired",
        paymentStatus: "expired",
        version: { increment: 1 },
      },
    });
    await tx.paymentAttempt.updateMany({
      where: { orderId: order.id, status: "pending" },
      data: { status: "expired" },
    });
    await this.event(tx, updated, "order.expired", null);
    return this.get(tx, order.id);
  }
  async create(customerId: string, input: CreateOrder, idempotencyKey: string) {
    const requestHash = digest(canonical(input));
    try {
      return await this.db.orm.$transaction(
        async (tx) => {
          const scope = "order.create";
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${customerId + ":" + scope + ":" + idempotencyKey}))`;
          const previous = await tx.idempotencyRecord.findUnique({
            where: {
              actorId_scope_key: {
                actorId: customerId,
                scope,
                key: idempotencyKey,
              },
            },
          });
          if (previous) {
            if (previous.requestHash !== requestHash)
              throw new BusinessError(
                "IDEMPOTENCY_CONFLICT",
                "Ключ операции уже использован для другого запроса.",
                409,
              );
            return previous.response;
          }
          await tx.$queryRaw`SELECT id FROM "Customer" WHERE id=${customerId}::uuid FOR SHARE`;
          if (
            (await tx.customer.findUnique({ where: { id: customerId } }))
              ?.deletedAt
          )
            throw new BusinessError("ACCOUNT_DELETED", "Аккаунт удалён.", 401);
          await tx.$queryRaw`SELECT id FROM "Quote" WHERE id=${input.quoteId}::uuid FOR UPDATE`;
          const quote = await tx.quote.findFirst({
            where: { id: input.quoteId, customerId },
            include: { order: true },
          });
          if (!quote) throw new NotFoundException();
          if (
            (
              await tx.customerRestriction.findUnique({
                where: {
                  customerId_branchId: { customerId, branchId: quote.branchId },
                },
              })
            )?.blocked
          )
            throw new BusinessError(
              "CUSTOMER_BLOCKED",
              "Приём новых заказов для этого аккаунта приостановлен. Свяжитесь с поддержкой.",
              403,
            );
          if (quote.order)
            throw new BusinessError(
              "QUOTE_USED",
              "Для этого расчёта уже создан заказ.",
              409,
              { order: this.present(await this.get(tx, quote.order.id), true) },
            );
          if (quote.expiresAt.getTime() <= Date.now())
            throw new BusinessError(
              "QUOTE_EXPIRED",
              "Расчёт устарел. Подтвердите новый итог.",
              409,
            );
          const quoteInput = quote.input as unknown as QuoteInput;
          await tx.$queryRaw`SELECT id FROM "Branch" WHERE id=${quote.branchId}::uuid FOR UPDATE`;
          if (quoteInput.promoCode)
            await tx.$queryRaw`SELECT id FROM "Promotion" WHERE "branchId"=${quote.branchId}::uuid AND code=${quoteInput.promoCode} FOR UPDATE`;
          for (const id of [
            ...new Set(quoteInput.items.map((i) => i.productId)),
          ].sort())
            await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${id}::uuid FOR UPDATE`;
          const calculated = await this.quotes.calculate(
              tx,
              customerId,
              quoteInput,
            ),
            branch = await tx.branch.findUniqueOrThrow({
              where: { id: quote.branchId },
            });
          if (calculated.signature !== quote.signature)
            throw new BusinessError(
              "QUOTE_CHANGED",
              "Цены или условия изменились. Подтвердите новый расчёт.",
              409,
            );
          if (
            calculated.totalMinor > 0 &&
            input.paymentMethod === "cash" &&
            !branch.allowCash
          )
            throw new BusinessError(
              "CASH_DISABLED",
              "Оплата при получении выключена.",
            );
          const active = await tx.order.count({
            where: { branchId: branch.id, status: { notIn: terminal } },
          });
          if (active >= branch.maxActiveOrders)
            throw new BusinessError(
              "BRANCH_CAPACITY",
              "Филиал сейчас не может принять ещё один заказ.",
              409,
            );
          const order = await tx.order.create({
            data: {
              quoteId: quote.id,
              customerId,
              branchId: quote.branchId,
              fulfilment: quoteInput.fulfilment,
              addressSnapshot: quoteInput.address
                ? json(quoteInput.address)
                : undefined,
              comment: quoteInput.comment ?? "",
              status:
                calculated.totalMinor === 0
                  ? "placed"
                  : input.paymentMethod === "cash"
                    ? "placed"
                    : "awaiting_payment",
              paymentMethod:
                calculated.totalMinor === 0
                  ? "no_payment_required"
                  : input.paymentMethod,
              paymentStatus:
                calculated.totalMinor === 0
                  ? "not_required"
                  : input.paymentMethod === "cash"
                    ? "unpaid"
                    : "pending",
              subtotalMinor: calculated.subtotalMinor,
              discountMinor: calculated.discountMinor,
              deliveryFeeMinor: calculated.deliveryFeeMinor,
              totalMinor: calculated.totalMinor,
              pickupSecret:
                quoteInput.fulfilment === "pickup"
                  ? encryptSecret(String(randomInt(1000000)).padStart(6, "0"))
                  : null,
              expiresAt: new Date(Date.now() + 600000),
              items: {
                create: calculated.items.map(
                  ({
                    options,
                    productId,
                    nameRu,
                    nameKk,
                    quantity,
                    unitPriceMinor,
                    lineTotalMinor,
                  }) => ({
                    optionsSnapshot: json(options),
                    productId,
                    nameRu,
                    nameKk,
                    quantity,
                    unitPriceMinor,
                    lineTotalMinor,
                  }),
                ),
              },
            },
          });
          const reservations = new Map<string, number>();
          for (const item of calculated.items)
            reservations.set(
              item.productId,
              (reservations.get(item.productId) ?? 0) + item.quantity,
            );
          for (const [productId, quantity] of reservations) {
            const product = await tx.product.findUniqueOrThrow({
              where: { id: productId },
            });
            if (product.stockQuantity !== null) {
              const changed = await tx.product.updateMany({
                where: {
                  id: product.id,
                  stockQuantity: { gte: quantity },
                },
                data: { stockQuantity: { decrement: quantity } },
              });
              if (changed.count !== 1)
                throw new BusinessError(
                  "OUT_OF_STOCK",
                  "Порции закончились.",
                  409,
                );
              await tx.stockReservation.create({
                data: {
                  orderId: order.id,
                  productId: product.id,
                  quantity,
                },
              });
            }
          }
          if (calculated.promotionId)
            await tx.promotionRedemption.create({
              data: {
                promotionId: calculated.promotionId,
                customerId,
                orderId: order.id,
              },
            });
          if (calculated.totalMinor > 0 && input.paymentMethod === "mock")
            await tx.paymentAttempt.create({
              data: {
                orderId: order.id,
                provider: "mock",
                providerId: "mock_" + randomUUID(),
                amountMinor: order.totalMinor,
              },
            });
          await this.event(tx, order, "order.created", customerId);
          const response = json(
            this.present(await this.get(tx, order.id), true),
          );
          await tx.idempotencyRecord.create({
            data: {
              actorId: customerId,
              scope,
              key: idempotencyKey,
              requestHash,
              response,
            },
          });
          return response;
        },
        { timeout: 10000 },
      );
    } catch (error) {
      if (
        error instanceof BusinessError &&
        ["QUOTE_CHANGED", "QUOTE_EXPIRED"].includes(error.code)
      ) {
        const stored = await this.db.orm.quote.findFirst({
          where: { id: input.quoteId, customerId },
        });
        if (stored) {
          const fresh = await this.quotes.create(
            customerId,
            stored.input as unknown as QuoteInput,
          );
          throw new BusinessError(error.code, error.safeMessage, 409, {
            quote: fresh,
          });
        }
      }
      throw error;
    }
  }
  async lookup(customerId: string, lookupKey: string) {
    if (!/^[A-Za-z0-9_.:-]{8,128}$/.test(lookupKey))
      throw new BusinessError(
        "INVALID_KEY",
        "Некорректный ключ оформления.",
        400,
      );
    const record = await this.db.orm.idempotencyRecord.findUnique({
      where: {
        actorId_scope_key: {
          actorId: customerId,
          scope: "order.create",
          key: lookupKey,
        },
      },
    });
    if (
      !record ||
      !record.response ||
      typeof record.response !== "object" ||
      Array.isArray(record.response) ||
      typeof record.response.id !== "string"
    )
      throw new NotFoundException();
    return this.customerOrder(customerId, record.response.id);
  }
  async customerOrder(customerId: string, id: string) {
    const order = await this.db.orm.order.findFirst({
      where: { id, customerId },
      include,
    });
    if (!order) throw new NotFoundException();
    return this.present(order, true);
  }
  private async page(where: Prisma.OrderWhereInput, query: ListOrders) {
    if (query.cursor) {
      const anchor = await this.db.orm.order.findFirst({
        where: { AND: [where, { id: query.cursor }] },
        select: { id: true, createdAt: true },
      });
      if (!anchor)
        throw new BusinessError(
          "INVALID_CURSOR",
          "Обновите список заказов.",
          400,
        );
      where = {
        AND: [
          where,
          {
            OR: [
              { createdAt: { lt: anchor.createdAt } },
              { createdAt: anchor.createdAt, id: { lt: anchor.id } },
            ],
          },
        ],
      };
    }
    return this.db.orm.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      include,
    });
  }
  async customerOrders(customerId: string, query: ListOrders) {
    const rows = await this.page({ customerId }, query);
    return {
      items: rows.slice(0, query.limit).map((o) => this.present(o, true)),
      nextCursor: rows.length > query.limit ? rows[query.limit - 1].id : null,
    };
  }
  async simulate(
    customerId: string,
    paymentId: string,
    outcome: SimulateCommand["outcome"],
  ) {
    if (
      !["development", "test"].includes(process.env.NODE_ENV ?? "development")
    )
      throw new BusinessError(
        "MOCK_DISABLED",
        "Тестовые операции выключены.",
        403,
      );
    return this.db.orm.$transaction(async (tx) => {
      const first = await tx.paymentAttempt.findFirst({
        where: { id: paymentId, provider: "mock", order: { customerId } },
      });
      if (!first) throw new NotFoundException();
      await this.lock(tx, first.orderId);
      let order = await this.expire(tx, await this.get(tx, first.orderId));
      const payment = await tx.paymentAttempt.findUniqueOrThrow({
        where: { id: paymentId },
      });
      if (
        outcome === "timeout" ||
        ["paid", "refunded"].includes(payment.status)
      )
        return this.present(order, true);
      if (outcome === "failed") {
        if (payment.status !== "pending") return this.present(order, true);
        await tx.paymentAttempt.update({
          where: { id: paymentId },
          data: { status: "failed" },
        });
        const updated = await tx.order.update({
          where: { id: order.id },
          data: {
            ...(order.status === "awaiting_payment"
              ? { paymentStatus: "failed" as const }
              : {}),
            version: { increment: 1 },
          },
        });
        await this.event(tx, updated, "payment.failed", customerId);
        return this.present(await this.get(tx, order.id), true);
      }
      if (payment.amountMinor !== order.totalMinor) {
        await tx.paymentAttempt.update({
          where: { id: paymentId },
          data: { status: "manual_review" },
        });
        const updated = await tx.order.update({
          where: { id: order.id },
          data: { paymentStatus: "manual_review", version: { increment: 1 } },
        });
        await this.event(tx, updated, "payment.manual_review", null);
        return this.present(await this.get(tx, order.id), true);
      }
      await tx.paymentAttempt.update({
        where: { id: paymentId },
        data: { status: "paid" },
      });
      const otherPaid = await tx.paymentAttempt.findFirst({
        where: { orderId: order.id, status: "paid", id: { not: paymentId } },
      });
      if (otherPaid || order.status !== "awaiting_payment") {
        await this.mockRefund(
          tx,
          paymentId,
          otherPaid
            ? "Duplicate payment"
            : "Payment after order no longer executable",
        );
        const updated = await tx.order.update({
          where: { id: order.id },
          data: {
            ...(otherPaid ? {} : { paymentStatus: "refunded" }),
            version: { increment: 1 },
          },
        });
        await this.event(
          tx,
          updated,
          otherPaid ? "payment.duplicate.refunded" : "payment.late.refunded",
          null,
        );
      } else {
        const updated = await tx.order.update({
          where: { id: order.id },
          data: {
            status: "placed",
            paymentStatus: "paid",
            version: { increment: 1 },
          },
        });
        await this.event(tx, updated, "payment.confirmed", customerId);
      }
      order = await this.get(tx, order.id);
      return this.present(order, true);
    });
  }
  async retry(customerId: string, id: string, idempotencyKey: string) {
    return this.db.orm.$transaction(async (tx) => {
      if (
        !(await tx.order.findFirst({
          where: { id, customerId },
          select: { id: true },
        }))
      )
        throw new NotFoundException();
      await this.lock(tx, id);
      const order = await this.get(tx, id);
      const scope = "payment.retry:" + id,
        hash = digest(id),
        previous = await tx.idempotencyRecord.findUnique({
          where: {
            actorId_scope_key: {
              actorId: customerId,
              scope,
              key: idempotencyKey,
            },
          },
        });
      if (previous) return previous.response;
      if (
        order.paymentMethod !== "mock" ||
        order.status !== "awaiting_payment" ||
        order.expiresAt.getTime() <= Date.now() ||
        order.paymentStatus !== "failed"
      )
        throw new BusinessError(
          "PAYMENT_RETRY_BLOCKED",
          "Новая попытка оплаты пока недоступна. Сначала уточните статус.",
          409,
        );
      await tx.paymentAttempt.create({
        data: {
          orderId: id,
          providerId: "mock_" + randomUUID(),
          amountMinor: order.totalMinor,
        },
      });
      const updated = await tx.order.update({
        where: { id },
        data: { paymentStatus: "pending", version: { increment: 1 } },
      });
      await this.event(tx, updated, "payment.retry", customerId);
      const response = json(this.present(await this.get(tx, id), true));
      await tx.idempotencyRecord.create({
        data: {
          actorId: customerId,
          scope,
          key: idempotencyKey,
          requestHash: hash,
          response,
        },
      });
      return response;
    });
  }
  async cancel(customerId: string, id: string, input: ReasonCommand) {
    return this.db.orm.$transaction(async (tx) => {
      if (
        !(await tx.order.findFirst({
          where: { id, customerId },
          select: { id: true },
        }))
      )
        throw new NotFoundException();
      await this.lock(tx, id);
      const order = await this.get(tx, id);
      if (
        order.version !== input.expectedVersion ||
        !["awaiting_payment", "placed"].includes(order.status)
      )
        throw new BusinessError(
          "CANCEL_NOT_ALLOWED",
          "Самостоятельная отмена этого заказа недоступна.",
          409,
        );
      await this.release(tx, id);
      let paymentStatus = order.paymentStatus;
      for (const p of order.payments)
        if (p.status === "paid") {
          await this.mockRefund(tx, p.id, input.reason);
          paymentStatus = "refunded";
        }
      const updated = await tx.order.update({
        where: { id },
        data: { status: "cancelled", paymentStatus, version: { increment: 1 } },
      });
      await this.event(
        tx,
        updated,
        "order.cancelled",
        customerId,
        input.reason,
      );
      return this.present(await this.get(tx, id), true);
    });
  }
  async expireOverdue() {
    const rows = await this.db.orm.order.findMany({
      where: {
        status: "awaiting_payment",
        expiresAt: { lte: new Date() },
        paymentStatus: { not: "manual_review" },
      },
      take: 100,
      select: { id: true },
    });
    for (const row of rows)
      await this.db.orm.$transaction(async (tx) => {
        await this.lock(tx, row.id);
        await this.expire(tx, await this.get(tx, row.id));
      });
    return rows.length;
  }
  private kitchenOnly(context: StaffContext, branchId: string) {
    return !context.session.staff!.roles.some(
      (binding) =>
        binding.role === "owner" ||
        (binding.branchId === branchId &&
          ["manager", "operator", "dispatcher"].includes(binding.role)),
    );
  }
  async staffOrders(context: StaffContext, query: AdminOrders) {
    const kitchen = this.kitchenOnly(context, query.branchId);
    const rows = await this.page(
      {
        branchId: query.branchId,
        ...(query.status ? { status: query.status } : {}),
      },
      query,
    );
    return {
      items: rows
        .slice(0, query.limit)
        .map((o) => this.present(o, false, kitchen)),
      nextCursor: rows.length > query.limit ? rows[query.limit - 1].id : null,
    };
  }
  async staffOrder(id: string, context: StaffContext) {
    const order = await this.db.orm.order.findUnique({
      where: { id },
      include,
    });
    if (!order) throw new NotFoundException();
    const kitchen = this.kitchenOnly(context, order.branchId);
    return this.present(order, false, kitchen);
  }
  async branchOf(id: string) {
    const order = await this.db.orm.order.findUnique({
      where: { id },
      select: { branchId: true },
    });
    if (!order) throw new NotFoundException();
    return order.branchId;
  }
  async command(
    id: string,
    context: StaffContext,
    command: string,
    input: VersionCommand & {
      reason?: string;
      preparationMinutes?: number;
      courierId?: string;
      pickupCode?: string;
      cashReceived?: boolean;
    },
  ) {
    return this.db.orm.$transaction(async (tx) => {
      await this.lock(tx, id);
      const order = await this.get(tx, id);
      if (order.version !== input.expectedVersion)
        throw new BusinessError(
          "VERSION_CONFLICT",
          "Заказ уже изменился. Обновите его состояние.",
          409,
        );
      const expected: Record<string, OrderStatus[]> = {
        accept: ["placed"],
        prepare: ["accepted"],
        ready: ["preparing"],
        reject: ["placed"],
        cancel: ["awaiting_payment", "placed", "accepted"],
        "complete-pickup": ["ready"],
        "assign-courier": ["accepted", "preparing", "ready"],
      };
      if (!expected[command]?.includes(order.status))
        throw new BusinessError(
          "INVALID_TRANSITION",
          "Этот переход заказа недоступен.",
          409,
        );
      if (
        !["cancel", "reject"].includes(command) &&
        !["paid", "not_required"].includes(order.paymentStatus) &&
        !(order.paymentMethod === "cash" && order.paymentStatus === "unpaid")
      )
        throw new BusinessError(
          "PAYMENT_NOT_SETTLED",
          "Статус оплаты не позволяет выполнить действие.",
          409,
        );
      let status = order.status,
        paymentStatus = order.paymentStatus;
      const data: Prisma.OrderUpdateInput = { version: { increment: 1 } };
      if (command === "accept") {
        status = "accepted";
        data.preparationMinutes = input.preparationMinutes;
      }
      if (command === "prepare") status = "preparing";
      if (command === "ready") status = "ready";
      if (command === "reject" || command === "cancel") {
        if (!input.reason)
          throw new BusinessError("REASON_REQUIRED", "Укажите причину.");
        await this.release(tx, id);
        for (const p of order.payments)
          if (p.status === "paid") {
            await this.mockRefund(tx, p.id, input.reason);
            paymentStatus = "refunded";
          }
        status = command === "reject" ? "rejected" : "cancelled";
      }
      if (command === "assign-courier") {
        if (order.fulfilment !== "delivery")
          throw new BusinessError(
            "NOT_DELIVERY",
            "Курьер нужен только для доставки.",
          );
        const courier = await tx.staffUser.findFirst({
          where: {
            id: input.courierId,
            active: true,
            roles: { some: { role: "courier", branchId: order.branchId } },
          },
        });
        if (!courier)
          throw new BusinessError(
            "INVALID_COURIER",
            "Курьер недоступен для этого филиала.",
          );
        data.courierId = courier.id;
        data.courierAccepted = false;
      }
      if (command === "complete-pickup") {
        if (
          order.fulfilment !== "pickup" ||
          !order.pickupSecret ||
          !equalSecret(
            decryptSecret(order.pickupSecret),
            input.pickupCode ?? "",
          )
        )
          throw new BusinessError(
            "INVALID_PICKUP_CODE",
            "Проверьте код получения заказа.",
          );
        if (order.paymentStatus === "unpaid") {
          if (order.paymentMethod !== "cash" || input.cashReceived !== true)
            throw new BusinessError(
              "CASH_NOT_CONFIRMED",
              "Подтвердите получение оплаты при выдаче.",
            );
          await tx.paymentAttempt.create({
            data: {
              orderId: id,
              provider: "cash-demo",
              providerId: "cash_" + randomUUID(),
              amountMinor: order.totalMinor,
              status: "paid",
            },
          });
          paymentStatus = "paid";
        }
        status = "completed";
      }
      const updated = await tx.order.update({
        where: { id },
        data: { ...data, status, paymentStatus },
      });
      await this.event(
        tx,
        updated,
        "order." + command,
        context.session.staffId,
        input.reason,
      );
      return this.present(
        await this.get(tx, id),
        false,
        this.kitchenOnly(context, order.branchId),
      );
    });
  }
  async courierOrders(staffId: string, query: ListOrders, branches: string[]) {
    const rows = await this.page(
      {
        courierId: staffId,
        branchId: { in: branches },
        status: { in: ["accepted", "preparing", "ready", "out_for_delivery"] },
      },
      query,
    );
    return {
      items: rows.slice(0, query.limit).map((o) => this.present(o)),
      nextCursor: rows.length > query.limit ? rows[query.limit - 1].id : null,
    };
  }
  async courier(
    id: string,
    context: StaffContext,
    command: "accept" | "collect" | "deliver",
    input: DeliverCommand,
  ) {
    return this.db.orm.$transaction(async (tx) => {
      const staffId = context.session.staffId!;
      await this.lock(tx, id);
      const order = await this.get(tx, id);
      if (
        !context.session.staff!.roles.some(
          (r) => r.role === "courier" && r.branchId === order.branchId,
        ) ||
        order.courierId !== staffId ||
        terminal.includes(order.status)
      )
        throw new NotFoundException();
      if (order.version !== input.expectedVersion)
        throw new BusinessError(
          "VERSION_CONFLICT",
          "Заказ уже изменился.",
          409,
        );
      if (
        !["paid", "not_required"].includes(order.paymentStatus) &&
        !(order.paymentMethod === "cash" && order.paymentStatus === "unpaid")
      )
        throw new BusinessError(
          "PAYMENT_NOT_SETTLED",
          "Требуется проверка оплаты.",
          409,
        );
      const data: Prisma.OrderUpdateInput = { version: { increment: 1 } };
      if (command === "accept") {
        if (!["accepted", "preparing", "ready"].includes(order.status))
          throw new BusinessError(
            "INVALID_TRANSITION",
            "Назначение нельзя принять.",
            409,
          );
        data.courierAccepted = true;
      }
      if (command === "collect") {
        if (order.status !== "ready" || !order.courierAccepted)
          throw new BusinessError(
            "INVALID_TRANSITION",
            "Заказ ещё нельзя забрать.",
            409,
          );
        data.status = "out_for_delivery";
      }
      if (command === "deliver") {
        if (order.status !== "out_for_delivery")
          throw new BusinessError(
            "INVALID_TRANSITION",
            "Заказ ещё не в доставке.",
            409,
          );
        if (order.paymentStatus === "unpaid") {
          if (order.paymentMethod !== "cash" || input.cashReceived !== true)
            throw new BusinessError(
              "CASH_NOT_CONFIRMED",
              "Подтвердите получение оплаты.",
            );
          await tx.paymentAttempt.create({
            data: {
              orderId: id,
              provider: "cash-demo",
              providerId: "cash_" + randomUUID(),
              amountMinor: order.totalMinor,
              status: "paid",
            },
          });
          data.paymentStatus = "paid";
        }
        data.status = "delivered";
      }
      const updated = await tx.order.update({ where: { id }, data });
      await this.event(tx, updated, "courier." + command, staffId);
      if (command === "deliver")
        return {
          id: updated.id,
          status: updated.status,
          version: updated.version,
        };
      return this.present(await this.get(tx, id));
    });
  }
  async refund(
    paymentId: string,
    context: StaffContext,
    input: RefundCommand,
    idempotencyKey: string,
  ) {
    return this.db.orm.$transaction(async (tx) => {
      const bindings = context.session.staff!.roles,
        owner = bindings.some((r) => r.role === "owner"),
        branches = bindings
          .filter((r) => r.role === "manager" && r.refundAllowed && r.branchId)
          .map((r) => r.branchId!);
      if (!owner && !branches.length)
        throw new BusinessError(
          "REFUND_FORBIDDEN",
          "Нет разрешения на возвраты.",
          403,
        );
      const payment = await tx.paymentAttempt.findFirst({
        where: {
          id: paymentId,
          ...(owner ? {} : { order: { branchId: { in: branches } } }),
        },
      });
      if (!payment) throw new NotFoundException();
      await this.lock(tx, payment.orderId);
      const order = await this.get(tx, payment.orderId),
        roles = context.session.staff!.roles;
      if (
        !roles.some(
          (r) =>
            r.role === "owner" ||
            (r.role === "manager" &&
              r.branchId === order.branchId &&
              r.refundAllowed),
        )
      )
        throw new BusinessError(
          "REFUND_FORBIDDEN",
          "Нет разрешения на возвраты.",
          403,
        );
      const scope = "refund:" + paymentId,
        requestHash = digest(canonical({ paymentId, reason: input.reason })),
        previous = await tx.idempotencyRecord.findUnique({
          where: {
            actorId_scope_key: {
              actorId: context.session.staffId!,
              scope,
              key: idempotencyKey,
            },
          },
        });
      if (previous) {
        if (previous.requestHash !== requestHash)
          throw new BusinessError(
            "IDEMPOTENCY_CONFLICT",
            "Ключ возврата уже использован иначе.",
            409,
          );
        return previous.response;
      }
      const staff = await tx.staffUser.findUniqueOrThrow({
          where: { id: context.session.staffId! },
        }),
        counter = verifyTotp(
          decryptSecret(staff.mfaSecret),
          input.code,
          staff.lastMfaCounter,
        );
      if (counter === null)
        throw new BusinessError(
          "REAUTH_REQUIRED",
          "Нужен новый код подтверждения сотрудника.",
          401,
        );
      const changed = await tx.staffUser.updateMany({
        where: { id: staff.id, lastMfaCounter: { lt: counter } },
        data: { lastMfaCounter: counter },
      });
      if (!changed.count)
        throw new BusinessError("REAUTH_REQUIRED", "Код уже использован.", 401);
      const refund = await this.mockRefund(tx, paymentId, input.reason),
        updated = await tx.order.update({
          where: { id: order.id },
          data: { paymentStatus: "refunded", version: { increment: 1 } },
        });
      await this.event(tx, updated, "payment.refunded", staff.id, input.reason);
      const response = json({
        id: refund.id,
        status: refund.status,
        amountMinor: refund.amountMinor,
        provider: refund.provider,
      });
      await tx.idempotencyRecord.create({
        data: {
          actorId: staff.id,
          scope,
          key: idempotencyKey,
          requestHash,
          response,
        },
      });
      return response;
    });
  }
}
const commandRoles: Record<string, StaffRole[]> = {
  accept: ["manager", "operator"],
  prepare: ["manager", "kitchen"],
  ready: ["manager", "kitchen"],
  reject: ["manager", "operator"],
  cancel: ["manager"],
  "complete-pickup": ["manager", "operator"],
  "assign-courier": ["manager", "dispatcher"],
};
@ApiTags("orders")
@Controller()
export class OrderController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(OrderService) private readonly orders: OrderService,
  ) {}
  @Post("orders") async create(
    @Req() request: Request,
    @Body() input: CreateOrder,
  ) {
    return this.orders.create(
      (await this.auth.customer(request)).customerId!,
      input,
      key(request),
    );
  }
  @Get("me/orders") async mine(
    @Req() request: Request,
    @Query() query: ListOrders,
  ) {
    return this.orders.customerOrders(
      (await this.auth.customer(request)).customerId!,
      query,
    );
  }
  @Get("orders/by-key/:key") async lookup(
    @Req() request: Request,
    @Param("key") lookupKey: string,
  ) {
    return this.orders.lookup(
      (await this.auth.customer(request)).customerId!,
      lookupKey,
    );
  }
  @Get("orders/:id") async get(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.orders.customerOrder(
      (await this.auth.customer(request)).customerId!,
      id,
    );
  }
  @Post("orders/:id/cancel") @HttpCode(200) async cancel(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: ReasonCommand,
  ) {
    return this.orders.cancel(
      (await this.auth.customer(request)).customerId!,
      id,
      input,
    );
  }
  @Post("orders/:id/payment-attempts") async retry(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() _input: EmptyCommand,
  ) {
    return this.orders.retry(
      (await this.auth.customer(request)).customerId!,
      id,
      key(request),
    );
  }
  @Post("payments/:id/mock-result") @HttpCode(200) async result(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: SimulateCommand,
  ) {
    return this.orders.simulate(
      (await this.auth.customer(request)).customerId!,
      id,
      input.outcome,
    );
  }
  @Get("admin/orders") async list(
    @Req() request: Request,
    @Query() query: AdminOrders,
  ) {
    return this.orders.staffOrders(
      await this.auth.staff(
        request,
        ["manager", "operator", "kitchen", "dispatcher"],
        query.branchId,
      ),
      query,
    );
  }
  @Get("admin/orders/:id") async staffGet(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    await this.auth.staff(request, [
      "manager",
      "operator",
      "kitchen",
      "dispatcher",
    ]);
    const branch = await this.orders.branchOf(id);
    return this.orders.staffOrder(
      id,
      await this.auth.staff(
        request,
        ["manager", "operator", "kitchen", "dispatcher"],
        branch,
      ),
    );
  }
  private async staffCommand(
    request: Request,
    id: string,
    command: string,
    input: VersionCommand,
  ) {
    await this.auth.staff(request, commandRoles[command], undefined, true);
    const branch = await this.orders.branchOf(id);
    return this.orders.command(
      id,
      await this.auth.staff(request, commandRoles[command], branch, true),
      command,
      input,
    );
  }
  @Post("admin/orders/:id/accept") @HttpCode(200) accept(
    @Req() r: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() i: AcceptCommand,
  ) {
    return this.staffCommand(r, id, "accept", i);
  }
  @Post("admin/orders/:id/prepare") @HttpCode(200) prepare(
    @Req() r: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() i: VersionCommand,
  ) {
    return this.staffCommand(r, id, "prepare", i);
  }
  @Post("admin/orders/:id/ready") @HttpCode(200) ready(
    @Req() r: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() i: VersionCommand,
  ) {
    return this.staffCommand(r, id, "ready", i);
  }
  @Post("admin/orders/:id/reject") @HttpCode(200) reject(
    @Req() r: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() i: ReasonCommand,
  ) {
    return this.staffCommand(r, id, "reject", i);
  }
  @Post("admin/orders/:id/cancel") @HttpCode(200) staffCancel(
    @Req() r: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() i: ReasonCommand,
  ) {
    return this.staffCommand(r, id, "cancel", i);
  }
  @Post("admin/orders/:id/complete-pickup") @HttpCode(200) pickup(
    @Req() r: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() i: CompleteCommand,
  ) {
    return this.staffCommand(r, id, "complete-pickup", i);
  }
  @Post("admin/orders/:id/assign-courier") @HttpCode(200) assign(
    @Req() r: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() i: AssignCommand,
  ) {
    return this.staffCommand(r, id, "assign-courier", i);
  }
  @Get("courier/assignments") async assignments(
    @Req() request: Request,
    @Query() query: ListOrders,
  ) {
    const ctx = await this.auth.staff(request, ["courier"]);
    return this.orders.courierOrders(
      ctx.session.staffId!,
      query,
      ctx.session
        .staff!.roles.filter((r) => r.role === "courier" && r.branchId)
        .map((r) => r.branchId!),
    );
  }
  @Post("courier/assignments/:id/accept") @HttpCode(200) async courierAccept(
    @Req() r: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() i: VersionCommand,
  ) {
    const ctx = await this.auth.staff(r, ["courier"], undefined, true);
    return this.orders.courier(id, ctx, "accept", i);
  }
  @Post("courier/assignments/:id/collect") @HttpCode(200) async collect(
    @Req() r: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() i: VersionCommand,
  ) {
    const ctx = await this.auth.staff(r, ["courier"], undefined, true);
    return this.orders.courier(id, ctx, "collect", i);
  }
  @Post("courier/assignments/:id/deliver") @HttpCode(200) async deliver(
    @Req() r: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() i: DeliverCommand,
  ) {
    const ctx = await this.auth.staff(r, ["courier"], undefined, true);
    return this.orders.courier(id, ctx, "deliver", i);
  }
  @Post("admin/payments/:id/refunds") async refund(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: RefundCommand,
  ) {
    const ctx = await this.auth.staff(request, ["manager"], undefined, true);
    return this.orders.refund(id, ctx, input, key(request));
  }
}
