export interface Config {
  port: number;
  host: string;
  databaseUrl: string;
  brandPath: string;
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Until release gates and real providers exist this application is deliberately local/test only.
  if (!["development", "test"].includes(env.NODE_ENV ?? "development"))
    throw new Error(
      "Only development/test are supported; production release gates are incomplete",
    );
  if ((env.PAYMENT_PROVIDER ?? "mock") !== "mock")
    throw new Error(
      "Kaspi disabled: approved provider contract and source audit required",
    );
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw new Error("DATABASE_URL must be a PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("DATABASE_URL must be a PostgreSQL URL");
  for (const name of ["connect_timeout", "socket_timeout", "pool_timeout"]) {
    if (!url.searchParams.has(name)) url.searchParams.set(name, "3");
  }
  if (!env.AUTH_KEY || !/^[0-9a-f]{64}$/i.test(env.AUTH_KEY))
    throw new Error(
      "AUTH_KEY must be a generated 32-byte hex secret; run bootstrap",
    );
  const port = Number(env.PORT ?? "3001");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be 1..65535");
  return {
    port,
    host: env.API_HOST ?? "127.0.0.1",
    databaseUrl: url.toString(),
    brandPath: env.BRAND_CONFIG ?? "../../brands/demo/brand.json",
  };
}
