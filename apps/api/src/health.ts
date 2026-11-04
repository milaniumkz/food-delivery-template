import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ApiOkResponse, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Tenant } from "./tenant.js";
import { Database } from "./database.js";
const migrationsDir = new URL("../prisma/migrations/", import.meta.url);
const requiredMigrations = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    name: entry.name,
    checksum: createHash("sha256")
      .update(
        readFileSync(new URL(entry.name + "/migration.sql", migrationsDir)),
      )
      .digest("hex"),
  }));
@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(Tenant) private readonly tenant: Tenant,
  ) {}
  @ApiOkResponse({
    schema: {
      type: "object",
      required: ["status"],
      properties: { status: { type: "string", enum: ["ok"] } },
    },
  })
  @Get("live")
  live() {
    return { status: "ok" };
  }
  @ApiOkResponse({
    schema: {
      type: "object",
      required: ["status", "database", "migrations"],
      properties: {
        status: { type: "string", enum: ["ok"] },
        database: { type: "string", enum: ["ready"] },
        migrations: { type: "string", enum: ["ready"] },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: "Database unavailable or required migrations missing",
  })
  @Get("ready")
  async ready() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const query = this.db.$queryRaw<
        Array<{
          migration_name: string;
          checksum: string;
          finished_at: Date | null;
        }>
      >`SELECT migration_name, checksum, finished_at FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`;
      const rows = await Promise.race([
        query,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error("Readiness deadline")),
            3500,
          );
        }),
      ]);
      if (
        rows.length !== requiredMigrations.length ||
        rows.some((row) => !row.finished_at) ||
        !requiredMigrations.every((expected) =>
          rows.some(
            (row) =>
              row.migration_name === expected.name &&
              row.checksum === expected.checksum,
          ),
        )
      )
        throw new Error("Migration missing, failed or changed");
      await this.tenant.assert();
      return { status: "ok", database: "ready", migrations: "ready" };
    } catch {
      throw new ServiceUnavailableException();
    } finally {
      clearTimeout(timer);
    }
  }
}
