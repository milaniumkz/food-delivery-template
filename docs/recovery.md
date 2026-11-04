# Восстановление и сбои

Проверки ниже работают только с собственными временными ресурсами. Они не являются production backup job. Не передавайте production DATABASE_URL.

```sh
pnpm --filter @food/api build
pnpm test:recovery
pnpm test:pitr
```

`test:recovery` создаёт `food_restore_src/dst_<hex>`, применяет миграции, оформляет/оплачивает mock заказ и сохраняет связанное нормализованное фото. Останавливает собственный Redis, проверяет продолжение PostgreSQL expiry, затем восстановление outbox и отсутствие повторного уведомления. Делает pg_dump/pg_restore, сравнивает заказы/попытки/остатки/outbox, проверяет readiness, неизменность платежа при replay, связь фото и SHA256 bytes после восстановления. Dump, синтетический media snapshot и результат остаются в ignored `.generated/recovery/<hex>` с ограниченными правами; временные БД/Redis удаляются в finally. Не удаляйте эти артефакты без необходимости для повторного PITR drill.

`test:pitr` берёт последний успешный **собственный синтетический** dump. В отдельных PostgreSQL 17.6 контейнерах включает WAL archive, делает физический pg_basebackup, фиксирует target time и после него создаёт mock refund/маркер. Восстанавливает базу из physical backup + WAL до target, проверяет наличие события до и отсутствие после target, прежний paid заказ, readiness и replay без финансового эффекта. Контейнеры и WAL/data volumes удаляются. Результат — `.generated/pitr/<hex>/result.json`. Это проверка PostgreSQL; recovery object storage требует отдельной согласованной стратегии.

Локальные logical/media restore, физический Redis outage и WAL/PITR выполнены успешно. Локальное время recovery одного PITR-прогона — 1,5 с; оно **не** является обещанием RTO. Не настроены offsite backup, автоматическое расписание, шифрование/ключи и алерты, реальный merchant reconciliation и приёмка production RPO/RTO. A23 частично проверен, не закрыт целиком.

Перед production утвердить retention и географию, независимое encrypted offsite хранилище, непрерывность WAL, immutable/versioned media, безопасный доступ к ключам и регулярный restore drill. При реальном восстановлении остановить запись/worker, восстановить БД и согласованный media snapshot в изолированной среде, проверить миграции/tenant binding/остатки/outbox, выполнить read-only сверку с фактическим провайдером и разбор расхождений. Не воспроизводить списания из очереди и не считать локальный paid доказательством внешнего платежа. Затем отдельно разрешить возобновление работы и проверить алерты.
