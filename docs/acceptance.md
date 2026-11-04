# Матрица приёмки SPEC

`Локально` означает воспроизведённый сценарий на synthetic данных с mock provider. `Частично` не считается полной production-приёмкой. Полные критерии остаются в SPEC_RU.md; таблица не сокращает объём обязательств.

| ID | Статус | Доказательство / остаётся |
|---|---|---|
| A01 | Локально | Flutter guest cart→OTP→server quote→mock→browser restaurant/courier→delivered; native device ещё не проверен |
| A02 | Локально | Flutter pickup без адреса→browser выдача по customer code→completed |
| A03 | Частично | min/max/required/active/duplicate/foreign modifier server tests и snapshots; отдельный graph несовместимости choices ещё не реализован |
| A04 | Локально | Изменение цены/stop-list/expiry требует нового quote и подтверждения |
| A05 | Локально | Конкурентный create, durable key/payload, by-key lookup, consumed quote recovery; один order/attempt |
| A06 | Локально | Параллельная последняя порция и общий stock разных вариантов |
| A07 | Частично | Повторный/параллельный mock result не создаёт финансовый эффект/outbox дубль; внешний callback и настоящая подпись blocked Kaspi |
| A08 | Частично | Несовпадающая сумма — manual_review; внешние непроверенные уведомления запрещены; настоящий merchant/signature contract не предоставлен |
| A09 | Частично | Durable pending на аккаунт, unknown-result recovery и lifecycle sync; реальный Kaspi deep link/native restart blocked |
| A10 | Локально/mock | Timeout/unknown не вызывает слепой повтор, retry требует определённого состояния; external reconciliation blocked |
| A11 | Локально/mock | Поздняя оплата возвращается/фиксируется без возрождения заказа |
| A12 | Локально | Cancel/accept гонка имеет один допустимый исход |
| A13 | Локально/mock | Reject paid order выполняет полный mock refund |
| A14 | Локально/mock | MFA/permission/idempotency; duplicate refund один |
| A15 | Локально | Customer/courier foreign ID privacy и server action guards |
| A16 | Локально | Manager чужого branch CRUD/report/customer restriction запрещён |
| A17 | Локально | Worker restart, удаление своих queue jobs, физический Redis stop/start; expiry продолжает работу и notifications dedup |
| A18 | Частично | Flutter polling/resume и monotonic version; реальный push provider ещё отсутствует |
| A19 | Частично | Ручной адрес/GPS disabled/finite bounds, safe network errors; полный offline cache, устройства и network chaos UI matrix не готовы |
| A20 | Частично | OTP deletion, session revoke, address/quote/order/restriction redaction, сохранённый SMS budget; утверждённая retention policy и public web deletion/export отсутствуют |
| A21 | Локально | Параллельный последний promo use, release при отмене |
| A22 | Частично | Второй brand API/admin/DB isolation и deterministic native generation; две полноценные installable сборки blocked |
| A23 | Частично | Logical+media restore, physical WAL/PITR, readiness/replay passed; real-provider reconciliation/offsite/RPO-RTO не приняты |
| A24 | Частично | Startup запрещает production/mock/Kaspi, validator запрещает demo production brand, limited secret scan passed; полный release/security gate и remote CI не приняты |

| ID | Статус | Доказательство / остаётся |
|---|---|---|
| D01 | Частично | Общие Material/admin controls/states; полный component catalog не подготовлен |
| D02 | Частично | Основные operational screens реализованы; полный design review и дополнительные SPEC screens не завершены |
| D03 | Локальный core | Полные pickup/delivery E2E без тупиков; детали всех error/accessibility flows требуют UX review |
| D04 | Частично | Flutter320px/KK/text1.8, map320px, browser1440/390 nooverflow; вся матрица320/360/390/430 и200%/планшеты не пройдена |
| D05 | Частично | Два контрастных theme/identity config, browser smoke и assets; полная визуальная приёмка обеих native сборок blocked |
| D06 | Не завершён | Есть ignored screenshots smoke; эталонные screenshots всех языков/брендов и стабильные visual regression baselines не подготовлены |
| D07 | Частично | Реальные axe/keyboard/labels scans login/menu/settings/customers/diagnostics; не все экраны/роли вручную проверены screen reader |
| D08 | Частично | Рабочие core actions и явно подписанный mock; нет выдуманного движения курьера. Не все обязательные SPEC actions реализованы |

## Остаток программной реализации

Кроме внешних интеграций остаются: каталог баннеров и структурированных атрибутов/несовместимости; ограниченный offline cache; смена телефона с reauthentication; полный адресный UX; документы/support/privacy preferences, consent versions, защищённый экспорт и публичный web deletion; courier issue flow; расширенный dashboard/фильтры; production object storage/push/adapters/наблюдаемость и полноценный release gate. Эти пункты — **незавершённая разработка**, не сетевые блокеры. Их нельзя объявлять готовыми на основании прошедшего основного заказа.

Перед выпуском требуется закрыть весь перечень, затем повторить проверки на конкретном SHA, подтвердить внешние sandbox/устройства и бизнес-параметры. Запрос «делай полностью» не даёт разрешения выдумывать договоры/доступы или включать реальные деньги/магазины.
