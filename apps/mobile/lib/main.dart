import 'ui/privacy.dart';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'data/shop.dart';
import 'ui/screens.dart';

final shopProvider = ChangeNotifierProvider<Shop>(
  (ref) => throw StateError('Shop override required'),
);
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final brand = Map<String, dynamic>.from(
    jsonDecode(await rootBundle.loadString('assets/brand.json')),
  );
  final shop = Shop(
    brand: brand,
    vault: const DeviceVault(FlutterSecureStorage()),
  );
  runApp(
    ProviderScope(
      overrides: [shopProvider.overrideWith((ref) => shop)],
      child: const DeliveryApp(),
    ),
  );
  await shop.initialize();
}

final router = GoRouter(
  routes: [
    GoRoute(path: '/', builder: (context, state) => const MenuScreen()),
    GoRoute(path: '/cart', builder: (context, state) => const CartScreen()),
    GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
    GoRoute(
      path: '/orders',
      builder: (context, state) => const HistoryScreen(),
    ),
    GoRoute(
      path: '/orders/:id',
      builder: (context, state) => OrderScreen(id: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/privacy',
      builder: (context, state) => Consumer(
        builder: (context, ref, _) =>
            PrivacyScreen(key: ValueKey(ref.watch(shopProvider).customer?.id)),
      ),
    ),
    GoRoute(
      path: '/profile',
      builder: (context, state) => Consumer(
        builder: (context, ref, _) =>
            ProfileScreen(key: ValueKey(ref.watch(shopProvider).customer?.id)),
      ),
    ),
  ],
);

class DeliveryApp extends ConsumerWidget {
  const DeliveryApp({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shop = ref.watch(shopProvider), brand = shop.brand;
    Color color(String name) => Color(
      int.parse((brand[name] as String).replaceFirst('#', 'FF'), radix: 16),
    );
    return MaterialApp.router(
      title: brand['displayName'],
      routerConfig: router,
      locale: Locale(shop.locale),
      supportedLocales: shop.enabledLocales.map(Locale.new).toList(),
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: color('primaryColor'))
            .copyWith(
              primary: color('primaryColor'),
              onPrimary: color('onPrimary'),
            ),
        scaffoldBackgroundColor: color('surfaceColor'),
        textTheme: ThemeData().textTheme.apply(
          bodyColor: color('textColor'),
          displayColor: color('textColor'),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(minimumSize: const Size(48, 48)),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(minimumSize: const Size(48, 48)),
        ),
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
        ),
        iconButtonTheme: IconButtonThemeData(
          style: IconButton.styleFrom(minimumSize: const Size(48, 48)),
        ),
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
        ),
      ),
    );
  }
}
