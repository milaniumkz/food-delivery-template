# Техническое задание · White-label доставка еды
Версия 1.0 · 04.11.2026 · Язык требований: русский. Статус: спецификация будущей реализации.

## 1. Цель и границы
Создать повторно используемый продукт для ресторанов и небольших сетей Казахстана: клиентское iOS/Android приложение, сервер, административная веб-панель. Новый клиент получает собственное название, логотип, палитру, приложение в магазинах, домен и изолированную базу без форка бизнес-кода. Базовая модель: один бренд и несколько филиалов на отдельное окружение. Маркетплейс независимых ресторанов, расчёты между продавцами, агрегатор курьеров и курьерское мобильное приложение вне первой версии.

«Готов к продаже» означает: все критерии раздела 16 выполнены, live-провайдер и уведомления проверены, резервная копия восстановлена, магазины приняли приложение. Наличие исходников или демо этого не означает.

## 2. Архитектура и выбор технологий
- Flutter/Dart: единая кодовая база iOS/Android, Material 3 с собственной дизайн-системой, Riverpod для состояния, go_router для маршрутов, Dio для HTTP. Secure storage для refresh token; access token в памяти. Версии зафиксировать после проверки совместимости в этапе 0.
- NestJS/TypeScript: модульный монолит REST `/v1`, OpenAPI, DTO-валидация, PostgreSQL как источник истины, Prisma с миграциями. Фоновые workers и Redis/BullMQ для повторов и доставки уведомлений. Платёжные операции сохраняются в БД, не только в Redis.
- Next.js/TypeScript: отдельная responsive admin web, сессионные cookies HttpOnly/Secure/SameSite, защита CSRF; не хранить административные токены в localStorage.
- S3-совместимое хранилище изображений, TLS reverse proxy, контейнерная сборка сервера, управляемая БД или отдельный PostgreSQL. FCM/APNs через адаптер push, SMS-провайдер через адаптер OTP.
- Монорепозиторий: apps/mobile, apps/api, apps/admin, packages/contracts, brands, infra, tools, docs, design. Общие API-контракты генерировать в Dart/TypeScript из OpenAPI; не делить бизнес-классы между языками.

Изоляция по окружениям дороже общей SaaS БД, но позволяет передавать приложение клиенту и снижает риск смешивания заказов. Настоящая multi-tenancy со shared DB — отдельное изменение архитектуры.

## 3. Роли и доступ
Гость: меню, адресная зона, корзина. Покупатель: собственные адреса, заказы, профиль. Оператор: заказы своего филиала и статусы. Менеджер: каталог, расписание, промокоды, зоны, отчёты. Владелец: пользователи панели, настройки и экспорт. Сервисный worker: только назначенные технические действия. Роли и филиальные ограничения проверять на сервере для каждого объекта, включая media/export. Audit log всех изменений цен, статусов, доступов и возвратов. Администраторам MFA, ограничение сессий и отзыв доступа.

## 4. Клиентское приложение
### 4.1 Первый запуск и авторизация
RU/KK, выбор языка; адрес/пин вручную без обязательного разрешения геолокации. Вход по телефону Казахстана в E.164 и одноразовому SMS коду. Просмотр без регистрации. Перед оформлением — подтверждённый номер. OTP TTL 5 минут, не более 5 попыток проверки, resend cooldown 60 секунд; серверные лимиты на телефон/IP/устройство, защита от стоимости SMS abuse. Конкретные лимиты вынести в настройки сервера. Не раскрывать наличие аккаунта. Политика конфиденциальности, согласие с условиями, отдельное необязательное маркетинговое согласие с датой/версией.
### 4.2 Каталог
Адрес и доступный филиал сверху; время доставки, состояние «закрыто», категории, поиск, карточка блюда с ценой и фотографией. Детали: состав, масса, аллергены, доступность, варианты размера, обязательные/необязательные модификаторы с min/max, цена дополнений. Избранное. Sold out нельзя заказать; изменения цены/доступности подтверждаются в корзине. Offline допускает кеш просмотра с явной отметкой, оформление требует сети.
### 4.3 Корзина и расчёт
Один филиал на корзину. При смене филиала запросить подтверждение очистки. Строка включает выбранные модификаторы, количество, snapshot названия/цены после заказа. Минимальный заказ, доставка, бесплатный порог, промокод, итог в KZT. Сервер рассчитывает quote; клиент отправляет product/variant/modifier IDs и quantity, никогда доверенную цену. Quote TTL 5 минут; при устаревании вернуть новый расчёт и потребовать подтверждение. Лимиты quantity 1–99, не более 100 строк.
### 4.4 Checkout
Доставка/самовывоз, адрес, подъезд/этаж/квартира/комментарий, контакт, «как можно скорее» или доступный слот, приборы, промокод и способ оплаты. Карта не единственный способ адресации. Сервер проверяет полигон зоны, филиал, расписание/праздники, ёмкость слота, минимальную сумму. Оплата mock только в demo, наличные при включённой настройке, Kaspi только после допуска. Без карточных данных в собственном backend.
### 4.5 Заказы и профиль
Экран подтверждения с номером; таймлайн статусов, состав, сумма, адрес, поддержка, отмена по правилам. Повтор заказа пересоздаёт корзину по текущим ценам и показывает недоступные позиции. История, адреса, язык, согласия, запрос удаления аккаунта и выгрузки данных. Push обновляет интерфейс после запроса сервера, а не самостоятельно меняет платёжный статус. Deep link только к авторизованному собственному заказу. Live GPS курьера — будущий этап; не показывать фиктивное движение.

