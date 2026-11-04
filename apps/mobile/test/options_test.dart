import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:food_delivery_api/food_delivery_api.dart';
import 'package:food_delivery_starter/data/shop.dart';
import 'package:food_delivery_starter/ui/screens.dart';
import 'shop_test.dart' show MemoryVault;

void main() {
  testWidgets(
    'option dialog prevents incompatible selections and returns only the allowed combination',
    (tester) async {
      final shop = Shop(
        brand: {
          'id': 'demo',
          'defaultLocale': 'ru',
          'apiBaseUrl': 'https://example.invalid',
        },
        vault: MemoryVault(),
      );
      const product = CatalogProduct(
        id: 'p',
        branchId: 'b',
        name: 'Блюдо',
        description: '',
        priceMinor: 100000,
        currency: 'KZT',
        version: 1,
        configuration: ProductConfiguration(
          variants: [
            ProductVariant(
              id: 'v1',
              nameRu: 'Первый',
              nameKk: 'Бірінші',
              priceMinor: 100000,
              active: true,
            ),
            ProductVariant(
              id: 'v2',
              nameRu: 'Второй',
              nameKk: 'Екінші',
              priceMinor: 200000,
              active: true,
            ),
          ],
          groups: [
            ProductGroup(
              id: 'g',
              nameRu: 'Добавки',
              nameKk: 'Қоспалар',
              minimum: 1,
              maximum: 2,
              choices: [
                ProductChoice(
                  id: 'c1',
                  nameRu: 'Сыр',
                  nameKk: 'Ірімшік',
                  deltaMinor: 10000,
                  active: true,
                ),
                ProductChoice(
                  id: 'c2',
                  nameRu: 'Соус',
                  nameKk: 'Тұздық',
                  deltaMinor: 20000,
                  active: true,
                ),
              ],
            ),
          ],
          incompatiblePairs: [
            IncompatiblePair(firstId: 'v1', secondId: 'c1'),
            IncompatiblePair(firstId: 'c1', secondId: 'c2'),
          ],
        ),
      );
      Selection? result;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: FilledButton(
                onPressed: () async {
                  result = await showDialog<Selection>(
                    context: context,
                    builder: (_) => OptionsDialog(product: product, shop: shop),
                  );
                },
                child: const Text('Открыть'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Открыть'));
      await tester.pumpAndSettle();
      Future<void> choose(String label) async {
        await tester.tap(find.byType(DropdownButtonFormField<String>));
        await tester.pumpAndSettle();
        await tester.tap(find.text(label).last);
        await tester.pumpAndSettle();
      }

      CheckboxListTile choice(String label) => tester.widget<CheckboxListTile>(
        find.widgetWithText(CheckboxListTile, label),
      );
      await choose('Первый · 1000 ₸');
      expect(choice('Сыр +100 ₸').onChanged, isNull);
      expect(choice('Соус +200 ₸').onChanged, isNotNull);
      await choose('Второй · 2000 ₸');
      await tester.tap(find.text('Сыр +100 ₸'));
      await tester.pumpAndSettle();
      expect(choice('Соус +200 ₸').onChanged, isNull);
      await tester.tap(find.text('Выбрать'));
      await tester.pumpAndSettle();
      expect(result!.variantId, 'v2');
      expect(result!.choiceIds, ['c1']);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      shop.dispose();
    },
  );
}
