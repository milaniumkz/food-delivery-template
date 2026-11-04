import { spawn, spawnSync } from "node:child_process";
const build = spawnSync("pnpm", ["--filter", "@food/api", "build"], {
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);
const children = new Set();
let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* Child already exited. */
    }
  }
  const timer = setTimeout(() => {
    for (const child of children) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* Child already exited. */
      }
    }
  }, 5000);
  timer.unref();
}
for (const script of ["start:api", "dev:admin", "dev:worker"]) {
  const child = spawn("pnpm", [script], { stdio: "inherit", detached: true });
  children.add(child);
  child.once("error", () => shutdown(1));
  child.once("exit", (code) => {
    children.delete(child);
    shutdown(code ?? 1);
  });
}
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