## 5. Административная панель
Responsive desktop-first: обзор, рабочая очередь заказов (таблица/канбан), карточка заказа с разрешёнными переходами, фильтры по дате/статусу/филиалу, поиск по номеру. Обновление через SSE с polling fallback; после reconnect полная синхронизация. Конфликт изменений — optimistic locking/version и 409.
Каталог: категории, блюда, варианты/модификаторы, фото, состав/аллергены, RU/KK переводы, стоп-лист по филиалу, сортировка. Филиалы: адрес, зоны на карте, стоимость/порог, график/исключения, время приготовления, слоты, контакты. Промокоды: срок, лимиты общего/персонального использования, минимум, максимум скидки, совместимость, филиалы, атомарное списание лимитов. Клиенты: минимально нужные данные и блокировка злоупотреблений; экспорт только разрешённой роли и с аудитом. Отчёты по заказам/оплаченным суммам/отменам и возвратам, CSV; не считать созданный платёж выручкой.
Настройки бренда не содержат секретов. Возврат — отдельное подтверждаемое действие с причиной, правом и аудитом; без ручного перевода order.payment_status в paid.

## 6. Жизненный цикл заказа
Состояния: awaiting_payment → placed → accepted → preparing → ready → out_for_delivery → delivered. Для pickup: ready → delivered. awaiting_payment → expired/cancelled; placed → rejected/cancelled; accepted/preparing → cancelled только по праву менеджера и с разрешением по оплате. Финальные состояния не меняются обычным оператором. Таблица переходов и событие сохраняются атомарно с version; невозможный переход даёт 409. Каждый переход имеет actor, time, reason. Отмена клиентом разрешена до accepted; после — обращение в поддержку. Кухня получает заказ только после подтверждения оплаты, либо placed с cash-on-delivery.

Платёж имеет независимые состояния pending, paid, failed, cancelled, refund_pending, partially_refunded, refunded, reconciliation_required. Несколько попыток оплаты допустимы, успешный capture один на заказ; поздняя вторая успешная оплата требует сверки/возврата. Поздняя оплата expired заказа не отправляет его автоматически на кухню. Повторные callback не создают новый заказ/уведомление.

## 7. Оплата и Kaspi
Единый PaymentProvider: createPayment, getPayment, verifyNotification, refund. Вход: orderId, amountMinor, currency, idempotencyKey; выход: providerPaymentId, status, при подтверждённом API — checkout URL/QR, expiresAt. Верифицированное уведомление — нормализованное событие с eventId/paymentId/amount/currency/status/occurredAt. Не предполагать, что конкретный Kaspi продукт поддерживает callback/refund: сверить договор и документацию. Если callback нет, разрешённый polling со сверкой server-to-server. Возврат в браузер или screenshot чека не подтверждает оплату.
Точный маршрут, подпись, сертификат и статусы Kaspi определяются только после проверки существующего проекта. Реальные секреты в server secret manager, отдельно на клиента и среду; на устройстве только публичные идентификаторы. Проверять raw body до JSON parsing, если того требует схема подписи; replay window и уникальность событий. Не принимать произвольные URL провайдера от клиента (SSRF). Автоматическая ежедневная сверка и очередь расхождений обязательны. Mock не должен запускаться в production: startup validation.

