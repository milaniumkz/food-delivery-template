# Проверки starter · 04.11.2026

- Node.js v24.10.0: `node --test apps/api/test/*.test.mjs` — 4/4 passed: идемпотентность и конфликт суммы, неверные суммы, переход mock/изоляция снимка, запрет внешних уведомлений и Kaspi.
- `node tools/brand.mjs brands/demo/brand.json` — passed, публичная конфигурация сгенерирована. `.generated/` исключена из git.
- JavaScript из design/index.html извлечён и проверен `node --check` — passed.
- `git diff --cached --check` — passed.
- Просмотрен список всех отслеживаемых файлов: только новые исходники, публичные demo-данные и документация. Поиск распространённых паттернов private keys/GitHub/AWS/live payment tokens не нашёл совпадений. Это ограниченная проверка, не доказательство отсутствия всех возможных секретов.
- Создана новая Git-история; история существующих проектов и платёжный код не импортировались.

## Ограничения проверки
Flutter SDK недоступен: сборки Android/iOS, Flutter analyze и tests не запускались. Полноценный HTTP backend и Next.js admin ещё не созданы, проверять их E2E пока нельзя. Browser smoke попытка через Playwright CLI не завершилась: окружение возвратило `ENOTDIR` для npm cache, затем для `/Users/dmitriyshtrakhov/Library/Caches/ms-playwright`. Макет проверен статически, но визуальный и интерактивный browser QA не подтверждён. Перед реализацией и передачей клиенту выполнить ручной/автоматический browser QA на desktop 1440px и mobile 390px, полную клавиатурную навигацию и contrast checks. CI опубликован, его удалённый результат следует проверять отдельно.
