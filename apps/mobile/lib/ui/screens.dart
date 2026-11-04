import 'package:url_launcher/url_launcher.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:food_delivery_api/food_delivery_api.dart' as api;
import '../main.dart';
import 'delivery_map.dart';
import 'order_labels.dart';
import 'package:latlong2/latlong.dart';
import '../data/shop.dart';

class PageFrame extends ConsumerWidget {
  final String title;
  final Widget child;
  final Widget? footer;
  const PageFrame({
    super.key,
    required this.title,
    required this.child,
    this.footer,
  });
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shop = ref.watch(shopProvider);
    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        actions: [
          PopupMenuButton<String>(
            tooltip: shop.text('Язык', 'Тіл'),
            onSelected: (value) => shop.run(() => shop.changeLocale(value)),
            itemBuilder: (_) =>
                [
                      PopupMenuItem(value: 'ru', child: Text('Русский')),
                      PopupMenuItem(value: 'kk', child: Text('Қазақша')),
                    ]
                    .where((item) => shop.enabledLocales.contains(item.value))
                    .toList(),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (shop.busy) const LinearProgressIndicator(),
            if (shop.error != null)
              MaterialBanner(
                content: Text(shop.error!),
                actions: [
                  TextButton(
                    onPressed: () => shop.run(() async {}),
                    child: Text(shop.text('Закрыть', 'Жабу')),
                  ),
                ],
              ),
            if (shop.notice != null)
              MaterialBanner(
                content: Text(shop.notice!),
                actions: [
                  TextButton(
                    onPressed: () => shop.run(() async {}),
                    child: Text(shop.text('Закрыть', 'Жабу')),
                  ),
                ],
              ),
            Expanded(
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 720),
                  child: child,
                ),
              ),
            ),
            if (footer != null)
              Padding(
                padding: const EdgeInsets.all(12),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 720),
                    child: SizedBox(width: double.infinity, child: footer),
                  ),
                ),
              ),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: GoRouterState.of(context).uri.path.startsWith('/orders')
            ? 1
            : GoRouterState.of(context).uri.path == '/profile'
            ? 2
            : 0,
        onDestinationSelected: (i) =>
            context.go(['/', '/orders', '/profile'][i]),
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.restaurant_menu),
            label: shop.text('Меню', 'Мәзір'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.receipt_long),
            label: shop.text('Заказы', 'Тапсырыстар'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.person_outline),
            label: shop.text('Профиль', 'Профиль'),
          ),
        ],
      ),
    );
  }
}

Widget gap() => const SizedBox(height: 16);
Future<bool> confirm(BuildContext context, String message) async =>
    await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('←'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Icon(Icons.check, semanticLabel: 'OK'),
          ),
        ],
      ),
    ) ??
    false;

class MenuScreen extends ConsumerStatefulWidget {
  const MenuScreen({super.key});
  @override
  ConsumerState<MenuScreen> createState() => _MenuState();
}

