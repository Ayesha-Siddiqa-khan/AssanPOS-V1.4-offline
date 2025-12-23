# Quick Start: Network Printer Setup

## ⚡ 5-Minute Setup Guide

### Step 1: Find Your Printer's IP Address
**Bixolon SRP-352 Plus III:**
1. Turn off printer
2. Hold FEED button while turning on
3. Release when printing starts
4. Look for IP address on printed page (e.g., `192.168.100.243`)

**Alternative:** Check your router's admin page for connected devices

---

### Step 2: Add Printer in AssanPOS
1. Open **Settings** tab
2. Scroll to **Printer Settings**
3. Tap **Add Printer**
4. Tap **Network Printer** card
5. Fill in:
   - **Name:** "Bixolon Counter"
   - **IP:** `192.168.100.243` (your printer's IP)
   - **Port:** `9100` (leave default)
   - **Paper Width:** `80mm` (or `58mm` if using smaller paper)

---

### Step 3: Test Connection
1. Tap **Test Print** button
2. ✅ **Success:** Printer prints test receipt → Tap **Add Printer**
3. ❌ **Failed:** Check:
   - Printer is ON (green light)
   - IP is correct
   - Phone on same Wi-Fi as printer

---

### Step 4: Print Sales
1. Complete a sale
2. Tap on sale in **Sales** tab
3. Tap **Print** icon
4. Choose **Network Printer** 🎉
5. Receipt prints instantly!

---

## Troubleshooting

### "Connection timeout"
- Printer is off → Turn on and try again
- Wrong IP → Verify IP from printer config page
- Different network → Connect phone to same Wi-Fi

### "Connection refused"
- Wrong port → Verify port 9100 in printer manual
- Printer sleeping → Press FEED button to wake

### Still not working?
1. Try printing from another app (RawBT) to verify printer works
2. Ping printer IP from PC: `ping 192.168.100.243`
3. Check printer manual for ESC/POS over network support

---

## Print Options Comparison

| Option | When to Use |
|--------|------------|
| **Network Printer** ⚡ | Daily sales (fast, direct) |
| **Share PDF** 📄 | Backup method, sharing via WhatsApp |
| **System Print** 🖨️ | Legacy option (may show blank) |

**Recommended:** Use **Network Printer** for all daily printing!

---

## Need Help?

📖 **Full Guide:** See `NETWORK_PRINTER_GUIDE.md`
🔧 **Technical Details:** See `ESC_POS_PRINTER_SETUP.md`
📝 **Implementation:** See `IMPLEMENTATION_SUMMARY.md`

---

**Your Bixolon printer is ready to use!** 🚀
