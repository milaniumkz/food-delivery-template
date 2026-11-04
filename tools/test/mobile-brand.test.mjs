import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const digest = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");
const run = (...args) => {
  const p = spawnSync(process.execPath, ["tools/mobile-brand.mjs", ...args], {
    encoding: "utf8",
  });
  assert.equal(p.status, 0, p.stderr);
};
test("native brand assets are deterministic, independent; dry run preserves mobile identity", () => {
  const mobile = "apps/mobile/assets/brand.json",
    before = digest(mobile);
  run("brands/demo-alt/brand.json", "--dry-run", "--apply");
  assert.equal(digest(mobile), before);
  run("brands/demo/brand.json");
  const first = digest(".generated/demo/mobile/web/icons/Icon-192.png");
  run("brands/demo/brand.json");
  assert.equal(digest(".generated/demo/mobile/web/icons/Icon-192.png"), first);
  run("brands/demo-alt/brand.json");
  assert.notEqual(
    digest(".generated/demo-alt/mobile/web/icons/Icon-192.png"),
    first,
  );
  const alternate = JSON.parse(
    readFileSync(".generated/demo-alt/mobile/assets/brand.json", "utf8"),
  );
  assert.equal(alternate.id, "demo-alt");
  assert.ok(
    readFileSync(
      ".generated/demo-alt/mobile/android/app/build.gradle.kts",
      "utf8",
    ).includes('applicationId = "' + alternate.applicationId + '"'),
  );
  assert.ok(
    readFileSync(
      ".generated/demo-alt/mobile/ios/Runner.xcodeproj/project.pbxproj",
      "utf8",
    ).includes("PRODUCT_BUNDLE_IDENTIFIER = " + alternate.applicationId + ";"),
  );
  assert.equal(digest(mobile), before);
});
