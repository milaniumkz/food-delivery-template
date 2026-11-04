import { createHash } from "node:crypto";
// Different deployments of the SAME brand may share Redis. Never let their workers consume each other's DB events.
export function queueScope(brandId: string, databaseUrl: string) {
  const db = new URL(databaseUrl),
    identity =
      db.hostname.toLowerCase() + ":" + (db.port || "5432") + db.pathname;
  return (
    "food:" +
    brandId +
    ":" +
    createHash("sha256").update(identity).digest("hex").slice(0, 16)
  );
}
