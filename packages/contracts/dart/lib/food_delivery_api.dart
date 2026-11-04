// GENERATED from packages/contracts/openapi.json by tools/dart-client.mjs.
// Do not edit; regenerate after changing API contracts.
import 'package:dio/dio.dart';
Map<String, dynamic> _object(dynamic value) => Map<String, dynamic>.from(value as Map);

class AddressRequest {
  final String? label;
  final String text;
  final double? latitude;
  final double? longitude;
  const AddressRequest({this.label, required this.text, this.latitude, this.longitude});
  factory AddressRequest.fromJson(Map<String, dynamic> json) => AddressRequest(label: json['label'] == null ? null : json['label'] as String, text: json['text'] as String, latitude: json['latitude'] == null ? null : (json['latitude'] as num).toDouble(), longitude: json['longitude'] == null ? null : (json['longitude'] as num).toDouble(), );
  Map<String, dynamic> toJson() => {if (label != null) 'label': label!, 'text': text, if (latitude != null) 'latitude': latitude!, if (longitude != null) 'longitude': longitude!, };
}

class AddressUpdateRequest {
  final String? label;
  final String text;
  final double? latitude;
  final double? longitude;
  final int expectedVersion;
  const AddressUpdateRequest({this.label, required this.text, this.latitude, this.longitude, required this.expectedVersion});
  factory AddressUpdateRequest.fromJson(Map<String, dynamic> json) => AddressUpdateRequest(label: json['label'] == null ? null : json['label'] as String, text: json['text'] as String, latitude: json['latitude'] == null ? null : (json['latitude'] as num).toDouble(), longitude: json['longitude'] == null ? null : (json['longitude'] as num).toDouble(), expectedVersion: json['expectedVersion'] as int, );
  Map<String, dynamic> toJson() => {if (label != null) 'label': label!, 'text': text, if (latitude != null) 'latitude': latitude!, if (longitude != null) 'longitude': longitude!, 'expectedVersion': expectedVersion, };
}

class AddressesResponse {
  final List<SavedAddress> items;
  const AddressesResponse({required this.items});
  factory AddressesResponse.fromJson(Map<String, dynamic> json) => AddressesResponse(items: (json['items'] as List).map((item) => SavedAddress.fromJson(_object(item))).toList(), );
  Map<String, dynamic> toJson() => {'items': items.map((item) => item.toJson()).toList(), };
}

class BootstrapResponse {
  final BrandConfig brand;
  final FeatureFlags features;
  const BootstrapResponse({required this.brand, required this.features});
  factory BootstrapResponse.fromJson(Map<String, dynamic> json) => BootstrapResponse(brand: BrandConfig.fromJson(_object(json['brand'])), features: FeatureFlags.fromJson(_object(json['features'])), );
  Map<String, dynamic> toJson() => {'brand': brand.toJson(), 'features': features.toJson(), };
}

class BranchesResponse {
  final List<PublicBranch> items;
  const BranchesResponse({required this.items});
  factory BranchesResponse.fromJson(Map<String, dynamic> json) => BranchesResponse(items: (json['items'] as List).map((item) => PublicBranch.fromJson(_object(item))).toList(), );
  Map<String, dynamic> toJson() => {'items': items.map((item) => item.toJson()).toList(), };
}

class BrandConfig {
  final int schemaVersion;
  final String id;
  final String displayName;
  final String applicationId;
  final String apiBaseUrl;
  final String currency;
  final List<String> locales;
  final String defaultLocale;
  final String timeZone;
  final String logoAsset;
  final String supportEmail;
  final String primaryColor;
  final String onPrimary;
  final String surfaceColor;
  final String textColor;
  const BrandConfig({required this.schemaVersion, required this.id, required this.displayName, required this.applicationId, required this.apiBaseUrl, required this.currency, required this.locales, required this.defaultLocale, required this.timeZone, required this.logoAsset, required this.supportEmail, required this.primaryColor, required this.onPrimary, required this.surfaceColor, required this.textColor});
  factory BrandConfig.fromJson(Map<String, dynamic> json) => BrandConfig(schemaVersion: json['schemaVersion'] as int, id: json['id'] as String, displayName: json['displayName'] as String, applicationId: json['applicationId'] as String, apiBaseUrl: json['apiBaseUrl'] as String, currency: json['currency'] as String, locales: (json['locales'] as List).map((item) => item as String).toList(), defaultLocale: json['defaultLocale'] as String, timeZone: json['timeZone'] as String, logoAsset: json['logoAsset'] as String, supportEmail: json['supportEmail'] as String, primaryColor: json['primaryColor'] as String, onPrimary: json['onPrimary'] as String, surfaceColor: json['surfaceColor'] as String, textColor: json['textColor'] as String, );
  Map<String, dynamic> toJson() => {'schemaVersion': schemaVersion, 'id': id, 'displayName': displayName, 'applicationId': applicationId, 'apiBaseUrl': apiBaseUrl, 'currency': currency, 'locales': locales.map((item) => item).toList(), 'defaultLocale': defaultLocale, 'timeZone': timeZone, 'logoAsset': logoAsset, 'supportEmail': supportEmail, 'primaryColor': primaryColor, 'onPrimary': onPrimary, 'surfaceColor': surfaceColor, 'textColor': textColor, };
}

