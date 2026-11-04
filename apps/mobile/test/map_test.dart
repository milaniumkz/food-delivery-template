import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator_platform_interface/geolocator_platform_interface.dart';
import 'package:food_delivery_starter/data/shop.dart';
import 'package:food_delivery_starter/ui/delivery_map.dart';
import 'shop_test.dart' show MemoryVault;

class DisabledLocation extends GeolocatorPlatform {
  @override
  Future<bool> isLocationServiceEnabled() async => false;
}

void main() {
  test('manual coordinates reject non-finite and out-of-range values', () {
    expect(deliveryPoint('NaN', '76'), isNull);
    expect(deliveryPoint('91', '76'), isNull);
    expect(deliveryPoint('43', '181'), isNull);
    expect(deliveryPoint('43,25', '76,9')!.latitude, 43.25);
  });
  testWidgets(
    'disabled GPS leaves manual fallback and cannot invent a selected location',
    (tester) async {
      final original = GeolocatorPlatform.instance;
      GeolocatorPlatform.instance = DisabledLocation();
      addTearDown(() => GeolocatorPlatform.instance = original);
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      tester.platformDispatcher.textScaleFactorTestValue = 1.8;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      final shop = Shop(
        brand: {
          'id': 'demo',
          'defaultLocale': 'ru',
          'apiBaseUrl': 'https://example.invalid',
          'applicationId': 'com.example.test',
        },
        vault: MemoryVault(),
      );
      await tester.pumpWidget(MaterialApp(home: DeliveryMap(shop: shop)));
      await tester.pumpAndSettle();
      final select = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Выбрать точку'),
      );
      expect(select.onPressed, isNull);
      await tester.ensureVisible(find.text('Моё местоположение'));
      await tester.tap(find.text('Моё местоположение'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Не удалось получить геопозицию.'),
        findsOneWidget,
      );
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Выбрать точку'),
            )
            .onPressed,
        isNull,
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      shop.dispose();
      await tester.pump(const Duration(seconds: 4));
    },
  );
}
