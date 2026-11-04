import { readBrand, type Brand } from "@food/config";
export function configuredBrand() {
  return readBrand(process.env.BRAND_CONFIG ?? "../../brands/demo/brand.json");
}
export async function backendForBrand(brand: Brand) {
  const endpoint = new URL(
    process.env.ADMIN_API_URL ?? "http://127.0.0.1:3001",
  );
  if (
    !["http:", "https:"].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== "/"
  )
    throw Error("Invalid backend origin");
  const response = await fetch(new URL("/v1/bootstrap", endpoint), {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(3500),
  });
  if (!response.ok || (await response.json()).brand?.id !== brand.id)
    throw Error("Backend brand mismatch or unavailable");
  return endpoint.origin;
}