class CatalogPage {
  final List<CatalogProduct> items;
  final String? nextCursor;
  const CatalogPage({required this.items, required this.nextCursor});
  factory CatalogPage.fromJson(Map<String, dynamic> json) => CatalogPage(items: (json['items'] as List).map((item) => CatalogProduct.fromJson(_object(item))).toList(), nextCursor: json['nextCursor'] == null ? null : json['nextCursor'] as String, );
  Map<String, dynamic> toJson() => {'items': items.map((item) => item.toJson()).toList(), 'nextCursor': nextCursor == null ? null : nextCursor!, };
}

class CatalogProduct {
  final String id;
  final String branchId;
  final String name;
  final String description;
  final int priceMinor;
  final String currency;
  final int version;
  final ProductConfiguration? configuration;
  final ProductCategory? category;
  final String? imageUrl;
  const CatalogProduct({required this.id, required this.branchId, required this.name, required this.description, required this.priceMinor, required this.currency, required this.version, this.configuration, this.category, this.imageUrl});
  factory CatalogProduct.fromJson(Map<String, dynamic> json) => CatalogProduct(id: json['id'] as String, branchId: json['branchId'] as String, name: json['name'] as String, description: json['description'] as String, priceMinor: json['priceMinor'] as int, currency: json['currency'] as String, version: json['version'] as int, configuration: json['configuration'] == null ? null : ProductConfiguration.fromJson(_object(json['configuration'])), category: json['category'] == null ? null : ProductCategory.fromJson(_object(json['category'])), imageUrl: json['imageUrl'] == null ? null : json['imageUrl'] as String, );
  Map<String, dynamic> toJson() => {'id': id, 'branchId': branchId, 'name': name, 'description': description, 'priceMinor': priceMinor, 'currency': currency, 'version': version, if (configuration != null) 'configuration': configuration!.toJson(), if (category != null) 'category': category!.toJson(), if (imageUrl != null) 'imageUrl': imageUrl!, };
}

class CreateOrderRequest {
  final String quoteId;
  final String paymentMethod;
  const CreateOrderRequest({required this.quoteId, required this.paymentMethod});
  factory CreateOrderRequest.fromJson(Map<String, dynamic> json) => CreateOrderRequest(quoteId: json['quoteId'] as String, paymentMethod: json['paymentMethod'] as String, );
  Map<String, dynamic> toJson() => {'quoteId': quoteId, 'paymentMethod': paymentMethod, };
}

class CustomerOrder {
  final String id;
  final String branchId;
  final String fulfilment;
  final String status;
  final int version;
  final int? preparationMinutes;
  final DateTime createdAt;
  final List<OrderItem> items;
  final String comment;
  final String paymentMethod;
  final String paymentStatus;
  final String currency;
  final int subtotalMinor;
  final int discountMinor;
  final int deliveryFeeMinor;
  final int totalMinor;
  final NullableDeliveryAddress? address;
  final String? courierId;
  final bool courierAccepted;
  final String? pickupCode;
  final List<OrderPayment> payments;
  final List<OrderEvent> events;
  const CustomerOrder({required this.id, required this.branchId, required this.fulfilment, required this.status, required this.version, required this.preparationMinutes, required this.createdAt, required this.items, required this.comment, required this.paymentMethod, required this.paymentStatus, required this.currency, required this.subtotalMinor, required this.discountMinor, required this.deliveryFeeMinor, required this.totalMinor, required this.address, required this.courierId, required this.courierAccepted, required this.pickupCode, required this.payments, required this.events});
  factory CustomerOrder.fromJson(Map<String, dynamic> json) => CustomerOrder(id: json['id'] as String, branchId: json['branchId'] as String, fulfilment: json['fulfilment'] as String, status: json['status'] as String, version: json['version'] as int, preparationMinutes: json['preparationMinutes'] == null ? null : json['preparationMinutes'] as int, createdAt: DateTime.parse(json['createdAt'] as String), items: (json['items'] as List).map((item) => OrderItem.fromJson(_object(item))).toList(), comment: json['comment'] as String, paymentMethod: json['paymentMethod'] as String, paymentStatus: json['paymentStatus'] as String, currency: json['currency'] as String, subtotalMinor: json['subtotalMinor'] as int, discountMinor: json['discountMinor'] as int, deliveryFeeMinor: json['deliveryFeeMinor'] as int, totalMinor: json['totalMinor'] as int, address: json['address'] == null ? null : NullableDeliveryAddress.fromJson(_object(json['address'])), courierId: json['courierId'] == null ? null : json['courierId'] as String, courierAccepted: json['courierAccepted'] as bool, pickupCode: json['pickupCode'] == null ? null : json['pickupCode'] as String, payments: (json['payments'] as List).map((item) => OrderPayment.fromJson(_object(item))).toList(), events: (json['events'] as List).map((item) => OrderEvent.fromJson(_object(item))).toList(), );
  Map<String, dynamic> toJson() => {'id': id, 'branchId': branchId, 'fulfilment': fulfilment, 'status': status, 'version': version, 'preparationMinutes': preparationMinutes == null ? null : preparationMinutes!, 'createdAt': createdAt.toUtc().toIso8601String(), 'items': items.map((item) => item.toJson()).toList(), 'comment': comment, 'paymentMethod': paymentMethod, 'paymentStatus': paymentStatus, 'currency': currency, 'subtotalMinor': subtotalMinor, 'discountMinor': discountMinor, 'deliveryFeeMinor': deliveryFeeMinor, 'totalMinor': totalMinor, 'address': address == null ? null : address!.toJson(), 'courierId': courierId == null ? null : courierId!, 'courierAccepted': courierAccepted, 'pickupCode': pickupCode == null ? null : pickupCode!, 'payments': payments.map((item) => item.toJson()).toList(), 'events': events.map((item) => item.toJson()).toList(), };
}