## 8. Модель данных
UUID primary keys, UTC timestamps, FK и индексы, money bigint minor units с контролем безопасной сериализации.
- BrandSettings(id, publicConfigVersion, locales, legalLinks); Branch(id, name, address, timezone, active).
- User(id, phoneUnique, status, deletedAt); RefreshSession(userId, tokenHash, expiresAt, revokedAt); Consent(userId, type, version, acceptedAt).
- AdminUser и AdminRole/BranchScope; Address(userId, formatted, lat, lng, details).
- Category(sort, translatedName); Product(categoryId, nameI18n, descriptionI18n, allergens, imageKey); Variant(productId, priceMinor); ModifierGroup(min,max,required); Modifier(priceMinor); BranchAvailability.
- DeliveryZone(branchId, polygon, feeMinor, freeFromMinor); Schedule и ScheduleException; Slot(capacity, reservedCount).
- CartQuote(userId, branchId, lines, totals, expiresAt, catalogVersion).
- Order(userId, branchId, fulfilment, status, paymentStatus, totals, currency, addressSnapshot, contactSnapshot, version, idempotencyKey); OrderItem с immutable snapshot; OrderStatusEvent.
- PaymentAttempt(orderId, provider, providerPaymentIdUnique, amountMinor, currency, status, idempotencyKeyUnique); PaymentEvent(provider,eventIdUnique,payloadHash,processedAt); Refund(paymentId,amountMinor,status,idempotencyKeyUnique).
- Promo и PromoRedemption с constraints; OutboxEvent(type,aggregateId,payload,attempts,nextAttemptAt); NotificationDelivery; AuditLog(actorId,action,targetId,redactedDiff).
Индексировать order(userId,createdAt), order(branchId,status,createdAt), outbox(nextAttemptAt), payment(providerPaymentId). Order/Payment snapshots не пересчитывать по текущему каталогу. Retention и удаление сверить с применимыми обязательствами; физическое удаление профиля не должно уничтожать обязательный финансовый учёт.

