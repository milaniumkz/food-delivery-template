# Local infrastructure

infra/compose/compose.yaml запускает только PostgreSQL 17.6 с loopback-портом, healthcheck и persistent volume. API/admin работают на хосте через pnpm. Пароль генерирует tools/bootstrap.mjs в ignored .env; не использовать sample placeholders для клиента.

SQL-smoke проверен на реальной БД. Prisma generate/deploy пока блокируется сетевым доступом к binaries.prisma.sh. Redis/BullMQ, MinIO, Docker app images, reverse proxy, backup/PITR и production deployment ещё не реализованы.

Инструкция: ../docs/local-development.md. Не удалять volume с нужными данными; автоматического разрушительного rollback нет.