class CustomerProfile {
  final String id;
  final String? name;
  final String? phone;
  final String locale;
  const CustomerProfile({required this.id, required this.name, required this.phone, required this.locale});
  factory CustomerProfile.fromJson(Map<String, dynamic> json) => CustomerProfile(id: json['id'] as String, name: json['name'] == null ? null : json['name'] as String, phone: json['phone'] == null ? null : json['phone'] as String, locale: json['locale'] as String, );
  Map<String, dynamic> toJson() => {'id': id, 'name': name == null ? null : name!, 'phone': phone == null ? null : phone!, 'locale': locale, };
}

class DeliveryAddress {
  final String text;
  final double latitude;
  final double longitude;
  const DeliveryAddress({required this.text, required this.latitude, required this.longitude});
  factory DeliveryAddress.fromJson(Map<String, dynamic> json) => DeliveryAddress(text: json['text'] as String, latitude: (json['latitude'] as num).toDouble(), longitude: (json['longitude'] as num).toDouble(), );
  Map<String, dynamic> toJson() => {'text': text, 'latitude': latitude, 'longitude': longitude, };
}

class EmptyRequest {
  const EmptyRequest();
  factory EmptyRequest.fromJson(Map<String, dynamic> json) => EmptyRequest();
  Map<String, dynamic> toJson() => {};
}

class FeatureFlags {
  final bool ordering;
  final String paymentProvider;
  const FeatureFlags({required this.ordering, required this.paymentProvider});
  factory FeatureFlags.fromJson(Map<String, dynamic> json) => FeatureFlags(ordering: json['ordering'] as bool, paymentProvider: json['paymentProvider'] as String, );
  Map<String, dynamic> toJson() => {'ordering': ordering, 'paymentProvider': paymentProvider, };
}

class IncompatiblePair {
  final String firstId;
  final String secondId;
  const IncompatiblePair({required this.firstId, required this.secondId});
  factory IncompatiblePair.fromJson(Map<String, dynamic> json) => IncompatiblePair(firstId: json['firstId'] as String, secondId: json['secondId'] as String, );
  Map<String, dynamic> toJson() => {'firstId': firstId, 'secondId': secondId, };
}

class MockResultRequest {
  final String outcome;
  const MockResultRequest({required this.outcome});
  factory MockResultRequest.fromJson(Map<String, dynamic> json) => MockResultRequest(outcome: json['outcome'] as String, );
  Map<String, dynamic> toJson() => {'outcome': outcome, };
}

class Notification {
  final String id;
  final String orderId;
  final String type;
  final String provider;
  final DateTime createdAt;
  const Notification({required this.id, required this.orderId, required this.type, required this.provider, required this.createdAt});
  factory Notification.fromJson(Map<String, dynamic> json) => Notification(id: json['id'] as String, orderId: json['orderId'] as String, type: json['type'] as String, provider: json['provider'] as String, createdAt: DateTime.parse(json['createdAt'] as String), );
  Map<String, dynamic> toJson() => {'id': id, 'orderId': orderId, 'type': type, 'provider': provider, 'createdAt': createdAt.toUtc().toIso8601String(), };
}

class NotificationsResponse {
  final List<Notification> items;
  const NotificationsResponse({required this.items});
  factory NotificationsResponse.fromJson(Map<String, dynamic> json) => NotificationsResponse(items: (json['items'] as List).map((item) => Notification.fromJson(_object(item))).toList(), );
  Map<String, dynamic> toJson() => {'items': items.map((item) => item.toJson()).toList(), };
}

class NullableDeliveryAddress {
  final String text;
  final double latitude;
  final double longitude;
  const NullableDeliveryAddress({required this.text, required this.latitude, required this.longitude});
  factory NullableDeliveryAddress.fromJson(Map<String, dynamic> json) => NullableDeliveryAddress(text: json['text'] as String, latitude: (json['latitude'] as num).toDouble(), longitude: (json['longitude'] as num).toDouble(), );
  Map<String, dynamic> toJson() => {'text': text, 'latitude': latitude, 'longitude': longitude, };
}

class NullableRefundResponse {
  final String id;
  final String status;
  final int amountMinor;
  final String provider;
  const NullableRefundResponse({required this.id, required this.status, required this.amountMinor, required this.provider});
  factory NullableRefundResponse.fromJson(Map<String, dynamic> json) => NullableRefundResponse(id: json['id'] as String, status: json['status'] as String, amountMinor: json['amountMinor'] as int, provider: json['provider'] as String, );
  Map<String, dynamic> toJson() => {'id': id, 'status': status, 'amountMinor': amountMinor, 'provider': provider, };
}

class OkResponse {
  final bool ok;
  const OkResponse({required this.ok});
  factory OkResponse.fromJson(Map<String, dynamic> json) => OkResponse(ok: json['ok'] as bool, );
  Map<String, dynamic> toJson() => {'ok': ok, };
}

