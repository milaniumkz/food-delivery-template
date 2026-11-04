# Сторонние зависимости

Лицензию собственного шаблона владелец ещё не выбрал. Этот реестр не предоставляет прав на сторонние материалы клиентов.

Прямые зависимости и версии перечислены в package.json приложений и packages/config; полное дерево и integrity — в pnpm-lock.yaml. Никакие существующие частные репозитории или Kaspi-модули не импортировались.

| Компонент | Назначение | Лицензия upstream |
|---|---|---|
| NestJS, Express, RxJS, reflect-metadata, class-transformer/class-validator, Helmet | API | MIT / RxJS Apache-2.0 |
| Prisma | ORM и tooling | Apache-2.0 |
| Next.js, React, React DOM | Панель | MIT |
| AJV, ajv-formats | JSON Schema | MIT |
| TypeScript | Сборка | Apache-2.0 |
| ESLint, typescript-eslint, Prettier | Проверки разработки | MIT |
| PostgreSQL (официальный Docker image) | Локальная БД | PostgreSQL License; образ также содержит ОС/системные пакеты |
| Flutter 3.44.0 / Dart 3.12.0 | Mobile starter | BSD-3-Clause |

Сверять LICENSE/NOTICE конкретных установленных пакетов перед распространением; этот короткий реестр не заменяет полный SBOM образов/артефактов. Demo-alt SVG — собственная геометрическая иллюстрация, внешние фото/шрифты не добавлены.

Prisma 7.10.1 использует JS driver adapter и закреплённые npm/WASM tooling API; прежний override Prisma 6 удалён. Generate/migrate и повторное применение миграций проверены. Flutter SDK установлен из immutable Cirrus image с проверкой официального Git tag/revision; образ не включён в репозиторий. Sharp 0.35.5 (Apache-2.0) преобразует собственные SVG брендов в native icons. Riverpod (MIT), go_router/Dio/flutter_secure_storage (BSD-3-Clause), intl (BSD-3-Clause), BullMQ/ioredis (MIT) добавлены для рабочих сценариев. Текущий pnpm audit --prod не обнаружил известных advisories; это не security audit приложения. Перед коммерческим распространением требуется актуальный license inventory всех транзитивных зависимостей.

Карты: flutter_map (BSD-3-Clause), latlong2 (Apache-2.0), geolocator (MIT), url_launcher (BSD-3-Clause); OpenStreetMap data © contributors (ODbL), tile service имеет отдельную usage policy и обязательную атрибуцию. Публичные OSM tiles используются только для development, production provider/лицензию нужно подтвердить. timezone (BSD-2-Clause) включает IANA tz data; сверить NOTICE установленного пакета. Playwright (Apache-2.0), axe-core/@axe-core/playwright (MPL-2.0) — инструменты тестирования, не компоненты мобильного релиза. Транзитивный libvips Sharp и системные пакеты Docker требуют отдельного inventory.
