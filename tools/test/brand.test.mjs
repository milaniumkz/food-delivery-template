import test from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  readBrand,
  validateBrand,
  contrast,
} from "../../packages/config/index.mjs";
const brand = JSON.parse(
  readFileSync(
    new URL("../../brands/demo/brand.json", import.meta.url),
    "utf8",
  ),
);
test("both versioned brands have readable themes and distinct identities", () => {
  const a = readBrand("brands/demo/brand.json"),
    b = readBrand("brands/demo-alt/brand.json");
  assert.notEqual(a.applicationId, b.applicationId);
  assert.notEqual(a.primaryColor, b.primaryColor);
  assert.equal(contrast("#FFFFFF", "#000000"), 21);
});
test("brand refuses secret fields, unsafe URL/path/locale/timezone and poor contrast", () => {
  for (const bad of [
    { ...brand, token: "do-not-publish" },
    { ...brand, schemaVersion: 2 },
    { ...brand, applicationId: "com.example.invalid_name" },
    { ...brand, apiBaseUrl: "http://localhost" },
    { ...brand, apiBaseUrl: "https://user:password@example.invalid" },
    { ...brand, logoAsset: "../secret.svg" },
    { ...brand, locales: ["ru"], defaultLocale: "kk" },
    { ...brand, timeZone: "Fake/Zone" },
    { ...brand, primaryColor: "#FFFFFF" },
  ])
    assert.throws(() => validateBrand(bad));
  assert.throws(() => validateBrand(brand, { production: true }), /Demo/);
});
test("brand asset cannot escape through symlink", () => {
  const dir = mkdtempSync(join(tmpdir(), "brand-test-"));
  try {
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "brand.json"), JSON.stringify(brand));
    writeFileSync(join(dir, "outside.svg"), "<svg/>");
    symlinkSync("/etc/hosts", join(dir, "assets/logo.svg"));
    assert.throws(() => readBrand(join(dir, "brand.json")), /escapes/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("generator is deterministic and supports dry run", () => {
  for (let i = 0; i < 2; i++) {
    const r = spawnSync(
      process.execPath,
      ["tools/brand.mjs", "brands/demo/brand.json"],
      { encoding: "utf8" },
    );
    assert.equal(r.status, 0, r.stderr);
  }
  const first = readFileSync(".generated/demo/brand.json", "utf8");
  assert.deepEqual(JSON.parse(first), brand);
  const r = spawnSync(
    process.execPath,
    ["tools/brand.mjs", "brands/demo/brand.json", "--dry-run"],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /dry run/);
  assert.equal(readFileSync(".generated/demo/brand.json", "utf8"), first);
});