class OrderEvent {
  final String id;
  final String action;
  final int version;
  final DateTime createdAt;
  final String? reason;
  const OrderEvent({required this.id, required this.action, required this.version, required this.createdAt, required this.reason});
  factory OrderEvent.fromJson(Map<String, dynamic> json) => OrderEvent(id: json['id'] as String, action: json['action'] as String, version: json['version'] as int, createdAt: DateTime.parse(json['createdAt'] as String), reason: json['reason'] == null ? null : json['reason'] as String, );
  Map<String, dynamic> toJson() => {'id': id, 'action': action, 'version': version, 'createdAt': createdAt.toUtc().toIso8601String(), 'reason': reason == null ? null : reason!, };
}

class OrderItem {
  final String id;
  final String productId;
  final String nameRu;
  final String nameKk;
  final int quantity;
  final int unitPriceMinor;
  final int lineTotalMinor;
  final List<SelectedOption>? options;
  const OrderItem({required this.id, required this.productId, required this.nameRu, required this.nameKk, required this.quantity, required this.unitPriceMinor, required this.lineTotalMinor, this.options});
  factory OrderItem.fromJson(Map<String, dynamic> json) => OrderItem(id: json['id'] as String, productId: json['productId'] as String, nameRu: json['nameRu'] as String, nameKk: json['nameKk'] as String, quantity: json['quantity'] as int, unitPriceMinor: json['unitPriceMinor'] as int, lineTotalMinor: json['lineTotalMinor'] as int, options: json['options'] == null ? null : (json['options'] as List).map((item) => SelectedOption.fromJson(_object(item))).toList(), );
  Map<String, dynamic> toJson() => {'id': id, 'productId': productId, 'nameRu': nameRu, 'nameKk': nameKk, 'quantity': quantity, 'unitPriceMinor': unitPriceMinor, 'lineTotalMinor': lineTotalMinor, if (options != null) 'options': options!.map((item) => item.toJson()).toList(), };
}

class OrderPayment {
  final String id;
  final String provider;
  final String status;
  final int amountMinor;
  final NullableRefundResponse? refund;
  const OrderPayment({required this.id, required this.provider, required this.status, required this.amountMinor, required this.refund});
  factory OrderPayment.fromJson(Map<String, dynamic> json) => OrderPayment(id: json['id'] as String, provider: json['provider'] as String, status: json['status'] as String, amountMinor: json['amountMinor'] as int, refund: json['refund'] == null ? null : NullableRefundResponse.fromJson(_object(json['refund'])), );
  Map<String, dynamic> toJson() => {'id': id, 'provider': provider, 'status': status, 'amountMinor': amountMinor, 'refund': refund == null ? null : refund!.toJson(), };
}

class OrdersPage {
  final List<CustomerOrder> items;
  final String? nextCursor;
  const OrdersPage({required this.items, required this.nextCursor});
  factory OrdersPage.fromJson(Map<String, dynamic> json) => OrdersPage(items: (json['items'] as List).map((item) => CustomerOrder.fromJson(_object(item))).toList(), nextCursor: json['nextCursor'] == null ? null : json['nextCursor'] as String, );
  Map<String, dynamic> toJson() => {'items': items.map((item) => item.toJson()).toList(), 'nextCursor': nextCursor == null ? null : nextCursor!, };
}

class OtpChallengeResponse {
  final String challengeId;
  final int expiresIn;
  final int retryAfter;
  const OtpChallengeResponse({required this.challengeId, required this.expiresIn, required this.retryAfter});
  factory OtpChallengeResponse.fromJson(Map<String, dynamic> json) => OtpChallengeResponse(challengeId: json['challengeId'] as String, expiresIn: json['expiresIn'] as int, retryAfter: json['retryAfter'] as int, );
  Map<String, dynamic> toJson() => {'challengeId': challengeId, 'expiresIn': expiresIn, 'retryAfter': retryAfter, };
}

class OtpRequest {
  final String phone;
  const OtpRequest({required this.phone});
  factory OtpRequest.fromJson(Map<String, dynamic> json) => OtpRequest(phone: json['phone'] as String, );
  Map<String, dynamic> toJson() => {'phone': phone, };
}

class OtpVerifyRequest {
  final String challengeId;
  final String code;
  const OtpVerifyRequest({required this.challengeId, required this.code});
  factory OtpVerifyRequest.fromJson(Map<String, dynamic> json) => OtpVerifyRequest(challengeId: json['challengeId'] as String, code: json['code'] as String, );
  Map<String, dynamic> toJson() => {'challengeId': challengeId, 'code': code, };
}

class PrivacyExportPage {
  final String section;
  final List<Map<String, dynamic>> items;
  final String? nextCursor;
  final DateTime generatedAt;
  const PrivacyExportPage({required this.section, required this.items, required this.nextCursor, required this.generatedAt});
  factory PrivacyExportPage.fromJson(Map<String, dynamic> json) => PrivacyExportPage(section: json['section'] as String, items: (json['items'] as List).map((item) => _object(item)).toList(), nextCursor: json['nextCursor'] == null ? null : json['nextCursor'] as String, generatedAt: DateTime.parse(json['generatedAt'] as String), );
  Map<String, dynamic> toJson() => {'section': section, 'items': items.map((item) => item).toList(), 'nextCursor': nextCursor == null ? null : nextCursor!, 'generatedAt': generatedAt.toUtc().toIso8601String(), };
}

class ProductCategory {
  final String id;
  final String name;
  final int position;
  const ProductCategory({required this.id, required this.name, required this.position});
  factory ProductCategory.fromJson(Map<String, dynamic> json) => ProductCategory(id: json['id'] as String, name: json['name'] as String, position: json['position'] as int, );
  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'position': position, };
}

