import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:food_delivery_api/food_delivery_api.dart' as api;
import '../main.dart';
import 'screens.dart' show PageFrame, gap;

class PrivacyScreen extends ConsumerStatefulWidget {
  const PrivacyScreen({super.key});
  @override
  ConsumerState<PrivacyScreen> createState() => _PrivacyState();
}

class _PrivacyState extends ConsumerState<PrivacyScreen> {
  final code = TextEditingController();
  String? challenge;
  bool verified = false;
  String section = 'profile';
  api.PrivacyExportPage? page;
  @override
  void dispose() {
    code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final shop = ref.watch(shopProvider);
    final sections = {
      'profile': shop.text('Профиль и адреса', 'Профиль және мекенжайлар'),
      'orders': shop.text('Заказы', 'Тапсырыстар'),
      'quotes': shop.text('Расчёты корзины', 'Себет есептері'),
      'sessions': shop.text('Сессии без токенов', 'Токенсіз сессиялар'),
      'restrictions': shop.text('Ограничения заказов', 'Тапсырыс шектеулері'),
      'notifications': shop.text(
        'Системные уведомления',
        'Жүйелік хабарламалар',
      ),
    };
    return PageFrame(
      title: shop.text('Выгрузка моих данных', 'Деректерімді шығару'),
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            shop.text(
              'Доступ открывается на 5 минут после отдельного SMS-подтверждения. Между SMS-запросами нужно подождать минуту. Выгрузка содержит персональные данные; сохраняйте её в безопасном месте.',
              'Бөлек SMS растаудан кейін қолжетімділік 5 минутқа ашылады. SMS сұрауларының арасында бір минут күтіңіз. Шығарылымда жеке деректер бар; оны қауіпсіз жерде сақтаңыз.',
            ),
          ),
          if (shop.customer == null)
            Text(
              shop.text(
                'Сначала войдите в аккаунт',
                'Алдымен аккаунтқа кіріңіз',
              ),
            )
          else ...[
            if (!verified) ...[
              OutlinedButton(
                onPressed: shop.busy
                    ? null
                    : () => shop.run(() async {
                        final result = await shop.api.privacyChallenge(
                          const api.EmptyRequest(),
                        );
                        if (!mounted) return;
                        challenge = result.challengeId;
                        code.clear();
                      }),
                child: Text(
                  shop.text('Получить код для выгрузки', 'Шығару кодын алу'),
                ),
              ),
              if (challenge != null) ...[
                Text(
                  shop.text(
                    'Тестовая SMS доступна оператору локальной среды.',
                    'Тестілік SMS жергілікті орта операторына қолжетімді.',
                  ),
                ),
                TextField(
                  controller: code,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  autofillHints: const [AutofillHints.oneTimeCode],
                  decoration: InputDecoration(
                    labelText: shop.text('Код SMS', 'SMS коды'),
                  ),
                ),
                FilledButton(
                  onPressed: shop.busy
                      ? null
                      : () => shop.run(() async {
                          await shop.api.privacyConfirm(
                            api.OtpVerifyRequest(
                              challengeId: challenge!,
                              code: code.text.trim(),
                            ),
                          );
                          if (!mounted) return;
                          verified = true;
                          code.clear();
                          page = await shop.api.privacyExport(section: section);
                        }),
                  child: Text(
                    shop.text('Подтвердить выгрузку', 'Шығаруды растау'),
                  ),
                ),
              ],
            ] else ...[
              DropdownButtonFormField<String>(
                initialValue: section,
                isExpanded: true,
                decoration: InputDecoration(
                  labelText: shop.text('Раздел данных', 'Деректер бөлімі'),
                ),
                items: sections.entries
                    .map(
                      (e) =>
                          DropdownMenuItem(value: e.key, child: Text(e.value)),
                    )
                    .toList(),
                onChanged: shop.busy
                    ? null
                    : (value) => shop.run(() async {
                        section = value!;
                        page = null;
                        page = await shop.api.privacyExport(section: section);
                      }),
              ),
              gap(),
              if (page != null) ...[
                Text(
                  shop.text(
                    'Данные выдаются страницами до 10 записей.',
                    'Деректер 10 жазбаға дейінгі беттермен беріледі.',
                  ),
                ),
                OutlinedButton(
                  onPressed: () => Clipboard.setData(
                    ClipboardData(
                      text: const JsonEncoder.withIndent(
                        '  ',
                      ).convert(page!.toJson()),
                    ),
                  ),
                  child: Text(
                    shop.text(
                      'Копировать JSON страницы',
                      'Бет JSON деректерін көшіру',
                    ),
                  ),
                ),
                SelectableText(
                  const JsonEncoder.withIndent('  ').convert(page!.toJson()),
                ),
                if (page!.nextCursor != null)
                  FilledButton(
                    onPressed: shop.busy
                        ? null
                        : () => shop.run(() async {
                            page = await shop.api.privacyExport(
                              section: section,
                              cursor: page!.nextCursor,
                            );
                          }),
                    child: Text(shop.text('Следующая страница', 'Келесі бет')),
                  ),
              ],
              OutlinedButton(
                onPressed: () => setState(() {
                  verified = false;
                  page = null;
                  challenge = null;
                }),
                child: Text(shop.text('Закрыть выгрузку', 'Шығаруды жабу')),
              ),
            ],
          ],
        ],
      ),
    );
  }
}
