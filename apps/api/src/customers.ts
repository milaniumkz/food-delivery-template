import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  HttpCode,
} from "@nestjs/common";
import { ApiProperty, ApiOkResponse } from "@nestjs/swagger";
import {
  IsUUID,
  IsString,
  Length,
  ValidateIf,
  IsBoolean,
  IsInt,
  Min,
} from "class-validator";
import type { Request } from "express";
import { AuthService } from "./auth.js";
import { Database } from "./database.js";
import { BusinessError } from "./business-error.js";
class CustomerQuery {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() branchId!: string;
  @ApiProperty({ required: false, type: String, format: "uuid" })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  cursor?: string;
  @ApiProperty({ required: false, type: String, minLength: 2, maxLength: 80 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @Length(2, 80)
  search?: string;
}
class RestrictCustomer {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() branchId!: string;
  @ApiProperty({ type: Boolean }) @IsBoolean() blocked!: boolean;
  @ApiProperty({ type: String, minLength: 5, maxLength: 300 })
  @IsString()
  @Length(5, 300)
  reason!: string;
  @ApiProperty({ type: "integer", minimum: 0 })
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}
const restrictionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["blocked", "reason", "version", "updatedAt"],
  properties: {
    blocked: { type: "boolean" },
    reason: { type: "string" },
    version: { type: "integer" },
    updatedAt: { type: "string", format: "date-time" },
  },
};
const customerSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "phone", "locale", "restriction", "recentOrders"],
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string", nullable: true },
    phone: { type: "string", nullable: true },
    locale: { type: "string" },
    restriction: { ...restrictionSchema, nullable: true },
    recentOrders: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "status", "totalMinor", "createdAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          status: { type: "string" },
          totalMinor: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
};
export const customerSchemas = {
  CustomerRestriction: restrictionSchema,
  AdminCustomer: customerSchema,
  AdminCustomerList: {
    type: "object",
    additionalProperties: false,
    required: ["items", "nextCursor"],
    properties: {
      items: {
        type: "array",
        maxItems: 50,
        items: { $ref: "#/components/schemas/AdminCustomer" },
      },
      nextCursor: { type: "string", format: "uuid", nullable: true },
    },
  },
};
@Controller("admin/customers")
export class CustomersController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get()
  @ApiOkResponse({
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["items", "nextCursor"],
      properties: {
        items: { type: "array", maxItems: 50, items: customerSchema },
        nextCursor: { type: "string", format: "uuid", nullable: true },
      },
    },
  })
  async list(@Req() request: Request, @Query() query: CustomerQuery) {
    await this.auth.staff(request, ["manager"], query.branchId);
    const found = await this.db.orm.customer.findMany({
      where: {
        deletedAt: null,
        OR: [
          { orders: { some: { branchId: query.branchId } } },
          { quotes: { some: { branchId: query.branchId } } },
        ],
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
        ...(query.search
          ? {
              AND: [
                {
                  OR: [
                    { phone: { contains: query.search } },
                    { name: { contains: query.search, mode: "insensitive" } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: { id: "asc" },
      take: 51,
      select: {
        id: true,
        name: true,
        phone: true,
        locale: true,
        restrictions: {
          where: { branchId: query.branchId },
          select: {
            blocked: true,
            reason: true,
            version: true,
            updatedAt: true,
          },
        },
        orders: {
          where: { branchId: query.branchId },
          take: 10,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true, status: true, totalMinor: true, createdAt: true },
        },
      },
    });
    return {
      items: found
        .slice(0, 50)
        .map(({ restrictions, orders, ...customer }) => ({
          ...customer,
          restriction: restrictions[0] ?? null,
          recentOrders: orders,
        })),
      nextCursor: found.length > 50 ? found[49].id : null,
    };
  }
  @Post(":id/restriction")
  @HttpCode(200)
  @ApiOkResponse({ schema: restrictionSchema })
  async restrict(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: RestrictCustomer,
  ) {
    const { session } = await this.auth.staff(
      request,
      ["manager"],
      input.branchId,
      true,
    );
    input.reason = input.reason.trim();
    if (input.reason.length < 5)
      throw new BusinessError(
        "INVALID_REASON",
        "Укажите содержательную причину.",
        400,
      );
    return this.db.orm.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id=${id}::uuid FOR UPDATE`;
      const customer = await tx.customer.findFirst({
        where: {
          id,
          deletedAt: null,
          OR: [
            { orders: { some: { branchId: input.branchId } } },
            { quotes: { some: { branchId: input.branchId } } },
          ],
        },
      });
      if (!customer) throw new NotFoundException();
      const where = {
          customerId_branchId: { customerId: id, branchId: input.branchId },
        },
        old = await tx.customerRestriction.findUnique({ where });
      if ((old?.version ?? 0) !== input.expectedVersion)
        throw new BusinessError(
          "VERSION_CONFLICT",
          "Данные изменились. Обновите карточку.",
          409,
        );
      const result = await tx.customerRestriction.upsert({
        where,
        create: {
          customerId: id,
          branchId: input.branchId,
          blocked: input.blocked,
          reason: input.reason,
        },
        update: {
          blocked: input.blocked,
          reason: input.reason,
          version: { increment: 1 },
          updatedAt: new Date(),
        },
        select: { blocked: true, reason: true, version: true, updatedAt: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.staffId,
          action: input.blocked ? "customer.blocked" : "customer.unblocked",
          entityId: id,
          details: {
            branchId: input.branchId,
            version: result.version,
            reason: input.reason,
          },
        },
      });
      return result;
    });
  }
}
