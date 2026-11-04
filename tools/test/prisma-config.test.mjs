import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const require = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const prismaRequire = createRequire(require.resolve("prisma/package.json"));
const { loadConfigFromFile } = prismaRequire("@prisma/config");
test("Prisma configuration loads through security-patched deepmerge dependency", async () => {
  const dir = mkdtempSync(join(tmpdir(), "food-prisma-config-"));
  try {
    const moduleUrl = pathToFileURL(require.resolve("prisma/config")).href;
    const file = join(dir, "prisma.config.mjs");
    writeFileSync(
      file,
      `import { defineConfig } from ${JSON.stringify(moduleUrl)}; export default defineConfig({ schema:'schema.prisma', migrations: {path:'migrations'} });`,
    );
    const result = await loadConfigFromFile({
      configFile: file,
      configRoot: dir,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.config.schema, join(dir, "schema.prisma"));
    assert.equal(result.config.migrations.path, join(dir, "migrations"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
