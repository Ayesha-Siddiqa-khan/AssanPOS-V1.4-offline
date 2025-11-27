# Quick Reference: Searchable Expandable List

## 📦 What Was Created

### 1. **SearchBar Component** (`components/ui/SearchBar.tsx`)
Reusable search input with optional barcode scanner button.

```tsx
<SearchBar
  value={query}
  onChangeText={setQuery}
  placeholder="Search..."
  showScanner
  onScanPress={handleScan}
/>
```

### 2. **ExpandableList Component** (`components/ui/ExpandableList.tsx`)
Collapsible list with automatic empty state.

```tsx
<ExpandableList
  items={items}
  expandedItems={expanded}
  onToggleExpand={(id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))}
/>
```

### 3. **useFuseSearch Hook** (`hooks/useFuseSearch.ts`)
Custom hook for fuzzy search with debouncing.

```tsx
const { query, results, search, isSearching } = useFuseSearch(data, {
  keys: ['name', 'category'],
  threshold: 0.4,
  debounceMs: 300,
});
```

### 4. **Complete Example** (`examples/SearchableListExample.tsx`)
Full working example combining all components.

### 5. **Documentation**
- `SEARCHABLE_LIST_GUIDE.md` - Comprehensive usage guide
- `COMMON_ERRORS.md` - Error fixes and debugging

---

## 🚀 Quick Start

### Installation
```bash
npm install fuse.js
```

### Basic Usage
```tsx
import { SearchBar } from '@/components/ui/SearchBar';
import { ExpandableList } from '@/components/ui/ExpandableList';
import { useFuseSearch } from '@/hooks/useFuseSearch';

function MyComponent() {
  const [expanded, setExpanded] = useState({});
  
  const { query, results, search } = useFuseSearch(products, {
    keys: ['name', 'category'],
    threshold: 0.4,
  });

  return (
    <>
      <SearchBar value={query} onChangeText={search} />
      <ExpandableList
        items={results.map(r => ({
          id: r.item.id,
          title: r.item.name,
          subtitle: r.item.category,
        }))}
        expandedItems={expanded}
        onToggleExpand={(id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))}
      />
    </>
  );
}
```

---

## 🎨 Fuse.js Configuration Cheat Sheet

| Threshold | Behavior | Use Case |
|-----------|----------|----------|
| `0.0` | Exact match only | Barcodes, IDs |
| `0.2` | Very strict | Product codes |
| `0.4` | **Recommended** | Names, titles |
| `0.6` | Fuzzy | Typo-tolerant search |
| `1.0` | Matches everything | Don't use |

### Common Configurations

**Strict Search (Products, Codes)**
```tsx
{
  threshold: 0.2,
  ignoreLocation: false,
  minMatchCharLength: 3,
}
```

**Fuzzy Search (Names, Descriptions)**
```tsx
{
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 1,
}
```

**Weighted Fields**
```tsx
{
  keys: [
    { name: 'title', weight: 2 },
    { name: 'description', weight: 1 },
  ],
}
```

---

## 🔧 Common Patterns

### Auto-Expand on Search Match
```tsx
useEffect(() => {
  if (isSearching) {
    const toExpand = {};
    results.forEach(r => {
      if (hasMatchingChild(r.item)) {
        toExpand[r.item.id] = true;
      }
    });
    setExpanded(prev => ({ ...prev, ...toExpand }));
  }
}, [results, isSearching]);
```

### Search with Nested Objects
```tsx
const { results } = useFuseSearch(products, {
  keys: [
    'name',
    'variants.name',
    'variants.barcode',
  ],
});
```

### Flatten for Better Search
```tsx
const searchItems = products.flatMap(product => [
  { product, text: product.name },
  ...product.variants.map(v => ({ product, text: `${product.name} - ${v.name}` })),
]);
```

### Highlight Matching Text
```tsx
const highlightText = (text, query) => {
  const regex = new RegExp(`(${query})`, 'gi');
  const parts = text.split(regex);
  return (
    <Text>
      {parts.map((part, i) => 
        regex.test(part) ? 
          <Text key={i} style={styles.highlight}>{part}</Text> : 
          part
      )}
    </Text>
  );
};
```

---

## 🐛 Debugging Checklist

- [ ] Fuse.js installed? `npm install fuse.js`
- [ ] Keys array configured? `keys: ['name', 'category']`
- [ ] Threshold between 0-1? `threshold: 0.4`
- [ ] Debouncing added? `debounceMs: 300`
- [ ] useMemo for Fuse instance? `useMemo(() => new Fuse(...), [data])`
- [ ] Dependencies in useEffect? `useEffect(() => {...}, [query])`
- [ ] Unique keys in lists? `key={item.id}`
- [ ] TypeScript types defined? `Fuse<Product>(...)`

---

## 📁 File Structure

```
components/
  ui/
    SearchBar.tsx        ← Reusable search input
    ExpandableList.tsx   ← Collapsible list component
    
hooks/
  useFuseSearch.ts       ← Fuzzy search hook

examples/
  SearchableListExample.tsx  ← Complete working example

SEARCHABLE_LIST_GUIDE.md     ← Full documentation
COMMON_ERRORS.md              ← Error fixes
```

---

## 💡 Pro Tips

1. **Debounce for performance** - 300ms is a good default
2. **Use memoization** - Prevent unnecessary recalculations
3. **Limit results** - Show only top 50-100 items
4. **Flatten nested data** - Better search results
5. **Weight important fields** - Higher weight = higher priority
6. **Test threshold values** - Find the sweet spot for your data
7. **Add loading states** - Show spinner during search
8. **Clear on blur** - Better UX for mobile
9. **Show result count** - "Found 5 products"
10. **Handle empty states** - Show helpful message

---

## 🎯 Next Steps

1. ✅ Components created and documented
2. ✅ Fuse.js integrated with examples
3. ✅ Error handling documented
4. Try the example: `examples/SearchableListExample.tsx`
5. Read the full guide: `SEARCHABLE_LIST_GUIDE.md`
6. Check common errors: `COMMON_ERRORS.md`

**Need help?** Check the documentation files or paste any error here for a fix!
