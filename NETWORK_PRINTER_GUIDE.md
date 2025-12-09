# Network Printer Setup Guide (ESC/POS)

## Overview
Your AssanPOS app now supports direct network printing to ESC/POS thermal printers like the **Bixolon SRP-352 Plus III** via TCP/IP connection.

## Features
✅ Direct ESC/POS printing via LAN (bypasses Android print dialog)
✅ Support for 58mm and 80mm thermal paper
✅ Test print functionality to verify connectivity
✅ Save multiple network printers
✅ Edit and manage saved printers
✅ Automatic receipt formatting for thermal printers

---

## Step 1: Connect Your Printer to Network

### For Bixolon SRP-352 Plus III:
1. **Connect printer to your Wi-Fi router** using Ethernet cable or Wi-Fi (if supported)
2. **Print network configuration page:**
   - Turn off printer
   - Hold FEED button while turning on
   - Release when printer starts printing
   - Look for IP address on printed page

3. **Note down the IP address** (e.g., `192.168.100.243`)

### Alternative Methods to Find IP:
- **Router admin page:** Log into router (usually 192.168.1.1 or 192.168.0.1), check connected devices
- **Network scanner apps:** Use "Fing" or "IP Scanner" app to scan your network
- **Printer's LCD display:** Some models show IP on screen

---

## Step 2: Configure Printer in AssanPOS

### Add Network Printer:
1. Open **Settings** tab in app
2. Scroll to **Printer Settings** section
3. Tap **Add Printer** button
4. Select **Network Printer** card
5. Fill in printer details:
   - **Printer Name:** e.g., "Bixolon Counter Printer"
   - **IP Address:** e.g., `192.168.100.243`
   - **Port:** `9100` (default ESC/POS port, usually correct)
   - **Paper Width:** Select `80mm` or `58mm` (match your paper roll)

6. **Test the connection:**
   - Tap **Test Print** button
   - Printer should print a test receipt
   - If successful, tap **Add Printer**

### Troubleshooting Test Print:
If test print fails:
- ✅ **Printer is powered on** and ready (green light)
- ✅ **IP address is correct** (verify from printer config page)
- ✅ **Port is 9100** (standard for ESC/POS, check printer manual if different)
- ✅ **Same network:** Phone and printer must be on same Wi-Fi
- ✅ **Firewall:** Some routers block printer ports (check router settings)

---

## Step 3: Print Sales Receipts

### From Sales Tab:
1. Complete a sale
2. Tap on the sale in sales list
3. Tap **Print** icon
4. Choose **Network Printer** option (new option!)
5. If multiple printers saved, select one
6. Receipt prints directly to thermal printer

### From History:
1. Navigate to **History** (if available in your app)
2. Find the sale you want to reprint
3. Tap print icon
4. Select **Network Printer**

---

## Managing Printers

### Edit Printer:
1. Go to **Settings → Printer Settings**
2. Find saved printer in list
3. Tap **Edit icon** (pencil) next to printer name
4. Update IP, port, or paper width
5. Test again if needed
6. Tap **Update Printer**

### Remove Printer:
1. Go to **Settings → Printer Settings**
2. Tap **Trash icon** next to printer
3. Confirm removal

### Set Default Printer:
- First printer added is automatically default
- Default printer shown with ★ symbol

---

## Receipt Format

### What Gets Printed:
- **Header:** Store name (centered, bold)
- **Sale Info:** Receipt #, Date, Time
- **Customer:** Customer name or "Walk-in Customer"
- **Items Table:**
  - Item name (with variant if applicable)
  - Quantity × Unit Price = Total
- **Totals:**
  - Subtotal
  - Discount (if any)
  - **Total (bold)**
  - Amount Paid
  - Change Given
  - Remaining Balance (if partial payment)
- **Payment Method**
- **Footer:** "Thank you!" message
- **Paper cut** command (automatic)

### Paper Width Considerations:
- **80mm paper:** ~42 characters per line, better for detailed receipts
- **58mm paper:** ~32 characters per line, more compact