class _MenuState extends ConsumerState<MenuScreen> {
  String search = '';
  String? category;
  @override
  Widget build(BuildContext context) {
    final shop = ref.watch(shopProvider);
    final categories = <String, api.ProductCategory>{
      for (final p in shop.products)
        if (p.category != null) p.category!.id: p.category!,
    }.values.toList()..sort((a, b) => a.position.compareTo(b.position));
    final visible =
        shop.products
            .where(
              (p) =>
                  (category == null ||
                      !categories.any((c) => c.id == category) ||
                      p.category?.id == category) &&
                  p.name.toLowerCase().contains(search.trim().toLowerCase()),
            )
            .toList()
          ..sort(
            (a, b) => (a.category?.position ?? 2147483647).compareTo(
              b.category?.position ?? 2147483647,
            ),
          );
    return PageFrame(
      title: shop.brand['displayName'],
      footer: shop.itemCount == 0
          ? null
          : FilledButton.icon(
              onPressed: () => context.push("/cart"),
              icon: const Icon(Icons.shopping_bag_outlined),
              label: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text("${shop.text('Корзина', 'Себет')} · ${shop.itemCount}"),
                  Text(
                    "${shop.text('Товары примерно', 'Тауарлар шамамен')}: ${money(shop.estimatedItemsMinor)}",
                  ),
                ],
              ),
            ),
      child: RefreshIndicator(
        onRefresh: () => shop.initialize(),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (!shop.connected)
              FilledButton(
                onPressed: shop.busy ? null : shop.initialize,
                child: Text(shop.text('Подключиться', 'Қосылу')),
              ),
            if (shop.branches.isNotEmpty)
              DropdownButtonFormField<String>(
                initialValue: shop.branch?.id,
                isExpanded: true,
                decoration: InputDecoration(
                  labelText: shop.text('Филиал', 'Филиал'),
                ),
                items: shop.branches
                    .map(
                      (b) => DropdownMenuItem(
                        value: b.id,
                        child: Text(shop.locale == 'kk' ? b.nameKk : b.nameRu),
                      ),
                    )
                    .toList(),
                onChanged: shop.busy
                    ? null
                    : (id) async {
                        if (id == shop.branch?.id) return;
                        if (shop.cart.isNotEmpty &&
                            !await confirm(
                              context,
                              shop.text(
                                'Смена филиала очистит корзину. Продолжить?',
                                'Филиалды ауыстырсаңыз, себет тазартылады. Жалғастыру керек пе?',
                              ),
                            )) {
                          return;
                        }
                        await shop.run(
                          () => shop.selectBranch(
                            shop.branches.firstWhere((b) => b.id == id),
                          ),
                        );
                      },
              ),
            gap(),
            if (shop.branch != null)
              Text(
                shop.branch!.openNow
                    ? shop.text(
                        'Готовим примерно ${shop.branch!.preparationMinutes} мин',
                        'Дайындау шамамен ${shop.branch!.preparationMinutes} мин',
                      )
                    : shop.text(
                        'Филиал закрыт. Можно посмотреть меню.',
                        'Филиал жабық. Мәзірді көруге болады.',
                      ),
              ),
            gap(),
            if (shop.brand['logoAsset'] != null)
              Align(
                alignment: Alignment.centerLeft,
                child: Image.asset(
                  'assets/brand-logo.png',
                  width: 64,
                  height: 64,
                  semanticLabel: shop.brand['displayName'],
                ),
              ),
            TextField(
              decoration: InputDecoration(
                labelText: shop.text(
                  'Поиск по названию',
                  'Атауы бойынша іздеу',
                ),
                prefixIcon: const Icon(Icons.search),
              ),
              onChanged: (value) => setState(() => search = value),
            ),
            if (categories.isNotEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    ChoiceChip(
                      label: Text(shop.text('Все блюда', 'Барлық тағамдар')),
                      selected: category == null,
                      onSelected: (_) => setState(() => category = null),
                    ),
                    for (final item in categories)
                      ChoiceChip(
                        label: Text(item.name),
                        selected: category == item.id,
                        onSelected: (_) => setState(() => category = item.id),
                      ),
                  ],
                ),
              ),
            if (shop.connected && shop.products.isNotEmpty && visible.isEmpty)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(shop.text('Ничего не найдено', 'Ештеңе табылмады')),
              ),
            for (final product in visible)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (product.category != null)
                        Text(product.category!.name),
                      if (product.imageUrl != null)
                        ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: AspectRatio(
                            aspectRatio: 1.5,
                            child: Image.network(
                              '${Uri.parse(shop.dio.options.baseUrl).origin}${product.imageUrl}',
                              fit: BoxFit.cover,
                              errorBuilder: (context, error, stack) => Center(
                                child: Text(
                                  shop.text(
                                    'Фото недоступно',
                                    'Фото қолжетімсіз',
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      Text(
                        product.name,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      if (product.description.isNotEmpty)
                        Text(product.description),
                      gap(),
                      Wrap(
                        spacing: 16,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text(money(product.priceMinor)),
                          FilledButton.tonalIcon(
                            onPressed: shop.busy
                                ? null
                                : () async {
                                    Selection selection = const Selection();
                                    if ((product
                                                .configuration
                                                ?.variants
                                                .isNotEmpty ??
                                            false) ||
                                        (product
                                                .configuration
                                                ?.groups
                                                .isNotEmpty ??
                                            false)) {
                                      final chosen =
                                          await showDialog<Selection>(
                                            context: context,
                                            builder: (_) => OptionsDialog(
                                              product: product,
                                              shop: shop,
                                            ),
                                          );
                                      if (chosen == null) return;
                                      selection = chosen;
                                    }
                                    await shop.run(
                                      () => shop.addProduct(
                                        product.id,
                                        selection,
                                      ),
                                    );
                                  },
                            icon: const Icon(Icons.add),
                            label: Text(shop.text('В корзину', 'Себетке')),
                          ),
                          if (shop.quantityForProduct(product.id) > 0)
                            Text('× ${shop.quantityForProduct(product.id)}'),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            if (shop.connected && shop.products.isEmpty)
              Text(shop.text('Меню пока пустое', 'Мәзір әзірге бос')),
            gap(),
          ],
        ),
      ),
    );
  }
}

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginState();
}

