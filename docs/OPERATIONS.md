# Подготовка отдельного клиента

1. Скопировать только публичный demo brand JSON в новый slug. Заменить название, цвета, ID, публичный API и логотип. Приватную клиентскую конфигурацию хранить вне публичного git.
2. `node tools/brand.mjs brands/demo/brand.json` проверяет JSON и формирует `.generated/demo/brand.json`. Сейчас это только генерация публичного JSON; native rename/icon pipeline ещё требуется реализовать.
3. Развернуть отдельные staging/prod сервер, БД, media, SMS/push и merchant configuration. Проверить TLS, домены, backups, политики и права.
4. Реализованный впоследствии release pipeline генерирует applicationId/bundleId, native display name, icon/splash; вставляет JSON в Flutter assets. Подписывать индивидуальными ключами из защищённого хранилища.
5. Проверить Android и iOS на физических устройствах, полный заказ и возврат в разрешённой тестовой среде, ошибки сети, RU/KK, push, deep links.
6. Подготовить store listing, privacy declarations, policy/support/account deletion URLs и скриншоты. Сверить действующие правила магазинов. Публикация требует отдельного поручения, аккаунтов и прохождения review.

Нет production deployment или публикации в магазинах в текущем starter. Не отправлять реальные адреса, телефоны и платежи через дизайн-прототип.
