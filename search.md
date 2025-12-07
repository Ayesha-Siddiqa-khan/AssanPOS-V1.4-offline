# Inventory Search Improvements

## Current behavior
- Suggestions dropdown is scrollable and shows all matches (no 8-item cap).
- Suggestions sort with items starting with the query first, then alphabetical.
- Short queries (1 char) use simple matches and do not fuzzy-match variants.
- Fuzzy search uses Fuse for longer queries and respects filters.
- Auto-expand of product variants only happens when query length > 2 to avoid opening all variants on short searches.
- Short query ordering prioritizes prefix matches before other results.

## User feedback addressed
1) Too many variants shown for short queries — now avoided with prefix-only search for 1-char and no auto-expand for queries <=2.
2) Suggestions capped — removed cap and made list scrollable.
3) Ordering — suggestions and results prioritize entries starting with the query.
4) Default scan frame size — barcode scan frame defaults to Small (product-selection modal).

## Notes for future tweaks
- Tuning Fuse thresholds may further adjust match strictness.
- If performance regresses on very large inventories, consider increasing `initialNumToRender`/`maxToRenderPerBatch` on the `FlatList` or adding pagination.
- Keep prefix-first ordering for short queries to reduce noise.
