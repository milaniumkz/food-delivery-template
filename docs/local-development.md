# Локальная разработка

Из корня checkout. Node **24.22.1**, pnpm **11.25.0**, Docker Compose v2. Используйте существующий checkout в облаке; отдельные worktrees не нужны.

```sh
npm install --global pnpm@11.25.0
make bootstrap
pnpm staff:bootstrap
```

Bootstrap создаёт только отсутствующий ignored `.env` с уникальными DB credentials и AUTH_KEY (0600), выполняет frozen install, Prisma generation, запускает PostgreSQL/Redis и применяет миграции/seed. Не сбрасывает данные и не меняет существующий пароль volume. `staff:bootstrap` создаёт только первого владельца; секреты сохраняются в ignored `.local/owner-credentials.json` (0600), не в консоли. Импортируйте TOTP в аутентификатор и храните файл защищённо; повторный bootstrap владельца запрещён.

Общий запуск `pnpm dev` собирает API и запускает API/admin/worker; Ctrl+C завершает только его дочерние процессы. Либо в отдельных терминалах из корня:

```sh
pnpm dev:api
pnpm dev:admin
pnpm dev:worker
```

API слушает 127.0.0.1:3001, Next.js — 127.0.0.1:3000. Worker обрабатывает expiry/outbox/BullMQ. Это локальные адреса, а не опубликованный preview. API читает корневой `.env`; Next.js использует окружение/ignored `apps/admin/.env.local`. Не кладите DB/секреты в NEXT_PUBLIC. При изменении API TS перезапустите процесс. Проверка: GET `/v1/health/live`, затем `/v1/health/ready` (200 только при правильной БД/миграциях/бренде); `/docs` и `/openapi.json` на API.

Войдите в админку с MFA. Seed намеренно создаёт **закрытый** demo-филиал. В «Настройки» задайте расписание через дни недели и время, timezone, приём заказов, наличные/минимум, зоны и промокоды. Новый MFA-код нужен для управления командой и возвратов; использованный код повторно не принимается. Пароль/MFA нового сотрудника показываются только при создании; передавайте их защищённо.

## Flutter

```sh
node tools/install-flutter.mjs
node tools/mobile-brand.mjs brands/demo/brand.json --apply
cd apps/mobile
/workspace/.toolchains/flutter-3.44.0/bin/flutter pub get --enforce-lockfile
/workspace/.toolchains/flutter-3.44.0/bin/flutter analyze
/workspace/.toolchains/flutter-3.44.0/bin/flutter test
/workspace/.toolchains/flutter-3.44.0/bin/flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3001
```

SDK **Flutter 3.44.0 / Dart 3.12.0** закреплён; установщик проверяет Git tag и revision. `FLUTTER_TOOLCHAIN_DIR` меняет место установки, `FLUTTER_SDK` — путь для `tools/flutter.sh`. Скрипт использует immutable Cirrus image, Docker и Git. Приложение берёт тему/имя/идентичность из JSON; API_BASE_URL — только development override, API должен возвращать тот же brand.id. Android emulator видит host как 10.0.2.2; host API по умолчанию loopback, поэтому для эмулятора на отдельной машине нужно явно настроить доступный интерфейс/forwarding. HTTP разрешён только debug Android; production требует HTTPS. В secure storage хранится refresh bundle; код не логирует токены. Web secure storage требует защищённый контекст/localhost и не заменяет нативную проверку.

OTP в development/test **не отправляет настоящую SMS**: код сохраняется локальным адаптером в ignored `.local/sms/<challenge-id>.txt` (0600) относительно API. Не публикуйте эти файлы. Mock payment UI явно помечен тестовым; его paid/failed/timeout не затрагивают деньги.

Web build: `flutter build web --no-web-resources-cdn --dart-define=API_BASE_URL=http://127.0.0.1:3001`. Для браузера API задайте `CORS_ALLOWED_ORIGINS` точным origin dev-server (без wildcard). В текущей облачной машине Web SDK ещё blocked storage.googleapis.com CONNECT403; сохранённое разрешение домена нужно применить в настройках среды. Android требует JDK/SDK/NDK и Gradle через прокси с доверенным CA; iOS archive требует macOS/Xcode. Не отключайте TLS/checksum. Текущий статус сборок — в progress.md.

## Конфигурация и проверки

`.env.example` перечисляет имена, а не рабочие секреты. AUTH_KEY — случайные 32 байта hex, не менять на существующей БД без миграции MFA secrets. BRAND_CONFIG — путь к JSON относительно apps/api или apps/admin; каждый бренд использует отдельную БД. API production и Kaspi fail-closed. Внутренние npm API Prisma 7.10.1 закреплены; helpers JS/WASM позволяют generate/migrate без Rust CDN. При обновлении Prisma обязательны migration-repeat и полный integration runner.

```sh
pnpm check
pnpm test:integration
pnpm build
pnpm test:admin
pnpm test:e2e
pnpm openapi
node tools/dart-client.mjs
pnpm exec openapi-typescript packages/contracts/openapi.json -o packages/contracts/client.d.ts
```

Integration/E2E создают и удаляют только собственные временные БД `food_test_<hex>`. Нужны локальные PostgreSQL/Redis и права CREATE DATABASE. Не запускайте их с production credentials. Flutter tests и браузерные тесты требуют loopback sockets; в sandbox используйте разрешённый execution context. Сборка/CI-файл без реального запуска не является приёмкой. Детальные фактические результаты и незакрытые gates — [progress](progress.md).

Контейнерный вариант запуска API/admin/worker проверен; команды и persistent volumes описаны в [OPERATIONS](OPERATIONS.md). При работе в контейнере локальные SMS лежат в отдельном volume, а не в host `.local/sms`.
