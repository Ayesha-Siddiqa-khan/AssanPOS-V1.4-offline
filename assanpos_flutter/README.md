# AssanPOS Flutter

Flutter rewrite of AsaanPOS focused on inventory management with barcode/voice tools that work without Expo native rebuilds. This repo currently ships the Dart source (`lib/`) and `pubspec.yaml`. Run the following inside `assanpos_flutter` to generate platform scaffolding and fetch packages:

```bash
flutter create .
flutter pub get
flutter run
```

## Features
- Inventory dashboard with quick stats and low stock alerting
- Product search with instant filtering and barcode-powered lookup
- Add-product flow supporting manual entry or camera scan via `mobile_scanner`
- Riverpod-powered state so offline cache/business logic is easy to extend

The code is organised per feature (`lib/features/inventory`) so bringing in JazzCash, Sales, etc. is straightforward.
