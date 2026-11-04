import { ApiProperty } from "@nestjs/swagger";
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import {
  IsIn,
  IsInt,
  IsNumber,
  IsString,
  Length,
  Max,
  Min,
  ValidateIf,
} from "class-validator";
import type { Prisma } from "@prisma/client";
import type { Request } from "express";
import { AuthService } from "./auth.js";
import { Database } from "./database.js";
import { BusinessError } from "./business-error.js";
class ProfileUpdate {
  @ApiProperty({
    required: false,
    nullable: true,
    type: String,
    minLength: 0,
    maxLength: 80,
  })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsString()
  @Length(0, 80)
  name?: string | null;
  @ApiProperty({ required: false, enum: ["ru", "kk"] })
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(["ru", "kk"])
  locale?: string;
}
class AddressCreate {
  @ApiProperty({
    required: false,
    type: String,
    minLength: 0,
    maxLength: 80,
    default: "",
  })
  @IsString()
  @Length(0, 80)
  label = "";
  @ApiProperty({ type: String, minLength: 5, maxLength: 300 })
  @IsString()
  @Length(5, 300)
  text!: string;
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
}
class AddressUpdate extends AddressCreate {
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
class AddressDelete {
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
@Controller("me")
export class ProfileController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  private async active(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM "Customer" WHERE id=${id}::uuid FOR UPDATE`;
    const customer = await tx.customer.findUnique({ where: { id } });
    if (!customer || customer.deletedAt) throw new NotFoundException();
  }
  @Patch() async update(@Req() request: Request, @Body() input: ProfileUpdate) {
    const session = await this.auth.customer(request);
    return this.db.orm.$transaction(async (tx) => {
      await this.active(tx, session.customerId!);
      return tx.customer.update({
        where: { id: session.customerId! },
        data: input,
        select: { id: true, name: true, locale: true, phone: true },
      });
    });
  }
  @Get("addresses") async addresses(@Req() request: Request) {
    const session = await this.auth.customer(request);
    return {
      items: await this.db.orm.customerAddress.findMany({
        where: { customerId: session.customerId! },
        take: 100,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    };
  }
  private fields(input: AddressCreate) {
    if ((input.latitude == null) !== (input.longitude == null))
      throw new BusinessError(
        "ADDRESS_POINT",
        "Нужны обе координаты точки доставки.",
      );
    return {
      label: input.label,
      text: input.text,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    };
  }
  @Post("addresses") async create(
    @Req() request: Request,
    @Body() input: AddressCreate,
  ) {
    const session = await this.auth.customer(request),
      fields = this.fields(input);
    return this.db.orm.$transaction(async (tx) => {
      await this.active(tx, session.customerId!);
      if (
        (await tx.customerAddress.count({
          where: { customerId: session.customerId! },
        })) >= 20
      )
        throw new BusinessError(
          "ADDRESS_LIMIT",
          "Сохранено максимальное количество адресов.",
        );
      return tx.customerAddress.create({
        data: { ...fields, customerId: session.customerId! },
      });
    });
  }
  @Patch("addresses/:id") async address(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: AddressUpdate,
  ) {
    const session = await this.auth.customer(request),
      fields = this.fields(input);
    return this.db.orm.$transaction(async (tx) => {
      await this.active(tx, session.customerId!);
      const changed = await tx.customerAddress.updateMany({
        where: {
          id,
          customerId: session.customerId!,
          version: input.expectedVersion,
        },
        data: { ...fields, version: { increment: 1 } },
      });
      if (!changed.count) {
        if (
          await tx.customerAddress.findFirst({
            where: { id, customerId: session.customerId! },
          })
        )
          throw new BusinessError(
            "ADDRESS_CONFLICT",
            "Адрес уже изменился.",
            409,
          );
        throw new NotFoundException();
      }
      return tx.customerAddress.findFirstOrThrow({
        where: { id, customerId: session.customerId! },
      });
    });
  }
  @Delete("addresses/:id") async remove(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: AddressDelete,
  ) {
    const session = await this.auth.customer(request);
    const changed = await this.db.orm.customerAddress.deleteMany({
      where: {
        id,
        customerId: session.customerId!,
        version: input.expectedVersion,
      },
    });
    if (!changed.count) throw new NotFoundException();
    return { ok: true };
  }
}
