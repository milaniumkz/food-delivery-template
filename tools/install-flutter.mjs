import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";
const version = "3.44.0",
  revision = "559ffa3f75e7402d65a8def9c28389a9b2e6fe42",
  image =
    "ghcr.io/cirruslabs/flutter@sha256:46691e311715845de03a3ba4753a475476936805b29431b1f00f1816981033f8";
const directory = resolve(
    process.env.FLUTTER_TOOLCHAIN_DIR ?? "/workspace/.toolchains",
  ),
  target = resolve(directory, "flutter-" + version);
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0)
    throw Error(command + " failed: " + (result.stderr ?? ""));
  return result.stdout;
}
function check(path) {
  const head = run("git", [
    "-c",
    "safe.directory=" + path,
    "-C",
    path,
    "rev-parse",
    "HEAD",
  ]).trim();
  if (head !== revision) throw Error("Flutter revision mismatch");
  const data = JSON.parse(
    run(resolve(path, "bin/flutter"), ["--version", "--machine"]),
  );
  if (data.frameworkVersion !== version || data.dartSdkVersion !== "3.12.0")
    throw Error("Flutter/Dart version mismatch");
}
if (existsSync(target)) {
  check(target);
  console.log("Verified retained Flutter " + version + " / Dart 3.12.0");
  process.exit(0);
}
mkdirSync(directory, { recursive: true });
const tag = run("git", [
  "ls-remote",
  "https://github.com/flutter/flutter.git",
  "refs/tags/" + version,
]).split(/\s+/)[0];
if (tag !== revision) throw Error("Official Flutter tag mismatch");
run("docker", ["pull", image]);
const container = "food-flutter-sdk-" + process.pid,
  temp = target + ".install-" + process.pid;
try {
  run("docker", ["create", "--name", container, image]);
  run("docker", ["cp", container + ":/sdks/flutter", temp]);
  check(temp);
  renameSync(temp, target);
} finally {
  run("docker", ["rm", "-f", container]);
  if (existsSync(temp)) rmSync(temp, { recursive: true });
}
console.log(
  "Installed verified Flutter " + version + " / Dart 3.12.0 at " + target,
);
