# Food Delivery · White-label starter

Основа коммерчески развиваемого приложения доставки еды для отдельных ресторанных брендов. **Реализованы основные локальные сценарии заказа с тестовой оплатой; полный SPEC и production-приёмка ещё не завершены.**

План: [roadmap](docs/roadmap.md), аудит: [discovery](docs/discovery.md), текущие результаты и блокеры: [progress](docs/progress.md). Запуск основы и проверки: [local development](docs/local-development.md).

## Состав и реальное состояние
| Часть | Подготовлено | До production |
|---|---|---|
| Техническое задание | Единое ТЗ v1.1, API, модель данных, этапы, A01–A24 и D01–D08 | Согласовать бизнес-параметры клиента |
| Дизайн | Токены, UX, интерактивный HTML-макет каталога, корзины, оформления и панели | Пользовательские тесты и реализация всех экранов |
| Mobile | Flutter RU/KK, Riverpod/go_router/Dio, каталог/поиск/варианты/корзина/OTP/quote/заказы/профиль/export, secure storage, восстановление запроса | Нативные сборки/устройства, реальные push/SMS и полная UX-приёмка |
| Server | NestJS, PostgreSQL/Prisma 7, OTP/session/MFA/RBAC, серверный quote, резервы, идемпотентность, durable mock payments/refunds, audit/outbox | Реальные провайдеры, оставшиеся SPEC функции и production hardening |
| Admin/курьер | Next.js: меню, очередь/кухня, самовывоз, назначения/доставка, расписания/зоны/промокоды, управление командой | Полная UX/дизайн-приёмка и регрессии всех ролей |
| Kaspi | Fail-closed; рабочая локальная тестовая оплата без реальных списаний | Подтверждённый исходник, права, договор/параметры и sandbox |
| White-label | Versioned JSON Schema, два бренда, тема, native IDs/названия/иконки Android/iOS/Web | Полная проверка двух сборок, signing, store metadata, клиентские release gates |

## Быстрый просмотр
```sh
python3 -m http.server 8080 --directory design
# http://localhost:8080 — только локальный демонстрационный макет
pnpm install --frozen-lockfile
node tools/brand.mjs brands/demo/brand.json
node --test apps/api/test/*.test.mjs
```
Интерактивный макет работает с демонстрационными данными в памяти; не передаёт платежи или заказы.

## Документация
- [Полное ТЗ для Codex](docs/SPEC_RU.md)
- [Дизайн-система и экраны](docs/DESIGN_RU.md)
- [План реализации](docs/IMPLEMENTATION.md)
- [Безопасность и Kaspi](docs/KASPI.md)
- [Запуск клиента и публикация](docs/OPERATIONS.md)
- [Контракт API](packages/contracts/openapi.json)
- [Инструкции Codex](AGENTS.md)

Выбранный стек: Flutter/Dart, NestJS/TypeScript, PostgreSQL, Next.js/TypeScript. Один monorepo, отдельные сборки и серверные окружения каждого заказчика. Не переносить персональные данные клиентов и секреты в публичный репозиторий.

## Правовой статус
Публичность исходников сама по себе не предоставляет лицензию. Файл LICENSE намеренно не добавлен: перед распространением производных решений владелец должен выбрать коммерческую/открытую модель лицензирования. Макет использует собственные CSS-иллюстрации и emoji без внешних фотографий.

Защищённая выгрузка и web удаление аккаунта: [реестр данных](docs/data-register.md). Реальная SMS и юридическая/production приёмка ещё не завершены.
