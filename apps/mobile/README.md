# Flutter starter
Flutter SDK отсутствовал в среде подготовки: код не собирался и не проверялся Flutter analyze.
Native runners Android/iOS намеренно не сгенерированы. В этапе 0 создать временный проект `flutter create --platforms=android,ios --org com.example food_delivery_starter`, перенести runners и проверить package/bundle IDs.
После проверки бренда скопировать `.generated/demo/brand.json` в `apps/mobile/assets/brand.json`. Добавить рендеринг SVG-логотипа, генерацию native icons/splash и поддержку flavors в этапе 1. Стартовый экран пока показывает только имя и тему.
