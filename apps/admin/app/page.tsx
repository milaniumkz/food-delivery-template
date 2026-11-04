import { backendForBrand, configuredBrand } from "./backend";
import type { CSSProperties } from "react";
import Admin from "./admin";
export const dynamic = "force-dynamic";
export default async function Home() {
  const brand = configuredBrand();
  let ready = false;
  try {
    const backend = await backendForBrand(brand);
    const response = await fetch(`${backend}/v1/health/ready`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3500),
    });
    ready = response.ok && (await response.json()).status === "ok";
  } catch {
    /* Unavailable readiness is rendered explicitly below. */
  }
  const style = {
    "--primary": brand.primaryColor,
    "--on-primary": brand.onPrimary,
    "--surface": brand.surfaceColor,
    "--text": brand.textColor,
  } as CSSProperties;
  return (
    <main style={style}>
      <header className="topbar">
        <a className="brand-name" href="/">
          {brand.displayName}
          <span>панель ресторана</span>
        </a>
        <span className="environment">Локальный режим · тестовые платежи</span>
      </header>
      {!ready && (
        <p role="status" className="warning">
          Сервер или база данных недоступны. Проверьте запуск сервисов.
        </p>
      )}
      <Admin brand={brand} />
    </main>
  );
}
