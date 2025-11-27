# Install Barcode Scanner Package

⚠️ **IMPORTANT: The camera barcode scanner is currently DISABLED** because the package is not installed yet.

Your app will work normally with **manual barcode entry**, but camera scanning won't work until you follow these steps.

## Current Status

✅ **Manual Barcode Entry** - Working (type barcode manually)
✅ **External Bluetooth/USB Scanners** - Working (they type into the input field)
❌ **Camera Scanning** - Disabled (requires package installation)

## Installation Steps

### Step 1: Install the Package

**Option A: Using Command Prompt (Recommended)**
1. Close VS Code and the Expo app completely
2. Open **Command Prompt (CMD)** as Administrator
   - Press `Win + R`
   - Type `cmd`
   - Press `Ctrl + Shift + Enter` (to run as admin)
3. Navigate to project:
   ```cmd
   cd "d:\POS\Shopkeeper POS App Mobile"
   ```
4. Install the package:
   ```cmd
   npm install expo-barcode-scanner
   ```

**Option B: Fix PowerShell Execution Policy**
1. Open **PowerShell** as Administrator
2. Enable script execution permanently:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```
3. Then install:
   ```powershell
   cd "d:\POS\Shopkeeper POS App Mobile"
   npm install expo-barcode-scanner
   ```

### Step 2: Uncomment the Code

After installation, uncomment these lines in `app/modals/product-selection.tsx`:

**Line 19:** Change from:
```typescript
// import { BarCodeScanner } from 'expo-barcode-scanner'; // TODO: Install package first
```
To:
```typescript
import { BarCodeScanner } from 'expo-barcode-scanner';
```

**Lines 471-483:** Uncomment the permission request function (remove the `//` comments)

**Lines 1081-1084:** Uncomment the BarCodeScanner component

### Step 3: Rebuild the App

```cmd
npx expo prebuild --clean
npx expo run:android
```

### Step 4: Test on Physical Device

📱 **Note:** Camera scanning only works on physical devices, NOT emulators.

1. Install app on your phone
2. Open Product Selection
3. Click barcode icon 📷
4. Click "Scan with Camera"
5. Grant camera permission
6. Point at barcode

## Quick Fix for PowerShell

If you keep getting PowerShell errors, you can permanently fix it:

```powershell
# Run as Administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

This is safe and allows locally created scripts to run.

## Testing the Barcode Scanner

1. Open the app on a physical device (camera doesn't work in emulator)
2. Go to Product Selection
3. Click the barcode icon 📷
4. Choose "Scan with Camera"
5. Grant camera permission when prompted
6. Point camera at a barcode

## Features Implemented

✅ **Camera Scanning** - Use device camera to scan barcodes visually
✅ **Manual Input** - Type barcode manually or use external Bluetooth/USB scanner
✅ **Permission Handling** - Requests camera permission automatically
✅ **Multiple Barcode Formats** - Supports QR codes, EAN-13, UPC-A, Code 128, etc.
✅ **Toast Notification** - Shows scanned barcode value
✅ **Auto Search** - Automatically searches for product after scanning

## Troubleshooting

**Issue: Camera shows black screen**
- Ensure you're using a physical device (not emulator)
- Check that camera permission is granted in device settings

**Issue: "Cannot find module" error**
- Make sure you ran `npm install expo-barcode-scanner`
- Rebuild the app after installation

**Issue: Barcode not recognized**
- Make sure the barcode is clear and well-lit
- Try different barcode types (some formats may not be supported)
- Check that the barcode data matches a product in your inventory
