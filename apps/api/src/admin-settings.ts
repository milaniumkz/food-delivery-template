import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { Database } from "./database.js";
import { AuthService } from "./auth.js";
import { BusinessError } from "./business-error.js";
import { json } from "./quotes.js";
export class WindowInput {
  @ApiProperty({ type: "integer", minimum: 0, maximum: 1439 })
  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute!: number;
  @ApiProperty({ type: "integer", minimum: 1, maximum: 1440 })
  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute!: number;
}
export class ScheduleInput extends WindowInput {
  @ApiProperty({ type: "integer", minimum: 0, maximum: 6 })
  @IsInt()
  @Min(0)
  @Max(6)
  day!: number;
}
export class HolidayInput {
  @ApiProperty({ type: String, pattern: "^\\d{4}-\\d{2}-\\d{2}$" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
  @ApiProperty({ type: () => [WindowInput], maxItems: 10 })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => WindowInput)
  windows!: WindowInput[];
}
export class UpdateBranch {
  @ApiProperty({
    required: false,
    nullable: true,
    type: "number",
    minimum: -90,
    maximum: 90,
  })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;
  @ApiProperty({
    required: false,
    nullable: true,
    type: "number",
    minimum: -180,
    maximum: 180,
  })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;
  @ApiProperty({ required: false, type: String, minLength: 0, maxLength: 300 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @Length(0, 300)
  addressRu?: string;
  @ApiProperty({ required: false, type: String, minLength: 0, maxLength: 300 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @Length(0, 300)
  addressKk?: string;
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty({ required: false, type: Boolean })
  @ValidateIf((_o, v) => v !== undefined)
  @IsBoolean()
  acceptingOrders?: boolean;
  @ApiProperty({ required: false, type: String, minLength: 1, maxLength: 120 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @Length(1, 120)
  nameRu?: string;
  @ApiProperty({ required: false, type: String, minLength: 1, maxLength: 120 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @Length(1, 120)
  nameKk?: string;
  @ApiProperty({ required: false, type: String, minLength: 1, maxLength: 80 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @Length(1, 80)
  timeZone?: string;
  @ApiProperty({ required: false, type: Boolean })
  @ValidateIf((_o, v) => v !== undefined)
  @IsBoolean()
  allowCash?: boolean;
  @ApiProperty({ required: false, type: "integer", minimum: 1, maximum: 180 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsInt()
  @Min(1)
  @Max(180)
  preparationMinutes?: number;
  @ApiProperty({ required: false, type: "integer", minimum: 1, maximum: 1000 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsInt()
  @Min(1)
  @Max(1000)
  maxActiveOrders?: number;
  @ApiProperty({
    required: false,
    type: "integer",
    minimum: 0,
    maximum: 100000000,
  })
  @ValidateIf((_o, v) => v !== undefined)
  @IsInt()
  @Min(0)
  @Max(100000000)
  minimumPickupMinor?: number;
  @ApiProperty({ required: false, type: () => [ScheduleInput], maxItems: 70 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsArray()
  @ArrayMaxSize(70)
  @ValidateNested({ each: true })
  @Type(() => ScheduleInput)
  schedule?: ScheduleInput[];
  @ApiProperty({ required: false, type: () => [HolidayInput], maxItems: 366 })
  @ValidateIf((_o, v) => v !== undefined)
  @IsArray()
  @ArrayMaxSize(366)
  @ValidateNested({ each: true })
  @Type(() => HolidayInput)
  holidays?: HolidayInput[];
}
export function checkedWindows(windows: WindowInput[]) {
  const sorted = [...windows].sort((a, b) => a.startMinute - b.startMinute);
  for (let i = 0; i < sorted.length; i++)
    if (
      sorted[i].startMinute >= sorted[i].endMinute ||
      (i > 0 && sorted[i].startMinute < sorted[i - 1].endMinute)
    )
      throw new BusinessError(
        "INVALID_SCHEDULE",
        "Интервалы работы должны идти по порядку и не пересекаться.",
      );
}
export function branchFields(input: UpdateBranch) {
  const { expectedVersion: _version, holidays, schedule, ...fields } = input;
  if (
    (fields.latitude === undefined) !== (fields.longitude === undefined) ||
    (fields.latitude === null) !== (fields.longitude === null)
  )
    throw new BusinessError(
      "INVALID_COORDINATES",
      "Укажите обе координаты либо очистите обе.",
    );
  if (fields.timeZone) {
    try {
      new Intl.DateTimeFormat("ru", { timeZone: fields.timeZone });
    } catch {
      throw new BusinessError(
        "INVALID_TIME_ZONE",
        "Укажите часовой пояс IANA.",
      );
    }
  }
  if (schedule)
    for (let day = 0; day < 7; day++)
      checkedWindows(schedule.filter((s) => s.day === day));
  const overrides: Record<string, WindowInput[]> = {};
  if (holidays)
    for (const holiday of holidays) {
      const date = new Date(holiday.date + "T00:00:00Z");
      if (
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== holiday.date ||
        holiday.date in overrides
      )
        throw new BusinessError(
          "INVALID_HOLIDAY",
          "Дата исключения некорректна или повторяется.",
        );
      checkedWindows(holiday.windows);
      overrides[holiday.date] = holiday.windows;
    }
  return {
    ...fields,
    ...(schedule ? { schedule: json(schedule) } : {}),
    ...(holidays ? { holidays: json(overrides) } : {}),
  };
}
class BranchCreate {
  @ApiProperty({ type: String, minLength: 1, maxLength: 120 })
  @IsString()
  @Length(1, 120)
  nameRu!: string;
  @ApiProperty({ type: String, minLength: 1, maxLength: 120 })
  @IsString()
  @Length(1, 120)
  nameKk!: string;
}
class AdminBranchQuery {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() branchId!: string;
}
class GeoPoint {
  @ApiProperty({ type: "number", minimum: -90, maximum: 90 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;
  @ApiProperty({ type: "number", minimum: -180, maximum: 180 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
}
class ZoneInput {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() branchId!: string;
  @ApiProperty({ type: String, minLength: 1, maxLength: 80 })
  @IsString()
  @Length(1, 80)
  name!: string;
  @ApiProperty({ type: () => [GeoPoint], minItems: 3, maxItems: 100 })
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => GeoPoint)
  polygon!: GeoPoint[];
  @ApiProperty({
    required: false,
    type: "integer",
    minimum: -1000,
    maximum: 1000,
    default: 0,
  })
  @IsInt()
  @Min(-1000)
  @Max(1000)
  priority = 0;
  @ApiProperty({ type: "integer", minimum: 0, maximum: 100000000 })
  @IsInt()
  @Min(0)
  @Max(100000000)
  feeMinor!: number;
  @ApiProperty({
    required: false,
    type: "integer",
    minimum: 0,
    maximum: 100000000,
    default: 0,
  })
  @IsInt()
  @Min(0)
  @Max(100000000)
  minimumMinor = 0;
  @ApiProperty({
    required: false,
    nullable: true,
    type: "integer",
    minimum: 0,
    maximum: 100000000,
  })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsInt()
  @Min(0)
  @Max(100000000)
  freeThresholdMinor?: number | null;
  @ApiProperty({ required: false, type: Boolean, default: true })
  @IsBoolean()
  active = true;
}
class UpdateZone extends ZoneInput {
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
class PromoInput {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() branchId!: string;
  @ApiProperty({ type: String, pattern: "^[A-Z0-9_-]{3,32}$" })
  @Matches(/^[A-Z0-9_-]{3,32}$/)
  code!: string;
  @ApiProperty({
    required: false,
    nullable: true,
    type: "integer",
    minimum: 1,
    maximum: 10000,
  })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsInt()
  @Min(1)
  @Max(10000)
  basisPoints?: number | null;
  @ApiProperty({
    required: false,
    nullable: true,
    type: "integer",
    minimum: 1,
    maximum: 100000000,
  })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsInt()
  @Min(1)
  @Max(100000000)
  fixedMinor?: number | null;
  @ApiProperty({
    required: false,
    nullable: true,
    type: "integer",
    minimum: 1,
    maximum: 100000000,
  })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsInt()
  @Min(1)
  @Max(100000000)
  maxDiscountMinor?: number | null;
  @ApiProperty({
    required: false,
    type: "integer",
    minimum: 0,
    maximum: 100000000,
    default: 0,
  })
  @IsInt()
  @Min(0)
  @Max(100000000)
  minimumMinor = 0;
  @ApiProperty({
    required: false,
    nullable: true,
    type: "integer",
    minimum: 1,
    maximum: 1000000,
  })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsInt()
  @Min(1)
  @Max(1000000)
  totalLimit?: number | null;
  @ApiProperty({
    required: false,
    nullable: true,
    type: "integer",
    minimum: 1,
    maximum: 1000000,
  })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsInt()
  @Min(1)
  @Max(1000000)
  customerLimit?: number | null;
  @ApiProperty({ type: String, format: "date-time" })
  @IsDateString()
  startsAt!: string;
  @ApiProperty({ type: String, format: "date-time" })
  @IsDateString()
  endsAt!: string;
  @ApiProperty({ required: false, type: Boolean, default: true })
  @IsBoolean()
  active = true;
}
class UpdatePromo extends PromoInput {
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
class StockInput {
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
  @ApiProperty({
    required: false,
    nullable: true,
    type: "integer",
    minimum: 0,
    maximum: 100000,
  })
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(100000)
  expectedStockQuantity!: number | null;
  @ApiProperty({
    required: false,
    nullable: true,
    type: "integer",
    minimum: 0,
    maximum: 100000,
  })
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(100000)
  stockQuantity!: number | null;
}
function validPolygon(points: GeoPoint[]) {
  const coordinates = points.map((p) => [p.longitude, p.latitude]),
    unique = new Set(coordinates.map((p) => p.join(",")));
  if (unique.size !== points.length)
    throw new BusinessError(
      "INVALID_POLYGON",
      "Точки зоны не должны повторяться.",
    );
  let area = 0;
  for (let i = 0; i < coordinates.length; i++) {
    const a = coordinates[i],
      b = coordinates[(i + 1) % coordinates.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  if (Math.abs(area) < 1e-12)
    throw new BusinessError(
      "INVALID_POLYGON",
      "Зона должна иметь ненулевую площадь.",
    );
  const cross = (a: number[], b: number[], c: number[]) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < coordinates.length; i++)
    for (let j = i + 1; j < coordinates.length; j++) {
      if (j === i + 1 || (i === 0 && j === coordinates.length - 1)) continue;
      const a = coordinates[i],
        b = coordinates[(i + 1) % coordinates.length],
        c = coordinates[j],
        d = coordinates[(j + 1) % coordinates.length];
      if (
        cross(a, b, c) * cross(a, b, d) <= 0 &&
        cross(c, d, a) * cross(c, d, b) <= 0 &&
        Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <=
          Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) &&
        Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) <=
          Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1]))
      )
        throw new BusinessError(
          "INVALID_POLYGON",
          "Границы зоны не должны пересекаться.",
        );
    }
}
function promoData(input: PromoInput) {
  if ((input.basisPoints == null) === (input.fixedMinor == null))
    throw new BusinessError(
      "INVALID_PROMO",
      "Выберите процентную или фиксированную скидку.",
    );
  const start = new Date(input.startsAt),
    end = new Date(input.endsAt);
  if (end <= start)
    throw new BusinessError(
      "INVALID_PROMO_DATES",
      "Окончание должно быть позже начала.",
    );
  return {
    ...input,
    basisPoints: input.basisPoints ?? null,
    fixedMinor: input.fixedMinor ?? null,
    maxDiscountMinor: input.maxDiscountMinor ?? null,
    totalLimit: input.totalLimit ?? null,
    customerLimit: input.customerLimit ?? null,
    startsAt: start,
    endsAt: end,
  };
}
@ApiTags("admin settings")
@Controller("admin")
export class AdminSettingsController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Post("branches") async branch(
    @Req() request: Request,
    @Body() input: BranchCreate,
  ) {
    const { session } = await this.auth.staff(
      request,
      ["owner"],
      undefined,
      true,
    );
    return this.db.orm.$transaction(async (tx) => {
      const branch = await tx.branch.create({ data: input });
      await tx.auditLog.create({
        data: {
          actorId: session.staffId,
          entityId: branch.id,
          action: "branch.created",
        },
      });
      return branch;
    });
  }
  @Get("couriers") async couriers(
    @Req() request: Request,
    @Query() query: AdminBranchQuery,
  ) {
    await this.auth.staff(request, ["manager", "dispatcher"], query.branchId);
    return {
      items: await this.db.orm.staffUser.findMany({
        where: {
          active: true,
          roles: { some: { role: "courier", branchId: query.branchId } },
        },
        take: 100,
        select: { id: true, email: true },
        orderBy: { id: "asc" },
      }),
    };
  }
  @Post("products/:id/stock") async stock(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: StockInput,
  ) {
    await this.auth.staff(request, ["manager"], undefined, true);
    const product = await this.db.orm.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException();
    const { session } = await this.auth.staff(
      request,
      ["manager"],
      product.branchId,
      true,
    );
    return this.db.orm.$transaction(async (tx) => {
      const changed = await tx.product.updateMany({
        where: {
          id,
          version: input.expectedVersion,
          stockQuantity: input.expectedStockQuantity,
        },
        data: { stockQuantity: input.stockQuantity, version: { increment: 1 } },
      });
      if (!changed.count)
        throw new BusinessError(
          "STOCK_CONFLICT",
          "Остаток уже изменился. Загрузите актуальное значение.",
          409,
        );
      await tx.auditLog.create({
        data: {
          actorId: session.staffId,
          action: "stock.adjusted",
          entityId: id,
        },
      });
      return tx.product.findUniqueOrThrow({ where: { id } });
    });
  }
  @Get("zones") async zones(
    @Req() request: Request,
    @Query() query: AdminBranchQuery,
  ) {
    await this.auth.staff(request, ["manager"], query.branchId);
    return {
      items: await this.db.orm.deliveryZone.findMany({
        where: { branchId: query.branchId },
        take: 100,
        orderBy: [{ priority: "desc" }, { id: "asc" }],
      }),
    };
  }
  @Post("zones") async zone(@Req() request: Request, @Body() input: ZoneInput) {
    const { session } = await this.auth.staff(
      request,
      ["manager"],
      input.branchId,
      true,
    );
    validPolygon(input.polygon);
    return this.db.orm.$transaction(async (tx) => {
      const zone = await tx.deliveryZone.create({
        data: { ...input, polygon: json(input.polygon) },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.staffId,
          action: "zone.created",
          entityId: zone.id,
        },
      });
      return zone;
    });
  }
  @Patch("zones/:id") async updateZone(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: UpdateZone,
  ) {
    const { session } = await this.auth.staff(
      request,
      ["manager"],
      input.branchId,
      true,
    );
    validPolygon(input.polygon);
    const { expectedVersion, ...fields } = input;
    return this.db.orm.$transaction(async (tx) => {
      const changed = await tx.deliveryZone.updateMany({
        where: { id, branchId: input.branchId, version: expectedVersion },
        data: {
          ...fields,
          polygon: json(fields.polygon),
          freeThresholdMinor: fields.freeThresholdMinor ?? null,
          version: { increment: 1 },
        },
      });
      if (!changed.count)
        throw new BusinessError(
          "ZONE_CONFLICT",
          "Зона уже изменена или недоступна.",
          409,
        );
      await tx.auditLog.create({
        data: {
          actorId: session.staffId,
          action: "zone.updated",
          entityId: id,
        },
      });
      return tx.deliveryZone.findUniqueOrThrow({ where: { id } });
    });
  }
  @Get("promotions") async promotions(
    @Req() request: Request,
    @Query() query: AdminBranchQuery,
  ) {
    await this.auth.staff(request, ["manager"], query.branchId);
    return {
      items: await this.db.orm.promotion.findMany({
        where: { branchId: query.branchId },
        take: 100,
        orderBy: { id: "asc" },
      }),
    };
  }
  @Post("promotions") async promo(
    @Req() request: Request,
    @Body() input: PromoInput,
  ) {
    const { session } = await this.auth.staff(
      request,
      ["manager"],
      input.branchId,
      true,
    );
    const data = promoData(input);
    try {
      return await this.db.orm.$transaction(async (tx) => {
        const promo = await tx.promotion.create({ data });
        await tx.auditLog.create({
          data: {
            actorId: session.staffId,
            action: "promotion.created",
            entityId: promo.id,
          },
        });
        return promo;
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error &&
        "code" in error &&
        error.code === "P2002"
      )
        throw new BusinessError(
          "PROMO_EXISTS",
          "Код промокода уже занят.",
          409,
        );
      throw error;
    }
  }
  @Patch("promotions/:id") async updatePromo(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: UpdatePromo,
  ) {
    const { session } = await this.auth.staff(
      request,
      ["manager"],
      input.branchId,
      true,
    );
    const { expectedVersion, ...fields } = input,
      data = promoData(fields);
    return this.db.orm.$transaction(async (tx) => {
      const changed = await tx.promotion.updateMany({
        where: { id, branchId: input.branchId, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });
      if (!changed.count)
        throw new BusinessError(
          "PROMO_CONFLICT",
          "Промокод уже изменён или недоступен.",
          409,
        );
      await tx.auditLog.create({
        data: {
          actorId: session.staffId,
          action: "promotion.updated",
          entityId: id,
        },
      });
      return tx.promotion.findUniqueOrThrow({ where: { id } });
    });
  }
}
