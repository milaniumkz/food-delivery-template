import { spawnSync } from "node:child_process";
for (const script of ["migrate.mjs", "seed.mjs"]) {
  const result = spawnSync(process.execPath, ["../../tools/" + script], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
