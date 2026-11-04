import { UpdateBranch, branchFields } from "./admin-settings.js";
import {
  Body,
  ConflictException,
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
  IsBoolean,
  IsInt,
  ValidateIf,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from "class-validator";
import { ApiProperty, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import type { Request } from "express";
import { Database } from "./database.js";
import { AuthService } from "./auth.js";
class AdminCatalogQuery {
  @ApiProperty() @IsUUID() branchId!: string;
  @ApiProperty({
    required: false,
    type: "integer",
    minimum: 1,
    maximum: 100,
    default: 50,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
  @ApiProperty({ required: false, type: String, format: "uuid" })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  cursor?: string;
}
class CreateProduct {
  @ApiProperty() @IsUUID() branchId!: string;
  @ApiProperty() @IsString() @Length(1, 120) nameRu!: string;
  @ApiProperty() @IsString() @Length(1, 120) nameKk!: string;
  @ApiProperty({
    required: false,
    type: String,
    minLength: 0,
    maxLength: 2000,
    default: "",
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(0, 2000)
  descriptionRu = "";
  @ApiProperty({
    required: false,
    type: String,
    minLength: 0,
    maxLength: 2000,
    default: "",
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(0, 2000)
  descriptionKk = "";
  @ApiProperty() @IsInt() @Min(1) @Max(100000000) priceMinor!: number;
}
class UpdateProduct {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiProperty({ required: false, type: String, minLength: 1, maxLength: 120 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 120)
  nameRu?: string;
  @ApiProperty({ required: false, type: String, minLength: 1, maxLength: 120 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 120)
  nameKk?: string;
  @ApiProperty({ required: false, type: String, minLength: 0, maxLength: 2000 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(0, 2000)
  descriptionRu?: string;
  @ApiProperty({ required: false, type: String, minLength: 0, maxLength: 2000 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(0, 2000)
  descriptionKk?: string;
  @ApiProperty({
    required: false,
    type: "integer",
    minimum: 1,
    maximum: 100000000,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(100000000)
  priceMinor?: number;
  @ApiProperty({ required: false, type: Boolean })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  active?: boolean;
}
@ApiTags("admin catalog")
@Controller("admin")
export class AdminCatalogController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get("branches") async branches(@Req() request: Request) {
    const { session } = await this.auth.staff(request);
    const roles = session.staff!.roles;
    return {
      items: await this.db.orm.branch.findMany({
        where: roles.some((r) => r.role === "owner")
          ? {}
          : {
              id: {
                in: roles.flatMap((r) => (r.branchId ? [r.branchId] : [])),
              },
            },
        take: 100,
        orderBy: { id: "asc" },
      }),
    };
  }
  @Get("products") async products(
    @Req() request: Request,
    @Query() query: AdminCatalogQuery,
  ) {
    await this.auth.staff(request, ["manager"], query.branchId);
    const items = await this.db.orm.product.findMany({
      where: {
        branchId: query.branchId,
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: query.limit + 1,
    });
    return {
      items: items.slice(0, query.limit),
      nextCursor: items.length > query.limit ? items[query.limit - 1].id : null,
    };
  }
  @Post("products") async create(
    @Req() request: Request,
    @Body() input: CreateProduct,
  ) {
    const { session } = await this.auth.staff(
      request,
      ["manager"],
      input.branchId,
      true,
    );
    if (
      !(await this.db.orm.branch.findUnique({ where: { id: input.branchId } }))
    )
      throw new NotFoundException();
    return this.db.orm.$transaction(async (tx) => {
      const product = await tx.product.create({ data: { ...input } });
      await tx.auditLog.create({
        data: {
          actorId: session.staffId,
          action: "catalog.product.created",
          entityId: product.id,
        },
      });
      return product;
    });
  }
  @Patch("products/:id") async update(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: UpdateProduct,
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
    const { expectedVersion, ...fields } = input;
    return this.db.orm.$transaction(async (tx) => {
      const changed = await tx.product.updateMany({
        where: { id, version: expectedVersion },
        data: { ...fields, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException();
      await tx.auditLog.create({
        data: {
          actorId: session.staffId,
          action: "catalog.product.updated",
          entityId: id,
        },
      });
      return tx.product.findUniqueOrThrow({ where: { id } });
    });
  }
  @Patch("branches/:id") async updateBranch(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: UpdateBranch,
  ) {
    const { session } = await this.auth.staff(request, ["manager"], id, true);
    if (input.allowCash !== undefined)
      await this.auth.staff(request, ["owner"], undefined, true);
    const fields = branchFields(input);
    return this.db.orm.$transaction(async (tx) => {
      const changed = await tx.branch.updateMany({
        where: { id, version: input.expectedVersion },
        data: {
          ...fields,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException();
      await tx.auditLog.create({
        data: {
          actorId: session.staffId,
          action: "branch.ordering.changed",
          entityId: id,
        },
      });
      return tx.branch.findUniqueOrThrow({ where: { id } });
    });
  }
}
