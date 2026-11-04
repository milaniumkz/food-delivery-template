import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { getGenerators } = require("@prisma/internals");
const { createDefaultRegistry } = require("@prisma/client-generator-registry");
// The CLI downloads a Rust schema binary before delegating to this same registry.
// The JS client needs no binary. Keep these programmatic APIs pinned together.
const generators = await getGenerators({
  schemaPath: resolve("prisma/schema.prisma"),
  registry: createDefaultRegistry("generate").toInternal(),
  cliCommand: "generate",
});
try {
  for (const generator of generators) await generator.generate();
  console.log("Prisma JS client generated from schema");
} finally {
  for (const generator of generators) generator.stop();
}
