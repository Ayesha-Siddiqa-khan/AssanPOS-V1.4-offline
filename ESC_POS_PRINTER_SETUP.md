# ESC/POS Network Printer Setup

## Overview
This document explains the LAN/Network ESC/POS printer integration for Bixolon SRP-352 Plus III and similar thermal printers.

## System Requirements
- Printer: Bixolon SRP-352 Plus III (or any ESC/POS compatible thermal printer)
- Connection: TCP/IP over LAN
- Default Port: 9100
- Paper Width: 80mm or 58mm
- Network: Printer and mobile device on same Wi-Fi network

## Installation Steps

### 1. Install Required Package
For full TCP socket support in React Native, install:
```bash
npm install react-native-tcp-socket
# or
yarn add react-native-tcp-socket
```

For development build (recommended for full features):
```bash
npx expo install react-native-tcp-socket
npx expo prebuild
npx expo run:android
```

### 2. Printer Network Setup
1. Connect your Bixolon SRP-352 Plus III to your router via Ethernet cable
2. Print a network configuration page (hold FEED button while powering on)
3. Note the IP address (e.g., 192.168.100.243)
4. Verify printer port is 9100 (standard for ESC/POS)

### 3. Find Printer IP Address
**Method 1: Printer Self-Test**
- Power off printer
- Hold FEED button and power on
- Printer will print configuration with IP address

**Method 2: Router Admin Panel**
- Log into your router (usually 192.168.1.1 or 192.168.0.1)
- Check connected devices
- Find device named "Bixolon" or similar

**Method 3: Network Scanner App**
- Install "Fing" or similar network scanner on phone
- Scan network for devices
- Look for Bixolon printer

## Usage in App

### Add Network Printer
1. Open **Settings** → **Printer Settings**
2. Tap **"Add New Printer"**
3. Select **"Network Printer"**
4. Enter details:
   - **Printer Name**: "Bixolon SRP-352" (or your choice)
   - **IP Address**: 192.168.100.243 (your printer's IP)
   - **Port**: 9100 (default ESC/POS port)
   - **Paper Width**: 80mm (or 58mm if using smaller paper)
5. Tap **"Test Print"** to verify connection
6. Tap **"Save"**

### Print Receipt
1. From **Sales** page, tap any sale
2. Tap the **Print** button (printer icon)
3. Select **"Print to Network Printer"**
4. Choose your saved printer
5. Receipt prints automatically

## Troubleshooting

### "Printer timeout - check if printer is on and reachable"
**Causes:**
- Printer is powered off
- Printer not connected to network
- Wrong IP address
- Phone and printer on different networks

**Solutions:**
- Verify printer is on and ready LED is lit
- Check printer's network cable is connected
- Verify IP address is correct (print config page)
- Ensure phone and printer are on same Wi-Fi network
- Try pinging printer IP from phone (use terminal app)

### "Network error - check Wi-Fi and printer IP"
**Causes:**
- Phone not connected to Wi-Fi
- Firewall blocking port 9100
- Router configuration issue

**Solutions:**
- Connect phone to Wi-Fi (not mobile data)
- Check router firewall settings
- Try connecting to printer from computer first to verify it works

### "Port closed or printer not listening on 9100"
**Causes:**
- Printer configured for different port
- Printer in wrong mode

**Solutions:**
- Check printer's network settings (print config page)
- Most ESC/POS printers use port 9100
- Some printers use 8008 or 9008 - try these if 9100 fails
- Reset printer to factory defaults

### Prints but output is garbled
**Causes:**
- Wrong printer language (not ESC/POS)
- Character encoding mismatch

**Solutions:**
- Verify printer is in ESC/POS mode (check manual)
- Bixolon SRP-352 Plus III is ESC/POS by default
- Try resetting printer

### Test Print works but real receipts don't
**Causes:**
- Receipt data formatting issue
- Special characters not supported

**Solutions:**
- Check receipt contains only basic ASCII characters
- Avoid Unicode emojis or special symbols
- Urdu text may need special encoding setup

## Technical Details

### ESC/POS Commands Used
```
ESC @ - Initialize printer
ESC a - Set alignment (0=left, 1=center, 2=right)
ESC E - Bold on/off
ESC - - Underline on/off
ESC ! - Font size control
GS V - Cut paper
LF (0x0A) - Line feed
```

### Network Communication
- Protocol: TCP/IP
- Port: 9100 (standard ESC/POS)
- Timeout: 5 seconds
- Data: Raw byte stream (ESC/POS commands + text)

### Paper Width Settings
**80mm (recommended)**
- ~42 characters per line
- Standard for receipts
- Better readability

**58mm**
- ~32 characters per line
- Compact receipts
- Uses less paper

## API Reference

### NetworkPrinterConfig
```typescript
interface NetworkPrinterConfig {
  id: string;              // Unique identifier
  name: string;            // Display name
  type: 'ESC_POS';        // Printer type
  ip: string;              // e.g., "192.168.100.243"
  port: number;            // Usually 9100
  paperWidthMM: 58 | 80;  // Paper size
  isDefault: boolean;      // Auto-select this printer
}
```

### Print Receipt
```typescript
import { printerService } from './services/escPosPrinterService';

const result = await printerService.printReceipt(printerConfig, receiptData);
if (result.success) {
  console.log('Printed successfully');
} else {
  console.error('Print failed:', result.message);
}
```

### Test Print
```typescript
const result = await printerService.testPrint(printerConfig);
if (result.success) {
  alert('Printer is working!');
} else {
  alert(`Printer error: ${result.message}`);
}
```

## Example: Complete Printer Setup

```typescript
// 1. Define printer configuration
const myPrinter: NetworkPrinterConfig = {
  id: '1',
  name: 'Bixolon SRP-352',
  type: 'ESC_POS',
  ip: '192.168.100.243',
  port: 9100,
  paperWidthMM: 80,
  isDefault: true,
};

// 2. Save to AsyncStorage
await AsyncStorage.setItem('networkPrinters', JSON.stringify([myPrinter]));

// 3. Print a receipt
const receiptData = {
  storeName: 'My Store',
  address: '123 Main St',
  phone: '555-1234',
  dateTime: new Date().toLocaleString(),
  receiptNo: 'R-001',
  customerName: 'John Doe',
  items: [
    { name: 'Product 1', qty: 2, unitPrice: 100 },
    { name: 'Product 2', qty: 1, unitPrice: 150 },
  ],
  subtotal: 350,
  tax: 0,
  total: 350,
  amountPaid: 500,
  changeAmount: 150,
  paymentMethod: 'Cash',
  footer: 'Thank you for your business!',
};

const result = await printerService.printReceipt(myPrinter, receiptData);
```

## Support
For issues or questions:
1. Check printer is on same network as phone
2. Verify IP address is correct
3. Test with "Test Print" first
4. Check printer's self-test page prints correctly
5. Try pinging printer IP from another device
