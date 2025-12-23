# Quick Start Guide - React Native POS App

## 🚀 Get Running in 3 Steps

### Step 1: Install Dependencies (5 minutes)
```bash
cd rn-app
npm install
```

### Step 2: Start the App (1 minute)
```bash
npx expo start
```

### Step 3: Open on Device
**Choose one:**

**iOS Simulator** (macOS only):
```
Press 'i' in terminal
```

**Android Emulator**:
```
Press 'a' in terminal
```

**Physical Device**:
1. Install "Expo Go" from App Store/Play Store
2. Scan QR code shown in terminal

---

## ✅ What's Working Now

### 5 Main Screens (All Functional)
1. **Home** - Dashboard with stats & quick actions
2. **Customers** - Customer list with search
3. **Sales** - Complete sales history
4. **Inventory** - Products with stock tracking
5. **Reports** - Analytics & profit calculations

### Key Features
- ✅ SQLite database with sample data
- ✅ English/Urdu language support
- ✅ Real-time statistics
- ✅ Low stock alerts
- ✅ Pending payment tracking
- ✅ Product variants support
- ✅ Search & filtering

---

## 📱 First Launch

When you open the app, you'll see:
- Pre-loaded products (panels, locks, hinges, etc.)
- Sample data for testing
- Dashboard with today's stats
- Language toggle (English ⇔ اردو)

---

## 🎯 Try These Features

1. **Switch Language**: Tap language toggle on Home screen
2. **Browse Products**: Go to Inventory → See all products
3. **Search Products**: Use search bar in Inventory
4. **Filter by Category**: Tap category pills in Inventory
5. **View Customers**: Go to Customers tab
6. **Check Reports**: Go to Reports → See analytics

---

## 🆘 Having Issues?

### Metro bundler issues?
```bash
npx expo start --clear
```

### Need to reinstall?
```bash
rm -rf node_modules package-lock.json
npm install
```

### iOS Simulator not opening?
```bash
# Open manually
open -a Simulator
```

---

## 📚 More Help

- **Full Setup**: See `SETUP_GUIDE.md`
- **Features**: See `REACT_NATIVE_APP_COMPLETE.md`
- **Troubleshooting**: Check SETUP_GUIDE.md troubleshooting section

---

## 🎉 You're All Set!

Your POS app is ready to use. Start exploring the features and test the functionality!

**Next**: To implement sales flow, see modal screens in `/app/modals/`
