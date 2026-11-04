import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:food_delivery_starter/main.dart';
import 'package:food_delivery_starter/data/shop.dart';
import '../test/shop_test.dart' show MemoryVault;

// This suite intentionally exercises a disposable real API; ordinary widget tests keep Flutter's HTTP isolation.
class LiveBinding extends AutomatedTestWidgetsFlutterBinding {
  @override
  bool get overrideHttpClient => false;
}

void main() {
  LiveBinding();
  WidgetController.hitTestWarningShouldBeFatal = true;
  testWidgets(
    'real Flutter UI: guest cart, OTP, mock payment, restaurant browser and pickup completion',
    (tester) async {
      const base = String.fromEnvironment('LIVE_API_URL'),
          directory = String.fromEnvironment('E2E_DIRECTORY'),
          smsDirectory = String.fromEnvironment('SMS_DIRECTORY'),
          fulfilment = String.fromEnvironment(
            'LIVE_FULFILMENT',
            defaultValue: 'pickup',
          );
      expect(base, isNotEmpty);
      expect(directory, isNotEmpty);
      expect(smsDirectory, isNotEmpty);
      final brand = {
        'id': 'demo',
        'displayName': 'TAMAK',
        'defaultLocale': 'ru',
        'apiBaseUrl': base,
        'primaryColor': '#B9381B',
        'onPrimary': '#FFFFFF',
        'surfaceColor': '#FFF9F2',
        'textColor': '#22271F',
      };
      final shop = Shop(
        brand: brand,
        vault: MemoryVault(),
        transport: Dio(
          BaseOptions(
            baseUrl: '$base/v1',
            connectTimeout: const Duration(seconds: 5),
            receiveTimeout: const Duration(seconds: 10),
          ),
        ),
      );
      await tester.runAsync(shop.initialize);
      expect(shop.error, isNull);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [shopProvider.overrideWith((ref) => shop)],
          child: const DeliveryApp(),
        ),
      );
      await tester.pumpAndSettle();
      Future<void> tap(String label) async {
        final target = find.text(label);
        if (target.evaluate().isEmpty) {
          await tester.scrollUntilVisible(
            target,
            200,
            scrollable: find.byType(Scrollable).first,
          );
        }
        await tester.ensureVisible(target);
        await tester.pumpAndSettle();
        await tester.runAsync(() async {
          await tester.tap(target);
          final deadline = DateTime.now().add(const Duration(seconds: 15));
          while (shop.busy && DateTime.now().isBefore(deadline)) {
            await Future<void>.delayed(const Duration(milliseconds: 20));
          }
          expect(shop.busy, false);
        });
        await tester.pumpAndSettle();
        expect(shop.error, isNull);
      }

      await tap('В корзину');
      expect(shop.itemCount, 1);
      expect(shop.customer, isNull);
      await tap('Корзина · 1');
      await tap('Войти для оформления');
      await tester.enterText(find.byType(TextField).first, '+77000000444');
      final previous = await tester.runAsync(
        () async => Directory(smsDirectory).existsSync()
            ? Directory(smsDirectory).listSync().map((f) => f.path).toSet()
            : <String>{},
      );
      await tap('Получить код');
      final code = await tester.runAsync(() async {
        final files = Directory(smsDirectory)
            .listSync()
            .whereType<File>()
            .where((f) => !previous!.contains(f.path))
            .toList();
        expect(files.length, 1);
        return files.single.readAsStringSync().trim();
      });
      await tester.enterText(find.byType(TextField).last, code!);
      await tap('Войти');
      expect(shop.customer, isNotNull);
      expect(shop.itemCount, 1);
      if (fulfilment == 'delivery') {
        await tester.tap(find.byType(DropdownButtonFormField<String>).first);
        await tester.pumpAndSettle();
        await tap('Доставка');
        Future<void> fill(String label, String value) async {
          final field = find.widgetWithText(TextField, label);
          await tester.ensureVisible(field);
          await tester.pumpAndSettle();
          await tester.enterText(field, value);
        }

        await fill('Полный адрес', 'Synthetic E2E address');
        await fill('Широта', '43.5');
        await fill('Долгота', '76.5');
      }
      await tap('Рассчитать на сервере');
      expect(shop.quote!.totalMinor, 249000);
      await tap('Подтвердить заказ и сумму');
      expect(shop.currentOrder, isNotNull);
      expect(shop.currentOrder!.paymentStatus, 'pending');
      await tap('Тест: подтвердить оплату');
      expect(shop.currentOrder!.paymentStatus, 'paid');
      final id = shop.currentOrder!.id;
      await tester.runAsync(() async {
        final file = File('$directory/order.json.tmp');
        await file.writeAsString(jsonEncode({'id': id}));
        await file.rename('$directory/order.json');
        final deadline = DateTime.now().add(const Duration(seconds: 60));
        bool sent = false;
        while (DateTime.now().isBefore(deadline)) {
          await shop.loadOrder(id);
          if (shop.currentOrder!.status == 'ready' &&
              fulfilment == 'pickup' &&
              !sent) {
            final pickup = File('$directory/pickup.txt.tmp');
            await pickup.writeAsString(shop.currentOrder!.pickupCode!);
            await pickup.rename('$directory/pickup.txt');
            sent = true;
          }
          if (shop.currentOrder!.status ==
              (fulfilment == 'pickup' ? 'completed' : 'delivered'))
            break;
          await Future<void>.delayed(const Duration(milliseconds: 100));
        }
        expect(
          shop.currentOrder!.status,
          fulfilment == 'pickup' ? 'completed' : 'delivered',
        );
      });
      await tester.pumpAndSettle();
      expect(shop.currentOrder!.totalMinor, 249000);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      shop.dio.close(force: true);
      await tester.pump(const Duration(seconds: 4));
    },
    timeout: const Timeout(Duration(minutes: 2)),
  );
}
