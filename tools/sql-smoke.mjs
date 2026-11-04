import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
// Independent DDL validation while engine access is blocked. NOT a Prisma migration test.
const database = "food_sql_test_" + randomBytes(8).toString("hex");
const prefix = [
  "compose",
  "--env-file",
  ".env",
  "-f",
  "infra/compose/compose.yaml",
  "exec",
  "-T",
  "postgres",
  "psql",
  "-v",
  "ON_ERROR_STOP=1",
  "-U",
  "food_local",
];
function sql(databaseName, body) {
  const r = spawnSync("docker", [...prefix, "-d", databaseName], {
    input: body,
    encoding: "utf8",
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw Error("SQL smoke failed: " + r.stderr);
  return r.stdout;
}
try {
  sql("postgres", `CREATE DATABASE "${database}";`);
  sql(
    database,
    readFileSync(
      "apps/api/prisma/migrations/202611040001_foundation/migration.sql",
      "utf8",
    ),
  );
  sql(
    database,
    `
 INSERT INTO "Branch" (id,"nameRu","nameKk") VALUES ('00000000-0000-4000-8000-000000000001','Тест','Сынақ');
 INSERT INTO "Product" (id,"branchId","nameRu","nameKk","priceMinor","updatedAt") VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Блюдо','Тағам',249000,NOW());
 DO $$ BEGIN
  IF (SELECT "priceMinor" FROM "Product" LIMIT 1) <> 249000 THEN RAISE EXCEPTION 'Money changed'; END IF;
  IF (SELECT "acceptingOrders" FROM "Branch" LIMIT 1) THEN RAISE EXCEPTION 'Ordering must default off'; END IF;
  BEGIN
   UPDATE "Product" SET "priceMinor"=-1;
   RAISE EXCEPTION 'Negative money accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
   UPDATE "Product" SET version=0;
   RAISE EXCEPTION 'Invalid version accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
   UPDATE "Product" SET "branchId"='00000000-0000-4000-8000-000000000099';
   RAISE EXCEPTION 'Unknown branch accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
   DELETE FROM "Branch";
   RAISE EXCEPTION 'Referenced branch deleted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 END $$;
 `,
  );
  console.log(
    "SQL smoke passed: PostgreSQL DDL, integer money, version checks, foreign keys, restricted deletes and ordering-off default. Prisma deploy NOT tested by this check.",
  );
} finally {
  if (/^food_sql_test_[0-9a-f]{16}$/.test(database))
    sql("postgres", `DROP DATABASE IF EXISTS "${database}" WITH (FORCE);`);
}
