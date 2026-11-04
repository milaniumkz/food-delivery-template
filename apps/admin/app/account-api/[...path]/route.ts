import type { NextRequest } from "next/server";
import { backendForBrand, configuredBrand } from "../../backend";
const allowed = new Map([
  ["auth/otp/request", "POST"],
  ["auth/otp/verify", "POST"],
  ["me/deletion-challenge", "POST"],
  ["me/delete", "POST"],
  ["auth/logout", "POST"],
]);
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path.join("/");
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (allowed.get(path) !== "POST")
    return Response.json({ code: "NOT_FOUND" }, { status: 404, headers });
  if (
    request.headers.get("origin") !==
    (process.env.ADMIN_ORIGIN ?? "http://127.0.0.1:3000")
  )
    return Response.json({ code: "FORBIDDEN" }, { status: 403, headers });
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return Response.json(
      { code: "INVALID_CONTENT_TYPE" },
      { status: 400, headers },
    );
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (reader)
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 32768) {
        await reader.cancel();
        return Response.json(
          { code: "PAYLOAD_TOO_LARGE" },
          { status: 413, headers },
        );
      }
      chunks.push(part.value);
    }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) {
    body.set(part, offset);
    offset += part.length;
  }
  try {
    const backend = await backendForBrand(configuredBrand()),
      token = request.headers.get("authorization"),
      forward: Record<string, string> = { "content-type": "application/json" };
    if (token) {
      if (!/^Bearer [0-9a-f]{64}$/.test(token))
        return Response.json(
          { code: "UNAUTHORIZED" },
          { status: 401, headers },
        );
      forward.authorization = token;
    }
    const response = await fetch(backend + "/v1/" + path, {
      method: "POST",
      headers: forward,
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.headers.get("content-type")?.startsWith("application/json"))
      throw Error("Unexpected response");
    // Only these small identity/deletion envelopes are allowed. Never forward staff cookies/refresh storage.
    const result = await response.json();
    if (path === "auth/otp/verify" && response.ok)
      return Response.json(
        { accessToken: result.accessToken, expiresIn: result.expiresIn },
        { status: response.status, headers },
      );
    return Response.json(result, { status: response.status, headers });
  } catch {
    return Response.json({ code: "UNAVAILABLE" }, { status: 503, headers });
  }
}
