# WhatsApp & PDF Sharing Guide

This document maps the current WhatsApp and PDF sharing flows in the app and points to the core utilities that power them.

## Core utilities
- `lib/share.ts` — `shareTextViaWhatsApp(message: string): Promise<boolean>` opens `whatsapp://send?text=...` with a `wa.me` web fallback and returns `true` when a client handled the link.
- `services/receiptService.ts` — receipt helpers:
  - `generateReceiptHtml(payload, store)` builds printable HTML for receipts.
  - `createReceiptPdf(html)` turns the HTML into a PDF via `expo-print`.
  - `shareReceipt(fileUri)` shares a single PDF via the system share sheet using `expo-sharing` (returns `false` if sharing is unavailable).
  - `emailReceipt(fileUri, recipients)` mails the PDF when the platform supports it.

## WhatsApp text sharing entry points
- `app/modals/sale-success.tsx` — “Share Receipt on WhatsApp” sends a receipt summary after checkout and shows toasts for missing WhatsApp or failures.
- `app/modals/customer-account.tsx` — multiple WhatsApp shares: customer overview (`handleShareAll`), individual sale summary (`handleShareSale`), and credit entry details (`handleShareCreditEntry`); all use `shareTextViaWhatsApp` with error toasts.
- `app/vendor-history.tsx` — vendor purchase cards include a WhatsApp button that sends a short purchase summary.
- `app/(tabs)/reports.tsx` — “Share via WhatsApp” sends the currently selected report summary; CSV export also attempts to share the generated file URI via WhatsApp.
- `app/pending-payments.tsx` — per-customer “WhatsApp” action opens a `wa.me/<phone>` link to start a chat.
- `app/jazzcash.tsx` — `handleShareCustomer` shares a JazzCash account snapshot (totals, outstanding credit, last activity) to WhatsApp.

## PDF sharing/export entry points
- `app/modals/sale-success.tsx` — “Share PDF” builds receipt HTML, converts it to PDF with `createReceiptPdf`, then calls `shareReceipt`; the same PDF is reused for email sending.
- `app/modals/customer-account.tsx` — “Share PDF” on a sale uses the same receipt helpers; “Share all as PDF” generates one PDF per filtered sale and shares the first file (multi-file share isn’t universally supported).
- `app/vendor-history.tsx` — purchase cards offer “Share PDF,” which generates a vendor receipt PDF and passes it to `shareReceipt`.
- `app/(tabs)/reports.tsx` — “Export PDF” renders the report HTML, saves a PDF via `expo-print`, and shares it when `expo-sharing` is available (falls back to showing the file location).

## Behavioral notes and gotchas
- WhatsApp share relies on the device having WhatsApp installed; the helper falls back to the web intent but returns `false` so callers can show a toast.
- `expo-sharing` is not available on web; `shareReceipt` early-returns `false` in that case, and some screens show informational toasts.
- Multi-file PDF sharing is not supported across all platforms; customer “Share all as PDF” only sends the first generated file and surfaces a toast when more PDFs were created.
- PDF generation/writes use the platform cache directory; consumers should clean up if they later add long-term storage.

## Quick usage patterns
- WhatsApp text:
  ```ts
  const success = await shareTextViaWhatsApp(myMessage);
  if (!success) {
    Toast.show({ type: 'error', text1: t('WhatsApp not installed') });
  }
  ```
- Receipt PDF share:
  ```ts
  const html = await generateReceiptHtml(receiptPayload, storeProfile);
  const pdf = await createReceiptPdf(html);
  await shareReceipt(pdf.uri);
  ```
