# Настройка бренда

Публичная конфигурация `brands/<id>/brand.json` проходит JSON Schema v1 и общий валидатор `@food/config`. В ней находятся имя, applicationId, API URL, логотип, RU/KK, defaultLocale, IANA zone и цвета. Неизвестные поля, credentials в URL, выход logo за каталог (включая symlink), непереносимый applicationId и контраст ниже 4.5:1 отклоняются. Секретам здесь места нет.

```sh
node tools/brand.mjs brands/demo/brand.json --dry-run
node tools/mobile-brand.mjs brands/demo/brand.json --apply
# Альтернативная идентичность; бизнес-код не меняется:
node tools/mobile-brand.mjs brands/demo-alt/brand.json --apply
# Вернуть основной бренд:
node tools/mobile-brand.mjs brands/demo/brand.json --apply
```

Без `--apply` native generator записывает только ignored `.generated/<id>/mobile`; `--dry-run` не пишет ничего. Генератор создаёт 48 файлов: публичный JSON и logo, растровый Flutter logo, Android namespace/applicationId/activity/label/icons/splash, iOS bundleId/name/icons/splash, Web manifest/title/icons. Он сохраняет остальную native конфигурацию и не создаёт ключи подписания. Повторная генерация детерминирована; тест сравнивает оба бренда и неизменность mobile после dry-run.

Flutter читает тему и название из assets, язык сохраняет в brand namespace; API и админка читают `BRAND_CONFIG`. Путь относительно cwd соответствующего сервиса; абсолютный путь удобнее в контейнере. Каждый бренд использует отдельную БД. API проверяет brand binding БД; Flutter и BFF проверяют `/v1/bootstrap` перед передачей сессии. Публичный bootstrap объявляет локальный ordering/mock, без секретов.

HTTP и PostgreSQL проверки второго бренда выполнены. Полные Web/APK сборки blocked загрузкой Flutter artifacts с storage.googleapis.com; iOS archive требует macOS/Xcode. Нативная генерация и HTTP smoke не заменяют две установленные релизные сборки. Production gate также требует уникальных production IDs, HTTPS, реальных интеграций, юридических материалов, подписания, screenshots и store metadata. `--production` отклоняет demo-конфиги, но сам по себе не подтверждает эти gates.