class ProductChoice {
  final String id;
  final String nameRu;
  final String nameKk;
  final int deltaMinor;
  final bool active;
  const ProductChoice({required this.id, required this.nameRu, required this.nameKk, required this.deltaMinor, required this.active});
  factory ProductChoice.fromJson(Map<String, dynamic> json) => ProductChoice(id: json['id'] as String, nameRu: json['nameRu'] as String, nameKk: json['nameKk'] as String, deltaMinor: json['deltaMinor'] as int, active: json['active'] as bool, );
  Map<String, dynamic> toJson() => {'id': id, 'nameRu': nameRu, 'nameKk': nameKk, 'deltaMinor': deltaMinor, 'active': active, };
}

class ProductConfiguration {
  final List<IncompatiblePair>? incompatiblePairs;
  final List<ProductVariant> variants;
  final List<ProductGroup> groups;
  const ProductConfiguration({this.incompatiblePairs, required this.variants, required this.groups});
  factory ProductConfiguration.fromJson(Map<String, dynamic> json) => ProductConfiguration(incompatiblePairs: json['incompatiblePairs'] == null ? null : (json['incompatiblePairs'] as List).map((item) => IncompatiblePair.fromJson(_object(item))).toList(), variants: (json['variants'] as List).map((item) => ProductVariant.fromJson(_object(item))).toList(), groups: (json['groups'] as List).map((item) => ProductGroup.fromJson(_object(item))).toList(), );
  Map<String, dynamic> toJson() => {if (incompatiblePairs != null) 'incompatiblePairs': incompatiblePairs!.map((item) => item.toJson()).toList(), 'variants': variants.map((item) => item.toJson()).toList(), 'groups': groups.map((item) => item.toJson()).toList(), };
}

class ProductGroup {
  final String id;
  final String nameRu;
  final String nameKk;
  final int minimum;
  final int maximum;
  final List<ProductChoice> choices;
  const ProductGroup({required this.id, required this.nameRu, required this.nameKk, required this.minimum, required this.maximum, required this.choices});
  factory ProductGroup.fromJson(Map<String, dynamic> json) => ProductGroup(id: json['id'] as String, nameRu: json['nameRu'] as String, nameKk: json['nameKk'] as String, minimum: json['minimum'] as int, maximum: json['maximum'] as int, choices: (json['choices'] as List).map((item) => ProductChoice.fromJson(_object(item))).toList(), );
  Map<String, dynamic> toJson() => {'id': id, 'nameRu': nameRu, 'nameKk': nameKk, 'minimum': minimum, 'maximum': maximum, 'choices': choices.map((item) => item.toJson()).toList(), };
}

class ProductVariant {
  final String id;
  final String nameRu;
  final String nameKk;
  final int priceMinor;
  final bool active;
  const ProductVariant({required this.id, required this.nameRu, required this.nameKk, required this.priceMinor, required this.active});
  factory ProductVariant.fromJson(Map<String, dynamic> json) => ProductVariant(id: json['id'] as String, nameRu: json['nameRu'] as String, nameKk: json['nameKk'] as String, priceMinor: json['priceMinor'] as int, active: json['active'] as bool, );
  Map<String, dynamic> toJson() => {'id': id, 'nameRu': nameRu, 'nameKk': nameKk, 'priceMinor': priceMinor, 'active': active, };
}

class ProfileRequest {
  final String? name;
  final String? locale;
  const ProfileRequest({this.name, this.locale});
  factory ProfileRequest.fromJson(Map<String, dynamic> json) => ProfileRequest(name: json['name'] == null ? null : json['name'] as String, locale: json['locale'] == null ? null : json['locale'] as String, );
  Map<String, dynamic> toJson() => {if (name != null) 'name': name!, if (locale != null) 'locale': locale!, };
}

class PublicBranch {
  final String id;
  final String nameRu;
  final String nameKk;
  final String timeZone;
  final bool acceptingOrders;
  final bool openNow;
  final bool allowCash;
  final int preparationMinutes;
  final int minimumPickupMinor;
  final double? latitude;
  final double? longitude;
  final String? addressRu;
  final String? addressKk;
  const PublicBranch({required this.id, required this.nameRu, required this.nameKk, required this.timeZone, required this.acceptingOrders, required this.openNow, required this.allowCash, required this.preparationMinutes, required this.minimumPickupMinor, this.latitude, this.longitude, this.addressRu, this.addressKk});
  factory PublicBranch.fromJson(Map<String, dynamic> json) => PublicBranch(id: json['id'] as String, nameRu: json['nameRu'] as String, nameKk: json['nameKk'] as String, timeZone: json['timeZone'] as String, acceptingOrders: json['acceptingOrders'] as bool, openNow: json['openNow'] as bool, allowCash: json['allowCash'] as bool, preparationMinutes: json['preparationMinutes'] as int, minimumPickupMinor: json['minimumPickupMinor'] as int, latitude: json['latitude'] == null ? null : (json['latitude'] as num).toDouble(), longitude: json['longitude'] == null ? null : (json['longitude'] as num).toDouble(), addressRu: json['addressRu'] == null ? null : json['addressRu'] as String, addressKk: json['addressKk'] == null ? null : json['addressKk'] as String, );
  Map<String, dynamic> toJson() => {'id': id, 'nameRu': nameRu, 'nameKk': nameKk, 'timeZone': timeZone, 'acceptingOrders': acceptingOrders, 'openNow': openNow, 'allowCash': allowCash, 'preparationMinutes': preparationMinutes, 'minimumPickupMinor': minimumPickupMinor, if (latitude != null) 'latitude': latitude!, if (longitude != null) 'longitude': longitude!, if (addressRu != null) 'addressRu': addressRu!, if (addressKk != null) 'addressKk': addressKk!, };
}