---

## Technical Details

### ESC/POS Protocol:
- Uses raw ESC/POS byte commands
- TCP/IP connection on port 9100
- 5-second timeout for connection
- Automatic paper cut after print

### Network Requirements:
- **Same Wi-Fi:** Phone must be on same network as printer
- **No VPN:** Disable VPN on phone while printing
- **Static IP recommended:** Configure printer with static IP to avoid changes

### Supported Printers:
Any ESC/POS compatible thermal printer should work, including:
- Bixolon SRP series (SRP-350, SRP-352, SRP-380, etc.)
- Epson TM series (TM-T20, TM-T82, TM-T88, etc.)
- Star TSP series
- Citizen CT-S series
- Generic ESC/POS printers

---

## Comparison: Network vs Other Methods

| Feature | Network Printer | System Print | Share PDF |
|---------|----------------|--------------|-----------|
| **Speed** | Fast | Medium | Slow |
| **Thermal Support** | ✅ Perfect | ⚠️ May show blank | ✅ Via printer app |
| **Direct Print** | ✅ Yes | ⚠️ Via dialog | ❌ Requires app |
| **Format Control** | ✅ Full | ⚠️ Limited | ✅ Full |
| **Works Offline** | ✅ Yes (LAN) | ✅ Yes | ✅ Yes |
| **Setup Required** | One-time | None | None |

**Recommendation:** Use **Network Printer** for daily sales, **Share PDF** as backup.

---

## Common Issues & Solutions

### Issue: "Connection timeout"
**Causes:**
- Printer is off or sleeping
- Wrong IP address
- Different network (phone on mobile data, printer on Wi-Fi)
- Router firewall blocking port 9100

**Solutions:**
- Wake printer (press FEED button)
- Verify IP from printer config page
- Ensure phone connected to same Wi-Fi as printer
- Try disabling router firewall temporarily

---

### Issue: "Connection refused"
**Causes:**
- Wrong port number
- Printer doesn't support network printing
- Printer network feature disabled

**Solutions:**
- Confirm port 9100 in printer settings
- Check printer manual for ESC/POS over network support
- Enable network printing in printer configuration

---

### Issue: Prints garbage characters
**Causes:**
- Wrong printer protocol (not ESC/POS)
- Printer in wrong mode

**Solutions:**
- Verify printer is ESC/POS compatible (check manual)
- Reset printer to factory defaults
- Try different emulation mode if available

---

### Issue: Prints but cuts off text
**Causes:**
- Wrong paper width setting
- Printer uses different characters per line

**Solutions:**
- Change paper width in app (80mm ↔ 58mm)
- Contact support if issue persists

---

## Advanced: Installing TCP Socket (Future)

**Current implementation:** Uses HTTP fetch for TCP communication (works with most printers)

**For better reliability (optional):**
```bash
npm install react-native-tcp-socket
npx expo prebuild
```

This enables true TCP sockets for network printing. The app will automatically use TCP sockets if available.

---

## Support

### If printing still doesn't work:
1. **Test with another app:**
   - Install "RawBT" or similar ESC/POS test app
   - Try printing to same IP:port
   - Confirms if issue is printer or app

2. **Check printer logs:**
   - Some printers have error logs
   - Check printer LCD for error messages

3. **Network diagnostics:**
   - Ping printer IP from another device
   - Telnet to printer: `telnet 192.168.100.243 9100`
   - Should connect if printer is reachable

4. **Contact Support:**
   - Include: Printer model, IP, port, error message
   - Attach: Test print result or photo

---

## Summary

✅ **Setup:** Add printer once with IP address
✅ **Test:** Use Test Print to verify connection
✅ **Print:** Select Network Printer when printing sales
✅ **Fast:** Direct printing, no dialogs or extra apps
✅ **Reliable:** Works offline via LAN connection

**Your Bixolon SRP-352 Plus III should now print perfectly!** 🎉
