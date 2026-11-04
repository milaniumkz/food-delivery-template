import 'package:flutter_test/flutter_test.dart';
import 'package:food_delivery_starter/ui/order_labels.dart';

void main() {
  test('order timestamps use IANA business timezone including DST', () {
    expect(
      localOrderTime(DateTime.parse('2026-01-01T00:30:00Z'), 'Asia/Almaty'),
      '01.01.2026 05:30',
    );
    expect(
      localOrderTime(DateTime.parse('2026-03-29T01:30:00Z'), 'Europe/Berlin'),
      '29.03.2026 03:30',
    );
  });
}