## 9. API и транзакции
REST JSON UTF-8, /v1, HTTPS, Bearer для mobile; admin отдельная cookie session. Pagination cursor+limit максимум 100. Ошибки: code,message,requestId,details без stacktrace. 400 validation, 401 authentication, 403 permission, 404 absent/not-owned, 409 state/price conflict, 422 unavailable, 429 rate limit, 503 provider unavailable.
Маршруты: GET /public/brand, /branches, /catalog; POST /auth/otp/request, /verify, /refresh, /logout; GET/PATCH/DELETE /me; CRUD /me/addresses; POST /checkout/quote; POST /orders (Idempotency-Key); GET /orders и /orders/:id; POST /orders/:id/cancel; POST /orders/:id/payment-attempts; GET /payment-attempts/:id; POST /payments/:provider/notifications только с provider authentication. Admin: /admin/orders, /:id/transitions, /catalog/*, /branches/*, /promos, /users, /reports, /refunds.
Заказ: quote+user+idempotency key проверяются в транзакции, фиксируются snapshots/резервы и outbox; платёжный API вне долгой DB-транзакции с устойчивым retry. Unique(userId,idempotencyKey) и request hash; повтор идентичного запроса возвращает прежний результат, иной payload — 409. Промокод/slot capacity защищены от гонок блокировками/условными update. Webhook persist+state transition+outbox в одной транзакции; 2xx только после durable приёма. Transactional outbox: таблица событий рядом с заказом, worker повторяет доставку безопасно после сбоя.
Файл openapi.yaml сейчас описывает только starter health contract; полный контракт генерируется на этапе 2 и является обязательным deliverable.

## 10. Безопасность
RBAC+object ownership, prepared queries, строгие DTO и size limits, rate limits, CSRF для cookie mutations, CORS allowlist, CSP admin. OTP/tokens только hash в БД, refresh rotation/reuse detection, секреты не логировать. Upload: MIME/magic byte validation, image decode/re-encode, max 10MB и max dimensions, signed URLs, запрет SVG из недоверенного источника и публичного ACL персональных файлов. Admin audit append-only, least privilege DB users. Зависимости/контейнеры сканировать, критические уязвимости устранять до release. Публичный git без production .env, signing keys, push service accounts, дампов БД, телефонов/адресов и приватных копий интеграции.

## 11. Нефункциональные требования
Цель первой версии: 100 одновременных пользователей, 20 заказов/мин, каталог до 5000 позиций. На согласованном staging при 100 concurrent p95 read API <500ms, create order <1500ms без времени внешнего провайдера, error rate <1%; отчёт load test обязателен. План доступности 99.5%/месяц измеряется мониторингом, не обещается starter. UI 60fps на средних устройствах, отзывчивость корзины без сети, loading/empty/error/retry на каждом экране. WCAG 2.2 AA как цель: контраст 4.5:1 обычного текста, 3:1 крупного/контролов, touch ≥48dp, screen reader semantics, 200% text scaling, статус не только цветом. iOS/Android минимальные версии определить по выбранному Flutter и аудитории в этапе 0. RU/KK без обрезки длинных строк, кириллический шрифт.

## 12. White-label и сборки
`brands/<slug>/brand.json`: публичные название, applicationId, палитра, API URL, локали, ссылки поддержки; assets logo/icon/splash. JSON schema и runtime validation; запрет неизвестных полей и секретов. Production API URL обязателен, placeholder *.invalid запрещён для release. В текущем demo это намеренный placeholder.
Один native bundle ID на клиента, отдельные signing profiles, push project и store listing. Название/цвета/logo меняются конфигурацией, затем генерируются Flutter assets/theme и native icons/splash/display names; binary rebuild обязателен для bundle identity и иконки. Runtime public config может менять доступные настройки только в рамках совместимой версии, не executable code. Скрипт onboarding проверяет активы, домены, контраст и package IDs; показывает diff. CI matrix brand+platform, отдельные secrets environments и ручной release gate. CI не хранит signing files в git. Не клонировать клиентские настройки в публичные примеры.

## 13. Эксплуатация
dev/staging/prod раздельно; миграции forward-safe, backup перед рискованными изменениями. Health/liveness без секретов, readiness проверяет БД и критические зависимости. Correlation ID, JSON logs, metrics order/payment failures, webhook lag, outbox backlog, SMS abuse. Error tracking с PII scrubbing. Ежедневный backup БД и WAL/PITR при выбранном хостинге; цель RPO 1 час и RTO 4 часа после практического restore drill. Оповещения дежурному и runbooks: провайдер недоступен, оплаты не совпадают, очередь зависла, истёк сертификат. Release: staging → smoke → backup/migration → rollout → monitor → rollback app image; несовместимую миграцию откатывать по отдельному плану. Расходы облака, SMS, карты, store accounts и Kaspi оплачиваются отдельно.

## 14. Тестирование
Unit: money/rounding, modifier constraints, promo boundaries, schedule timezone, state machine, idempotency hash. Integration PostgreSQL: concurrent orders, same key retries, duplicate/out-of-order events, rollback, scoped access, refunds sum≤paid. Contract: OpenAPI vs handlers and generated clients. E2E: guest→OTP→menu→cart→quote→order→mock payment→operator→delivery; cash/pickup, closed branch, outside zone, unavailable product, network retry, payment timeout+late success, account deletion. Mobile на Android+iOS, lifecycle/resume/deeplink/push, RU/KK/text scale/accessibility. Security: IDOR across users/branches, unverified webhook, OTP throttling, CSRF, upload payloads. Production Kaspi только после безопасных sandbox/provider-approved тестов и отдельного допуска владельца.

## 15. Неопределённости и допущения
Не найден предоставленный исходник Kaspi: точный продукт, repository/path, договор, webhook/refund возможности и права повторного использования пока не подтверждены. Для завершения нужны ссылка/доступ к исходнику и документация провайдера. Базовая доставка собственными курьерами, назначение оператором; картографический и SMS-провайдер выбираются перед интеграцией. У клиента должны быть права на бренд, фотографии и юридические тексты. Магазины могут потребовать доказать самостоятельную ценность похожих приложений; автоматическое одобрение не гарантировать, актуальные правила проверять перед каждой публикацией.

## 16. Приёмка готового продукта
- Нового клиента можно сконфигурировать без правки экранов: имя, палитра, логотип, ID, API; тестовая Android/iOS сборка показывает нужный бренд; чек-лист смены бренда воспроизводим.
- Полный заказ проходит с сохранением в PostgreSQL, виден оператору и клиенту, все статусы и permissions корректны.
- Двойной клик и повтор запроса не удваивают заказ, списание или промокод; тесты гонок приложены.
- Оплата подтверждается только провайдером, суммы проверяются, потерянные уведомления сверяются, отказ/поздняя оплата/возврат обработаны.
- Admin защищена, роли ограничены филиалами, аудит и выгрузка работают.
- RU/KK, ошибки сети, недоступность кухни, зоны и расписания протестированы.
- CI lint/types/unit/integration/E2E зелёный; Flutter analyze/test и обе release-сборки проходят; результаты зафиксированы.
- Backup восстановлен на чистом staging; мониторинг и оповещения проверены.
- Секретов в исходниках/истории нет; критических уязвимостей нет; юридические документы и store metadata заполнены.
- Передача включает исходники, инструкции, переменные окружения без значений, схемы, runbooks и доступы через защищённый канал. Публикация магазина — отдельный шаг по поручению.

## 17. Термины
White-label — один продукт под разными брендами. Monorepo — общий репозиторий нескольких приложений. Adapter — слой, отделяющий конкретного провайдера от заказа. Idempotency — повтор запроса даёт тот же результат без второго списания. Webhook — уведомление от сервиса серверу. RBAC — права по ролям. DTO — проверяемая структура входящих данных. Snapshot — сохранённая копия данных на момент заказа. Outbox — надёжная очередь событий в той же БД. RPO — допустимая потеря данных по времени; RTO — целевое время восстановления. p95 — время, быстрее которого выполнены 95% запросов. CI — автоматические проверки изменений. E2E — проверка полного пользовательского сценария.
