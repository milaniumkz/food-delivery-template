import {
  existsSync,
  writeFileSync,
  readFileSync,
  appendFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
if (!process.versions.node.startsWith("24.22."))
  throw Error("Use Node 24.22.x as pinned in .node-version");
if (!existsSync(".env")) {
  const password = randomBytes(32).toString("hex");
  writeFileSync(
    ".env",
    `NODE_ENV=development\nPAYMENT_PROVIDER=mock\nPOSTGRES_PASSWORD=${password}\nDATABASE_URL=postgresql://food_local:${password}@127.0.0.1:5432/food_local?connect_timeout=3&socket_timeout=3\nPORT=3001\n`,
    { mode: 0o600, flag: "wx" },
  );
  console.log("Created ignored .env with random local-only credentials");
}
if (!/^AUTH_KEY=/m.test(readFileSync(".env", "utf8")))
  appendFileSync(".env", `\nAUTH_KEY=${randomBytes(32).toString("hex")}\n`);
if (!/^REDIS_URL=/m.test(readFileSync(".env", "utf8")))
  appendFileSync(".env", "\nREDIS_URL=redis://127.0.0.1:6379\n");
for (const key of ["POSTGRES_PASSWORD", "DATABASE_URL"]) {
  if (!new RegExp(`^${key}=.+$`, "m").test(readFileSync(".env", "utf8")))
    throw Error(`Existing .env lacks ${key}; preserved, configure manually`);
}
if (/^POSTGRES_PASSWORD=CHANGE_ME$/m.test(readFileSync(".env", "utf8")))
  throw Error(
    "Replace the example DB password in ignored .env before bootstrap; file preserved",
  );
function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status ?? 1);
}
run("pnpm", ["install", "--frozen-lockfile"]);
run("pnpm", ["db:generate"]);
run("docker", [
  "compose",
  "--env-file",
  ".env",
  "-f",
  "infra/compose/compose.yaml",
  "up",
  "-d",
  "--wait",
]);
run("pnpm", ["db:migrate"]);
run("pnpm", ["db:seed"]);