class QuoteLineRequest {
  final String productId;
  final int quantity;
  final String? variantId;
  final List<String>? choiceIds;
  const QuoteLineRequest({required this.productId, required this.quantity, this.variantId, this.choiceIds});
  factory QuoteLineRequest.fromJson(Map<String, dynamic> json) => QuoteLineRequest(productId: json['productId'] as String, quantity: json['quantity'] as int, variantId: json['variantId'] == null ? null : json['variantId'] as String, choiceIds: json['choiceIds'] == null ? null : (json['choiceIds'] as List).map((item) => item as String).toList(), );
  Map<String, dynamic> toJson() => {'productId': productId, 'quantity': quantity, if (variantId != null) 'variantId': variantId!, if (choiceIds != null) 'choiceIds': choiceIds!.map((item) => item).toList(), };
}

class QuoteRequest {
  final String branchId;
  final String fulfilment;
  final List<QuoteLineRequest> items;
  final DeliveryAddress? address;
  final String? promoCode;
  final String? comment;
  const QuoteRequest({required this.branchId, required this.fulfilment, required this.items, this.address, this.promoCode, this.comment});
  factory QuoteRequest.fromJson(Map<String, dynamic> json) => QuoteRequest(branchId: json['branchId'] as String, fulfilment: json['fulfilment'] as String, items: (json['items'] as List).map((item) => QuoteLineRequest.fromJson(_object(item))).toList(), address: json['address'] == null ? null : DeliveryAddress.fromJson(_object(json['address'])), promoCode: json['promoCode'] == null ? null : json['promoCode'] as String, comment: json['comment'] == null ? null : json['comment'] as String, );
  Map<String, dynamic> toJson() => {'branchId': branchId, 'fulfilment': fulfilment, 'items': items.map((item) => item.toJson()).toList(), if (address != null) 'address': address!.toJson(), if (promoCode != null) 'promoCode': promoCode!, if (comment != null) 'comment': comment!, };
}

class QuoteResponse {
  final String quoteId;
  final DateTime expiresAt;
  final String pricingVersion;
  final String signature;
  final List<QuotedItem> items;
  final int subtotalMinor;
  final int discountMinor;
  final int deliveryFeeMinor;
  final int totalMinor;
  final String currency;
  final String? zoneId;
  final String? promotionId;
  final int preparationMinutes;
  const QuoteResponse({required this.quoteId, required this.expiresAt, required this.pricingVersion, required this.signature, required this.items, required this.subtotalMinor, required this.discountMinor, required this.deliveryFeeMinor, required this.totalMinor, required this.currency, required this.zoneId, required this.promotionId, required this.preparationMinutes});
  factory QuoteResponse.fromJson(Map<String, dynamic> json) => QuoteResponse(quoteId: json['quoteId'] as String, expiresAt: DateTime.parse(json['expiresAt'] as String), pricingVersion: json['pricingVersion'] as String, signature: json['signature'] as String, items: (json['items'] as List).map((item) => QuotedItem.fromJson(_object(item))).toList(), subtotalMinor: json['subtotalMinor'] as int, discountMinor: json['discountMinor'] as int, deliveryFeeMinor: json['deliveryFeeMinor'] as int, totalMinor: json['totalMinor'] as int, currency: json['currency'] as String, zoneId: json['zoneId'] == null ? null : json['zoneId'] as String, promotionId: json['promotionId'] == null ? null : json['promotionId'] as String, preparationMinutes: json['preparationMinutes'] as int, );
  Map<String, dynamic> toJson() => {'quoteId': quoteId, 'expiresAt': expiresAt.toUtc().toIso8601String(), 'pricingVersion': pricingVersion, 'signature': signature, 'items': items.map((item) => item.toJson()).toList(), 'subtotalMinor': subtotalMinor, 'discountMinor': discountMinor, 'deliveryFeeMinor': deliveryFeeMinor, 'totalMinor': totalMinor, 'currency': currency, 'zoneId': zoneId == null ? null : zoneId!, 'promotionId': promotionId == null ? null : promotionId!, 'preparationMinutes': preparationMinutes, };
}

class QuotedItem {
  final String productId;
  final String nameRu;
  final String nameKk;
  final int quantity;
  final int unitPriceMinor;
  final int lineTotalMinor;
  final int version;
  final List<SelectedOption>? options;
  const QuotedItem({required this.productId, required this.nameRu, required this.nameKk, required this.quantity, required this.unitPriceMinor, required this.lineTotalMinor, required this.version, this.options});
  factory QuotedItem.fromJson(Map<String, dynamic> json) => QuotedItem(productId: json['productId'] as String, nameRu: json['nameRu'] as String, nameKk: json['nameKk'] as String, quantity: json['quantity'] as int, unitPriceMinor: json['unitPriceMinor'] as int, lineTotalMinor: json['lineTotalMinor'] as int, version: json['version'] as int, options: json['options'] == null ? null : (json['options'] as List).map((item) => SelectedOption.fromJson(_object(item))).toList(), );
  Map<String, dynamic> toJson() => {'productId': productId, 'nameRu': nameRu, 'nameKk': nameKk, 'quantity': quantity, 'unitPriceMinor': unitPriceMinor, 'lineTotalMinor': lineTotalMinor, 'version': version, if (options != null) 'options': options!.map((item) => item.toJson()).toList(), };
}

