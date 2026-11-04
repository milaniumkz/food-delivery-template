# ADR 0001: модульный монолит и воспроизводимая основа

Статус: принято для локальной разработки, 2026-11-04.

Сохраняем Flutter/Dart, NestJS/TypeScript, PostgreSQL/Prisma, Next.js/React и pnpm workspace согласно SPEC. Node 24.22.1 и pnpm 11.25.0 фиксируются; зависимости имеют точные версии и lockfile. PostgreSQL 17.6. Миграции выполняются отдельно, seed разрешён только локально/test. API /v1, health/live отдельно от health/ready; readiness проверяет БД и миграцию. Время UTC, IANA timezone в филиале, KZT в целых тиынах.

Начальная поставка local-only: mock, production startup запрещён до реализации и проверки production dependencies. Никакой автоматической live-интеграции. Prisma хранит бизнес-данные; клиент не задаёт цену, роли или статусы платежей. Дальнейшие слои добавляются проверяемыми вертикальными сценариями. Не добавлять пустые worker/media-заготовки.

Flutter SDK не объявляется проверенным до доступной установки и analyze/test; iOS требует macOS. Foundation не считается полностью принятым до этих проверок.
