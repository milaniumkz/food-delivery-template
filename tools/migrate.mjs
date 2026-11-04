import { createRequire } from "node:module";
import { dirname, resolve, join } from "node:path";
import { mkdirSync, readFileSync, existsSync, copyFileSync } from "node:fs";
const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
if (!process.env.DATABASE_URL) throw Error("DATABASE_URL is required");
const version = require("prisma/package.json").version;
for (const name of ["@prisma/internals", "@prisma/migrate"])
  if (require(name + "/package.json").version !== version)
    throw Error("Prisma tooling versions must match");
// @prisma/internals omits its WASM build asset. Reuse the byte-identical npm artifact
// from the matching Prisma CLI release; neither TLS nor package integrity is bypassed.
const source = join(
  dirname(require.resolve("prisma/package.json")),
  "build/schema_engine_bg.wasm",
);
const target = join(
  dirname(require.resolve("@prisma/internals/package.json")),
  "build/schema_engine_bg.wasm",
);
mkdirSync(dirname(target), { recursive: true });
if (existsSync(target) && !readFileSync(target).equals(readFileSync(source)))
  throw Error("Unexpected existing Prisma WASM artifact; refusing replacement");
if (!existsSync(target)) copyFileSync(source, target);
if (!readFileSync(target).equals(readFileSync(source)))
  throw Error("Prisma WASM artifact copy verification failed");
const { Migrate, SchemaEngineWasm } = require("@prisma/migrate");
const { PrismaPg } = require("@prisma/adapter-pg");
const {
  bindMigrationAwareSqlAdapterFactory,
} = require("@prisma/driver-adapter-utils");
const { Pool } = require("pg");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 3000,
});
const adapter = bindMigrationAwareSqlAdapterFactory(new PrismaPg(pool));
const engine = await SchemaEngineWasm.setup({ adapter });
const migrate = new Migrate({
  engine,
  migrationsDirPath: resolve("prisma/migrations"),
});
try {
  const result = await migrate.applyMigrations();
  console.log(
    "Prisma migrations applied:",
    result.appliedMigrationNames.length,
  );
} finally {
  await migrate.stop();
  await pool.end();
}
