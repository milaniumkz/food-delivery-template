import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readBrand } from "../packages/config/index.mjs";
const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith("--")) ?? "brands/demo/brand.json";
const brand = readBrand(resolve(path), {
  production: args.includes("--production"),
});
const out = resolve(".generated", brand.id);
if (!args.includes("--dry-run")) {
  mkdirSync(out, { recursive: true });
  writeFileSync(
    resolve(out, "brand.json"),
    JSON.stringify(brand, null, 2) + "\n",
  );
}
console.log(
  `Validated public brand: ${brand.id}${args.includes("--dry-run") ? "; dry run" : "; output " + out + "/brand.json"}`,
);
