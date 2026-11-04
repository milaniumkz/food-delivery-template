import { ApiProperty } from "@nestjs/swagger";
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { randomBytes } from "node:crypto";
import type { Request } from "express";
import type { Prisma, StaffRole } from "@prisma/client";
import { Database } from "./database.js";
import { AuthService } from "./auth.js";
import {
  base32,
  decryptSecret,
  encryptSecret,
  hashPassword,
  verifyTotp,
} from "./auth-crypto.js";
import { BusinessError } from "./business-error.js";
class RoleInput {
  @ApiProperty({
    enum: ["owner", "manager", "operator", "kitchen", "dispatcher", "courier"],
  })
  @IsIn(["owner", "manager", "operator", "kitchen", "dispatcher", "courier"])
  role!: StaffRole;
  @ApiProperty({
    required: false,
    nullable: true,
    type: String,
    format: "uuid",
  })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsUUID()
  branchId?: string | null;
  @ApiProperty({ required: false, type: Boolean, default: false })
  @IsBoolean()
  refundAllowed = false;
}
class CreateStaff {
  @ApiProperty({ type: String, format: "email", minLength: 3, maxLength: 254 })
  @IsEmail()
  @Length(3, 254)
  email!: string;
  @ApiProperty({ type: () => [RoleInput], minItems: 1, maxItems: 30 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RoleInput)
  roles!: RoleInput[];
  @ApiProperty({ type: String, pattern: "^\\d{6}$" })
  @Matches(/^\d{6}$/)
  code!: string;
}
class UpdateStaff {
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
  @ApiProperty({ type: Boolean }) @IsBoolean() active!: boolean;
  @ApiProperty({ type: () => [RoleInput], minItems: 1, maxItems: 30 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RoleInput)
  roles!: RoleInput[];
  @ApiProperty({ type: String, pattern: "^\\d{6}$" })
  @Matches(/^\d{6}$/)
  code!: string;
}
const selection = {
  id: true,
  email: true,
  active: true,
  version: true,
  createdAt: true,
  roles: { select: { role: true, branchId: true, refundAllowed: true } },
} as const;
@Controller("admin/staff")
export class StaffController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  private async budget(id: string) {
    const allowed = await this.db.orm.$transaction(async (tx) => {
      const key = "staff-administration:" + id;
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${key}))`;
      const now = new Date(),
        old = await tx.authThrottle.findUnique({ where: { key } }),
        hits = old && old.resetAt > now ? old.hits : 0;
      if (hits >= 10) return false;
      await tx.authThrottle.upsert({
        where: { key },
        create: { key, hits: 1, resetAt: new Date(Date.now() + 900000) },
        update: {
          hits: hits + 1,
          resetAt:
            old && old.resetAt > now
              ? old.resetAt
              : new Date(Date.now() + 900000),
        },
      });
      return true;
    });
    if (!allowed)
      throw new BusinessError(
        "RATE_LIMITED",
        "Слишком много подтверждений. Подождите.",
        429,
      );
  }
  private async reauth(tx: Prisma.TransactionClient, id: string, code: string) {
    const actor = await tx.staffUser.findUniqueOrThrow({
      where: { id },
      include: { roles: true },
    });
    if (!actor.active || !actor.roles.some((r) => r.role === "owner"))
      throw new BusinessError("FORBIDDEN", "Недостаточно прав.", 403);
    const counter = verifyTotp(
      decryptSecret(actor.mfaSecret),
      code,
      actor.lastMfaCounter,
    );
    if (counter === null)
      throw new BusinessError(
        "REAUTH_REQUIRED",
        "Нужен новый код MFA владельца.",
        401,
      );
    const changed = await tx.staffUser.updateMany({
      where: { id, active: true, lastMfaCounter: { lt: counter } },
      data: { lastMfaCounter: counter },
    });
    if (!changed.count)
      throw new BusinessError("REAUTH_REQUIRED", "Код уже использован.", 401);
  }
  private async roles(tx: Prisma.TransactionClient, input: RoleInput[]) {
    const seen = new Set<string>();
    for (const role of input) {
      const key = role.role + ":" + (role.branchId ?? "");
      if (seen.has(key))
        throw new BusinessError("INVALID_ROLES", "Повтор роли.");
      seen.add(key);
      if (
        (role.role === "owner") !== (role.branchId == null) ||
        (!["owner", "manager"].includes(role.role) && role.refundAllowed)
      )
        throw new BusinessError(
          "INVALID_ROLES",
          "Укажите филиал для роли; возвраты доступны владельцу и уполномоченному менеджеру.",
        );
      if (
        role.branchId &&
        !(await tx.branch.findUnique({
          where: { id: role.branchId },
          select: { id: true },
        }))
      )
        throw new BusinessError("INVALID_BRANCH", "Филиал не найден.");
    }
    return input.map((r) => ({
      role: r.role,
      branchId: r.branchId ?? null,
      refundAllowed: r.role === "owner" || r.refundAllowed,
    }));
  }
  @Get() async list(@Req() request: Request) {
    await this.auth.staff(request, ["owner"]);
    return {
      items: await this.db.orm.staffUser.findMany({
        take: 100,
        orderBy: { id: "asc" },
        select: selection,
      }),
    };
  }
  @Post() async create(@Req() request: Request, @Body() input: CreateStaff) {
    const { session } = await this.auth.staff(
        request,
        ["owner"],
        undefined,
        true,
      ),
      password = randomBytes(24).toString("base64url"),
      secret = randomBytes(20).toString("hex"),
      passwordHash = await hashPassword(password);
    try {
      return await this.db.orm.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext('staff-administration'))`;
        await this.reauth(tx, session.staffId!, input.code);
        const roles = await this.roles(tx, input.roles);
        const staff = await tx.staffUser.create({
          data: {
            email: input.email.toLowerCase(),
            passwordHash,
            mfaSecret: encryptSecret(secret),
            roles: { create: roles },
          },
          select: selection,
        });
        await tx.auditLog.create({
          data: {
            actorId: session.staffId,
            action: "staff.created",
            entityId: staff.id,
          },
        });
        return { staff, credentials: { password, totpSecret: base32(secret) } };
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2002"
      )
        throw new BusinessError(
          "STAFF_EXISTS",
          "Учётная запись уже существует.",
          409,
        );
      throw error;
    }
  }
  @Patch(":id") async update(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: UpdateStaff,
  ) {
    const { session } = await this.auth.staff(
      request,
      ["owner"],
      undefined,
      true,
    );
    return this.db.orm.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext('staff-administration'))`;
      await this.reauth(tx, session.staffId!, input.code);
      const roles = await this.roles(tx, input.roles);
      const target = await tx.staffUser.findUnique({
        where: { id },
        include: { roles: true },
      });
      if (!target || target.version !== input.expectedVersion)
        throw new BusinessError(
          "STAFF_CONFLICT",
          "Запись изменена. Обновите список.",
          409,
        );
      if (
        target.active &&
        target.roles.some((r) => r.role === "owner") &&
        (!input.active || !roles.some((r) => r.role === "owner"))
      ) {
        if (
          (await tx.staffUser.count({
            where: { active: true, roles: { some: { role: "owner" } } },
          })) <= 1
        )
          throw new BusinessError(
            "LAST_OWNER",
            "Нельзя отключить последнего владельца.",
            409,
          );
      }
      await tx.staffUser.update({
        where: { id },
        data: {
          active: input.active,
          version: { increment: 1 },
          roles: { deleteMany: {}, create: roles },
        },
      });
      await tx.authSession.updateMany({
        where: { staffId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.staffId,
          action: "staff.access.updated",
          entityId: id,
        },
      });
      return tx.staffUser.findUniqueOrThrow({
        where: { id },
        select: selection,
      });
    });
  }
}
