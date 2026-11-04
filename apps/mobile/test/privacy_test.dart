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
    'privacy export requires OTP and clears visible private data when the account changes',
    (tester) async {
      final seen = <String>[],
          dio = Dio(BaseOptions(baseUrl: 'https://example.invalid/v1'));
      dio.httpClientAdapter = Adapter((options) async {
        seen.add(options.path);
        if (options.path == '/me/privacy/confirm' &&
            (options.data as Map)['code'] != '123456') {
          return ResponseBody.fromString(
            jsonEncode({'code': 'INVALID_PROOF'}),
            422,
            headers: {
              Headers.contentTypeHeader: ['application/json'],
            },
          );
        }

        final Object value = switch (options.path) {
          '/me/privacy/challenge' => {
            'challengeId': 'synthetic',
            'expiresIn': 180,
            'retryAfter': 60,
          },
          '/me/privacy/confirm' => {'ok': true},
          '/me/privacy/export' => {
            'section': 'profile',
            'items': [
              {'name': 'Synthetic private export'},
            ],
            'nextCursor': null,
            'generatedAt': '2026-11-04T00:00:00Z',
          },
          _ => throw StateError('Unexpected API path'),
        };
        return ResponseBody.fromString(
          jsonEncode(value),
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
      await shop.saveTokens(
        TokensResponse(
          accessToken: 'a' * 64,
          refreshToken: 'b' * 64,
          expiresIn: 900,
        ),
      );
      shop.customer = const CustomerProfile(
        id: 'a',
        name: null,
        phone: null,
        locale: 'ru',
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: [shopProvider.overrideWith((ref) => shop)],
          child: const DeliveryApp(),
        ),
      );
      router.go('/privacy');
      await tester.pumpAndSettle();
      expect(find.byType(SelectableText), findsNothing);
      await tester.tap(find.text('Получить код для выгрузки'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), '000000');
      await tester.ensureVisible(find.text('Подтвердить выгрузку'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Подтвердить выгрузку'));
      await tester.pumpAndSettle();
      expect(shop.error, isNotNull);
      expect(shop.tokens!.refreshToken, 'b' * 64);
      expect(seen.contains('/auth/refresh'), false);
      expect(find.byType(SelectableText), findsNothing);
      await tester.enterText(find.byType(TextField), '123456');
      await tester.ensureVisible(find.text('Подтвердить выгрузку'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Подтвердить выгрузку'));
      await tester.pumpAndSettle();
      expect(seen, [
        '/me/privacy/challenge',
        '/me/privacy/confirm',
        '/me/privacy/confirm',
        '/me/privacy/export',
      ]);
      expect(find.byType(SelectableText), findsOneWidget);
      expect(
        (tester.widget<SelectableText>(find.byType(SelectableText))).data,
        contains('Synthetic private export'),
      );
      await shop.run(shop.clearSession);
      await tester.pumpAndSettle();
      expect(find.byType(SelectableText), findsNothing);
      expect(find.text('Сначала войдите в аккаунт'), findsOneWidget);
      router.go('/');
      await tester.pumpAndSettle();
    },
  );
}
