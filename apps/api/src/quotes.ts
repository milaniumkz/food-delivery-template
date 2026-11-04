import {
  Body,
  Controller,
  HttpException,
  Inject,
  Injectable,
  Post,
  Req,
} from "@nestjs/common";
import { ApiProperty, ApiTags } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  ValidateIf,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { selectOptions, type SelectedOption } from "./product-options.js";
import { Type } from "class-transformer";
import type { Request } from "express";
import type { Prisma } from "@prisma/client";
import { Database } from "./database.js";
import { AuthService } from "./auth.js";
import { BusinessError } from "./business-error.js";
import { digest } from "./auth-crypto.js";
import {
  branchOpen,
  canonical,
  discountMinor,
  pointInPolygon,
  type Point,
} from "./pricing.js";
export const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export class QuoteLineInput {
  @ApiProperty({ required: false, type: String, format: "uuid" })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  variantId?: string;
  @ApiProperty({ required: false, type: () => [String], maxItems: 100 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  choiceIds: string[] = [];
  @ApiProperty() @IsUUID() productId!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(99) quantity!: number;
}
export class AddressInput {
  @ApiProperty() @IsString() @Length(5, 300) text!: string;
  @ApiProperty() @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @ApiProperty() @IsNumber() @Min(-180) @Max(180) longitude!: number;
}
export class QuoteInput {
  @ApiProperty() @IsUUID() branchId!: string;
  @ApiProperty({ enum: ["pickup", "delivery"] })
  @IsIn(["pickup", "delivery"])
  fulfilment!: "pickup" | "delivery";
  @ApiProperty({ type: [QuoteLineInput] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuoteLineInput)
  items!: QuoteLineInput[];
  @ApiProperty({ required: false, type: () => AddressInput })
  @ValidateIf((_object, value) => value !== undefined)
  @ValidateNested()
  @Type(() => AddressInput)
  address?: AddressInput;
  @ApiProperty({
    required: false,
    type: String,
    pattern: "^[a-zA-Z0-9_-]{3,32}$",
  })
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^[a-zA-Z0-9_-]{3,32}$/)
  promoCode?: string;
  @ApiProperty({ required: false, type: String, maxLength: 500, default: "" })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(500)
  comment = "";
}
export interface Calculation {
  items: Array<{
    options: SelectedOption[];
    productId: string;
    nameRu: string;
    nameKk: string;
    quantity: number;
    unitPriceMinor: number;
    lineTotalMinor: number;
    version: number;
  }>;
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  currency: "KZT";
  zoneId: string | null;
  promotionId: string | null;
  preparationMinutes: number;
  signature: string;
}
@Injectable()
export class QuoteService {
  constructor(@Inject(Database) private readonly db: Database) {}
  async calculate(
    tx: Prisma.TransactionClient,
    customerId: string,
    input: QuoteInput,
    now = new Date(),
  ): Promise<Calculation> {
    const branch = await tx.branch.findUnique({
      where: { id: input.branchId },
    });
    if (
      !branch ||
      !branch.acceptingOrders ||
      !branchOpen(branch.schedule, branch.holidays, branch.timeZone, now)
    )
      throw new BusinessError(
        "BRANCH_CLOSED",
        "Филиал сейчас не принимает заказы.",
      );
    if (input.fulfilment === "delivery" && !input.address)
      throw new BusinessError(
        "ADDRESS_REQUIRED",
        "Для доставки нужен адрес и координаты.",
      );
    if (input.fulfilment === "pickup" && input.address)
      throw new BusinessError(
        "PICKUP_ADDRESS",
        "Для самовывоза адрес не требуется.",
      );
    const ids = [...new Set(input.items.map((i) => i.productId))],
      lineKeys = input.items.map((i) =>
        canonical({
          productId: i.productId,
          variantId: i.variantId ?? null,
          choiceIds: [...(i.choiceIds ?? [])].sort(),
        }),
      );
    if (new Set(lineKeys).size !== lineKeys.length)
      throw new BusinessError(
        "DUPLICATE_ITEM",
        "Объедините одинаковые варианты и добавки одной позиции.",
      );
    const portions = new Map<string, number>();
    for (const item of input.items)
      portions.set(
        item.productId,
        (portions.get(item.productId) ?? 0) + item.quantity,
      );
    const products = await tx.product.findMany({
      where: {
        id: { in: ids },
        branchId: branch.id,
        active: true,
        OR: [{ categoryId: null }, { category: { active: true } }],
      },
    });
    if (products.length !== ids.length)
      throw new BusinessError(
        "PRODUCT_UNAVAILABLE",
        "Одна из позиций больше недоступна.",
      );
    const items = input.items
      .map((line) => {
        const p = products.find((p) => p.id === line.productId)!;
        if (p.stockQuantity !== null && p.stockQuantity < portions.get(p.id)!)
          throw new BusinessError(
            "OUT_OF_STOCK",
            "Недостаточно порций одного из блюд.",
          );
        const selected = selectOptions(
          p.priceMinor,
          p.configuration,
          line.variantId,
          line.choiceIds,
        );
        return {
          options: selected.options,
          productId: p.id,
          nameRu: p.nameRu,
          nameKk: p.nameKk,
          quantity: line.quantity,
          unitPriceMinor: selected.unitPriceMinor,
          lineTotalMinor: selected.unitPriceMinor * line.quantity,
          version: p.version,
        };
      })
      .sort(
        (a, b) =>
          a.productId.localeCompare(b.productId) ||
          canonical(a.options).localeCompare(canonical(b.options)),
      );
    const subtotal = items.reduce((sum, i) => sum + i.lineTotalMinor, 0);
    if (!Number.isSafeInteger(subtotal) || subtotal > 100000000)
      throw new BusinessError(
        "AMOUNT_LIMIT",
        "Сумма заказа превышает допустимый предел.",
      );
    let zone = null;
    if (input.fulfilment === "delivery") {
      const zones = await tx.deliveryZone.findMany({
        where: { branchId: branch.id, active: true },
        orderBy: [{ priority: "desc" }, { id: "asc" }],
      });
      zone =
        zones.find((z) =>
          pointInPolygon(input.address!, z.polygon as unknown as Point[]),
        ) ?? null;
      if (!zone)
        throw new BusinessError(
          "OUTSIDE_DELIVERY_ZONE",
          "Этот адрес находится вне зоны доставки.",
        );
    }
    let promotion = null,
      discount = 0;
    if (input.promoCode) {
      promotion = await tx.promotion.findUnique({
        where: {
          branchId_code: {
            branchId: branch.id,
            code: input.promoCode.toUpperCase(),
          },
        },
      });
      if (
        !promotion ||
        !promotion.active ||
        promotion.startsAt > now ||
        promotion.endsAt <= now
      )
        throw new BusinessError("PROMO_UNAVAILABLE", "Промокод недоступен.");
      const [total, personal] = await Promise.all([
        tx.promotionRedemption.count({
          where: { promotionId: promotion.id, releasedAt: null },
        }),
        tx.promotionRedemption.count({
          where: { promotionId: promotion.id, customerId, releasedAt: null },
        }),
      ]);
      if (
        (promotion.totalLimit !== null && total >= promotion.totalLimit) ||
        (promotion.customerLimit !== null &&
          personal >= promotion.customerLimit)
      )
        throw new BusinessError("PROMO_EXHAUSTED", "Лимит промокода исчерпан.");
      discount = discountMinor(subtotal, promotion);
      if (subtotal - discount < promotion.minimumMinor)
        throw new BusinessError(
          "PROMO_MINIMUM",
          "Для промокода не достигнута минимальная сумма товаров после скидки.",
        );
    }
    const discounted = subtotal - discount,
      minimum = zone?.minimumMinor ?? branch.minimumPickupMinor;
    if (discounted < minimum)
      throw new BusinessError(
        "MINIMUM_ORDER",
        "Не достигнута минимальная сумма заказа после скидки.",
        422,
        { minimumMinor: minimum },
      );
    const fee = zone
        ? zone.freeThresholdMinor !== null &&
          discounted >= zone.freeThresholdMinor
          ? 0
          : zone.feeMinor
        : 0,
      total = discounted + fee;
    if (total > 100000000)
      throw new BusinessError(
        "AMOUNT_LIMIT",
        "Сумма заказа превышает допустимый предел.",
      );
    const signature = digest(
      canonical({
        branchVersion: branch.version,
        items,
        zone: zone ? { id: zone.id, version: zone.version } : null,
        promotion: promotion
          ? { id: promotion.id, version: promotion.version }
          : null,
        subtotal,
        discount,
        fee,
        total,
      }),
    );
    return {
      items,
      subtotalMinor: subtotal,
      discountMinor: discount,
      deliveryFeeMinor: fee,
      totalMinor: total,
      currency: "KZT",
      zoneId: zone?.id ?? null,
      promotionId: promotion?.id ?? null,
      preparationMinutes: branch.preparationMinutes,
      signature,
    };
  }
  async create(customerId: string, input: QuoteInput) {
    return this.db.orm.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${"quote:" + customerId}))`;
      if (
        (await tx.quote.count({
          where: {
            customerId,
            createdAt: { gte: new Date(Date.now() - 60000) },
          },
        })) >= 20
      )
        throw new HttpException("Rate limited", 429);
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id=${customerId}::uuid FOR SHARE`;
      if (
        (await tx.customer.findUnique({ where: { id: customerId } }))?.deletedAt
      )
        throw new BusinessError("ACCOUNT_DELETED", "Аккаунт удалён.", 401);
      if (
        (
          await tx.customerRestriction.findUnique({
            where: {
              customerId_branchId: { customerId, branchId: input.branchId },
            },
          })
        )?.blocked
      )
        throw new BusinessError(
          "CUSTOMER_BLOCKED",
          "Приём новых заказов для этого аккаунта приостановлен. Свяжитесь с поддержкой.",
          403,
        );
      const normalized = {
        ...input,
        ...(input.promoCode
          ? { promoCode: input.promoCode.toUpperCase() }
          : {}),
      };
      const calc = await this.calculate(tx, customerId, normalized),
        expiresAt = new Date(Date.now() + 300000);
      const quote = await tx.quote.create({
        data: {
          customerId,
          branchId: input.branchId,
          input: json(normalized),
          calculation: json(calc),
          signature: calc.signature,
          expiresAt,
        },
      });
      return {
        quoteId: quote.id,
        expiresAt: expiresAt.toISOString(),
        pricingVersion: calc.signature,
        ...calc,
      };
    });
  }
}
@ApiTags("checkout")
@Controller("checkout")
export class QuoteController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(QuoteService) private readonly quotes: QuoteService,
  ) {}
  @Post("quote") async quote(
    @Req() request: Request,
    @Body() input: QuoteInput,
  ) {
    const session = await this.auth.customer(request);
    return this.quotes.create(session.customerId!, input);
  }
}
