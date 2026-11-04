import { backendForBrand, configuredBrand } from "../../backend";
import type { NextRequest } from "next/server";
const rules = [
  { path: /^admin\/customers$/, methods: ["GET"] },
  { path: /^admin\/customers\/[0-9a-f-]{36}\/restriction$/, methods: ["POST"] },
  { path: /^admin\/(system|outbox)$/, methods: ["GET"] },
  { path: /^admin\/outbox\/[0-9a-f-]{36}\/retry$/, methods: ["POST"] },
  { path: /^admin\/reports(?:\/export)?$/, methods: ["GET"] },
  { path: /^media\/[0-9a-f-]{36}$/, methods: ["GET"] },
  {
    path: /^admin\/products\/[0-9a-f-]{36}\/image$/,
    methods: ["POST", "DELETE"],
  },
  { path: /^admin\/categories$/, methods: ["GET", "POST"] },
  { path: /^admin\/categories\/[0-9a-f-]{36}$/, methods: ["PATCH"] },
  {
    path: /^admin\/products\/[0-9a-f-]{36}\/configuration$/,
    methods: ["POST"],
  },
  { path: /^admin\/staff$/, methods: ["GET", "POST"] },
  { path: /^admin\/staff\/[0-9a-f-]{36}$/, methods: ["PATCH"] },
  { path: /^admin\/orders$/, methods: ["GET"] },
  { path: /^admin\/orders\/[0-9a-f-]{36}$/, methods: ["GET"] },
  {
    path: /^admin\/orders\/[0-9a-f-]{36}\/(accept|prepare|ready|reject|cancel|complete-pickup|assign-courier)$/,
    methods: ["POST"],
  },
  { path: /^admin\/payments\/[0-9a-f-]{36}\/refunds$/, methods: ["POST"] },
  { path: /^courier\/assignments$/, methods: ["GET"] },
  {
    path: /^courier\/assignments\/[0-9a-f-]{36}\/(accept|collect|deliver)$/,
    methods: ["POST"],
  },
  { path: /^admin\/couriers$/, methods: ["GET"] },
  { path: /^admin\/(zones|promotions)$/, methods: ["GET", "POST"] },
  { path: /^admin\/(zones|promotions)\/[0-9a-f-]{36}$/, methods: ["PATCH"] },
  { path: /^admin\/products\/[0-9a-f-]{36}\/stock$/, methods: ["POST"] },
  { path: /^admin\/auth\/(login|logout)$/, methods: ["POST"] },
  { path: /^admin\/auth\/session$/, methods: ["GET"] },
  { path: /^admin\/branches$/, methods: ["GET"] },
  { path: /^admin\/products$/, methods: ["GET", "POST"] },
  { path: /^admin\/(products|branches)\/[0-9a-f-]{36}$/, methods: ["PATCH"] },
];
async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path.join("/");
  if (
    !rules.some(
      (rule) => rule.path.test(path) && rule.methods.includes(request.method),
    )
  )
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  const imageUpload =
    request.method === "POST" &&
    /^admin\/products\/[0-9a-f-]{36}\/image$/.test(path);
  const unsafe = !["GET", "HEAD"].includes(request.method);
  const origin = process.env.ADMIN_ORIGIN ?? "http://127.0.0.1:3000";
  if (unsafe && request.headers.get("origin") !== origin)
    return Response.json({ code: "FORBIDDEN" }, { status: 403 });
  let body: Uint8Array<ArrayBuffer> | undefined;
  if (unsafe && request.body) {
    const reader = request.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > (imageUpload ? 5 * 1024 * 1024 : 32768)) {
        await reader.cancel();
        return Response.json({ code: "PAYLOAD_TOO_LARGE" }, { status: 413 });
      }
      chunks.push(part.value);
    }
    body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
  }
  const headers: Record<string, string> = {
    "content-type": imageUpload
      ? (request.headers.get("content-type") ?? "application/octet-stream")
      : "application/json",
    origin,
  };
  for (const name of ["cookie", "x-csrf-token", "idempotency-key"]) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }
  try {
    const backend = await backendForBrand(configuredBrand());
    const url = new URL("/v1/" + path, backend);
    url.search = request.nextUrl.search;
    const upstream = await fetch(url, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (
      path === "admin/reports/export" &&
      upstream.ok &&
      upstream.headers.get("content-type")?.startsWith("text/csv")
    )
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": "attachment; filename=orders-cohort.csv",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    if (
      path.startsWith("media/") &&
      upstream.ok &&
      upstream.headers.get("content-type")?.startsWith("image/webp")
    )
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "content-type": "image/webp",
          "x-content-type-options": "nosniff",
          "cache-control": "no-store",
        },
      });
    if (!upstream.headers.get("content-type")?.includes("application/json"))
      return Response.json({ code: "NOT_READY" }, { status: 503 });
    const response = new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
    for (const cookie of upstream.headers.getSetCookie())
      response.headers.append("set-cookie", cookie);
    return response;
  } catch {
    return Response.json(
      { code: "NOT_READY", message: "Сервер временно недоступен" },
      { status: 503 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;

export const DELETE = proxy;
