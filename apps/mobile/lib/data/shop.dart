import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:food_delivery_api/food_delivery_api.dart';

abstract interface class Vault {
  Future<String?> read(String key);
  Future<void> write(String key, String? value);
}

class DeviceVault implements Vault {
  final FlutterSecureStorage storage;
  const DeviceVault(this.storage);
  @override
  Future<String?> read(String key) => storage.read(key: key);
  @override
  Future<void> write(String key, String? value) => value == null
      ? storage.delete(key: key)
      : storage.write(key: key, value: value);
}

String operationKey() => List.generate(
  24,
  (_) => Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0'),
).join();
String money(int minor) =>
    '${(minor ~/ 100)}${minor % 100 == 0 ? '' : ',${(minor % 100).toString().padLeft(2, '0')}'} ₸';

class Selection {
  final String? variantId;
  final List<String> choiceIds;
  const Selection({this.variantId, this.choiceIds = const []});
  Map<String, dynamic> toJson() => {
    if (variantId != null) "variantId": variantId,
    "choiceIds": choiceIds,
  };
  factory Selection.fromJson(Map<String, dynamic> json) => Selection(
    variantId: json["variantId"] as String?,
    choiceIds: List<String>.from(json["choiceIds"] ?? []),
  );
}

class Shop extends ChangeNotifier {
  final Map<String, dynamic> brand;
  final Vault vault;
  final Dio dio;
  late final FoodDeliveryApi api;
  bool busy = false, connected = false;
  String? error;
  String? notice;
  bool disposed = false;
  String locale = 'ru';
  String? accessToken;
  TokensResponse? tokens;
  Future<void>? refreshing;
  CustomerProfile? customer;
  List<PublicBranch> branches = [];
  PublicBranch? branch;
  List<CatalogProduct> products = [];
  final Map<String, int> cart = {};
  final Map<String, Selection> selections = {};
  QuoteResponse? quote;
  CustomerOrder? currentOrder;
  List<CustomerOrder> history = [];
  String? historyCursor;
  bool mock = false;
  String? pendingKey, pendingQuote, pendingMethod, pendingCustomer;
  Shop({required this.brand, required this.vault, Dio? transport})
    : dio =
          transport ??
          Dio(
            BaseOptions(
              baseUrl:
                  '${const String.fromEnvironment('API_BASE_URL', defaultValue: '').isEmpty ? brand['apiBaseUrl'] : const String.fromEnvironment('API_BASE_URL')}/v1',
              connectTimeout: const Duration(seconds: 10),
              receiveTimeout: const Duration(seconds: 15),
              sendTimeout: const Duration(seconds: 15),
              followRedirects: false,
            ),
          ) {
    locale = brand['defaultLocale'] as String;
    api = FoodDeliveryApi(dio);
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (connected && accessToken != null && protected(options.path)) {
            options.headers['Authorization'] = 'Bearer $accessToken';
          }
          handler.next(options);
        },
        onError: (failure, handler) async {
          final request = failure.requestOptions;
          if (failure.response?.statusCode != 401 ||
              !protected(request.path) ||
              request.extra['retried'] == true ||
              tokens == null) {
            handler.next(failure);
            return;
          }
          try {
            refreshing ??= refreshSession();
            await refreshing;
            request.extra['retried'] = true;
            request.headers['Authorization'] = 'Bearer $accessToken';
            handler.resolve(await dio.fetch(request));
          } catch (_) {
            handler.next(failure);
          } finally {
            refreshing = null;
          }
        },
      ),
    );
  }
  bool protected(String path) =>
      !(path == '/bootstrap' ||
          path == '/branches' ||
          path == '/catalog' ||
          path.startsWith('/auth/otp/') ||
          path == '/auth/refresh');
  String get namespace => 'food:${brand['id']}';
  List<String> get enabledLocales =>
      (brand['locales'] as List?)?.cast<String>() ?? const ['ru', 'kk'];
  String text(String ru, String kk) => locale == 'kk' ? kk : ru;
  Future<void> run(Future<void> Function() action) async {
    if (busy) return;
    busy = true;
    error = null;
    notice = null;
    if (!disposed) notifyListeners();
    try {
      await action();
    } catch (e) {
      error = describe(e);
    } finally {
      busy = false;
      if (!disposed) notifyListeners();
    }
  }

  String describe(Object e) {
    if (e is DioException) {
      final code = e.response?.data is Map ? e.response?.data['code'] : null;
      if (e.response?.statusCode == 401) {
        return text('Войдите заново', 'Қайта кіріңіз');
      }
      if (e.response?.statusCode == 409) {
        return text(
          'Данные изменились. Обновите расчёт или заказ.',
          'Деректер өзгерді. Есепті не тапсырысты жаңартыңыз.',
        );
      }
      if (e.response?.statusCode == 429) {
        return text(
          'Слишком много попыток. Подождите.',
          'Сұраулар тым көп. Күтіңіз.',
        );
      }
      const messages = {
        'CUSTOMER_BLOCKED': ['Приём новых заказов приостановлен. Свяжитесь с поддержкой.', 'Жаңа тапсырыстар қабылданбайды. Қолдау қызметіне хабарласыңыз.'],
        'BRANCH_CLOSED': ['Филиал сейчас закрыт', 'Филиал қазір жабық'],
        'OUT_OF_STOCK': [
          'Недостаточно порций. Измените количество.',
          'Порциялар жеткіліксіз. Санын өзгертіңіз.',
        ],
        'PRODUCT_UNAVAILABLE': [
          'Позиция недоступна. Обновите корзину.',
          'Позиция қолжетімсіз. Себетті жаңартыңыз.',
        ],
        'MINIMUM_ORDER': [
          'Не достигнута минимальная сумма после скидки.',
          'Жеңілдіктен кейін ең төменгі сомаға жетпеді.',
        ],
        'OUTSIDE_DELIVERY_ZONE': [
          'Адрес вне зоны доставки. Укажите другую точку.',
          'Мекенжай жеткізу аймағынан тыс. Басқа нүкте таңдаңыз.',
        ],
        'VARIANT_REQUIRED': [
          'Выберите доступный вариант блюда.',
          'Тағамның қолжетімді нұсқасын таңдаңыз.',
        ],
        'CHOICE_LIMIT': [
          'Проверьте обязательные добавки.',
          'Міндетті қоспаларды тексеріңіз.',
        ],
        'INVALID_CHOICE': [
          'Добавка недоступна. Измените выбор.',
          'Қоспа қолжетімсіз. Таңдауды өзгертіңіз.',
        ],
      };
      final message = messages[code];
      if (message != null) return message[locale == 'kk' ? 1 : 0];
      if (e.response?.statusCode == 404) {
        return text(
          'Данные недоступны. Обновите список.',
          'Деректер қолжетімсіз. Тізімді жаңартыңыз.',
        );
      }
      if (e.response?.statusCode == 413) {
        return text(
          'Слишком большая корзина. Уменьшите число позиций или добавок.',
          'Себет тым үлкен. Позициялар не қоспалар санын азайтыңыз.',
        );
      }
      if (e.response?.statusCode == 400 || e.response?.statusCode == 422) {
        return text(
          'Проверьте введённые данные и доступность заказа.',
          'Деректерді және тапсырыс қолжетімділігін тексеріңіз.',
        );
      }
      if (code == 'BRANCH_CLOSED') {
        return text('Филиал сейчас закрыт', 'Филиал қазір жабық');
      }
      return text(
        'Нет связи с сервером. Повторите запрос. Не создавайте повторный заказ.',
        'Сервермен байланыс жоқ. Қайталап көріңіз. Тапсырысты қайталамаңыз.',
      );
    }
    return text(
      'Не удалось выполнить действие. Проверьте данные.',
      'Әрекет орындалмады. Деректерді тексеріңіз.',
    );
  }

  Future<void> initialize() => run(() async {
    connected = false;
    final bootstrap = await api.bootstrap();
    if (bootstrap.brand.id != brand['id']) throw StateError('Brand mismatch');
    connected = true;
    mock = bootstrap.features.paymentProvider == 'mock';
    final preferredLocale = await vault.read("$namespace:locale");
    if (enabledLocales.contains(preferredLocale)) locale = preferredLocale!;
    final stored = await vault.read('$namespace:session');
    if (stored != null) {
      tokens = TokensResponse.fromJson(jsonDecode(stored));
      accessToken = tokens!.accessToken;
    }
    final saved = await vault.read('$namespace:cart');
    if (saved != null) {
      final data = jsonDecode(saved) as Map<String, dynamic>;
      cart.clear();
      selections.clear();
      final branchId = data['branchId'];
      for (final entry
          in ((data['selections'] ?? {}) as Map<String, dynamic>).entries) {
        selections[entry.key] = Selection.fromJson(
          Map<String, dynamic>.from(entry.value),
        );
      }
      branches = (await api.branches()).items;
      branch = branches.where((b) => b.id == branchId).firstOrNull;
      for (final entry in (data['items'] as Map<String, dynamic>).entries) {
        if (entry.value is int && entry.value > 0 && entry.value <= 99) {
          final selection = selections[entry.key] ?? const Selection();
          final normalized = cartKey(productIdOf(entry.key), selection);
          cart[normalized] = entry.value;
          selections[normalized] = selection;
        }
      }
    } else {
      branches = (await api.branches()).items;
    }
    branch ??= branches.firstOrNull;
    if (branch != null) await loadCatalog();
    if (tokens != null) {
      try {
        customer = await api.me();
      } on DioException catch (e) {
        if (e.response?.statusCode == 401) {
          await clearSession();
        } else {
          rethrow;
        }
      }
    }
    await readPending();
    if (pendingKey != null) await recoverOrder();
  });
  Future<void> readPending() async {
    pendingKey = null;
    pendingQuote = null;
    pendingMethod = null;
    pendingCustomer = null;
    if (customer == null) return;
    final saved = await vault.read('$namespace:pending:${customer!.id}');
    if (saved == null) return;
    final data = jsonDecode(saved);
    if (data['customer'] != customer!.id) {
      throw StateError('Pending account mismatch');
    }
    pendingKey = data['key'];
    pendingQuote = data['quote'];
    pendingMethod = data['method'];
    pendingCustomer = data['customer'];
  }

  Future<void> refreshSession() async {
    try {
      await saveTokens(
        await api.refresh(RefreshRequest(refreshToken: tokens!.refreshToken)),
      );
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) await clearSession();
      rethrow;
    }
  }

  Future<void> saveTokens(TokensResponse value) async {
    await vault.write('$namespace:session', jsonEncode(value.toJson()));
    tokens = value;
    accessToken = value.accessToken;
  }

  Future<void> clearSession() async {
    orderReadSequence++;
    tokens = null;
    accessToken = null;
    customer = null;
    currentOrder = null;
    quote = null;
    pendingKey = null;
    pendingQuote = null;
    pendingMethod = null;
    pendingCustomer = null;
    history = [];
    historyCursor = null;
    await vault.write('$namespace:session', null);
  }

  Future<void> login(String challengeId, String code) async {
    await saveTokens(
      await api.verifyOtp(
        OtpVerifyRequest(challengeId: challengeId, code: code),
      ),
    );
    customer = await api.me();
    final preferred = await vault.read("$namespace:locale");
    if (preferred != null && enabledLocales.contains(preferred)) {
      locale = preferred;
      if (customer!.locale != locale) {
        customer = await api.updateProfile(ProfileRequest(locale: locale));
      }
    } else if (enabledLocales.contains(customer!.locale)) {
      locale = customer!.locale;
      await vault.write("$namespace:locale", locale);
    }
    await loadCatalog();
    await readPending();
    if (pendingKey != null && pendingCustomer == customer?.id) {
      await recoverOrder();
    }
  }

  Future<void> logout() async {
    await api.logout(const EmptyRequest());
    await clearSession();
  }

  Future<void> loadCatalog() async {
    if (branch == null) return;
    final all = <CatalogProduct>[];
    String? cursor;
    do {
      final page = await api.catalog(
        branchId: branch!.id,
        locale: locale,
        cursor: cursor,
      );
      all.addAll(page.items);
      cursor = page.nextCursor;
    } while (cursor != null);
    products = all;
  }

  Future<void> selectBranch(PublicBranch value) async {
    if (branch?.id == value.id) return;
    branch = value;
    cart.clear();
    selections.clear();
    quote = null;
    await saveCart();
    await loadCatalog();
  }

  Future<void> changeLocale(String value) async {
    if (!enabledLocales.contains(value)) {
      throw ArgumentError("Unsupported locale");
    }
    if (customer != null) {
      customer = await api.updateProfile(ProfileRequest(locale: value));
    }
    await vault.write("$namespace:locale", value);
    locale = value;
    quote = null;
    await loadCatalog();
  }

  Future<void> saveCart() => vault.write(
    '$namespace:cart',
    jsonEncode({
      'branchId': branch?.id,
      'items': cart,
      'selections': selections.map(
        (key, value) => MapEntry(key, value.toJson()),
      ),
    }),
  );
  Future<void> quantity(String id, int count) async {
    if (count < 0 || count > 99) return;
    if (count == 0) {
      cart.remove(id);
      selections.remove(id);
    } else {
      cart[id] = count;
    }
    quote = null;
    await saveCart();
    notifyListeners();
  }

  bool hasOptions(String key) {
    final c = products
        .where((p) => p.id == productIdOf(key))
        .firstOrNull
        ?.configuration;
    return c != null && (c.variants.isNotEmpty || c.groups.isNotEmpty);
  }

  int get estimatedItemsMinor => cart.entries.fold(0, (sum, entry) {
    final product = products
        .where((p) => p.id == productIdOf(entry.key))
        .firstOrNull;
    if (product == null) return sum;
    final selected = selections[entry.key] ?? const Selection(),
        configuration = product.configuration,
        variant = configuration?.variants
            .where((v) => v.id == selected.variantId)
            .firstOrNull;
    int unit = variant?.priceMinor ?? product.priceMinor;
    for (final group in configuration?.groups ?? <ProductGroup>[]) {
      for (final choice in group.choices) {
        if (selected.choiceIds.contains(choice.id)) unit += choice.deltaMinor;
      }
    }
    return sum + unit * entry.value;
  });
  Future<void> repeatOrder(CustomerOrder order) async {
    final available = (await api.branches()).items,
        target = available.where((b) => b.id == order.branchId).firstOrNull;
    if (target == null) throw StateError('Branch unavailable');
    branch = target;
    branches = available;
    await loadCatalog();
    cart.clear();
    selections.clear();
    quote = null;
    final missing = <String>[];
    for (final item in order.items) {
      final p = products.where((p) => p.id == item.productId).firstOrNull;
      if (p == null) {
        missing.add(locale == 'kk' ? item.nameKk : item.nameRu);
        continue;
      }
      final options = item.options ?? <SelectedOption>[],
          config = p.configuration;
      final variant = config?.variants
          .where((v) => v.active && options.any((o) => o.id == v.id))
          .firstOrNull;
      final choices =
          config?.groups
              .expand((g) => g.choices)
              .where((c) => c.active && options.any((o) => o.id == c.id))
              .map((c) => c.id)
              .toList() ??
          <String>[];
      final selection = Selection(variantId: variant?.id, choiceIds: choices),
          key = cartKey(p.id, selection);
      selections[key] = selection;
      cart[key] = ((cart[key] ?? 0) + item.quantity).clamp(1, 99);
    }
    await saveCart();
    notice =
        text(
          'Корзина собрана по текущему меню. Проверьте варианты и новый расчёт.',
          'Себет қазіргі мәзір бойынша жиналды. Нұсқалар мен жаңа есепті тексеріңіз.',
        ) +
        (missing.isEmpty
            ? ''
            : text(' Недоступно: ', ' Қолжетімсіз: ') + missing.join(', '));
  }

  String productIdOf(String key) => key.split('|').first;
  String cartKey(String id, Selection selection) =>
      selection.variantId == null && selection.choiceIds.isEmpty
      ? id
      : '$id|${selection.variantId ?? ''}|${([...selection.choiceIds]..sort()).join(',')}';
  int quantityForProduct(String id) => cart.entries
      .where((e) => productIdOf(e.key) == id)
      .fold(0, (sum, e) => sum + e.value);
  Future<void> addProduct(
    String id, [
    Selection selection = const Selection(),
  ]) async {
    final key = cartKey(id, selection), count = (cart[key] ?? 0) + 1;
    if (count > 99 || (!cart.containsKey(key) && cart.length >= 100)) {
      throw StateError('Cart limit');
    }
    selections[key] = selection;
    await quantity(key, count);
  }

  Future<void> replaceSelection(String key, Selection selection) async {
    final target = cartKey(productIdOf(key), selection),
        count = (cart[key] ?? 0) + (target == key ? 0 : (cart[target] ?? 0));
    if (count > 99) throw StateError('Cart limit');
    cart.remove(key);
    selections.remove(key);
    selections[target] = selection;
    await quantity(target, count);
  }

  List<String> selectionNames(String id) {
    final configuration = products
            .where((p) => p.id == productIdOf(id))
            .firstOrNull
            ?.configuration,
        selection = selections[id];
    if (configuration == null || selection == null) return [];
    return [
      for (final v in configuration.variants)
        if (v.id == selection.variantId) locale == 'kk' ? v.nameKk : v.nameRu,
      for (final g in configuration.groups)
        for (final c in g.choices)
          if (selection.choiceIds.contains(c.id))
            locale == 'kk' ? c.nameKk : c.nameRu,
    ];
  }

  int get itemCount => cart.values.fold(0, (a, b) => a + b);
  Future<void> calculate({
    required String fulfilment,
    DeliveryAddress? address,
    String? promo,
    String? comment,
  }) async {
    quote = await api.quote(
      QuoteRequest(
        branchId: branch!.id,
        fulfilment: fulfilment,
        items: cart.entries
            .map(
              (e) => QuoteLineRequest(
                productId: productIdOf(e.key),
                quantity: e.value,
                variantId: selections[e.key]?.variantId,
                choiceIds: selections[e.key]?.choiceIds,
              ),
            )
            .toList(),
        address: address,
        promoCode: promo?.isEmpty == true ? null : promo,
        comment: comment,
      ),
    );
  }

  Future<void> place(String method) async {
    if (pendingKey != null) {
      await recoverOrder();
      return;
    }
    if (quote == null || quote!.expiresAt.isBefore(DateTime.now())) {
      quote = null;
      throw StateError('Expired quote');
    }
    pendingKey = operationKey();
    pendingQuote = quote!.quoteId;
    pendingMethod = method;
    pendingCustomer = customer!.id;
    await vault.write(
      '$namespace:pending:$pendingCustomer',
      jsonEncode({
        'key': pendingKey,
        'quote': pendingQuote,
        'method': pendingMethod,
        'customer': pendingCustomer,
      }),
    );
    await submitPending();
  }

  Future<void> submitPending() async {
    if (pendingCustomer != customer?.id) throw StateError('Wrong account');
    try {
      await adoptOrder(
        await api.createOrder(
          CreateOrderRequest(
            quoteId: pendingQuote!,
            paymentMethod: pendingMethod!,
          ),
          idempotencyKey: pendingKey!,
        ),
      );
    } on DioException catch (e) {
      if (e.response?.statusCode == 409) {
        final details = e.response?.data is Map
            ? e.response?.data['details']
            : null;
        if (details is Map && details['order'] is Map) {
          await adoptOrder(
            CustomerOrder.fromJson(Map<String, dynamic>.from(details['order'])),
          );
          return;
        }
        if (e.response?.data is Map &&
            e.response?.data['code'] == 'IDEMPOTENCY_CONFLICT') {
          await recoverOrder();
          if (pendingKey == null) return;
          rethrow;
        }
        if (details is Map && details['quote'] is Map) {
          quote = QuoteResponse.fromJson(
            Map<String, dynamic>.from(details['quote']),
          );
        }
        await clearPending();
      } else if (e.response?.statusCode == 404 ||
          e.response?.statusCode == 400 ||
          e.response?.statusCode == 422) {
        await clearPending();
      }
      rethrow;
    }
  }

  Future<void> clearPending() async {
    if (pendingCustomer != null) {
      await vault.write('$namespace:pending:$pendingCustomer', null);
    }
    pendingKey = null;
    pendingQuote = null;
    pendingMethod = null;
    pendingCustomer = null;
  }

  Future<void> recoverOrder() async {
    if (pendingKey == null || customer?.id != pendingCustomer) return;
    try {
      await adoptOrder(await api.pendingOrder(pendingKey!));
    } on DioException catch (e) {
      if (e.response?.statusCode != 404) rethrow;
    }
  }

  Future<void> adoptOrder(CustomerOrder value) async {
    currentOrder = value;
    await clearPending();
    cart.clear();
    selections.clear();
    quote = null;
    await saveCart();
  }

  Future<void> loadHistory({bool more = false}) async {
    final actor = customer?.id;
    final page = await api.orders(cursor: more ? historyCursor : null);
    if (customer?.id != actor || disposed) return;
    history = more ? [...history, ...page.items] : page.items;
    historyCursor = page.nextCursor;
  }

  int orderReadSequence = 0;
  void observeOrder(CustomerOrder value, {String? expectedId}) {
    if (expectedId != null && currentOrder?.id != expectedId) return;
    if (currentOrder?.id == value.id && currentOrder!.version > value.version) {
      return;
    }
    currentOrder = value;
  }

  Future<void> loadOrder(String id) async {
    final sequence = ++orderReadSequence;
    final value = await api.order(id);
    if (sequence != orderReadSequence) return;
    observeOrder(value);
    notifyListeners();
  }

  Future<void> simulate(String outcome) async {
    final attempt = currentOrder!.payments.lastWhere(
      (p) => p.status == 'pending' || p.status == 'unknown',
    );
    final id = currentOrder!.id;
    observeOrder(
      await api.simulatePayment(
        attempt.id,
        MockResultRequest(outcome: outcome),
      ),
      expectedId: id,
    );
  }

  @override
  void dispose() {
    disposed = true;
    orderReadSequence++;
    dio.close(force: true);
    super.dispose();
  }
}