class _LoginState extends ConsumerState<LoginScreen> {
  final phone = TextEditingController(), code = TextEditingController();
  String? challenge;
  DateTime? expires, retryAt;
  @override
  void dispose() {
    phone.dispose();
    code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final shop = ref.watch(shopProvider);
    return PageFrame(
      title: shop.text('Вход по телефону', 'Телефон арқылы кіру'),
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          TextField(
            controller: phone,
            keyboardType: TextInputType.phone,
            autofillHints: const [AutofillHints.telephoneNumber],
            decoration: InputDecoration(
              labelText: shop.text('Телефон +7…', 'Телефон +7…'),
            ),
          ),
          gap(),
          FilledButton(
            onPressed: shop.busy
                ? null
                : () => shop.run(() async {
                    if (retryAt != null && retryAt!.isAfter(DateTime.now())) {
                      throw StateError('Cooldown');
                    }
                    final result = await shop.api.requestOtp(
                      api.OtpRequest(phone: phone.text.trim()),
                    );
                    if (!mounted) return;
                    setState(() {
                      challenge = result.challengeId;
                      expires = DateTime.now().add(
                        Duration(seconds: result.expiresIn),
                      );
                      retryAt = DateTime.now().add(
                        Duration(seconds: result.retryAfter),
                      );
                    });
                  }),
            child: Text(shop.text('Получить код', 'Код алу')),
          ),
          if (challenge != null) ...[
            gap(),
            Text(
              shop.text(
                'Тестовая SMS: код доступен оператору в локальной среде. Реальная SMS не отправляется.',
                'Тестілік SMS: код оператордың жергілікті ортасында. Нақты SMS жіберілмейді.',
              ),
            ),
            gap(),
            TextField(
              controller: code,
              keyboardType: TextInputType.number,
              autofillHints: const [AutofillHints.oneTimeCode],
              maxLength: 6,
              decoration: InputDecoration(
                labelText: shop.text('Код из SMS', 'SMS коды'),
              ),
            ),
            gap(),
            FilledButton(
              onPressed: shop.busy
                  ? null
                  : () => shop.run(() async {
                      if (expires!.isBefore(DateTime.now())) {
                        throw StateError('Expired');
                      }
                      await shop.login(challenge!, code.text.trim());
                      if (context.mounted) context.pop();
                    }),
              child: Text(shop.text('Войти', 'Кіру')),
            ),
          ],
        ],
      ),
    );
  }
}

class CartScreen extends ConsumerStatefulWidget {
  const CartScreen({super.key});
  @override
  ConsumerState<CartScreen> createState() => _CartState();
}

class _CartState extends ConsumerState<CartScreen> {
  String fulfilment = 'pickup', payment = 'mock';
  final address = TextEditingController(),
      latitude = TextEditingController(),
      longitude = TextEditingController(),
      promo = TextEditingController(),
      comment = TextEditingController();
  @override
  void dispose() {
    for (final c in [address, latitude, longitude, promo, comment]) {
      c.dispose();
    }
    super.dispose();
  }

  void invalidate() {
    final shop = ref.read(shopProvider);
    if (shop.quote != null) {
      setState(() => shop.quote = null);
    }
  }

