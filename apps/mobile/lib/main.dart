import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
Future<void> main() async {
 WidgetsFlutterBinding.ensureInitialized();
 final brand=jsonDecode(await rootBundle.loadString('assets/brand.json')) as Map<String,dynamic>;
 runApp(DeliveryApp(brand:brand));
}
class DeliveryApp extends StatelessWidget {
 const DeliveryApp({super.key,required this.brand});
 final Map<String,dynamic> brand;
 Color color(String key)=>Color(int.parse((brand[key] as String).replaceFirst('#','FF'),radix:16));
 @override Widget build(BuildContext context)=>MaterialApp(
  title:brand['displayName'] as String,
  theme:ThemeData(useMaterial3:true,colorScheme:ColorScheme.fromSeed(seedColor:color('primaryColor')),scaffoldBackgroundColor:color('surfaceColor')),
  home:Scaffold(appBar:AppBar(title:Text(brand['displayName'] as String)),body:const Center(child:Padding(padding:EdgeInsets.all(24),child:Text('Основа приложения. Каталог, заказы и оплата ещё не подключены.',textAlign:TextAlign.center)))),
 );
}
