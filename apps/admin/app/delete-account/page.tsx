import { configuredBrand } from "../backend";
import DeleteAccount from "./view";
export const dynamic = "force-dynamic";
export default function Page() {
  const brand = configuredBrand();
  return (
    <main className="catalog">
      <h1>{brand.displayName}: удаление аккаунта</h1>
      <DeleteAccount supportEmail={brand.supportEmail} />
    </main>
  );
}
