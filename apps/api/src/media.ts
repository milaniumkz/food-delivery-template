import { ApiProperty } from "@nestjs/swagger";
import {
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { IsInt, Min } from "class-validator";
import { Type } from "class-transformer";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import sharp from "sharp";
import type { Request, Response } from "express";
import { Database } from "./database.js";
import { AuthService } from "./auth.js";
import { Tenant } from "./tenant.js";
import { BusinessError } from "./business-error.js";
class ImageVersion {
  @ApiProperty({ type: "integer", minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
const directory = () =>
  resolve(process.env.MEDIA_DIRECTORY ?? "../../.local/media");
const limit = 5 * 1024 * 1024;
async function readImage(request: Request): Promise<Buffer> {
  return new Promise((ok, fail) => {
    const chunks: Buffer[] = [];
    let bytes = 0,
      done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      request.off("data", data);
      request.off("end", end);
      request.off("aborted", aborted);
      if (error) {
        request.resume();
        fail(error);
      } else ok(Buffer.concat(chunks));
    };
    const data = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > limit) {
        finish(
          new BusinessError(
            "PAYLOAD_TOO_LARGE",
            "Изображение не больше 5 MiB.",
            413,
          ),
        );
        return;
      }
      chunks.push(chunk);
    };
    const end = () => finish(),
      aborted = () =>
        finish(new BusinessError("UPLOAD_ABORTED", "Загрузка прервана.", 400)),
      timer = setTimeout(
        () =>
          finish(
            new BusinessError("UPLOAD_TIMEOUT", "Срок загрузки истёк.", 408),
          ),
        15000,
      );
    timer.unref();
    request.on("data", data);
    request.once("end", end);
    request.once("aborted", aborted);
    request.once("error", aborted);
  });
}
@Controller()
export class MediaController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(Tenant) private readonly tenant: Tenant,
  ) {}
  private async product(request: Request, id: string) {
    await this.auth.staff(request, ["manager"], undefined, true);
    const product = await this.db.orm.product.findUnique({ where: { id } });
    if (!product)
      throw new BusinessError("NOT_FOUND", "Блюдо недоступно.", 404);
    const context = await this.auth.staff(
      request,
      ["manager"],
      product.branchId,
      true,
    );
    return { product, context };
  }
  @Post("admin/products/:id/image") async upload(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query() query: ImageVersion,
  ) {
    const { product, context } = await this.product(request, id),
      mime = request.headers["content-type"]?.split(";")[0];
    if (!["image/jpeg", "image/png", "image/webp"].includes(mime ?? "")) {
      request.resume();
      throw new BusinessError(
        "UNSUPPORTED_IMAGE",
        "Только JPEG, PNG или WebP.",
        415,
      );
    }
    if (Number(request.headers["content-length"] ?? 0) > limit) {
      request.resume();
      throw new BusinessError(
        "PAYLOAD_TOO_LARGE",
        "Изображение не больше 5 MiB.",
        413,
      );
    }
    const source = await readImage(request);
    let encoded: Buffer, info: { width: number; height: number };
    try {
      const image = sharp(source, {
          limitInputPixels: 16000000,
          failOn: "warning",
        }),
        metadata = await image.metadata();
      if (
        (metadata.pages && metadata.pages > 1) ||
        !["jpeg", "png", "webp"].includes(metadata.format ?? "") ||
        "image/" + (metadata.format === "jpeg" ? "jpeg" : metadata.format) !==
          mime
      )
        throw Error("Unsupported image");
      const result = await image
        .rotate()
        .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      encoded = result.data;
      info = result.info;
    } catch {
      throw new BusinessError(
        "INVALID_IMAGE",
        "Файл повреждён или не является поддерживаемым изображением.",
      );
    }
    const imageId = randomUUID(),
      filename = imageId + ".webp",
      path = join(directory(), filename);
    await mkdir(directory(), { recursive: true, mode: 0o700 });
    await writeFile(path, encoded, { flag: "wx", mode: 0o600 });
    try {
      return await this.db.orm.$transaction(async (tx) => {
        await tx.mediaAsset.create({
          data: {
            id: imageId,
            branchId: product.branchId,
            filename,
            mime: "image/webp",
            width: info.width,
            height: info.height,
            bytes: encoded.length,
          },
        });
        const changed = await tx.product.updateMany({
          where: { id, version: query.expectedVersion },
          data: { imageId, version: { increment: 1 } },
        });
        if (!changed.count)
          throw new BusinessError(
            "PRODUCT_CONFLICT",
            "Блюдо уже изменено. Обновите список.",
            409,
          );
        await tx.auditLog.create({
          data: {
            actorId: context.session.staffId,
            entityId: id,
            action: "catalog.image.updated",
          },
        });
        return tx.product.findUniqueOrThrow({ where: { id } });
      });
    } catch (error) {
      await unlink(path).catch(() => {});
      throw error;
    }
  }
  @Delete("admin/products/:id/image") async remove(
    @Req() request: Request,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query() query: ImageVersion,
  ) {
    const { context } = await this.product(request, id);
    return this.db.orm.$transaction(async (tx) => {
      const changed = await tx.product.updateMany({
        where: { id, version: query.expectedVersion },
        data: { imageId: null, version: { increment: 1 } },
      });
      if (!changed.count)
        throw new BusinessError("PRODUCT_CONFLICT", "Блюдо уже изменено.", 409);
      await tx.auditLog.create({
        data: {
          actorId: context.session.staffId,
          entityId: id,
          action: "catalog.image.removed",
        },
      });
      return tx.product.findUniqueOrThrow({ where: { id } });
    });
  }
  @Get("media/:id") async get(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.tenant.assert();
    const asset = await this.db.orm.mediaAsset.findUnique({ where: { id } });
    if (!asset || asset.filename !== id + ".webp")
      throw new BusinessError("NOT_FOUND", "Изображение недоступно.", 404);
    response.setHeader("Content-Type", "image/webp");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    let data: Buffer;
    try {
      data = await readFile(join(directory(), asset.filename));
    } catch {
      throw new BusinessError(
        "MEDIA_UNAVAILABLE",
        "Изображение временно недоступно.",
        503,
      );
    }
    if (data.length !== asset.bytes)
      throw new BusinessError(
        "MEDIA_UNAVAILABLE",
        "Изображение временно недоступно.",
        503,
      );
    return new StreamableFile(data, {
      type: "image/webp",
      length: asset.bytes,
    });
  }
}
