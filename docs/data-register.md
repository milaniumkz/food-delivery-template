# Данные и права пользователя

Это технический реестр текущего local/mock контура, не утверждённая юридическая политика. Владелец до production определяет основания/сроки хранения, обработчиков и географию, публикует документы и настраивает cleanup/backups. Маркетинговый provider и реестр согласий ещё не подключены.

| Хранилище | Данные / доступ | Удаление и ограничения |
|---|---|---|
| Customer, CustomerAddress | Телефон, имя/язык, до20 адресов/координат; сам пользователь, персонал по рабочей роли/филиалу | Профиль обезличивается, адреса удаляются |
| AuthSession | Односторонние hashes токенов, сроки/отзыв, session-bound privacy grant; только server | Все сессии отзываются. Hashes и псевдонимный audit требуют утверждённой retention policy |
| OtpChallenge / AuthThrottle | HMAC кода/телефона/IP и бюджеты; код3min/5попыток, purpose/session binding | Телефон/код очищаются при удалении; HMAC budget сохраняется для защиты от обхода лимитов. Регулярный TTL cleanup требует политики |
| IdempotencyRecord | Transient ответы оформления могут содержать адрес/комментарий; только server | Собственные cache records удаляются при account erasure; финансовые Order/Payment records сохраняются отдельно |
| Quote | Собственная корзина/адрес/комментарий и серверный расчёт5min | Input очищается при удалении; старые quotes не являются разрешением списать деньги |
| Order / items / payments / refunds / events | Неизменяемые товарные/финансовые snapshots, минимальные контакты во время исполнения | Активные/неуточнённые операции сначала завершаются. Адрес/комментарий/reasons очищаются; финансовые суммы сохраняются псевдонимно |
| CustomerRestriction / AuditLog | Ограничение новых покупок по филиалу, причина, actor/action/version | Не блокирует доступ к истории, профилю и privacy правам. Причины customer restrictions и соответствующие audit details очищаются при удалении |
| Notification / Outbox | Системные события без адреса/телефона; локальный provider | Customer notifications удаляются; outbox/financial events остаются без лишних PII |
| MediaAsset | Нормализованные WebP блюд без EXIF, scoped staff upload | Local storage; production object retention/S3/versioning и права на фото — отдельные gates |

## Защищённая выгрузка

В профиле Flutter доступна «Выгрузка моих данных»: запросить отдельный SMS → подтвердить → просматривать/копировать JSON страниц. API: `POST /v1/me/privacy/challenge`, `POST /v1/me/privacy/confirm`, `GET /v1/me/privacy/export?section=...&cursor=...`. Доступ5min связан с конкретной активной сессией. Код для privacy не подходит для login/deletion и наоборот; replay/другая сессия/истёкший grant запрещены. Ошибка кода422 `INVALID_PROOF` отделена от истёкшего access token401, чтобы клиент не ротировал сессию из-за неверного SMS.

Разделы: profile+addresses, orders+payment/refund snapshots, quotes, sessions **без hashes/tokens**, ограничения, уведомления. До10 записей/страницу,60 страниц/мин на субъекта, явный nextCursor; между страницами данные могут обновляться. Не подставляется customerId клиента — ownership берётся только из authenticated session. Секреты провайдера/сотрудников и внутренние credentials не выгружаются. Копирование JSON — явное действие пользователя; приложение не пишет выгрузку в логи/постоянный cache. При выходе/смене аккаунта экран очищается.

## Web-путь удаления

Next.js `/delete-account` доступен без установленного Flutter. Телефон → local SMS login → отдельный SMS для удаления → явное необратимое подтверждение. Между отправками действует серверный cooldown60s. Bearer хранится только в React memory, refresh token не передаётся браузеру; localStorage/cookie для этого пути не используются. Отдельный BFF `/account-api/...` имеет конечный allowlist, проверяет origin/body size/brand, не пересылает staff cookies и не допускает сторонний upstream. При активных заказах/неуточнённой оплате показывается отказ409, успех не имитируется.

Путь реализован и проверен в local environment; он ещё не опубликован на production HTTPS и не является подтверждением соответствия правилам магазинов. В test/dev настоящая SMS не отправляется. Результаты API/widget/browser проверок — progress.md.

Offline logout стирает локальные credentials и профиль даже при timeout. В таком случае UI явно не подтверждает server revocation и рекомендует завершить все сеансы после восстановления связи. Durable unknown-checkout key не стирается выходом: он привязан к аккаунту и нужен для исключения повторного оформления.
