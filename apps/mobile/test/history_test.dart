import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:food_delivery_api/food_delivery_api.dart';
import 'package:food_delivery_starter/main.dart';
import 'package:food_delivery_starter/data/shop.dart';
import 'shop_test.dart' show MemoryVault, Adapter;

void main() {
  testWidgets(
    'history loads after guest login and an empty history can be refreshed',
    (tester) async {
      final seen = <String>[],
          dio = Dio(BaseOptions(baseUrl: 'https://example.invalid/v1'));
      dio.httpClientAdapter = Adapter((options) async {
        seen.add(options.path);
        return ResponseBody.fromString(
          jsonEncode({'items': [], 'nextCursor': null}),
          200,
          headers: {
            Headers.contentTypeHeader: ['application/json'],
          },
        );
      });
      final shop = Shop(
        brand: {
          'id': 'demo',
          'displayName': 'Test brand',
          'defaultLocale': 'ru',
          'apiBaseUrl': 'https://example.invalid',
          'primaryColor': '#B9381B',
          'onPrimary': '#FFFFFF',
          'surfaceColor': '#FFF9F2',
          'textColor': '#22271F',
        },
        vault: MemoryVault(),
        transport: dio,
      );
      shop.connected = true;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [shopProvider.overrideWith((ref) => shop)],
          child: const DeliveryApp(),
        ),
      );
      router.go('/orders');
      await tester.pumpAndSettle();
      expect(find.text('Войти'), findsOneWidget);
      expect(seen, isEmpty);
      await shop.run(() async {
        shop.customer = const CustomerProfile(
          id: 'synthetic',
          name: null,
          phone: null,
          locale: 'ru',
        );
      });
      await tester.pumpAndSettle();
      expect(seen, ['/me/orders']);
      expect(shop.error, isNull);
      await tester.drag(find.byType(ListView), const Offset(0, 300));
      await tester.pumpAndSettle();
      expect(seen, ['/me/orders', '/me/orders']);
      expect(tester.takeException(), isNull);
      router.go('/');
      await tester.pumpAndSettle();
    },
  );
}
