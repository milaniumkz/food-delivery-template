import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:food_delivery_api/food_delivery_api.dart';
import 'package:food_delivery_starter/main.dart';
import 'package:food_delivery_starter/data/shop.dart';
import 'shop_test.dart' show MemoryVault;

void main() {
  testWidgets('menu and cart stay usable at 320px with large text and Kazakh', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    tester.platformDispatcher.textScaleFactorTestValue = 1.8;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final shop = Shop(
      brand: {
        'id': 'demo',
        'displayName': 'Test brand',
        'defaultLocale': 'kk',
        'apiBaseUrl': 'https://example.invalid',
        'primaryColor': '#B9381B',
        'onPrimary': '#FFFFFF',
        'surfaceColor': '#FFF9F2',
        'textColor': '#22271F',
      },
      vault: MemoryVault(),
    );
    shop.connected = true;
    shop.products = [
      const CatalogProduct(
        id: 'p',
        branchId: 'b',
        name: 'Тестілік тағамның ұзын атауы',
        description: 'Сипаттамасы',
        priceMinor: 249000,
        currency: 'KZT',
        version: 1,
      ),
    ];
    await tester.pumpWidget(
      ProviderScope(
        overrides: [shopProvider.overrideWith((ref) => shop)],
        child: MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(1.8)),
          child: const DeliveryApp(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Мәзір'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('Себетке'));
    await tester.pumpAndSettle();
    expect(shop.itemCount, 1);
    expect(tester.takeException(), isNull);
  });
}
