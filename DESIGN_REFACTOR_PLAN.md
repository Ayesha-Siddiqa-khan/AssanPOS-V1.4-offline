## Safe-area, spacing, and layout refactor plan

We will refactor screens one by one to respect safe areas, use a shared spacing/typography system, and avoid fixed positioning. This plan tracks progress.

### Shared tokens (to add)
- Spacing scale: 4, 8, 12, 16, 24, 32.
- Corner radii: small, medium, large (e.g., 8, 12, 16).
- Text styles: app bar title, screen title, section title, body, small helper, big number (KPIs).
- Breakpoints: small < 360, normal 360–480, tablet > 600 (for font and column tweaks).
- Safe area: wrap screens in SafeAreaView; ensure bottom padding for gesture bar.

### Screen order & status
- ✅ Add Product / Add Variants (forms + scanner modals)
- ✅ Inventory (header, filters, KPIs, list, scanner modals)
- ✅ Sales screen (filters, KPIs, list)
- ✅ Settings (cards, destructive actions)
- ✅ Unlock/Login (PIN layout)

### Steps per screen
1) Wrap content in SafeAreaView / ensure scrollable content.
2) Apply shared spacing/radii/text styles; replace magic numbers with tokens.
3) Use flex layout instead of fixed offsets; ensure bottom CTA padding respects safe area.
4) Adjust responsive bits (columns/font sizes) via breakpoints where appropriate.
5) Verify scanners use consistent overlay/frame and safe area.
