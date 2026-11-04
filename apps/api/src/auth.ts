import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Injectable,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  IsEmail,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Prisma, type StaffRole } from "@prisma/client";
import { BusinessError } from "./business-error.js";
import { Tenant } from "./tenant.js";
import { Database } from "./database.js";
import {
  decryptSecret,
  digest,
  equalSecret,
  hashPassword,
  keyedDigest,
  verifyPassword,
  verifyTotp,
} from "./auth-crypto.js";
const sessionInclude = {
  customer: true,
  staff: { include: { roles: true } },
} satisfies Prisma.AuthSessionInclude;
type Session = Prisma.AuthSessionGetPayload<{ include: typeof sessionInclude }>;
export type StaffContext = { session: Session; token: string };
@Injectable()
export class DevSmsProvider {
  readonly deliveries = new Map<string, string>();
  async send(challengeId: string, code: string) {
    if (
      !["development", "test"].includes(process.env.NODE_ENV ?? "development")
    )
      throw new Error("Dev SMS forbidden");
    this.deliveries.set(challengeId, code);
    if (process.env.NODE_ENV !== "test") {
      const dir = resolve(process.env.SMS_DIRECTORY ?? "../../.local/sms");
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await writeFile(resolve(dir, challengeId + ".txt"), code + "\n", {
        flag: "wx",
        mode: 0o600,
      });
    }
  }
}
class RequestOtp {
  @ApiProperty() @Matches(/^\+[1-9][0-9]{7,14}$/) phone!: string;
}
export class VerifyOtp {
  @ApiProperty() @IsUUID() challengeId!: string;
  @ApiProperty() @Matches(/^[0-9]{6}$/) code!: string;
}
class RefreshDto {
  @ApiProperty() @Matches(/^[0-9a-f]{64}$/) refreshToken!: string;
}
class StaffLogin {
  @ApiProperty() @IsEmail() @MaxLength(254) email!: string;
  @ApiProperty() @IsString() @Length(16, 128) password!: string;
  @ApiProperty() @Matches(/^[0-9]{6}$/) code!: string;
}
@Injectable()
export class AuthService {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(Tenant) private readonly tenant: Tenant,
    @Inject(DevSmsProvider) private readonly sms: DevSmsProvider,
  ) {}
  private async lock(tx: Prisma.TransactionClient, key: string) {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${key}))`;
  }
  async requestOtp(
    input: RequestOtp,
    ip: string,
    context?: { purpose: "deletion" | "privacy"; sessionId: string },
  ) {
    await this.tenant.assert();
    const id = randomUUID(),
      code = String(randomInt(1000000)).padStart(6, "0"),
      now = new Date(),
      ipHash = keyedDigest("ip:" + ip);
    await this.db.orm.$transaction(async (tx) => {
      await this.lock(tx, "otp-send-budget");
      const hour = new Date(now.getTime() - 3600000),
        day = new Date(Math.floor(now.getTime() / 86400000) * 86400000);
      const recent = await tx.otpChallenge.findFirst({
        where: {
          OR: [
            { phone: input.phone },
            { phoneHash: keyedDigest("phone:" + input.phone) },
          ],
        },
        orderBy: { createdAt: "desc" },
      });
      if (recent && recent.createdAt.getTime() > now.getTime() - 60000)
        throw new HttpException("Rate limited", 429);
      const phoneCount = await tx.otpChallenge.count({
        where: {
          OR: [
            { phone: input.phone },
            { phoneHash: keyedDigest("phone:" + input.phone) },
          ],
          createdAt: { gte: hour },
        },
      });
      const ipCount = await tx.otpChallenge.count({
        where: { ipHash, createdAt: { gte: hour } },
      });
      const total = await tx.otpChallenge.count({
        where: { createdAt: { gte: day } },
      });
      if (phoneCount >= 5 || ipCount >= 20 || total >= 100)
        throw new HttpException("Rate limited", 429);
      await tx.otpChallenge.updateMany({
        where: { phone: input.phone, consumedAt: null },
        data: { consumedAt: now },
      });
      await tx.otpChallenge.create({
        data: {
          id,
          purpose: context?.purpose ?? "login",
          sessionId: context?.sessionId ?? null,
          phone: input.phone,
          phoneHash: keyedDigest("phone:" + input.phone),
          ipHash,
          codeHash: keyedDigest(`otp:${id}:${code}`),
          expiresAt: new Date(now.getTime() + 180000),
        },
      });
    });
    try {
      await this.sms.send(id, code);
    } catch {
      await this.db.orm.otpChallenge.update({
        where: { id },
        data: { consumedAt: new Date() },
      });
      throw new ServiceUnavailableException();
    }
    return { challengeId: id, expiresIn: 180, retryAfter: 60 };
  }
  private async createCustomerSession(
    tx: Prisma.TransactionClient,
    customerId: string,
    familyId: string = randomUUID(),
  ) {
    const accessToken = randomBytes(32).toString("hex"),
      refreshToken = randomBytes(32).toString("hex"),
      now = Date.now();
    await tx.authSession.create({
      data: {
        customerId,
        accessHash: digest(accessToken),
        refreshHash: digest(refreshToken),
        familyId,
        expiresAt: new Date(now + 900000),
        refreshExpiresAt: new Date(now + 30 * 86400000),
      },
    });
    return { accessToken, refreshToken, expiresIn: 900 };
  }
  async verifyOtp(input: VerifyOtp) {
    await this.tenant.assert();
    const result = await this.db.orm.$transaction(async (tx) => {
      const hint = await tx.otpChallenge.findUnique({
        where: { id: input.challengeId },
        select: { phone: true },
      });
      if (hint?.phone)
        await tx.$queryRaw`SELECT id FROM "Customer" WHERE phone=${hint.phone} FOR UPDATE`;
      await this.lock(tx, "otp-verify:" + input.challengeId);
      const challenge = await tx.otpChallenge.findUnique({
        where: { id: input.challengeId },
      });
      if (
        !challenge ||
        !challenge.phone ||
        challenge.purpose !== "login" ||
        challenge.consumedAt ||
        challenge.expiresAt.getTime() <= Date.now() ||
        challenge.attempts >= 5
      )
        return null;
      const valid = equalSecret(
        challenge.codeHash,
        keyedDigest(`otp:${challenge.id}:${input.code}`),
      );
      await tx.otpChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts: { increment: 1 },
          ...(valid ? { consumedAt: new Date() } : {}),
        },
      });
      if (!valid) return null;
      const customer = await tx.customer.upsert({
        where: { phone: challenge.phone },
        update: {},
        create: { phone: challenge.phone },
      });
      if (customer.deletedAt) return null;
      return this.createCustomerSession(tx, customer.id);
    });
    if (!result) throw new UnauthorizedException();
    return result;
  }
  async refresh(input: RefreshDto) {
    await this.tenant.assert();
    const result = await this.db.orm.$transaction(async (tx) => {
      const found = await tx.authSession.findUnique({
        where: { refreshHash: digest(input.refreshToken) },
      });
      if (!found?.customerId) return null;
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id=${found.customerId}::uuid FOR SHARE`;
      await this.lock(tx, "refresh:" + found.familyId);
      const old = await tx.authSession.findUniqueOrThrow({
        where: { id: found.id },
        include: { customer: true },
      });
      if (old.revokedAt) {
        await tx.authSession.updateMany({
          where: { familyId: old.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return null;
      }
      if (
        !old.refreshExpiresAt ||
        old.refreshExpiresAt.getTime() <= Date.now() ||
        old.customer?.deletedAt
      )
        return null;
      await tx.authSession.update({
        where: { id: old.id },
        data: { revokedAt: new Date() },
      });
      return this.createCustomerSession(tx, found.customerId!, old.familyId);
    });
    if (!result) throw new UnauthorizedException();
    return result;
  }
  async customer(request: Request) {
    const token = request.headers.authorization?.match(
      /^Bearer ([0-9a-f]{64})$/,
    )?.[1];
    if (!token) throw new UnauthorizedException();
    await this.tenant.assert();
    const session = await this.db.orm.authSession.findUnique({
      where: { accessHash: digest(token) },
      include: sessionInclude,
    });
    if (
      !session?.customer ||
      session.customer.deletedAt ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    )
      throw new UnauthorizedException();
    return session;
  }
  async deleteAccount(request: Request, input: VerifyOtp) {
    const session = await this.customer(request);
    const result = await this.db.orm.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id=${session.customerId}::uuid FOR UPDATE`;
      const customer = await tx.customer.findUniqueOrThrow({
        where: { id: session.customerId! },
      });
      if (customer.deletedAt || !customer.phone) return false;
      if (
        await tx.order.count({
          where: {
            customerId: customer.id,
            OR: [
              {
                status: {
                  notIn: [
                    "completed",
                    "delivered",
                    "cancelled",
                    "rejected",
                    "expired",
                  ],
                },
              },
              {
                paymentStatus: {
                  in: ["pending", "manual_review", "refund_pending"],
                },
              },
            ],
          },
        })
      )
        throw new BusinessError(
          "ACTIVE_ORDERS",
          "Сначала завершите или отмените активные заказы и уточните статус оплаты.",
          409,
        );
      await this.lock(tx, "otp-verify:" + input.challengeId);
      const proof = await tx.otpChallenge.findUnique({
        where: { id: input.challengeId },
      });
      if (
        !proof ||
        proof.consumedAt ||
        proof.expiresAt.getTime() <= Date.now() ||
        proof.attempts >= 5 ||
        proof.phone !== customer.phone ||
        proof.purpose !== "deletion" ||
        proof.sessionId !== session.id
      )
        return false;
      const valid = equalSecret(
        proof.codeHash,
        keyedDigest(`otp:${proof.id}:${input.code}`),
      );
      await tx.otpChallenge.update({
        where: { id: proof.id },
        data: {
          attempts: { increment: 1 },
          ...(valid ? { consumedAt: new Date() } : {}),
        },
      });
      if (!valid) return false;
      await tx.authSession.updateMany({
        where: { customerId: customer.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.updateMany({
        where: {
          entityId: customer.id,
          action: { in: ["customer.blocked", "customer.unblocked"] },
        },
        data: { details: Prisma.DbNull },
      });
      await tx.customerRestriction.updateMany({
        where: { customerId: customer.id },
        data: { reason: "" },
      });
      await tx.authThrottle.deleteMany({
        where: { key: "privacy-export:" + customer.id },
      });
      await tx.customerAddress.deleteMany({
        where: { customerId: customer.id },
      });
      await tx.notification.deleteMany({ where: { customerId: customer.id } });
      await tx.orderEvent.updateMany({
        where: { order: { customerId: customer.id } },
        data: { reason: null },
      });
      await tx.refund.updateMany({
        where: { payment: { order: { customerId: customer.id } } },
        data: { reason: "Reason redacted after account deletion" },
      });
      await tx.order.updateMany({
        where: { customerId: customer.id },
        data: { addressSnapshot: Prisma.DbNull, comment: "" },
      });
      await tx.quote.updateMany({
        where: { customerId: customer.id },
        data: { input: {} },
      });
      await tx.otpChallenge.updateMany({
        where: { phone: customer.phone },
        data: {
          phone: null,
          phoneHash: keyedDigest("phone:" + customer.phone),
          codeHash: "",
          consumedAt: new Date(),
        },
      });
      await tx.customer.update({
        where: { id: customer.id },
        data: { phone: null, name: null, deletedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: customer.id,
          action: "customer.deleted",
          entityId: customer.id,
        },
      });
      return true;
    });
    if (!result)
      throw new BusinessError(
        "INVALID_PROOF",
        "Код недействителен или истёк. Получите новый код.",
        422,
      );
    return { ok: true };
  }
  async logoutAll(request: Request) {
    const session = await this.customer(request);
    await this.db.orm.authSession.updateMany({
      where: { customerId: session.customerId!, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }
  private checkOrigin(request: Request) {
    if (
      request.headers.origin &&
      request.headers.origin !==
        (process.env.ADMIN_ORIGIN ?? "http://127.0.0.1:3000")
    )
      throw new ForbiddenException();
  }
  async staffLogin(input: StaffLogin, request: Request, response: Response) {
    await this.tenant.assert();
    this.checkOrigin(request);
    const email = input.email.toLowerCase();
    const limits = [
      { key: keyedDigest("staff-account:" + email), limit: 5 },
      { key: keyedDigest("staff-ip:" + request.ip), limit: 20 },
    ].sort((a, b) => a.key.localeCompare(b.key));
    await this.db.orm.$transaction(async (tx) => {
      for (const { key, limit } of limits) {
        await this.lock(tx, key);
        const now = new Date(),
          previous = await tx.authThrottle.findUnique({ where: { key } });
        if (previous && previous.resetAt > now && previous.hits >= limit)
          throw new HttpException("Rate limited", 429);
        await tx.authThrottle.upsert({
          where: { key },
          create: { key, resetAt: new Date(Date.now() + 900000) },
          update:
            previous && previous.resetAt > now
              ? { hits: { increment: 1 } }
              : { hits: 1, resetAt: new Date(Date.now() + 900000) },
        });
      }
    });
    const staff = await this.db.orm.staffUser.findUnique({ where: { email } });
    // Spend the password KDF even for an unknown account; no account enumeration response.
    const correct = staff
      ? await verifyPassword(input.password, staff.passwordHash)
      : Boolean(await hashPassword(input.password)) && false;
    if (!correct || !staff?.active) throw new UnauthorizedException();
    let counter: bigint | null = null;
    try {
      counter = verifyTotp(
        decryptSecret(staff.mfaSecret),
        input.code,
        staff.lastMfaCounter,
      );
    } catch {
      throw new UnauthorizedException();
    }
    if (counter === null) throw new UnauthorizedException();
    const token = randomBytes(32).toString("hex");
    await this.db.orm.$transaction(async (tx) => {
      const updated = await tx.staffUser.updateMany({
        where: { id: staff.id, lastMfaCounter: { lt: counter! }, active: true },
        data: { lastMfaCounter: counter! },
      });
      if (updated.count !== 1) throw new UnauthorizedException();
      await tx.authSession.create({
        data: {
          staffId: staff.id,
          accessHash: digest(token),
          familyId: randomUUID(),
          expiresAt: new Date(Date.now() + 8 * 3600000),
        },
      });
      await tx.auditLog.create({
        data: { actorId: staff.id, action: "staff.login", entityId: staff.id },
      });
    });
    response.cookie("food_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: false,
      path: "/",
      maxAge: 8 * 3600000,
    });
    return {
      csrfToken: digest("csrf:" + token),
      user: { id: staff.id, email: staff.email },
    };
  }
  async staff(
    request: Request,
    roles: StaffRole[] = [],
    branchId?: string,
    unsafe = false,
  ): Promise<StaffContext> {
    this.checkOrigin(request);
    const values = (request.headers.cookie ?? "")
      .split(";")
      .map((x) => x.trim())
      .filter((x) => x.startsWith("food_session="));
    const token =
      values.length === 1 ? values[0].slice("food_session=".length) : "";
    if (!/^[0-9a-f]{64}$/.test(token)) throw new UnauthorizedException();
    await this.tenant.assert();
    const session = await this.db.orm.authSession.findUnique({
      where: { accessHash: digest(token) },
      include: sessionInclude,
    });
    if (
      !session?.staff?.active ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    )
      throw new UnauthorizedException();
    if (
      unsafe &&
      (typeof request.headers["x-csrf-token"] !== "string" ||
        !equalSecret(digest("csrf:" + token), request.headers["x-csrf-token"]))
    )
      throw new ForbiddenException();
    const allowed = session.staff.roles.some(
      (binding) =>
        binding.role === "owner" ||
        ((roles.length === 0 || roles.includes(binding.role)) &&
          (!branchId || binding.branchId === branchId)),
    );
    if (!allowed) throw new ForbiddenException();
    return { session, token };
  }
  async logout(request: Request, response: Response, staff = false) {
    const session = staff
      ? (await this.staff(request, [], undefined, true)).session
      : await this.customer(request);
    await this.db.orm.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    if (staff)
      response.clearCookie("food_session", {
        httpOnly: true,
        sameSite: "strict",
        secure: false,
        path: "/",
      });
    return { ok: true };
  }
}
@ApiTags("auth")
@Controller()
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Post("auth/otp/request") @HttpCode(200) requestOtp(
    @Body() input: RequestOtp,
    @Req() request: Request,
  ) {
    return this.auth.requestOtp(input, request.ip ?? "unknown");
  }
  @Post("auth/otp/verify") @HttpCode(200) verifyOtp(@Body() input: VerifyOtp) {
    return this.auth.verifyOtp(input);
  }
  @Post("auth/refresh") @HttpCode(200) refresh(@Body() input: RefreshDto) {
    return this.auth.refresh(input);
  }
  @Get("me") async me(@Req() request: Request) {
    const session = await this.auth.customer(request);
    return {
      id: session.customer!.id,
      phone: session.customer!.phone,
      name: session.customer!.name,
      locale: session.customer!.locale,
    };
  }
  @Post("auth/logout") @HttpCode(200) logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.logout(request, response);
  }
  @Post("auth/logout-all") @HttpCode(200) logoutAll(@Req() request: Request) {
    return this.auth.logoutAll(request);
  }
  @Post("me/deletion-challenge") @HttpCode(200) async deletionChallenge(
    @Req() request: Request,
  ) {
    const session = await this.auth.customer(request);
    if (!session.customer!.phone) throw new UnauthorizedException();
    return this.auth.requestOtp(
      { phone: session.customer!.phone },
      request.ip ?? "unknown",
      { purpose: "deletion", sessionId: session.id },
    );
  }
  @Post("me/delete") @HttpCode(200) delete(
    @Req() request: Request,
    @Body() input: VerifyOtp,
  ) {
    return this.auth.deleteAccount(request, input);
  }
  @Post("admin/auth/login") @HttpCode(200) staffLogin(
    @Body() input: StaffLogin,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.staffLogin(input, request, response);
  }
  @Get("admin/auth/session") async session(@Req() request: Request) {
    const context = await this.auth.staff(request);
    return {
      user: {
        id: context.session.staff!.id,
        email: context.session.staff!.email,
        roles: context.session.staff!.roles.map((r) => ({
          role: r.role,
          branchId: r.branchId,
          refundAllowed: r.refundAllowed,
        })),
      },
      csrfToken: digest("csrf:" + context.token),
    };
  }
  @Post("admin/auth/logout") @HttpCode(200) staffLogout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.logout(request, response, true);
  }
}
