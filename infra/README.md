# Локальная инфраструктура

`compose/compose.yaml` запускает PostgreSQL17.6 и Redis8.2.2 AOF с loopback портами, healthchecks и persistent volumes. `tools/bootstrap.mjs` создаёт случайные ignored credentials, применяет миграции и seed без сброса существующих данных. Prisma7.10.1 generation/migration работают на закреплённых JS/WASM helpers; Rust artifact CDN не требуется для этого workflow.

API/admin/worker можно запускать на host через `pnpm dev`. Дополнительный `compose/apps.yaml` запускает non-root application image, одноразовый migration/seed job, API, Next.js и worker; отдельные volumes для media и local SMS. Команды — [OPERATIONS](../docs/OPERATIONS.md), setup — [local development](../docs/local-development.md).

Local logical DB/media backup, Redis outage/reconnect и physical WAL/PITR drill реализованы и проверены: [recovery](../docs/recovery.md). Это не автоматические offsite production backups. MinIO/S3 provider, reverse proxy/TLS, external alerts и deployment не настроены. Production startup запрещён.

Не выполнять `down -v` или destructive rollback для обычного перезапуска. Не менять volumes/контейнеры других проектов. Credentials/signing/client private files не включаются в image/Git; public CA подключается через BuildKit secret при работе за managed proxy.
