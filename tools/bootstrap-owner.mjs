import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  hashPassword,
  encryptSecret,
  base32,
} from "../apps/api/dist/auth-crypto.js";
const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
if (!["development", "test"].includes(process.env.NODE_ENV ?? "development"))
  throw Error("Local bootstrap only");
const email = (process.argv[2] ?? "owner@demo.invalid").toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw Error("Valid owner email required");
const directory = resolve("../../.local"),
  path = resolve(directory, "owner-credentials.json");
if (existsSync(path))
  throw Error("Existing credentials preserved; bootstrap refuses overwrite");
const password = randomBytes(24).toString("base64url"),
  mfa = randomBytes(20).toString("hex");
const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 3000,
  }),
});
try {
  const passwordHash = await hashPassword(password),
    mfaSecret = encryptSecret(mfa);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext('first-owner-bootstrap'))`;
    if (await tx.roleBinding.count({ where: { role: "owner" } }))
      throw Error(
        "First owner already exists; no duplicate bootstrap permitted",
      );
    const staff = await tx.staffUser.create({
      data: {
        email,
        passwordHash,
        mfaSecret,
        roles: { create: { role: "owner" } },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: staff.id,
        action: "staff.owner.bootstrap",
        entityId: staff.id,
      },
    });
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(
      path,
      JSON.stringify(
        {
          email,
          password,
          totpSecret: base32(mfa),
          instructions:
            "Import the TOTP secret into your authenticator, then sign in with current code. Keep this file private and remove after secure transfer.",
        },
        null,
        2,
      ) + "\n",
      { flag: "wx", mode: 0o600 },
    );
  });
  console.log(
    "First owner created. Credentials saved only in ignored .local/owner-credentials.json (0600); no shared password.",
  );
} finally {
  await db.$disconnect();
}
