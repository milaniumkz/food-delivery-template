import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import schema from "./brand.schema.json" with { type: "json" };
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const check = ajv.compile(schema);
export const publicBrandSchema = Object.fromEntries(
  Object.entries(schema).filter(([key]) => key !== "$schema"),
);
function luminance(color) {
  const rgb = color
    .slice(1)
    .match(/../g)
    .map((x) => parseInt(x, 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
export function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
export function validateBrand(value, { production = false } = {}) {
  if (!check(value))
    throw Error(
      "Invalid public brand schema: " +
        check.errors.map((e) => e.instancePath + " " + e.keyword).join(", "),
    );
  const url = new URL(value.apiBaseUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  )
    throw Error(
      "Brand API requires HTTPS without credentials, query or fragment",
    );
  if (!value.locales.includes(value.defaultLocale))
    throw Error("defaultLocale must be enabled");
  try {
    new Intl.DateTimeFormat("ru", { timeZone: value.timeZone });
  } catch {
    throw Error("Invalid IANA time zone");
  }
  if (
    contrast(value.primaryColor, value.onPrimary) < 4.5 ||
    contrast(value.surfaceColor, value.textColor) < 4.5
  )
    throw Error("Brand contrast must be at least 4.5:1");
  if (
    production &&
    (value.applicationId.startsWith("com.example.") ||
      /(?:^|\.)(invalid|localhost|example\.(?:com|org|net))$/.test(
        url.hostname,
      ) ||
      value.id.startsWith("demo"))
  )
    throw Error("Demo brand is forbidden in production");
  return structuredClone(value);
}
export function readBrand(path, options) {
  const brand = validateBrand(JSON.parse(readFileSync(path, "utf8")), options);
  const base = realpathSync(dirname(path));
  const logo = realpathSync(resolve(base, brand.logoAsset));
  if (!logo.startsWith(base + sep)) throw Error("Logo escapes brand directory");
  readFileSync(logo);
  return brand;
}