class ReasonRequest {
  final int expectedVersion;
  final String reason;
  const ReasonRequest({required this.expectedVersion, required this.reason});
  factory ReasonRequest.fromJson(Map<String, dynamic> json) => ReasonRequest(expectedVersion: json['expectedVersion'] as int, reason: json['reason'] as String, );
  Map<String, dynamic> toJson() => {'expectedVersion': expectedVersion, 'reason': reason, };
}

class RefreshRequest {
  final String refreshToken;
  const RefreshRequest({required this.refreshToken});
  factory RefreshRequest.fromJson(Map<String, dynamic> json) => RefreshRequest(refreshToken: json['refreshToken'] as String, );
  Map<String, dynamic> toJson() => {'refreshToken': refreshToken, };
}

class SavedAddress {
  final String id;
  final String customerId;
  final String label;
  final String text;
  final double? latitude;
  final double? longitude;
  final int version;
  final DateTime createdAt;
  const SavedAddress({required this.id, required this.customerId, required this.label, required this.text, required this.latitude, required this.longitude, required this.version, required this.createdAt});
  factory SavedAddress.fromJson(Map<String, dynamic> json) => SavedAddress(id: json['id'] as String, customerId: json['customerId'] as String, label: json['label'] as String, text: json['text'] as String, latitude: json['latitude'] == null ? null : (json['latitude'] as num).toDouble(), longitude: json['longitude'] == null ? null : (json['longitude'] as num).toDouble(), version: json['version'] as int, createdAt: DateTime.parse(json['createdAt'] as String), );
  Map<String, dynamic> toJson() => {'id': id, 'customerId': customerId, 'label': label, 'text': text, 'latitude': latitude == null ? null : latitude!, 'longitude': longitude == null ? null : longitude!, 'version': version, 'createdAt': createdAt.toUtc().toIso8601String(), };
}

class SelectedOption {
  final String id;
  final String nameRu;
  final String nameKk;
  final int deltaMinor;
  const SelectedOption({required this.id, required this.nameRu, required this.nameKk, required this.deltaMinor});
  factory SelectedOption.fromJson(Map<String, dynamic> json) => SelectedOption(id: json['id'] as String, nameRu: json['nameRu'] as String, nameKk: json['nameKk'] as String, deltaMinor: json['deltaMinor'] as int, );
  Map<String, dynamic> toJson() => {'id': id, 'nameRu': nameRu, 'nameKk': nameKk, 'deltaMinor': deltaMinor, };
}

class TokensResponse {
  final String accessToken;
  final String refreshToken;
  final int expiresIn;
  const TokensResponse({required this.accessToken, required this.refreshToken, required this.expiresIn});
  factory TokensResponse.fromJson(Map<String, dynamic> json) => TokensResponse(accessToken: json['accessToken'] as String, refreshToken: json['refreshToken'] as String, expiresIn: json['expiresIn'] as int, );
  Map<String, dynamic> toJson() => {'accessToken': accessToken, 'refreshToken': refreshToken, 'expiresIn': expiresIn, };
}

class VersionRequest {
  final int expectedVersion;
  const VersionRequest({required this.expectedVersion});
  factory VersionRequest.fromJson(Map<String, dynamic> json) => VersionRequest(expectedVersion: json['expectedVersion'] as int, );
  Map<String, dynamic> toJson() => {'expectedVersion': expectedVersion, };
}

