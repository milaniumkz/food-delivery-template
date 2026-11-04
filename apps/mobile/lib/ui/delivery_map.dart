import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
import '../data/shop.dart';

LatLng? deliveryPoint(String latitude, String longitude) {
  final a = double.tryParse(latitude.replaceAll(',', '.')),
      b = double.tryParse(longitude.replaceAll(',', '.'));
  if (a == null ||
      b == null ||
      !a.isFinite ||
      !b.isFinite ||
      a < -90 ||
      a > 90 ||
      b < -180 ||
      b > 180) {
    return null;
  }
  return LatLng(a, b);
}

class DeliveryMap extends StatefulWidget {
  final Shop shop;
  final LatLng? initialPoint;
  const DeliveryMap({super.key, required this.shop, this.initialPoint});
  @override
  State<DeliveryMap> createState() => _DeliveryMapState();
}

class _DeliveryMapState extends State<DeliveryMap> {
  final controller = MapController();
  LatLng? selected;
  String? error;
  bool locating = false, tileError = false;
  @override
  void initState() {
    super.initState();
    selected = widget.initialPoint;
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  Future<void> locate() async {
    setState(() {
      locating = true;
      error = null;
    });
    final s = widget.shop;
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        throw StateError('Disabled');
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw StateError('Denied');
      }
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
      if (!mounted) return;
      final point = LatLng(position.latitude, position.longitude);
      setState(() => selected = point);
      controller.move(point, 16);
    } catch (_) {
      if (mounted) {
        setState(
          () => error = s.text(
            'Не удалось получить геопозицию. Выберите точку на карте или введите координаты вручную.',
            'Геопозиция алынбады. Картадан нүкте таңдаңыз немесе координаттарды қолмен енгізіңіз.',
          ),
        );
      }
    } finally {
      if (mounted) setState(() => locating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.shop,
        b = s.branch,
        center =
            widget.initialPoint ??
            (b?.latitude != null && b?.longitude != null
                ? LatLng(b!.latitude!, b.longitude!)
                : const LatLng(0, 0));
    return Scaffold(
      appBar: AppBar(title: Text(s.text('Точка доставки', 'Жеткізу нүктесі'))),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(
                    s.text(
                      'Нажмите точное место доставки на карте. Адрес укажите отдельно.',
                      'Картадан нақты жеткізу орнын басыңыз. Мекенжайды бөлек көрсетіңіз.',
                    ),
                  ),
                ),
                if (locating) const LinearProgressIndicator(),
                if (error != null)
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text(error!, semanticsLabel: error),
                  ),
                if (tileError)
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text(
                      s.text(
                        'Карта недоступна. Ручной ввод координат остаётся доступен на экране оформления.',
                        'Карта қолжетімсіз. Рәсімдеу экранында координаттарды қолмен енгізуге болады.',
                      ),
                    ),
                  ),
                SizedBox(
                  height: (constraints.maxHeight * 0.6)
                      .clamp(240.0, 600.0)
                      .toDouble(),
                  child: FlutterMap(
                    mapController: controller,
                    options: MapOptions(
                      initialCenter: center,
                      initialZoom: center == const LatLng(0, 0) ? 2 : 15,
                      onTap: (_, point) => setState(() => selected = point),
                    ),
                    children: [
                      TileLayer(
                        urlTemplate:
                            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                        userAgentPackageName:
                            s.brand['applicationId'] as String,
                        errorTileCallback: (_, _, _) {
                          if (!tileError && mounted) {
                            WidgetsBinding.instance.addPostFrameCallback((_) {
                              if (mounted) setState(() => tileError = true);
                            });
                          }
                        },
                      ),
                      if (selected != null)
                        MarkerLayer(
                          markers: [
                            Marker(
                              point: selected!,
                              width: 48,
                              height: 48,
                              child: Icon(
                                Icons.location_pin,
                                size: 48,
                                color: Theme.of(context).colorScheme.primary,
                                semanticLabel: s.text(
                                  'Место доставки',
                                  'Жеткізу орны',
                                ),
                              ),
                            ),
                          ],
                        ),
                      RichAttributionWidget(
                        attributions: [
                          TextSourceAttribution(
                            'OpenStreetMap contributors',
                            onTap: () => launchUrl(
                              Uri.parse(
                                'https://www.openstreetmap.org/copyright',
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    children: [
                      if (selected != null)
                        Text(
                          '${selected!.latitude.toStringAsFixed(6)}, ${selected!.longitude.toStringAsFixed(6)}',
                        ),
                      Wrap(
                        spacing: 12,
                        children: [
                          OutlinedButton.icon(
                            onPressed: locating ? null : locate,
                            icon: const Icon(Icons.my_location),
                            label: Text(
                              s.text('Моё местоположение', 'Менің орным'),
                            ),
                          ),
                          FilledButton(
                            onPressed: selected == null
                                ? null
                                : () => Navigator.pop(context, selected),
                            child: Text(
                              s.text('Выбрать точку', 'Нүктені таңдау'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
