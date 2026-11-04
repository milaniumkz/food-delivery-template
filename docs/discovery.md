# Аудит · 2026-11-04

Проверены README, AGENTS.md, SPEC_RU.md, IMPLEMENTATION.md, KASPI.md, исходники и CI. Исходный HEAD: ab027ff476e7bd01eb2b182da19258612f787361. Рабочее дерево до изменений чистое.

Существуют: четыре Node-теста PaymentProvider, fail-closed Kaspi, публичный brand generator, Flutter starter без native runners, статический HTML-прототип. HTTP API, БД, auth, Next.js и worker отсутствовали. Прототип не является приложением.

Доступен только checkout food-delivery-template; подтверждённого исходного проекта Kaspi и документации провайдера нет. Kaspi BLOCKED; не переносить закрытые материалы и не изобретать API. Не требуется для локального mock-сценария.

Среда: Linux, Node 24.22.1, Python 3.12.14, Docker 29.9.2, pnpm 11.25.0. Flutter отсутствует; запрос официального releases_linux.json на storage.googleapis.com возвращает CONNECT 403 сетевой политики. Android SDK/Xcode пока не подтверждены. Реальные SMS/push, merchant account, хостинг и лицензия владельца — отдельные release gates.

Персональные данные и секреты не нужны для тестовых данных. Локальные сгенерированные credentials хранить только в ignored .env. Не назначать лицензию от имени владельца.
