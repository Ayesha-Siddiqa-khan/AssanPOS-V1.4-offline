# React Native Searchable List with Expand/Collapse UI

This guide shows how to create a searchable list with expandable items using the reusable components.

## Components Created

1. **SearchBar** - Reusable search input with optional scanner
2. **ExpandableList** - List with expand/collapse functionality
3. **useFuseSearch** - Custom hook for fuzzy search

## Basic Usage

### 1. Simple Searchable List

```tsx
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { SearchBar } from '@/components/ui/SearchBar';
import { ExpandableList } from '@/components/ui/ExpandableList';
import { useFuseSearch } from '@/hooks/useFuseSearch';

interface Product {
  id: number;
  name: string;
  category: string;
  variants?: Variant[];
}

export default function SearchableListExample() {
  const [products] = useState<Product[]>([
    { id: 1, name: 'Shell', category: 'Mobil Oil', variants: [...] },
    { id: 2, name: 'Malaysian', category: 'Imported', variants: [...] },
  ]);

  const [expandedProducts, setExpandedProducts] = useState<Record<number, boolean>>({});

  // Use Fuse.js for fuzzy search
  const { query, results, search, isSearching } = useFuseSearch(products, {
    keys: [
      { name: 'name', weight: 2 },
      { name: 'category', weight: 1 },
    ],
    threshold: 0.4,
    debounceMs: 300,
  });

  return (
    <View>
      <SearchBar
        value={query}
        onChangeText={search}
        placeholder="Search products..."
      />

      <ExpandableList
        items={results.map(result => ({
          id: result.item.id,
          title: result.item.name,
          subtitle: result.item.category,
          children: result.item.variants && (
            <View>
              {result.item.variants.map(v => (
                <Text key={v.id}>{v.name}</Text>
              ))}
            </View>
          ),
        }))}
        expandedItems={expandedProducts}
        onToggleExpand={(id) => setExpandedProducts(prev => ({
          ...prev,
          [id]: !prev[id]
        }))}
      />
    </View>
  );
}
```

### 2. With Auto-Expand on Search

```tsx
const { results, isSearching } = useFuseSearch(products, {
  keys: ['name', 'variants.name'],
  threshold: 0.4,
});

// Auto-expand products that have matching variants
useEffect(() => {
  if (isSearching) {
    const toExpand: Record<number, boolean> = {};
    results.forEach(result => {
      if (hasMatchingVariant(result.item)) {
        toExpand[result.item.id] = true;
      }
    });
    setExpandedProducts(prev => ({ ...prev, ...toExpand }));
  }
}, [results, isSearching]);
```

### 3. With Custom Header Rendering

```tsx
<ExpandableList
  items={items}
  renderHeader={(item, isExpanded) => (
    <TouchableOpacity style={styles.customHeader}>
      <Image source={{ uri: item.image }} />
      <View>
        <Text style={styles.title}>{item.name}</Text>
        <Text style={styles.subtitle}>{item.category}</Text>
      </View>
      <Ionicons 
        name={isExpanded ? 'chevron-up' : 'chevron-down'} 
        size={20} 
      />
    </TouchableOpacity>
  )}
/>
```

### 4. With Barcode Scanner

```tsx
<SearchBar
  value={query}
  onChangeText={search}
  placeholder="Search or scan barcode..."
  showScanner
  onScanPress={handleOpenScanner}
/>
```

## Fuse.js Integration Guide

### Installation

```bash
npm install fuse.js
# or
yarn add fuse.js
```

### Basic Configuration

```tsx
import Fuse from 'fuse.js';

const fuse = new Fuse(data, {
  keys: ['name', 'category'],  // Fields to search
  threshold: 0.4,               // Fuzzy matching threshold
  ignoreLocation: true,         // Don't care where match appears
});

const results = fuse.search('query');
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `keys` | `string[]` | `[]` | Fields to search in |
| `threshold` | `number` | `0.6` | 0.0 = exact match, 1.0 = match anything |
| `distance` | `number` | `100` | Max distance for match location |
| `ignoreLocation` | `boolean` | `false` | Whether to ignore match position |
| `includeScore` | `boolean` | `false` | Include match score in results |
| `includeMatches` | `boolean` | `false` | Include match indices |
| `minMatchCharLength` | `number` | `1` | Min characters for a match |

### Weighted Search

```tsx
const fuse = new Fuse(products, {
  keys: [
    { name: 'name', weight: 2 },      // Product name is 2x important
    { name: 'category', weight: 1 },   // Category is normal importance
    { name: 'barcode', weight: 1.5 },  // Barcode is 1.5x important
  ],
});
```

### Nested Field Search

```tsx
const fuse = new Fuse(products, {
  keys: [
    'name',
    'variants.name',        // Search in nested variant names
    'variants.barcode',     // Search in nested variant barcodes
  ],
});
```

### Search with Highlights

```tsx
const fuse = new Fuse(data, {
  includeMatches: true,
});

const results = fuse.search('query');
results.forEach(result => {
  console.log(result.item);           // The matched item
  console.log(result.matches);        // Match details
  result.matches?.forEach(match => {
    console.log(match.key);           // 'name'
    console.log(match.indices);       // [[0, 2], [5, 7]]
  });
});
```

### Performance Tips

1. **Memoize Fuse instance**
   ```tsx
   const fuse = useMemo(() => new Fuse(data, options), [data]);
   ```

2. **Debounce search input**
   ```tsx
   const [debouncedQuery, setDebouncedQuery] = useState('');
   useEffect(() => {
     const timer = setTimeout(() => setDebouncedQuery(query), 300);
     return () => clearTimeout(timer);
   }, [query]);
   ```

3. **Use lower threshold for exact matches**
   ```tsx
   threshold: 0.2  // More strict matching
   ```

4. **Limit results**
   ```tsx
   const results = fuse.search('query').slice(0, 50);
   ```

## Common Issues and Solutions

### Issue: Search too slow with large datasets
**Solution:** Use debouncing and limit results
```tsx
const { results } = useFuseSearch(data, {
  debounceMs: 300,
});
const limitedResults = results.slice(0, 100);
```

### Issue: Search is too fuzzy (wrong results)
**Solution:** Lower the threshold
```tsx
threshold: 0.2  // More strict (0.0 = exact, 1.0 = anything)
```

### Issue: Search not finding partial matches
**Solution:** Set ignoreLocation to true
```tsx
ignoreLocation: true
```

### Issue: Want to search nested objects
**Solution:** Use dot notation in keys
```tsx
keys: ['name', 'variants.name', 'user.email']
```

## Complete Example

See `app/(tabs)/inventory.tsx` for a complete working example with:
- Fuse.js fuzzy search
- Debounced input
- Auto-expand on variant match
- Text highlighting
- Performance optimizations
