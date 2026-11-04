import 'dart:convert';
import 'dart:async';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:food_delivery_api/food_delivery_api.dart';
import 'package:food_delivery_starter/data/shop.dart';

class MemoryVault implements Vault {
  final values = <String, String>{};
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String? value) async {
    if (value == null) {
      values.remove(key);
    } else {
      values[key] = value;
    }
  }
}

class Adapter implements HttpClientAdapter {
  final Future<ResponseBody> Function(RequestOptions) respond;
  Adapter(this.respond);
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) => respond(options);
  @override
  void close({bool force = false}) {}
}

void main() {
  test('KZT formatted from integer tiyn without floating point', () {
    expect(money(249000), '2490 ₸');
    expect(money(123456), '1234,56 ₸');
  });
  test('generated brand model decodes scalar enum fields', () {
    final brand = BrandConfig.fromJson({
      'schemaVersion': 1,
      'id': 'demo',
      'displayName': 'Demo',
      'applicationId': 'com.example.demo',
      'apiBaseUrl': 'https://example.invalid',
      'currency': 'KZT',
      'locales': ['ru', 'kk'],
      'defaultLocale': 'ru',
      'timeZone': 'Asia/Almaty',
      'logoAsset': 'assets/logo.svg',
      'supportEmail': 'a@example.invalid',
      'primaryColor': '#112233',
      'onPrimary': '#FFFFFF',
      'surfaceColor': '#FFFFFF',
      'textColor': '#000000',
    });
    expect(brand.schemaVersion, 1);
    expect(brand.currency, 'KZT');
    expect(brand.locales, ['ru', 'kk']);
  });
  test(
    'different selections remain separate and merge only by identical option set',
    () async {
      final shop = Shop(
        brand: {
          'id': 'demo',
          'apiBaseUrl': 'https://example.invalid',
          'defaultLocale': 'ru',
        },
        vault: MemoryVault(),
      );
      const small = Selection(variantId: 'small', choiceIds: ['b', 'a']);
      const same = Selection(variantId: 'small', choiceIds: ['a', 'b']);
      const large = Selection(variantId: 'large');
      await shop.addProduct('p', small);
      await shop.addProduct('p', same);
      await shop.addProduct('p', large);
      expect(shop.cart.length, 2);
      expect(shop.quantityForProduct('p'), 3);
      expect(shop.cart[shop.cartKey('p', small)], 2);
      await shop.replaceSelection(shop.cartKey('p', large), same);
      expect(shop.cart.length, 1);
      expect(shop.cart.values.single, 3);
      shop.dispose();
    },
  );
  test(
    'pending checkout survives logout but is isolated between customer accounts',
    () async {
      final vault = MemoryVault();
      vault.values['food:demo:pending:a'] = jsonEncode({
        'key': 'original',
        'quote': 'q',
        'method': 'mock',
        'customer': 'a',
      });
      final shop = Shop(
        brand: {
          'id': 'demo',
          'apiBaseUrl': 'https://example.invalid',
          'defaultLocale': 'ru',
        },
        vault: vault,
      );
      shop.customer = const CustomerProfile(
        id: 'a',
        name: null,
        phone: null,
        locale: 'ru',
      );
      await shop.readPending();
      expect(shop.pendingKey, 'original');
      await shop.clearSession();
      shop.customer = const CustomerProfile(
        id: 'b',
        name: null,
        phone: null,
        locale: 'ru',
      );
      await shop.readPending();
      expect(shop.pendingKey, isNull);
      shop.customer = const CustomerProfile(
        id: 'a',
        name: null,
        phone: null,
        locale: 'ru',
      );
      await shop.readPending();
      expect(shop.pendingKey, 'original');
      shop.dispose();
    },
  );
  test('cart bounds and durable brand namespace', () async {
    final vault = MemoryVault();
    final shop = Shop(
      brand: {
        'id': 'demo',
        'apiBaseUrl': 'https://example.invalid',
        'defaultLocale': 'ru',
      },
      vault: vault,
    );
    await shop.quantity('a', 2);
    await shop.quantity('a', 100);
    expect(shop.cart['a'], 2);
    expect(jsonDecode(vault.values['food:demo:cart']!)['items']['a'], 2);
    await shop.quantity('a', 0);
    expect(shop.cart, isEmpty);
    shop.dispose();
  });
  test(
    'ambiguous checkout keeps original payload and idempotency key across retries',
    () async {
      final vault = MemoryVault(), seen = <RequestOptions>[];
      final dio = Dio(BaseOptions(baseUrl: 'https://example.invalid/v1'));
      dio.httpClientAdapter = Adapter((options) async {
        seen.add(options);
        throw DioException(
          requestOptions: options,
          type: DioExceptionType.receiveTimeout,
        );
      });
      final shop = Shop(
        brand: {
          'id': 'demo',
          'apiBaseUrl': 'https://example.invalid',
          'defaultLocale': 'ru',
        },
        vault: vault,
        transport: dio,
      );
      shop.customer = const CustomerProfile(
        id: 'customer',
        name: null,
        phone: null,
        locale: 'ru',
      );
      shop.quote = QuoteResponse(
        quoteId: 'quote',
        expiresAt: DateTime.now().add(const Duration(minutes: 5)),
        pricingVersion: '1',
        signature: 'signature',
        items: [],
        subtotalMinor: 100,
        discountMinor: 0,
        deliveryFeeMinor: 0,
        totalMinor: 100,
        currency: 'KZT',
        zoneId: null,
        promotionId: null,
        preparationMinutes: 20,
      );
      await expectLater(shop.place('mock'), throwsA(isA<DioException>()));
      final key = shop.pendingKey;
      expect(key, isNotNull);
      expect(vault.values['food:demo:pending:customer'], isNotNull);
      await expectLater(shop.submitPending(), throwsA(isA<DioException>()));
      expect(seen.map((r) => r.headers['Idempotency-Key']).toSet(), {key});
      expect(seen.map((r) => jsonEncode(r.data)).toSet(), {
        jsonEncode({'quoteId': 'quote', 'paymentMethod': 'mock'}),
      });
      shop.dispose();
    },
  );
  test(
    'brand mismatch rejects server before loading or sending session',
    () async {
      final vault = MemoryVault();
      vault.values['food:demo:session'] = jsonEncode({
        'accessToken': 'private',
        'refreshToken': 'private',
        'expiresIn': 900,
      });
      final seen = <RequestOptions>[];
      final dio = Dio(BaseOptions(baseUrl: 'https://example.invalid/v1'));
      final brand = {
        'schemaVersion': 1,
        'id': 'other',
        'displayName': 'Other',
        'applicationId': 'com.example.other',
        'apiBaseUrl': 'https://example.invalid',
        'currency': 'KZT',
        'locales': ['ru'],
        'defaultLocale': 'ru',
        'timeZone': 'UTC',
        'logoAsset': 'assets/logo.svg',
        'supportEmail': 'a@example.invalid',
        'primaryColor': '#112233',
        'onPrimary': '#FFFFFF',
        'surfaceColor': '#FFFFFF',
        'textColor': '#000000',
      };
      dio.httpClientAdapter = Adapter((options) async {
        seen.add(options);
        return ResponseBody.fromString(
          jsonEncode({
            'brand': brand,
            'features': {'ordering': true, 'paymentProvider': 'mock'},
          }),
          200,
          headers: {
            Headers.contentTypeHeader: ['application/json'],
          },
        );
      });
      final shop = Shop(
        brand: {
          'id': 'demo',
          'apiBaseUrl': 'https://example.invalid',
          'defaultLocale': 'ru',
        },
        vault: vault,
        transport: dio,
      );
      await shop.initialize();
      expect(shop.connected, false);
      expect(shop.accessToken, isNull);
      expect(seen.length, 1);
      expect(seen.single.headers.containsKey('Authorization'), false);
      shop.dispose();
    },
  );
  test('late polling never regresses a newer payment status', () async {
    CustomerOrder order(int version, String payment) => CustomerOrder.fromJson({
      'id': 'o',
      'branchId': 'b',
      'fulfilment': 'pickup',
      'status': payment == 'paid' ? 'placed' : 'awaiting_payment',
      'version': version,
      'preparationMinutes': null,
      'createdAt': '2026-11-04T00:00:00Z',
      'items': [],
      'comment': '',
      'paymentMethod': 'mock',
      'paymentStatus': payment,
      'currency': 'KZT',
      'subtotalMinor': 100,
      'discountMinor': 0,
      'deliveryFeeMinor': 0,
      'totalMinor': 100,
      'address': null,
      'courierId': null,
      'courierAccepted': false,
      'pickupCode': null,
      'payments': [],
      'events': [],
    });
    final response = Completer<ResponseBody>(),
        dio = Dio(BaseOptions(baseUrl: 'https://example.invalid/v1'));
    dio.httpClientAdapter = Adapter((_) => response.future);
    final shop = Shop(
      brand: {
        'id': 'demo',
        'apiBaseUrl': 'https://example.invalid',
        'defaultLocale': 'ru',
      },
      vault: MemoryVault(),
      transport: dio,
    );
    shop.currentOrder = order(1, 'pending');
    final polling = shop.loadOrder('o');
    shop.observeOrder(order(2, 'paid'));
    response.complete(
      ResponseBody.fromString(
        jsonEncode(order(1, 'pending').toJson()),
        200,
        headers: {
          Headers.contentTypeHeader: ['application/json'],
        },
      ),
    );
    await polling;
    expect(shop.currentOrder!.paymentStatus, 'paid');
    expect(shop.currentOrder!.version, 2);
    shop.dispose();
  });
}
