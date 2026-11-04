import 'package:timezone/data/latest.dart' as data;
import 'package:timezone/timezone.dart' as tz;
import '../data/shop.dart';

bool _ready = false;
String localOrderTime(DateTime value, String zone) {
  if (!_ready) {
    data.initializeTimeZones();
    _ready = true;
  }
  final time = tz.TZDateTime.from(value, tz.getLocation(zone));
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(time.day)}.${two(time.month)}.${time.year} ${two(time.hour)}:${two(time.minute)}';
}

String orderLabel(Shop shop, String value) {
  const labels = {
    'awaiting_payment': ['Ожидает оплаты', 'Төлем күтуде'],
    'placed': ['Новый заказ', 'Жаңа тапсырыс'],
    'accepted': ['Принят', 'Қабылданды'],
    'preparing': ['Готовится', 'Дайындалуда'],
    'ready': ['Готов к выдаче', 'Алып кетуге дайын'],
    'out_for_delivery': ['У курьера', 'Курьерде'],
    'delivered': ['Доставлен', 'Жеткізілді'],
    'completed': ['Выдан', 'Берілді'],
    'rejected': ['Отклонён', 'Қабылданбады'],
    'cancelled': ['Отменён', 'Бас тартылды'],
    'expired': ['Истёк срок оплаты', 'Төлем мерзімі аяқталды'],
    'unpaid': ['Оплата при получении', 'Алу кезінде төлеу'],
    'pending': ['Проверяем оплату', 'Төлем тексерілуде'],
    'paid': ['Оплата подтверждена', 'Төлем расталды'],
    'failed': ['Оплата не завершена', 'Төлем аяқталмады'],
    'refund_pending': ['Возврат в обработке', 'Қайтарым өңделуде'],
    'refunded': ['Возврат подтверждён', 'Қайтарым расталды'],
    'manual_review': ['Нужна проверка оплаты', 'Төлемді тексеру қажет'],
    'not_required': ['Оплата не требуется', 'Төлем қажет емес'],
  };
  final pair = labels[value];
  return pair == null
      ? shop.text('Обновляем состояние', 'Күйі жаңартылуда')
      : pair[shop.locale == 'kk' ? 1 : 0];
}

String eventLabel(Shop shop, String value) {
  const events = {
    'order.created': ['Заказ создан', 'Тапсырыс жасалды'],
    'payment.confirmed': ['Оплата подтверждена', 'Төлем расталды'],
    'payment.failed': ['Оплата не завершена', 'Төлем аяқталмады'],
    'payment.retry': ['Новая попытка оплаты', 'Жаңа төлем әрекеті'],
    'payment.refunded': ['Возврат подтверждён', 'Қайтарым расталды'],
    'payment.late.refunded': [
      'Поздняя оплата возвращена',
      'Кеш төлем қайтарылды',
    ],
    'payment.duplicate.refunded': [
      'Повторная оплата возвращена',
      'Қайталанған төлем қайтарылды',
    ],
    'payment.manual_review': [
      'Требуется проверка оплаты',
      'Төлемді тексеру қажет',
    ],
    'courier.accept': ['Курьер принял доставку', 'Курьер жеткізуді қабылдады'],
    'courier.collect': ['Заказ у курьера', 'Тапсырыс курьерде'],
    'courier.deliver': ['Доставлен', 'Жеткізілді'],
    'courier.assigned': ['Курьер назначен', 'Курьер тағайындалды'],
  };
  final pair = events[value];
  return pair != null
      ? pair[shop.locale == 'kk' ? 1 : 0]
      : value.startsWith('order.')
      ? orderLabel(shop, value.substring(6))
      : shop.text('Событие заказа', 'Тапсырыс оқиғасы');
}

String mockAction(Shop shop, String outcome) => outcome == 'paid'
    ? shop.text('Тест: подтвердить оплату', 'Тест: төлемді растау')
    : outcome == 'failed'
    ? shop.text('Тест: отказ оплаты', 'Тест: төлемнен бас тарту')
    : shop.text('Тест: неизвестный результат', 'Тест: нәтиже белгісіз');