class FoodDeliveryApi {
  final Dio dio;
  const FoodDeliveryApi(this.dio);
  Future<OtpChallengeResponse> privacyChallenge(EmptyRequest input) async {
    final response = await dio.request('/me/privacy/challenge', data: input.toJson(), options: Options(method: 'POST'));
    return OtpChallengeResponse.fromJson(_object(response.data));
  }
  Future<OkResponse> privacyConfirm(OtpVerifyRequest input) async {
    final response = await dio.request('/me/privacy/confirm', data: input.toJson(), options: Options(method: 'POST'));
    return OkResponse.fromJson(_object(response.data));
  }
  Future<PrivacyExportPage> privacyExport({String section = 'profile', String? cursor}) async {
    final response = await dio.request('/me/privacy/export', queryParameters: {'section': section, if (cursor != null) 'cursor': cursor}, options: Options(method: 'GET'));
    return PrivacyExportPage.fromJson(_object(response.data));
  }
  Future<BootstrapResponse> bootstrap() async {
    final response = await dio.request('/bootstrap', options: Options(method: 'GET'));
    return BootstrapResponse.fromJson(_object(response.data));
  }
  Future<BranchesResponse> branches() async {
    final response = await dio.request('/branches', options: Options(method: 'GET'));
    return BranchesResponse.fromJson(_object(response.data));
  }
  Future<CatalogPage> catalog({required String branchId, String locale = 'ru', int limit = 100, String? cursor, String? search}) async {
    final response = await dio.request('/catalog', queryParameters: {'branchId': branchId, 'locale': locale, 'limit': limit, if (cursor != null) 'cursor': cursor, if (search != null) 'search': search}, options: Options(method: 'GET'));
    return CatalogPage.fromJson(_object(response.data));
  }
  Future<OtpChallengeResponse> requestOtp(OtpRequest input) async {
    final response = await dio.request('/auth/otp/request', data: input.toJson(), options: Options(method: 'POST'));
    return OtpChallengeResponse.fromJson(_object(response.data));
  }
  Future<TokensResponse> verifyOtp(OtpVerifyRequest input) async {
    final response = await dio.request('/auth/otp/verify', data: input.toJson(), options: Options(method: 'POST'));
    return TokensResponse.fromJson(_object(response.data));
  }
  Future<TokensResponse> refresh(RefreshRequest input) async {
    final response = await dio.request('/auth/refresh', data: input.toJson(), options: Options(method: 'POST'));
    return TokensResponse.fromJson(_object(response.data));
  }
  Future<CustomerProfile> me() async {
    final response = await dio.request('/me', options: Options(method: 'GET'));
    return CustomerProfile.fromJson(_object(response.data));
  }
  Future<CustomerProfile> updateProfile(ProfileRequest input) async {
    final response = await dio.request('/me', data: input.toJson(), options: Options(method: 'PATCH'));
    return CustomerProfile.fromJson(_object(response.data));
  }
  Future<OkResponse> logout(EmptyRequest input) async {
    final response = await dio.request('/auth/logout', data: input.toJson(), options: Options(method: 'POST'));
    return OkResponse.fromJson(_object(response.data));
  }
  Future<OkResponse> logoutAll(EmptyRequest input) async {
    final response = await dio.request('/auth/logout-all', data: input.toJson(), options: Options(method: 'POST'));
    return OkResponse.fromJson(_object(response.data));
  }
  Future<AddressesResponse> addresses() async {
    final response = await dio.request('/me/addresses', options: Options(method: 'GET'));
    return AddressesResponse.fromJson(_object(response.data));
  }
  Future<SavedAddress> createAddress(AddressRequest input) async {
    final response = await dio.request('/me/addresses', data: input.toJson(), options: Options(method: 'POST'));
    return SavedAddress.fromJson(_object(response.data));
  }
  Future<SavedAddress> updateAddress(String id, AddressUpdateRequest input) async {
    final response = await dio.request('/me/addresses/${Uri.encodeComponent(id)}', data: input.toJson(), options: Options(method: 'PATCH'));
    return SavedAddress.fromJson(_object(response.data));
  }
  Future<OkResponse> deleteAddress(String id, VersionRequest input) async {
    final response = await dio.request('/me/addresses/${Uri.encodeComponent(id)}', data: input.toJson(), options: Options(method: 'DELETE'));
    return OkResponse.fromJson(_object(response.data));
  }
  Future<OtpChallengeResponse> deletionChallenge(EmptyRequest input) async {
    final response = await dio.request('/me/deletion-challenge', data: input.toJson(), options: Options(method: 'POST'));
    return OtpChallengeResponse.fromJson(_object(response.data));
  }
  Future<OkResponse> deleteAccount(OtpVerifyRequest input) async {
    final response = await dio.request('/me/delete', data: input.toJson(), options: Options(method: 'POST'));
    return OkResponse.fromJson(_object(response.data));
  }
  Future<QuoteResponse> quote(QuoteRequest input) async {
    final response = await dio.request('/checkout/quote', data: input.toJson(), options: Options(method: 'POST'));
    return QuoteResponse.fromJson(_object(response.data));
  }
  Future<CustomerOrder> createOrder(CreateOrderRequest input, {required String idempotencyKey}) async {
    final response = await dio.request('/orders', data: input.toJson(), options: Options(method: 'POST', headers: {'Idempotency-Key': idempotencyKey}));
    return CustomerOrder.fromJson(_object(response.data));
  }
  Future<OrdersPage> orders({int limit = 20, String? cursor}) async {
    final response = await dio.request('/me/orders', queryParameters: {'limit': limit, if (cursor != null) 'cursor': cursor}, options: Options(method: 'GET'));
    return OrdersPage.fromJson(_object(response.data));
  }
  Future<CustomerOrder> pendingOrder(String lookupKey) async {
    final response = await dio.request('/orders/by-key/${Uri.encodeComponent(lookupKey)}', options: Options(method: 'GET'));
    return CustomerOrder.fromJson(_object(response.data));
  }
  Future<CustomerOrder> order(String id) async {
    final response = await dio.request('/orders/${Uri.encodeComponent(id)}', options: Options(method: 'GET'));
    return CustomerOrder.fromJson(_object(response.data));
  }
  Future<CustomerOrder> cancelOrder(String id, ReasonRequest input) async {
    final response = await dio.request('/orders/${Uri.encodeComponent(id)}/cancel', data: input.toJson(), options: Options(method: 'POST'));
    return CustomerOrder.fromJson(_object(response.data));
  }
  Future<CustomerOrder> retryPayment(String id, EmptyRequest input, {required String idempotencyKey}) async {
    final response = await dio.request('/orders/${Uri.encodeComponent(id)}/payment-attempts', data: input.toJson(), options: Options(method: 'POST', headers: {'Idempotency-Key': idempotencyKey}));
    return CustomerOrder.fromJson(_object(response.data));
  }
  Future<CustomerOrder> simulatePayment(String id, MockResultRequest input) async {
    final response = await dio.request('/payments/${Uri.encodeComponent(id)}/mock-result', data: input.toJson(), options: Options(method: 'POST'));
    return CustomerOrder.fromJson(_object(response.data));
  }
  Future<NotificationsResponse> notifications() async {
    final response = await dio.request('/me/notifications', options: Options(method: 'GET'));
    return NotificationsResponse.fromJson(_object(response.data));
  }
}
