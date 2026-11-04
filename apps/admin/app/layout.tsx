import type { ReactNode } from "react";
import "./style.css";
export const metadata = {
  title: "Управление рестораном",
  description: "Локальная среда разработки",
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        {children}
        <footer>
          <a href="/delete-account">Удалить аккаунт без приложения</a>
        </footer>
      </body>
    </html>
  );
}