  Widget input(TextEditingController c, String label, {bool number = false}) =>
      Padding(
        padding: const EdgeInsets.only(top: 12),
        child: TextField(
          controller: c,
          onChanged: (_) => invalidate(),
          keyboardType: number
              ? const TextInputType.numberWithOptions(
                  decimal: true,
                  signed: true,
                )
              : TextInputType.text,
          decoration: InputDecoration(labelText: label),
        ),
      );
  @override
  Widget build(BuildContext context) {
    final shop = ref.watch(shopProvider);
    ref.listen(shopProvider.select((value) => value.customer?.id), (
      previous,
      next,
    ) {
      if (previous != null && previous != next) {
        for (final controller in [
          address,
          latitude,
          longitude,
          promo,
          comment,
        ]) {
          controller.clear();
        }
      }
    });
    return PageFrame(
      title: shop.text('Корзина и оформление', 'Себет және рәсімдеу'),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          for (final entry in shop.cart.entries)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      shop.products
                              .where((p) => p.id == shop.productIdOf(entry.key))
                              .firstOrNull
                              ?.name ??
                          shop.text('Товар недоступен', 'Тауар қолжетімсіз'),
                    ),
                    if (shop.selectionNames(entry.key).isNotEmpty)
                      Text(shop.selectionNames(entry.key).join(', ')),
                    if (shop.hasOptions(entry.key))
                      TextButton(
                        onPressed: shop.busy
                            ? null
                            : () async {
                                final product = shop.products
                                    .where(
                                      (p) =>
                                          p.id == shop.productIdOf(entry.key),
                                    )
                                    .firstOrNull;
                                if (product?.configuration == null) return;
                                final chosen = await showDialog<Selection>(
                                  context: context,
                                  builder: (_) => OptionsDialog(
                                    product: product!,
                                    shop: shop,
                                    initialSelection:
                                        shop.selections[entry.key],
                                  ),
                                );
                                if (chosen != null) {
                                  await shop.run(
                                    () => shop.replaceSelection(
                                      entry.key,
                                      chosen,
                                    ),
                                  );
                                }
                              },
                        child: Text(
                          shop.text(
                            'Изменить варианты и добавки',
                            'Нұсқалар мен қоспаларды өзгерту',
                          ),
                        ),
                      ),
                    Row(
                      children: [
                        IconButton(
                          tooltip: shop.text('Уменьшить', 'Азайту'),
                          onPressed: shop.busy
                              ? null
                              : () => shop.run(
                                  () =>
                                      shop.quantity(entry.key, entry.value - 1),
                                ),
                          icon: const Icon(Icons.remove),
                        ),
                        Text('${entry.value}'),
                        IconButton(
                          tooltip: shop.text('Добавить', 'Қосу'),
                          onPressed: shop.busy || entry.value >= 99
                              ? null
                              : () => shop.run(
                                  () =>
                                      shop.quantity(entry.key, entry.value + 1),
                                ),
                          icon: const Icon(Icons.add),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          gap(),
          DropdownButtonFormField<String>(
            initialValue: fulfilment,
            decoration: InputDecoration(
              labelText: shop.text('Получение', 'Алу тәсілі'),
            ),
            items: [
              DropdownMenuItem(
                value: 'pickup',
                child: Text(shop.text('Самовывоз', 'Өзі алып кету')),
              ),
              DropdownMenuItem(
                value: 'delivery',
                child: Text(shop.text('Доставка', 'Жеткізу')),
              ),
            ],
            onChanged: (v) {
              setState(() => fulfilment = v!);
              invalidate();
            },
          ),
          if (fulfilment == 'pickup' && shop.branch != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(
                shop.locale == 'kk'
                    ? (shop.branch!.addressKk ?? '')
                    : (shop.branch!.addressRu ?? ''),
              ),
            ),
          if (fulfilment == 'delivery') ...[
            if (shop.customer != null)
              OutlinedButton.icon(
                icon: const Icon(Icons.bookmark_outline),
                label: Text(
                  shop.text(
                    'Выбрать сохранённый адрес',
                    'Сақталған мекенжайды таңдау',
                  ),
                ),
                onPressed: shop.busy
                    ? null
                    : () => shop.run(() async {
                        final items = (await shop.api.addresses()).items;
                        if (!context.mounted) return;
                        final selected = await showDialog<api.SavedAddress>(
                          context: context,
                          builder: (dialogContext) => SimpleDialog(
                            title: Text(
                              shop.text('Мои адреса', 'Менің мекенжайларым'),
                            ),
                            children: [
                              if (items.isEmpty)
                                Padding(
                                  padding: const EdgeInsets.all(24),
                                  child: Text(
                                    shop.text(
                                      'Сохранённых адресов пока нет',
                                      'Әзірге сақталған мекенжайлар жоқ',
                                    ),
                                  ),
                                ),
                              for (final item in items)
                                SimpleDialogOption(
                                  onPressed: () =>
                                      Navigator.pop(dialogContext, item),
                                  child: Text(item.text),
                                ),
                            ],
                          ),
                        );
                        if (selected == null || !mounted) return;
                        address.text = selected.text;
                        latitude.text = selected.latitude?.toString() ?? '';
                        longitude.text = selected.longitude?.toString() ?? '';
                        invalidate();
                      }),
              ),
            input(address, shop.text('Полный адрес', 'Толық мекенжай')),
            OutlinedButton.icon(
              onPressed: () =>
                  showDialog<LatLng>(
                    context: context,
                    builder: (_) => Dialog.fullscreen(
                      child: DeliveryMap(
                        shop: shop,
                        initialPoint: deliveryPoint(
                          latitude.text,
                          longitude.text,
                        ),
                      ),
                    ),
                  ).then((point) {
                    if (point != null && mounted) {
                      latitude.text = point.latitude.toStringAsFixed(6);
                      longitude.text = point.longitude.toStringAsFixed(6);
                      invalidate();
                    }
                  }),
              icon: const Icon(Icons.map_outlined),
              label: Text(
                shop.text('Выбрать точку на карте', 'Картадан нүкте таңдау'),
              ),
            ),
            Text(
              shop.text(
                'Укажите точные координаты точки доставки. Доступность проверит сервер.',
                'Жеткізу нүктесінің нақты координаттарын көрсетіңіз. Сервер қолжетімділікті тексереді.',
              ),
            ),
            input(latitude, shop.text('Широта', 'Ендік'), number: true),
            input(longitude, shop.text('Долгота', 'Бойлық'), number: true),
          ],
          input(promo, shop.text('Промокод', 'Промокод')),
          input(comment, shop.text('Комментарий', 'Түсініктеме')),
          gap(),
          if (shop.customer == null)
            FilledButton(
              onPressed: () => context.push('/login'),
              child: Text(
                shop.text('Войти для оформления', 'Рәсімдеу үшін кіру'),
              ),
            )
          else ...[
            DropdownButtonFormField<String>(
              initialValue: payment,
              decoration: InputDecoration(
                labelText: shop.text('Оплата', 'Төлем'),
              ),
              items: [
                DropdownMenuItem(
                  value: 'mock',
                  child: Text(
                    shop.text(
                      'Тестовая оплата · без списания',
                      'Тестілік төлем · ақша алынбайды',
                    ),
                  ),
                ),
                if (shop.branch?.allowCash == true)
                  DropdownMenuItem(
                    value: 'cash',
                    child: Text(shop.text('Наличными', 'Қолма-қол')),
                  ),
              ],
              onChanged: (v) => setState(() => payment = v!),
            ),
            gap(),
            if (shop.pendingKey != null) ...[
              Text(
                shop.text(
                  'Результат предыдущего оформления неизвестен. Сначала восстановите его.',
                  'Алдыңғы рәсімдеу нәтижесі белгісіз. Алдымен оны қалпына келтіріңіз.',
                ),
              ),
              FilledButton(
                onPressed: shop.busy
                    ? null
                    : () => shop.run(() async {
                        await shop.recoverOrder();
                        if (shop.currentOrder != null && context.mounted) {
                          context.go('/orders/${shop.currentOrder!.id}');
                        }
                      }),
                child: Text(
                  shop.text('Проверить результат', 'Нәтижені тексеру'),
                ),
              ),
              OutlinedButton(
                onPressed: shop.busy
                    ? null
                    : () => shop.run(() async {
                        await shop.submitPending();
                        if (context.mounted) {
                          context.go('/orders/${shop.currentOrder!.id}');
                        }
                      }),
                child: Text(
                  shop.text('Повторить тот же запрос', 'Сол сұрауды қайталау'),
                ),
              ),
            ] else ...[
              FilledButton(
                onPressed: shop.busy || shop.cart.isEmpty
                    ? null
                    : () => shop.run(
                        () => shop.calculate(
                          fulfilment: fulfilment,
                          address: fulfilment == 'delivery'
                              ? api.DeliveryAddress(
                                  text: address.text.trim(),
                                  latitude: double.parse(
                                    latitude.text.replaceAll(',', '.'),
                                  ),
                                  longitude: double.parse(
                                    longitude.text.replaceAll(',', '.'),
                                  ),
                                )
                              : null,
                          promo: promo.text.trim(),
                          comment: comment.text.trim(),
                        ),
                      ),
                child: Text(
                  shop.text('Рассчитать на сервере', 'Серверде есептеу'),
                ),
              ),
              if (shop.quote != null) ...[
                gap(),
                Text(
                  '${shop.text('Товары', 'Тауарлар')}: ${money(shop.quote!.subtotalMinor)}',
                ),
                Text(
                  '${shop.text('Скидка', 'Жеңілдік')}: −${money(shop.quote!.discountMinor)}',
                ),
                Text(
                  '${shop.text('Доставка', 'Жеткізу')}: ${money(shop.quote!.deliveryFeeMinor)}',
                ),
                Text(
                  '${shop.text('Итого', 'Барлығы')}: ${money(shop.quote!.totalMinor)}',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                gap(),
                FilledButton(
                  onPressed: shop.busy
                      ? null
                      : () => shop.run(() async {
                          await shop.place(payment);
                          if (shop.currentOrder != null && context.mounted) {
                            context.go('/orders/${shop.currentOrder!.id}');
                          }
                        }),
                  child: Text(
                    shop.text(
                      'Подтвердить заказ и сумму',
                      'Тапсырыс пен соманы растау',
                    ),
                  ),
                ),
              ],
            ],
          ],
        ],
      ),
    );
  }
}

class HistoryScreen extends ConsumerStatefulWidget {
  const HistoryScreen({super.key});
  @override
  ConsumerState<HistoryScreen> createState() => _HistoryState();
}

class _HistoryState extends ConsumerState<HistoryScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(
      () => ref
          .read(shopProvider)
          .run(() => ref.read(shopProvider).loadHistory()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final shop = ref.watch(shopProvider);
    ref.listen(shopProvider.select((value) => value.customer?.id), (
      previous,
      next,
    ) {
      if (next != null && next != previous) {
        Future.microtask(() {
          if (mounted) shop.run(shop.loadHistory);
        });
      }
    });
    return PageFrame(
      title: shop.text('Мои заказы', 'Менің тапсырыстарым'),
      child: shop.customer == null
          ? Center(
              child: FilledButton(
                onPressed: () => context.push('/login'),
                child: Text(shop.text('Войти', 'Кіру')),
              ),
            )
          : RefreshIndicator(
              onRefresh: () => shop.run(() => shop.loadHistory()),
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                children: [
                  for (final order in shop.history)
                    Card(
                      child: ListTile(
                        title: Text(money(order.totalMinor)),
                        subtitle: Text(
                          '${orderLabel(shop, order.status)} · ${orderLabel(shop, order.paymentStatus)}',
                        ),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => context.push('/orders/${order.id}'),
                      ),
                    ),
                  if (shop.history.isEmpty)
                    Text(shop.text('Заказов пока нет', 'Әзірге тапсырыс жоқ')),
                  if (shop.historyCursor != null)
                    OutlinedButton(
                      onPressed: () =>
                          shop.run(() => shop.loadHistory(more: true)),
                      child: Text(shop.text('Ещё', 'Тағы')),
                    ),
                ],
              ),
            ),
    );
  }
}

