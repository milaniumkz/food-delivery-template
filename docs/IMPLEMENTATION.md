# Порядок реализации для Codex

Каждый этап завершается рабочим сценарием, проверками и обновлением таблицы состояния README. Не переходить к live-платежам на основании наличия mock.

| Этап | Результат | Условие завершения |
|---|---|---|
| 0 · Foundation | Проверенные версии Flutter/Dart/Node, lockfiles, NestJS, Next.js, Postgres, CI, Docker dev | Чистый checkout запускается по инструкции; health и migration smoke проходят |
| 1 · Brand + UI | schema, генератор всех native identities/assets, Flutter UI, admin shell, RU/KK | Два тестовых бренда собираются из одного кода; визуальные/доступность проверки |
| 2 · Identity + Catalog | OTP adapter, sessions, роли, каталог, media, seed | Серверные права, лимиты, OpenAPI, integration tests |
| 3 · Checkout | zones/schedules, quote, promos, order snapshots, idempotency | Конкурентные запросы не дублируют заказ и не превышают capacity |
| 4 · Operations | Admin order queue, state transitions, push/outbox, история | Сквозной mock/cash заказ от приложения до delivered, reconnect корректен |
| 5 · Payments | Аудит исходника Kaspi, approved adapter, verification, reconciliation/refunds | Sandbox сценарии и доказательства, fail-closed startup, отдельный допуск live |
| 6 · Hardening | Load/security/accessibility, backup restore, metrics | SPEC §16, устранены критические замечания |
| 7 · Client release kit | Onboarding, signing environment, metadata, screenshots, staging build | Передача клиенту и ручное разрешение публикации; магазины не вызываются автоматически |

## Первый запрос к Codex
«Прочитай AGENTS.md и SPEC_RU.md. Реализуй только этап 0 в этом репозитории. Сохрани mock и fail-closed Kaspi. Зафиксируй версии, подними локальную БД, добавь миграцию и health/readiness, CI и воспроизводимую инструкцию. Проверь чистый запуск и сообщи, что остаётся незавершённым. Не меняй другие проекты и не запускай live платежи».

## Минимальный Definition of Done для PR
Воспроизводимые команды, тестируемый результат, миграции и rollback considerations при изменении данных, обновлённые контракты/документация, отсутствие секретов, точное описание проверок. Заглушка должна быть явно обозначена и не имитировать успешную реальную операцию.
