# Передача и подготовка клиента

Рабочий локальный запуск: [local-development](local-development.md). Настройка идентичности: [branding](branding.md). Состояние этапов и проверок: [progress](progress.md). Реальные Kaspi/production/store publishing отключены.

1. Создать публичный конфиг нового slug с уникальными Android/iOS IDs, HTTPS API, своим разрешённым логотипом и контрастной темой. Не переносить private проекты, историю или секреты. Запустить validator и native generator.
2. Подготовить отдельные БД, Redis, media, домены/TLS, реальный SMS и push, merchant contract и secret storage. Зафиксировать миграции, retention, backup/PITR, monitoring и владельцев алертов.
3. Утвердить privacy/terms/cancellation, web account deletion, data export и обработчиков данных. Не выдавать starter текст за юридическое заключение.
4. Завершить все незакрытые пункты SPEC из progress/acceptance. Прогнать CI на конкретном SHA, полный сценарий доставки и самовывоза, сбои, разрешённый payment sandbox и restore drill. Для performance нужны утверждённые характеристики стенда.
5. На macOS/Xcode собрать iOS и проверить реальные устройства; Android signing key хранить отдельно. Не выпускать template debug signing как production. Проверить permissions, secure storage, push, deep links, RU/KK, обе идентичности и стабильные visual snapshots.
6. Подготовить metadata, screenshots, privacy declarations, support и deletion URL, актуальные правила магазинов. Передать исходники, лицензии/SBOM, OpenAPI и generated clients, runbooks, отчёт тестов и инструкции смены бренда. Передача секретов — только по защищённому каналу.
7. Deployment/live payments/store publication требуют отдельного поручения; в рамках текущей работы их не выполняли.

## Контейнерный demo стенд

```sh
make bootstrap
# В управляемой облачной среде передайте публичный CA через BuildKit secret:
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -t food-delivery-template:demo .
docker compose --env-file .env -f infra/compose/compose.yaml -f infra/compose/apps.yaml up -d --wait
```

За пределами managed proxy `docker build -t food-delivery-template:demo .` использует обычное TLS trust. Не копируйте session CA/credentials в образ и не отключайте TLS. Образ содержит инструменты миграции/проверок для локальной разработки; он не оптимизирован и не допущен как production image.

Compose запускает одноразовый migration/seed job, затем API/admin/worker. API и admin опубликованы только на loopback 3001/3000, данные PostgreSQL/Redis/media/SMS сохраняются в именованных volumes. AUTH_KEY и DB пароль берутся из ignored `.env` во время запуска. Идентичность demo закреплена абсолютным BRAND_CONFIG; для клиента нужен отдельный override, БД и volumes. Не запускайте одновременно host `pnpm dev` на тех же портах.

Проверки: `/v1/health/ready` и каталог — HTTP200, admin root — HTTP200; в «Система» отдельно видна свежесть expiry/notification heartbeat. Bootstrap владельца выполняется только один раз; существующий владелец host/Compose использует ту же БД и ключ. `docker compose ... stop api admin worker` останавливает только приложения. Не используйте `down -v` для обычного перезапуска.

### Проверка контейнерного образа

После сборки `food-delivery-template:demo` выполните `pnpm test:containers` из корня. Проверка закрепляет локальный image ID, создаёт отдельную временную БД и свежие SMS/media volumes, проверяет non-root/private directory, OTP, MFA, нормализацию фото и mock payment/refund, затем удаляет только свои ресурсы. Требуется локальный PostgreSQL; секреты не печатаются.

Образ заранее создаёт `/app/.local/sms` с владельцем uid1000 и mode0700. Уже существующий том от более старого образа может сохранить root ownership: перед обновлением проверьте metadata и исправьте владельца каталога на uid1000 и mode0700 административным доступом к этому конкретному local volume. Не удаляйте том и не выводите его содержимое.
