export interface Brand {
  schemaVersion: 1;
  id: string;
  displayName: string;
  applicationId: string;
  apiBaseUrl: string;
  currency: "KZT";
  locales: Array<"ru" | "kk">;
  defaultLocale: "ru" | "kk";
  timeZone: string;
  primaryColor: string;
  onPrimary: string;
  surfaceColor: string;
  textColor: string;
  logoAsset: string;
  supportEmail: string;
}
export function validateBrand(
  value: unknown,
  options?: { production?: boolean },
): Brand;
export function readBrand(
  path: string,
  options?: { production?: boolean },
): Brand;
export function contrast(a: string, b: string): number;
export const publicBrandSchema: Record<string, unknown>;
