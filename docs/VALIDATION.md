# Проверки

Актуальные результаты реализации находятся в [progress](progress.md), соответствие приёмке — в [acceptance](acceptance.md). Старый starter отчёт (4 теста и отсутствие SDK/API) больше не описывает состояние checkout.

Обязательные команды из корня:

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm check
pnpm test:integration
pnpm build
pnpm test:admin
pnpm test:e2e
pnpm contracts:generate
pnpm audit --prod --audit-level=moderate
```

Flutter: `tools/flutter.sh pub get --enforce-lockfile`, `analyze`, `test` из apps/mobile с корректным относительным путём `../../tools/flutter.sh`. Полные headless Flutter/API/browser сценарии запускает `test:e2e`; это не запуск нативного приложения на устройстве.

Покрытие API измеряется из apps/api:

```sh
node --env-file-if-exists=../../.env --test --experimental-test-coverage --test-coverage-include='dist/**' test/unit/*.test.mjs test/http/*.test.mjs test/integration/*.test.mjs
```

Последний результат: 95,86% строк, 79,96% ветвей, 91,06% функций **загруженных** dist-модулей. Транспилированные decorators/helpers входят в метрики; незагруженные entrypoints main/worker не входят. Worker отдельно запускается нагрузочным прогоном/Compose. Это не утверждение 100% покрытия всех исходников.

`pnpm test:load` выполняет локальный 30-минутный профиль: 100 virtual clients, 20 catalog RPS, 20 orders/min. Для быстрого smoke: `pnpm test:load --seconds=15`; он не заменяет 1800 с. Результат в ignored `.generated/load`. Тесты restore/PITR: [recovery](recovery.md). Все runner создают свои временные БД и не сбрасывают пользовательскую.

Удалённый CI и проверки на финальном remote SHA должны быть подтверждены отдельно. Наличие workflow, успешный local build или native generation не означают успешную Android/iOS/Web release сборку.