class OrderScreen extends ConsumerStatefulWidget {
  final String id;
  const OrderScreen({super.key, required this.id});
  @override
  ConsumerState<OrderScreen> createState() => _OrderState();
}

class _OrderState extends ConsumerState<OrderScreen>
    with WidgetsBindingObserver {
  Timer? timer;
  bool polling = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    Future.microtask(refresh);
    timer = Timer.periodic(const Duration(seconds: 5), (_) => refresh());
  }

  Future<void> refresh() async {
    final shop = ref.read(shopProvider);
    if (polling || shop.busy || shop.customer == null) return;
    polling = true;
    try {
      await shop.loadOrder(widget.id);
    } catch (e) {
      if (mounted) setState(() => shop.error = shop.describe(e));
    } finally {
      polling = false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) refresh();
  }

  @override
  void dispose() {
    timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final shop = ref.watch(shopProvider),
        order = shop.currentOrder?.id == widget.id ? shop.currentOrder : null;
    return PageFrame(
      title: shop.text('Заказ', 'Тапсырыс'),
      child: RefreshIndicator(
        onRefresh: refresh,
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            if (order == null)
              FilledButton(
                onPressed: refresh,
                child: Text(shop.text('Обновить', 'Жаңарту')),
              )
            else ...[
              Text(order.id, style: Theme.of(context).textTheme.labelSmall),
              gap(),
              Text(
                orderLabel(shop, order.status),
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              Text(
                '${shop.text('Оплата', 'Төлем')}: ${orderLabel(shop, order.paymentStatus)}',
              ),
              gap(),
              for (final item in order.items)
                Text(
                  '${shop.locale == 'kk' ? item.nameKk : item.nameRu} × ${item.quantity} ${(item.options ?? []).map((o) => shop.locale == 'kk' ? o.nameKk : o.nameRu).join(', ')}',
                ),
              gap(),
              Text(
                money(order.totalMinor),
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              if (order.pickupCode != null) ...[
                gap(),
                SelectableText(
                  '${shop.text('Код выдачи', 'Алу коды')}: ${order.pickupCode}',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
              ],
              if (shop.mock &&
                  order.payments.any(
                    (p) => p.status == 'pending' || p.status == 'unknown',
                  )) ...[
                gap(),
                Text(
                  shop.text(
                    'Тестовый провайдер. Реальные деньги не списываются.',
                    'Тестілік провайдер. Нақты ақша алынбайды.',
                  ),
                ),
                for (final outcome in ['paid', 'failed', 'timeout'])
                  OutlinedButton(
                    onPressed: shop.busy
                        ? null
                        : () => shop.run(() => shop.simulate(outcome)),
                    child: Text(mockAction(shop, outcome)),
                  ),
              ],
              if (order.paymentStatus == 'failed' &&
                  !['cancelled', 'expired', 'rejected'].contains(order.status))
                OutlinedButton(
                  onPressed: shop.busy
                      ? null
                      : () => shop.run(() async {
                          shop.observeOrder(
                            await shop.api.retryPayment(
                              order.id,
                              const api.EmptyRequest(),
                              idempotencyKey: operationKey(),
                            ),
                            expectedId: order.id,
                          );
                        }),
                  child: Text(
                    shop.text(
                      'Повторить тестовую оплату',
                      'Тестілік төлемді қайталау',
                    ),
                  ),
                ),
              if ([
                    'completed',
                    'delivered',
                    'cancelled',
                    'rejected',
                    'expired',
                  ].contains(order.status) &&
                  ![
                    'pending',
                    'manual_review',
                    'refund_pending',
                  ].contains(order.paymentStatus))
                OutlinedButton.icon(
                  onPressed: shop.busy
                      ? null
                      : () async {
                          if (shop.cart.isNotEmpty &&
                              !await confirm(
                                context,
                                shop.text(
                                  'Заменить текущую корзину?',
                                  'Қазіргі себетті ауыстыру керек пе?',
                                ),
                              )) {
                            return;
                          }
                          await shop.run(() async {
                            await shop.repeatOrder(order);
                            if (context.mounted) context.push('/cart');
                          });
                        },
                  icon: const Icon(Icons.replay),
                  label: Text(
                    shop.text('Повторить заказ', 'Тапсырысты қайталау'),
                  ),
                ),
              if (['awaiting_payment', 'placed'].contains(order.status))
                OutlinedButton(
                  onPressed: shop.busy
                      ? null
                      : () async {
                          if (await confirm(
                            context,
                            shop.text(
                              'Отменить заказ?',
                              'Тапсырыстан бас тарту керек пе?',
                            ),
                          )) {
                            await shop.run(() async {
                              shop.observeOrder(
                                await shop.api.cancelOrder(
                                  order.id,
                                  api.ReasonRequest(
                                    expectedVersion: order.version,
                                    reason: 'Customer request',
                                  ),
                                ),
                                expectedId: order.id,
                              );
                            });
                          }
                        },
                  child: Text(
                    shop.text('Отменить заказ', 'Тапсырыстан бас тарту'),
                  ),
                ),
              gap(),
              for (final event in order.events)
                Text(
                  '${eventLabel(shop, event.action)} · ${localOrderTime(event.createdAt, shop.branches.where((b) => b.id == order.branchId).firstOrNull?.timeZone ?? shop.brand['timeZone'] as String? ?? 'UTC')}',
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});
  @override
  ConsumerState<ProfileScreen> createState() => _ProfileState();
}

class _ProfileState extends ConsumerState<ProfileScreen> {
  final name = TextEditingController(),
      address = TextEditingController(),
      code = TextEditingController();
  List<api.SavedAddress> addresses = [];
  String? deletion;
  @override
  void dispose() {
    name.dispose();
    address.dispose();
    code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final shop = ref.watch(shopProvider);
    return PageFrame(
      title: shop.text('Профиль', 'Профиль'),
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          if (shop.brand['supportEmail'] != null)
            OutlinedButton.icon(
              onPressed: () => shop.run(() async {
                if (!await launchUrl(
                  Uri(scheme: 'mailto', path: shop.brand['supportEmail']),
                )) {
                  throw StateError('Mail application unavailable');
                }
              }),
              icon: const Icon(Icons.support_agent),
              label: Text(
                shop.text(
                  'Связаться с поддержкой',
                  'Қолдау қызметіне хабарласу',
                ),
              ),
            ),
          if (shop.customer == null)
            FilledButton(
              onPressed: () => context.push('/login'),
              child: Text(shop.text('Войти', 'Кіру')),
            )
          else ...[
            Text(shop.customer!.phone ?? ''),
            OutlinedButton(
              onPressed: () => context.push('/privacy'),
              child: Text(
                shop.text('Выгрузка моих данных', 'Деректерімді шығару'),
              ),
            ),
            TextField(
              controller: name,
              decoration: InputDecoration(
                labelText: shop.text('Имя', 'Аты'),
                hintText: shop.customer!.name,
              ),
            ),
            gap(),
            FilledButton(
              onPressed: shop.busy
                  ? null
                  : () => shop.run(() async {
                      shop.customer = await shop.api.updateProfile(
                        api.ProfileRequest(
                          name: name.text.trim(),
                          locale: shop.locale,
                        ),
                      );
                    }),
              child: Text(shop.text('Сохранить', 'Сақтау')),
            ),
            gap(),
            OutlinedButton(
              onPressed: shop.busy
                  ? null
                  : () => shop.run(() async {
                      addresses = (await shop.api.addresses()).items;
                    }),
              child: Text(shop.text('Мои адреса', 'Менің мекенжайларым')),
            ),
            for (final entry in addresses)
              ListTile(
                title: Text(entry.text),
                trailing: IconButton(
                  tooltip: shop.text('Удалить адрес', 'Мекенжайды жою'),
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () => shop.run(() async {
                    await shop.api.deleteAddress(
                      entry.id,
                      api.VersionRequest(expectedVersion: entry.version),
                    );
                    addresses = (await shop.api.addresses()).items;
                  }),
                ),
              ),
            TextField(
              controller: address,
              decoration: InputDecoration(
                labelText: shop.text('Сохранить адрес', 'Мекенжайды сақтау'),
              ),
            ),
            gap(),
            OutlinedButton(
              onPressed: shop.busy
                  ? null
                  : () => shop.run(() async {
                      await shop.api.createAddress(
                        api.AddressRequest(text: address.text.trim()),
                      );
                      address.clear();
                      addresses = (await shop.api.addresses()).items;
                    }),
              child: Text(shop.text('Добавить адрес', 'Мекенжай қосу')),
            ),
            gap(),
            OutlinedButton(
              onPressed: shop.busy ? null : () => shop.run(shop.logout),
              child: Text(shop.text('Выйти', 'Шығу')),
            ),
            gap(),
            OutlinedButton(
              onPressed: shop.busy ? null : () => shop.run(shop.logoutAll),
              child: Text(
                shop.text(
                  'Выйти со всех устройств',
                  'Барлық құрылғылардан шығу',
                ),
              ),
            ),
            gap(),
            OutlinedButton(
              onPressed: shop.busy
                  ? null
                  : () async {
                      if (!await confirm(
                        context,
                        shop.text(
                          'Удаление аккаунта необратимо. Активные заказы нужно завершить. Продолжить?',
                          'Аккаунтты жою қайтымсыз. Белсенді тапсырыстарды аяқтау қажет. Жалғастыру керек пе?',
                        ),
                      )) {
                        return;
                      }
                      await shop.run(() async {
                        deletion = (await shop.api.deletionChallenge(
                          const api.EmptyRequest(),
                        )).challengeId;
                      });
                    },
              child: Text(shop.text('Удалить аккаунт', 'Аккаунтты жою')),
            ),
            if (deletion != null) ...[
              TextField(
                controller: code,
                keyboardType: TextInputType.number,
                maxLength: 6,
                decoration: InputDecoration(
                  labelText: shop.text(
                    'Подтвердите кодом SMS',
                    'SMS кодымен растаңыз',
                  ),
                ),
              ),
              FilledButton(
                onPressed: shop.busy
                    ? null
                    : () => shop.run(() async {
                        await shop.api.deleteAccount(
                          api.OtpVerifyRequest(
                            challengeId: deletion!,
                            code: code.text.trim(),
                          ),
                        );
                        await shop.clearSession();
                        addresses = [];
                        deletion = null;
                      }),
                child: Text(shop.text('Подтвердить удаление', 'Жоюды растау')),
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class OptionsDialog extends StatefulWidget {
  final api.CatalogProduct product;
  final Shop shop;
  final Selection? initialSelection;
  const OptionsDialog({
    super.key,
    required this.product,
    required this.shop,
    this.initialSelection,
  });
  @override
  State<OptionsDialog> createState() => _OptionsState();
}

class _OptionsState extends State<OptionsDialog> {
  String? variant;
  final selected = <String>{};
  @override
  void initState() {
    super.initState();
    final existing = widget.initialSelection;
    variant = existing?.variantId;
    final known = widget.product.configuration!.groups
        .expand((g) => g.choices)
        .where((c) => c.active)
        .map((c) => c.id)
        .toSet();
    selected.addAll((existing?.choiceIds ?? []).where(known.contains));
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.shop, c = widget.product.configuration!;
    final picked = {...selected, ?variant};
    final pairs = c.incompatiblePairs ?? <api.IncompatiblePair>[];
    bool conflicts(String id, Set<String> others) => pairs.any(
      (pair) =>
          (pair.firstId == id && others.contains(pair.secondId)) ||
          (pair.secondId == id && others.contains(pair.firstId)),
    );
    final compatible = !pairs.any(
      (pair) => picked.contains(pair.firstId) && picked.contains(pair.secondId),
    );
    final valid =
        compatible &&
        (c.variants.isEmpty ||
            c.variants.any((v) => v.id == variant && v.active)) &&
        c.groups.every((g) {
          final count = g.choices
              .where((v) => v.active && selected.contains(v.id))
              .length;
          return count >= g.minimum && count <= g.maximum;
        });
    return AlertDialog(
      title: Text(widget.product.name),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (c.variants.isNotEmpty)
              DropdownButtonFormField<String>(
                initialValue: c.variants.any((v) => v.id == variant && v.active)
                    ? variant
                    : null,
                isExpanded: true,
                decoration: InputDecoration(
                  labelText: s.text('Вариант', 'Нұсқа'),
                ),
                items: c.variants
                    .where((v) => v.active)
                    .map(
                      (v) => DropdownMenuItem(
                        value: v.id,
                        enabled: v.id == variant || !conflicts(v.id, selected),
                        child: Text(
                          '${s.locale == 'kk' ? v.nameKk : v.nameRu} · ${money(v.priceMinor)}',
                        ),
                      ),
                    )
                    .toList(),
                onChanged: (v) => setState(() => variant = v),
              ),
            for (final g in c.groups) ...[
              gap(),
              Text(
                '${s.locale == 'kk' ? g.nameKk : g.nameRu} (${g.minimum}–${g.maximum})',
              ),
              for (final choice in g.choices.where((v) => v.active))
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(
                    '${s.locale == 'kk' ? choice.nameKk : choice.nameRu} +${money(choice.deltaMinor)}',
                  ),
                  value: selected.contains(choice.id),
                  subtitle:
                      !selected.contains(choice.id) &&
                          conflicts(choice.id, picked)
                      ? Text(
                          s.text(
                            'Несовместимо с текущим выбором',
                            'Қазіргі таңдаумен үйлеспейді',
                          ),
                        )
                      : null,
                  onChanged:
                      !selected.contains(choice.id) &&
                          conflicts(choice.id, picked)
                      ? null
                      : (v) => setState(() {
                          if (v == true) {
                            selected.add(choice.id);
                          } else {
                            selected.remove(choice.id);
                          }
                        }),
                ),
            ],
            if (!compatible)
              Text(
                s.text(
                  'Измените несовместимое сочетание, чтобы продолжить.',
                  'Жалғастыру үшін үйлеспейтін таңдауды өзгертіңіз.',
                ),
              ),
            if (widget.initialSelection != null)
              Text(
                s.text(
                  'Выбор применяется ко всем порциям этой позиции.',
                  'Таңдау осы позицияның барлық порциясына қолданылады.',
                ),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(s.text('Назад', 'Артқа')),
        ),
        FilledButton(
          onPressed: !valid
              ? null
              : () => Navigator.pop(
                  context,
                  Selection(variantId: variant, choiceIds: selected.toList()),
                ),
          child: Text(s.text('Выбрать', 'Таңдау')),
        ),
      ],
    );
  }
}
