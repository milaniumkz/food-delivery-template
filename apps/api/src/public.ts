import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Query,
} from "@nestjs/common";
import {
  ApiProperty,
  ApiPropertyOptional,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  IsIn,
  IsInt,
  ValidateIf,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { publicBrandSchema } from "@food/config";
import type { SchemaObject } from "@nestjs/swagger";
import { branchOpen } from "./pricing.js";
import { Database } from "./database.js";
import { Branding } from "./branding.js";
import { Tenant } from "./tenant.js";
export { Branding };
class CatalogQuery {
  @ApiProperty({ format: "uuid" }) @IsUUID() branchId!: string;
  @ApiPropertyOptional({ enum: ["ru", "kk"] })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(["ru", "kk"])
  locale: "ru" | "kk" = "ru";
  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
  @ApiPropertyOptional({ format: "uuid" })
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  cursor?: string;
  @ApiPropertyOptional({ maxLength: 80 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(80)
  search?: string;
}
@ApiTags("public")
@Controller()
export class PublicController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(Branding) private readonly branding: Branding,
    @Inject(Tenant) private readonly tenant: Tenant,
  ) {}
  @ApiOkResponse({
    schema: {
      type: "object",
      required: ["brand", "features"],
      properties: {
        brand: publicBrandSchema as SchemaObject,
        features: {
          type: "object",
          required: ["ordering", "paymentProvider"],
          properties: {
            ordering: { type: "boolean", enum: [true] },
            paymentProvider: { type: "string", enum: ["mock"] },
          },
        },
      },
    },
  })
  @Get("bootstrap")
  bootstrap() {
    return {
      brand: this.branding.brand,
      features: { ordering: true, paymentProvider: "mock" },
    };
  }
  @ApiOkResponse({
    schema: {
      type: "object",
      required: ["items"],
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "nameRu", "nameKk", "timeZone", "acceptingOrders"],
            properties: {
              id: { type: "string", format: "uuid" },
              nameRu: { type: "string" },
              nameKk: { type: "string" },
              timeZone: { type: "string" },
              acceptingOrders: { type: "boolean" },
            },
          },
        },
      },
    },
  })
  @Get("branches")
  async branches() {
    await this.tenant.assert();
    return {
      items: (
        await this.db.branch.findMany({
          orderBy: { id: "asc" },
          take: 100,
          select: {
            id: true,
            latitude: true,
            longitude: true,
            addressRu: true,
            addressKk: true,
            nameRu: true,
            nameKk: true,
            timeZone: true,
            acceptingOrders: true,
            schedule: true,
            holidays: true,
            allowCash: true,
            preparationMinutes: true,
            minimumPickupMinor: true,
          },
        })
      ).map(({ schedule, holidays, ...branch }) => ({
        ...branch,
        openNow:
          branch.acceptingOrders &&
          branchOpen(schedule, holidays, branch.timeZone, new Date()),
      })),
    };
  }
  @ApiOkResponse({
    schema: {
      type: "object",
      required: ["items", "nextCursor"],
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            required: [
              "id",
              "branchId",
              "name",
              "description",
              "priceMinor",
              "currency",
              "version",
            ],
            properties: {
              id: { type: "string", format: "uuid" },
              branchId: { type: "string", format: "uuid" },
              name: { type: "string" },
              description: { type: "string" },
              priceMinor: { type: "integer", minimum: 1, maximum: 2147483647 },
              currency: { type: "string", enum: ["KZT"] },
              version: { type: "integer", minimum: 1 },
            },
          },
        },
        nextCursor: { type: "string", format: "uuid", nullable: true },
      },
    },
  })
  @Get("catalog")
  async catalog(@Query() query: CatalogQuery) {
    await this.tenant.assert();
    const branch = await this.db.branch.findUnique({
      where: { id: query.branchId },
    });
    if (!branch) throw new NotFoundException();
    const name = query.locale === "kk" ? "nameKk" : "nameRu";
    const items = await this.db.product.findMany({
      where: {
        branchId: query.branchId,
        active: true,
        OR: [{ categoryId: null }, { category: { active: true } }],
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
        ...(query.search
          ? { [name]: { contains: query.search, mode: "insensitive" } }
          : {}),
      },
      orderBy: { id: "asc" },
      take: query.limit + 1,
      select: {
        id: true,
        branchId: true,
        nameRu: true,
        nameKk: true,
        descriptionRu: true,
        descriptionKk: true,
        priceMinor: true,
        version: true,
        imageId: true,
        categoryId: true,
        category: {
          select: { id: true, nameRu: true, nameKk: true, position: true },
        },
        configuration: true,
      },
    });
    const hasMore = items.length > query.limit;
    const page = items.slice(0, query.limit);
    return {
      items: page.map(
        (p: {
          id: string;
          branchId: string;
          nameRu: string;
          nameKk: string;
          descriptionRu: string;
          descriptionKk: string;
          priceMinor: number;
          version: number;
          imageId: string | null;
          categoryId: string | null;
          category: {
            id: string;
            nameRu: string;
            nameKk: string;
            position: number;
          } | null;
          configuration: unknown;
        }) => ({
          id: p.id,
          imageUrl: p.imageId ? "/v1/media/" + p.imageId : null,
          branchId: p.branchId,
          name: query.locale === "kk" ? p.nameKk : p.nameRu,
          description:
            query.locale === "kk" ? p.descriptionKk : p.descriptionRu,
          priceMinor: p.priceMinor,
          currency: "KZT",
          version: p.version,
          category: p.category
            ? {
                id: p.category.id,
                name:
                  query.locale === "kk" ? p.category.nameKk : p.category.nameRu,
                position: p.category.position,
              }
            : null,
          configuration: {
            incompatiblePairs:
              (p.configuration as { incompatiblePairs?: unknown[] })
                .incompatiblePairs ?? [],
            variants:
              (p.configuration as { variants?: unknown[] }).variants ?? [],
            groups: (p.configuration as { groups?: unknown[] }).groups ?? [],
          },
        }),
      ),
      nextCursor: hasMore ? page.at(-1)!.id : null,
    };
  }
}
