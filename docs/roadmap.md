# План реализации

Этапы IMPLEMENTATION.md используются как work packages; SPEC §18–19 задаёт нормативные release gates.

1. Foundation: pnpm/версии, PostgreSQL/Prisma и миграции, NestJS live/ready и безопасные ошибки, Next.js shell, mock conformance, Compose, CI. Проверки: frozen install, typecheck/build, migration repeat, реальный HTTP и отказ readiness при недоступной БД. Flutter SDK/analyze/test/native runners — обязательны до полного закрытия этапа.
2. Brand + UI: versioned JSON Schema, два бренда, общие tokens, RU/KK, доступные shell Flutter/admin; затем native identities/assets. Проверки invalid configs, deterministic generation, widget/browser и сборки двух брендов.
3. Identity + Catalog: OTP TTL/rate limits, отзываемые сессии и staff bootstrap/RBAC, филиалы, меню и варианты; создание в админке и просмотр в mobile через API. Проверки реальной БД, чужих ID, mass assignment, stop-list и локализаций.
4. Checkout: серверный quote/TTL, зоны/расписания, промокоды, неизменяемый снимок, резервы и идемпотентность. Проверки параллельного оформления и последней порции/промокода.
5. Operations: mock/cash заказ → ресторан → кухня → курьер/самовывоз; атомарные версии, аудит/outbox, worker/reconnect, полный mock refund. Сквозные E2E, сбои и повторная обработка.
6. Payments: изучение предоставленного Kaspi-проекта, прав и фактического контракта, sandbox conformance. До этого Kaspi blocked; остальные работы независимы.
7. Hardening: профиль/удаление, push/media/reporting, безопасность, A01–A24, D01–D08, нагрузка/restore drill. Не заявлять production по наличию тестового заказа.
8. Release kit: второй бренд с отдельной БД, реальные устройства/Android/iOS, signing/юридические материалы и ручное разрешение публикации.

Результаты команд и статус этапов фиксируются в docs/progress.md. Код этапов с непроверенными зависимостями помечается явно. Начало следующих независимых задач не закрывает незавершённые gates предыдущего этапа.
