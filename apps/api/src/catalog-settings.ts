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
  Query,
  Req,
} from "@nestjs/common";
import {
  IsDefined,
  IsBoolean,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import type { Request } from "express";
import { Database } from "./database.js";
import { AuthService } from "./auth.js";
import { BusinessError } from "./business-error.js";
import {
  ConfigurationInput,
  validateConfiguration,
} from "./product-options.js";
import { json } from "./quotes.js";
class CategoryBranchQuery {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() branchId!: string;
}
class CategoryInput extends CategoryBranchQuery {
  @ApiProperty({ type: String, minLength: 1, maxLength: 80 })
  @IsString()
  @Length(1, 80)
  nameRu!: string;
  @ApiProperty({ type: String, minLength: 1, maxLength: 80 })
  @IsString()
  @Length(1, 80)
  nameKk!: string;
  @ApiProperty({ required: false, type: Boolean, default: true })
  @IsBoolean()
  active = true;
  @ApiProperty({
    required: false,
    type: "integer",
    minimum: 0,
    maximum: 10000,
    default: 0,
  })
  @IsInt()
  @Min(0)
  @Max(10000)
  position = 0;
}
class CategoryUpdate extends CategoryInput {
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
class ConfigurationUpdate {
  @ApiProperty({ type: "integer", minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
  @ApiProperty({ type: () => ConfigurationInput })
  @IsDefined()
  @ValidateNested()
  @Type(() => ConfigurationInput)
  configuration!: ConfigurationInput;
  @ApiProperty({
    required: false,
    nullable: true,
    type: String,
    format: "uuid",
  })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsUUID()
  categoryId?: string | null;
}
@Controller("admin")
export class CatalogSettingsController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  @Get("categories") async categories(
    @Req() request: Request,
    @Query() query: CategoryBranchQuery,
  ) {
    await this.auth.staff(request, ["manager"], query.branchId);
    return {
      items: await this.db.orm.category.findMany({
        where: { branchId: query.branchId },
        take: 100,
        orderBy: [{ position: "asc" }, { id: "asc" }],
      }),
    };
  }
  @Post("categories") async category(
    @Req() request: Request,
    @Body() input: CategoryInput,
  ) {
    const { session } = await this.auth.staff(
      request,
      ["manager"],
      input.branchId,
      true,
    );
    return this.db.orm.$transaction(async (tx) => {
      const record = await tx.category.create({ data: input });
      await tx.auditLog.create({
        data: {
          actorId: session.staffId,
          entityId: record.id,
          action: "catalog.category.created",
        },
      });
      return record;
    });
  }
  @Patch("categories/:id") async updateCategory(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: CategoryUpdate,
  ) {
    const { session } = await this.auth.staff(
      request,
      ["manager"],
      input.branchId,
      true,
    );
    const { expectedVersion, ...fields } = input;
    return this.db.orm.$transaction(async (tx) => {
      const changed = await tx.category.updateMany({
        where: { id, branchId: input.branchId, version: expectedVersion },
        data: { ...fields, version: { increment: 1 } },
      });
      if (!changed.count)
        throw new BusinessError(
          "CATEGORY_CONFLICT",
          "Категория изменена или недоступна.",
          409,
        );
      await tx.auditLog.create({
        data: {
          actorId: session.staffId,
          entityId: id,
          action: "catalog.category.updated",
        },
      });
      return tx.category.findUniqueOrThrow({ where: { id } });
    });
  }
  @Post("products/:id/configuration") async configuration(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: ConfigurationUpdate,
  ) {
    await this.auth.staff(request, ["manager"], undefined, true);
    const product = await this.db.orm.product.findUnique({ where: { id } });
    if (!product)
      throw new BusinessError("NOT_FOUND", "Блюдо недоступно.", 404);
    const { session } = await this.auth.staff(
      request,
      ["manager"],
      product.branchId,
      true,
    );
    validateConfiguration(input.configuration);
    return this.db.orm.$transaction(async (tx) => {
      if (
        input.categoryId &&
        !(await tx.category.findFirst({
          where: { id: input.categoryId, branchId: product.branchId },
        }))
      )
        throw new BusinessError(
          "INVALID_CATEGORY",
          "Категория принадлежит другому филиалу.",
        );
      const changed = await tx.product.updateMany({
        where: { id, version: input.expectedVersion },
        data: {
          configuration: json(input.configuration),
          ...(input.categoryId !== undefined
            ? { categoryId: input.categoryId }
            : {}),
          version: { increment: 1 },
        },
      });
      if (!changed.count)
        throw new BusinessError("PRODUCT_CONFLICT", "Блюдо уже изменено.", 409);
      await tx.auditLog.create({
        data: {
          actorId: session.staffId,
          entityId: id,
          action: "catalog.configuration.updated",
        },
      });
      return tx.product.findUniqueOrThrow({ where: { id } });
    });
  }
}
