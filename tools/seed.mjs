import { readBrand } from "../packages/config/index.mjs";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { PrismaClient } = require("@prisma/client");
if (!["development", "test"].includes(process.env.NODE_ENV ?? "development"))
  throw Error("Seed only allowed in development/test");
const { PrismaPg } = require("@prisma/adapter-pg");
const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 3000,
  }),
});
try {
  await db.$transaction(async (tx) => {
    const brand = readBrand(
      process.env.BRAND_CONFIG ?? "../../brands/demo/brand.json",
    );
    const binding = await tx.brandSettings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, slug: brand.id },
    });
    if (binding.slug !== brand.id)
      throw Error(
        "Database already bound to a different brand; existing data preserved",
      );
    await tx.branch.upsert({
      where: { id: "00000000-0000-4000-8000-000000000001" },
      update: {},
      create: {
        id: "00000000-0000-4000-8000-000000000001",
        nameRu: "Демонстрационный филиал",
        nameKk: "Демонстрациялық филиал",
        acceptingOrders: false,
      },
    });
    await tx.product.upsert({
      where: { id: "00000000-0000-4000-8000-000000000002" },
      update: {},
      create: {
        id: "00000000-0000-4000-8000-000000000002",
        branchId: "00000000-0000-4000-8000-000000000001",
        nameRu: "Тестовое блюдо",
        nameKk: "Сынақ тағамы",
        priceMinor: 249000,
      },
    });
  });
  console.log(
    "Demo seed ready; existing records preserved; order acceptance remains disabled",
  );
} finally {
  await db.$disconnect();
}
