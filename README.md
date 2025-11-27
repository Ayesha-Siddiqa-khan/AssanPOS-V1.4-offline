# AsaanPOS - React Native Expo App

A comprehensive Point of Sale application for hardware shops built with React Native and Expo.

## Features

- ✅ Complete POS system with product selection and checkout
- ✅ Inventory management with variants (Malaysian panels, locks, hinges, etc.)
- ✅ Customer management with credit system
- ✅ Vendor management and purchase tracking
- ✅ Daily expenditure tracking (8 categories)
- ✅ Sales history and analytics
- ✅ Offline-first with SQLite database
- ✅ Bilingual support (English/Urdu)
- ✅ Pakistani Rupees (Rs.) currency
- ✅ 11-digit Pakistani phone number validation

## Tech Stack

- **React Native** - Mobile framework
- **Expo** - Development platform
- **Expo Router** - File-based navigation
- **expo-sqlite** - Local database
- **NativeWind** - Tailwind CSS for React Native
- **TypeScript** - Type safety
- **React Native Chart Kit** - Charts and analytics

## Prerequisites

- Node.js 18+ installed
- npm or yarn
- Expo CLI (will be installed automatically)
- iOS Simulator (macOS only) or Android Studio for emulator

## Installation

1. **Navigate to the React Native app directory:**
   ```bash
   cd rn-app
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npx expo start
   ```

4. **Run on device/simulator:**
   - Press `i` for iOS Simulator (macOS only)
   - Press `a` for Android Emulator
   - Scan QR code with Expo Go app on physical device

## Project Structure

```
rn-app/
├── app/                    # Expo Router screens
│   ├── (tabs)/            # Tab navigation screens
│   │   ├── _layout.tsx    # Tab navigator
│   │   ├── index.tsx      # Home screen
│   │   ├── customers.tsx  # Customers screen
│   │   ├── sales.tsx      # Sales history
│   │   ├── inventory.tsx  # Inventory management
│   │   └── reports.tsx    # Reports & analytics
│   ├── modals/            # Modal screens
│   │   ├── product-selection.tsx
│   │   ├── payment.tsx
│   │   ├── customer-account.tsx
│   │   └── expenditure.tsx
│   └── _layout.tsx        # Root layout with providers
├── components/            # Reusable components
│   └── ui/               # UI components (Button, Input, etc.)
├── contexts/             # React contexts
│   ├── DataContext.tsx   # Database operations
│   └── LanguageContext.tsx # i18n support
├── lib/                  # Utilities
│   └── database.ts       # SQLite database
├── app.json             # Expo configuration
├── package.json         # Dependencies
└── tailwind.config.js   # Tailwind config

```

## Database

The app uses **expo-sqlite** for local data persistence. The database includes:

- **Products** - Main items and variants
- **Customers** - Customer information with credit tracking
- **Sales** - Sales transactions
- **Credit Transactions** - Credit add/deduct/use history
- **Vendors** - Supplier information
- **Purchases** - Purchase orders
- **Expenditures** - Daily expenses across 8 categories
- **Settings** - App settings

Default products are automatically seeded on first launch.

## Key Differences from Web Version

### Storage
- ❌ IndexedDB → ✅ SQLite (expo-sqlite)
- All data operations are async
- Better performance on mobile

### UI Components
- ❌ ShadCN UI → ✅ Custom React Native components
- TouchableOpacity instead of Button
- TextInput instead of Input
- Modal instead of Dialog
- FlatList for optimized lists

### Navigation
- ❌ State-based navigation → ✅ Expo Router (file-based)
- Stack and Tab navigators
- Deep linking support

### Styling
- ❌ CSS/Tailwind → ✅ NativeWind (Tailwind for RN)
- Same utility classes, native performance
- Automatic dark mode support

### Platform Features
- Safe area handling for notched devices
- Hardware back button support (Android)
- Native date/time pickers
- Platform-specific UI adjustments

## Development

### Adding New Screens

1. **Tab Screen**: Create file in `app/(tabs)/`
2. **Modal Screen**: Create file in `app/modals/`
3. **Update navigation** in respective `_layout.tsx`

### Database Operations

```typescript
import { db } from '../lib/database';

// Get all products
const products = await db.getAllProducts();

// Add customer
await db.addCustomer({
  name: 'Ali Khan',
  phone: '03001234567',
  credit: 0,
  // ...
});
```

### Using Context

```typescript
import { useData } from '../contexts/DataContext';
import { useLanguage } from '../contexts/LanguageContext';

const { products, customers } = useData();
const { t, language, setLanguage } = useLanguage();

// Bilingual text
<Text>{t('Hello')}</Text>
```

## Building for Production

Expo’s **EAS Build** service handles signing and packaging. Make sure you have an Expo account and the EAS CLI installed.

```bash
# install once (or use npx eas ...)
npm install -g eas-cli
```

### 1. Prepare credentials

```bash
npx eas login                      # sign in to your Expo account
npx eas whoami                     # confirm login
npx eas build:configure            # generates eas.json/updates credentials
```

### 2. Build Android (Preview / Internal testing)

```bash
# Creates an installable .apk for quick testing
eas build --platform android --profile preview
```

When the build finishes, grab the download link from the terminal or https://expo.dev/accounts/<your-account>/projects/<project-name>/builds.

### 3. Build Android (Play Store release)

```bash
# Generates a Google Play .aab bundle with production signing
eas build --platform android --profile production
```

### 4. Build iOS (requires Apple Developer account)

```bash
eas build --platform ios --profile production
```

### 5. Submit to the stores (optional)

```bash
eas submit --platform android       # upload .aab to Google Play
eas submit --platform ios           # upload .ipa via App Store Connect
```

> **Tip:** You can trigger both platforms together with `eas build --platform all --profile production`.

## Testing

### On Physical Device

1. Install **Expo Go** from App Store/Play Store
2. Run `npx expo start`
3. Scan QR code with device camera

### On Emulator

**iOS Simulator (macOS only):**
```bash
npx expo start --ios
```

**Android Emulator:**
```bash
npx expo start --android
```

## Features Implementation Status

- ✅ Sales/POS functionality
- ✅ Product selection with variants
- ✅ Inventory management
- ✅ Stock tracking with low stock alerts
- ✅ Customer management
- ✅ Credit system
- ✅ Vendor management
- ✅ Purchase orders
- ✅ Daily expenditure tracking
- ✅ Sales history
- ✅ Reports & analytics
- ✅ Bilingual support (English/Urdu)
- ✅ Offline database
- ✅ Data backup/restore
- ✅ Pakistani phone number validation

## Troubleshooting

### Database Issues

If you encounter database errors:
```typescript
import { db } from './lib/database';

// Clear and reseed database
await db.clearAllData();
```

### Metro Bundler Cache

```bash
npx expo start --clear
```

### Dependency Issues

```bash
rm -rf node_modules package-lock.json
npm install
```

## Performance Tips

1. Use `React.memo` for expensive components
2. Use `useMemo`/`useCallback` for heavy calculations
3. Implement pagination for large lists
4. Use FlatList's `getItemLayout` for fixed-height items
5. Enable Hermes engine (enabled by default in Expo)

## Contributing

This is a conversion of a web-based POS system to React Native. Key areas for improvement:

- [ ] Add unit tests
- [ ] Implement data sync (multi-device)
- [ ] Add biometric authentication
- [ ] Implement receipt printing
- [ ] Add barcode scanning
- [ ] Cloud backup integration

## License

Private project for hardware shop management.

## Support

For issues or questions about the React Native version, refer to:
- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- [NativeWind Documentation](https://www.nativewind.dev/)


