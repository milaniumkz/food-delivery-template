import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsUUID, ValidateIf } from "class-validator";
import type { Request } from "express";
import { Database } from "./database.js";
import { AuthService, VerifyOtp } from "./auth.js";
import { equalSecret, keyedDigest } from "./auth-crypto.js";
import { BusinessError } from "./business-error.js";
class ExportQuery {
  @ApiProperty({
    required: false,
    enum: [
      "profile",
      "orders",
      "quotes",
      "sessions",
      "restrictions",
      "notifications",
    ],
    default: "profile",
  })
  @IsIn([
    "profile",
    "orders",
    "quotes",
    "sessions",
    "restrictions",
    "notifications",
  ])
  section:
    | "profile"
    | "orders"
    | "quotes"
    | "sessions"
    | "restrictions"
    | "notifications" = "profile";
  @ApiProperty({ required: false, type: String, format: "uuid" })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  cursor?: string;
}
@Controller("me/privacy")
export class PrivacyController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Post("challenge") @HttpCode(200) async challenge(@Req() request: Request) {
    const session = await this.auth.customer(request);
    if (!session.customer!.phone) throw new UnauthorizedException();
    return this.auth.requestOtp(
      { phone: session.customer!.phone },
      request.ip ?? "unknown",
      { purpose: "privacy", sessionId: session.id },
    );
  }
  @Post("confirm") @HttpCode(200) async confirm(
    @Req() request: Request,
    @Body() input: VerifyOtp,
  ) {
    const session = await this.auth.customer(request);
    const valid = await this.db.orm.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id=${session.customerId}::uuid FOR SHARE`;
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${"otp-verify:" + input.challengeId}))`;
      const customer = await tx.customer.findUnique({
          where: { id: session.customerId! },
        }),
        proof = await tx.otpChallenge.findUnique({
          where: { id: input.challengeId },
        });
      if (
        !customer ||
        customer.deletedAt ||
        !customer.phone ||
        !proof ||
        proof.phone !== customer.phone ||
        proof.sessionId !== session.id ||
        proof.purpose !== "privacy" ||
        proof.consumedAt ||
        proof.expiresAt.getTime() <= Date.now() ||
        proof.attempts >= 5
      )
        return false;
      const accepted = equalSecret(
        proof.codeHash,
        keyedDigest(`otp:${proof.id}:${input.code}`),
      );
      await tx.otpChallenge.update({
        where: { id: proof.id },
        data: {
          attempts: { increment: 1 },
          ...(accepted ? { consumedAt: new Date() } : {}),
        },
      });
      if (!accepted) return false;
      const result = await tx.authSession.updateMany({
        where: {
          id: session.id,
          customerId: customer.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { privacyVerifiedAt: new Date() },
      });
      return result.count === 1;
    });
    if (!valid)
      throw new BusinessError(
        "INVALID_PROOF",
        "Код недействителен или истёк. Получите новый код.",
        422,
      );
    return { ok: true };
  }
  @Get("export") async export(
    @Req() request: Request,
    @Query() query: ExportQuery,
  ) {
    const session = await this.auth.customer(request);
    if (
      !session.privacyVerifiedAt ||
      session.privacyVerifiedAt.getTime() < Date.now() - 300000 ||
      session.privacyVerifiedAt.getTime() > Date.now()
    )
      throw new BusinessError(
        "REAUTH_REQUIRED",
        "Подтвердите экспорт свежим SMS-кодом.",
        403,
      );
    // Bounded per-subject export budget; no personal identifiers are placed into logs.
    await this.db.orm.$transaction(async (tx) => {
      const key = "privacy-export:" + session.customerId;
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${key}))`;
      const old = await tx.authThrottle.findUnique({ where: { key } }),
        active = old && old.resetAt > new Date(),
        hits = active ? old.hits : 0;
      if (hits >= 60)
        throw new BusinessError(
          "RATE_LIMITED",
          "Слишком много страниц экспорта. Подождите.",
          429,
        );
      await tx.authThrottle.upsert({
        where: { key },
        create: { key, hits: 1, resetAt: new Date(Date.now() + 60000) },
        update: {
          hits: hits + 1,
          resetAt: active ? old.resetAt : new Date(Date.now() + 60000),
        },
      });
    });
    return this.db.orm.$transaction(
      async (tx) => {
        const customer = await tx.customer.findUniqueOrThrow({
          where: { id: session.customerId! },
        });
        if (customer.deletedAt) throw new UnauthorizedException();
        const where = {
            customerId: customer.id,
            ...(query.cursor ? { id: { gt: query.cursor } } : {}),
          },
          page = { where, take: 11, orderBy: { id: "asc" as const } };
        let items: unknown[];
        if (query.section === "profile") {
          if (query.cursor)
            throw new BusinessError(
              "INVALID_CURSOR",
              "Для профиля cursor не используется.",
              400,
            );
          items = [
            {
              id: customer.id,
              name: customer.name,
              phone: customer.phone,
              locale: customer.locale,
              createdAt: customer.createdAt,
              addresses: await tx.customerAddress.findMany({
                where: { customerId: customer.id },
                orderBy: { id: "asc" },
                select: {
                  id: true,
                  label: true,
                  text: true,
                  latitude: true,
                  longitude: true,
                  createdAt: true,
                },
              }),
            },
          ];
        } else if (query.section === "orders")
          items = await tx.order.findMany({
            ...page,
            select: {
              id: true,
              branchId: true,
              fulfilment: true,
              status: true,
              paymentMethod: true,
              paymentStatus: true,
              subtotalMinor: true,
              discountMinor: true,
              deliveryFeeMinor: true,
              totalMinor: true,
              currency: true,
              addressSnapshot: true,
              comment: true,
              createdAt: true,
              items: {
                select: {
                  productId: true,
                  nameRu: true,
                  nameKk: true,
                  optionsSnapshot: true,
                  quantity: true,
                  unitPriceMinor: true,
                  lineTotalMinor: true,
                },
              },
              payments: {
                select: {
                  id: true,
                  provider: true,
                  status: true,
                  amountMinor: true,
                  createdAt: true,
                  refund: {
                    select: {
                      id: true,
                      amountMinor: true,
                      status: true,
                      reason: true,
                      createdAt: true,
                      confirmedAt: true,
                    },
                  },
                },
              },
            },
          });
        else if (query.section === "quotes")
          items = await tx.quote.findMany({
            ...page,
            select: {
              id: true,
              branchId: true,
              input: true,
              calculation: true,
              createdAt: true,
              expiresAt: true,
            },
          });
        else if (query.section === "sessions")
          items = await tx.authSession.findMany({
            ...page,
            select: {
              id: true,
              createdAt: true,
              expiresAt: true,
              revokedAt: true,
            },
          });
        else if (query.section === "notifications")
          items = await tx.notification.findMany({
            ...page,
            select: {
              id: true,
              orderId: true,
              type: true,
              provider: true,
              createdAt: true,
            },
          });
        else {
          // Composite restrictions use branchId as their stable cursor, scoped to the authenticated subject.
          items = await tx.customerRestriction.findMany({
            where: {
              customerId: customer.id,
              ...(query.cursor ? { branchId: { gt: query.cursor } } : {}),
            },
            orderBy: { branchId: "asc" },
            take: 11,
            select: {
              branchId: true,
              blocked: true,
              reason: true,
              updatedAt: true,
            },
          });
        }
        const hasMore = items.length > 10,
          returned = items.slice(0, 10),
          last = returned.at(-1) as
            { id?: string; branchId?: string } | undefined;
        return {
          section: query.section,
          items: returned,
          nextCursor: hasMore
            ? query.section === "restrictions"
              ? last!.branchId
              : last!.id
            : null,
          generatedAt: new Date().toISOString(),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
}
