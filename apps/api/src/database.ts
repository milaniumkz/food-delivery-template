import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadConfig } from "./config.js";
@Injectable()
export class Database implements OnModuleDestroy {
  private value?: PrismaClient;
  private get client(): PrismaClient {
    return (this.value ??= new PrismaClient({
      adapter: new PrismaPg({
        connectionString: loadConfig().databaseUrl,
        connectionTimeoutMillis: 3000,
        statement_timeout: 3000,
      }),
    }));
  }
  get orm() {
    return this.client;
  }
  get branch() {
    return this.client.branch;
  }
  get product() {
    return this.client.product;
  }
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> {
    return this.client.$queryRaw(query, ...values) as Promise<T>;
  }
  $executeRawUnsafe(query: string, ...values: unknown[]) {
    return this.client.$executeRawUnsafe(query, ...values);
  }
  async onModuleDestroy() {
    await this.value?.$disconnect();
  }
}
