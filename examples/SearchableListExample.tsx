import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SearchBar } from '../components/ui/SearchBar';
import { ExpandableList } from '../components/ui/ExpandableList';
import { useFuseSearch } from '../hooks/useFuseSearch';

/**
 * Complete example of a searchable expandable list
 * combining all the reusable components
 */

interface Variant {
  id: number;
  name: string;
  price: number;
  stock: number;
}

interface Product {
  id: number;
  name: string;
  category: string;
  barcode?: string;
  variants?: Variant[];
}

const SAMPLE_DATA: Product[] = [
  {
    id: 1,
    name: 'Shell',
    category: 'Mobil Oil',
    barcode: 'SHELL001',
    variants: [
      { id: 1, name: 'R1', price: 2500, stock: 20 },
      { id: 2, name: 'R2', price: 2500, stock: 20 },
      { id: 3, name: 'R3', price: 2600, stock: 15 },
    ],
  },
  {
    id: 2,
    name: 'Malaysian',
    category: 'Imported',
    barcode: 'MAL001',
    variants: [
      { id: 4, name: 'Bristol', price: 3000, stock: 10 },
      { id: 5, name: 'Harmony', price: 2800, stock: 12 },
    ],
  },
];

export default function SearchableListExample() {
  const [expandedProducts, setExpandedProducts] = useState<Record<string | number, boolean>>({});

  // Create searchable items (flatten products with variants for better search)
  const searchableItems = React.useMemo(() => {
    const items: Array<{
      product: Product;
      searchText: string;
      isVariant: boolean;
    }> = [];

    SAMPLE_DATA.forEach((product) => {
      // Add product itself
      items.push({
        product,
        searchText: `${product.name} ${product.category} ${product.barcode || ''}`,
        isVariant: false,
      });

      // Add product-variant combinations
      product.variants?.forEach((variant) => {
        items.push({
          product,
          searchText: `${product.name} ${variant.name} ${product.category}`,
          isVariant: true,
        });
      });
    });

    return items;
  }, []);

  // Use Fuse.js for fuzzy search
  const { query, results, search, isSearching, clear } = useFuseSearch(
    searchableItems,
    {
      keys: [
        { name: 'searchText', weight: 2 },
        { name: 'product.name', weight: 1.5 },
        { name: 'product.category', weight: 1 },
        { name: 'product.barcode', weight: 1 },
      ],
      threshold: 0.4,
      debounceMs: 300,
      minSearchLength: 1,
    }
  );

  // Get unique products from search results
  const filteredProducts = React.useMemo(() => {
    if (!isSearching) {
      return SAMPLE_DATA;
    }

    const uniqueProductIds = new Set(results.map((r) => r.item.product.id));
    return SAMPLE_DATA.filter((p) => uniqueProductIds.has(p.id));
  }, [results, isSearching]);

  // Auto-expand products when variants match
  React.useEffect(() => {
    if (isSearching) {
      const toExpand: Record<number, boolean> = {};
      results.forEach((result) => {
        if (result.item.isVariant) {
          toExpand[result.item.product.id] = true;
        }
      });

      if (Object.keys(toExpand).length > 0) {
        setExpandedProducts((prev) => ({ ...prev, ...toExpand }));
      }
    }
  }, [results, isSearching]);

  const handleToggleExpand = (id: string | number) => {
    setExpandedProducts((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Searchable Product List</Text>

      <SearchBar
        value={query}
        onChangeText={search}
        placeholder="Search products, variants, or category..."
        showScanner={false}
        containerStyle={styles.searchBar}
      />

      {isSearching && (
        <Text style={styles.resultsText}>
          Found {filteredProducts.length} product(s)
        </Text>
      )}

      <ScrollView style={styles.listContainer}>
        <ExpandableList
          items={filteredProducts.map((product) => ({
            id: product.id,
            title: product.name,
            subtitle: product.category,
            metadata: `${product.variants?.length || 0} variants`,
            rightContent: product.barcode ? (
              <View style={styles.barcodeBadge}>
                <Text style={styles.barcodeText}>{product.barcode}</Text>
              </View>
            ) : undefined,
            children: product.variants && (
              <View style={styles.variantsContainer}>
                {product.variants.map((variant) => (
                  <View key={variant.id} style={styles.variantRow}>
                    <Text style={styles.variantName}>{variant.name}</Text>
                    <View style={styles.variantDetails}>
                      <Text style={styles.variantPrice}>
                        Rs {variant.price.toLocaleString()}
                      </Text>
                      <Text style={styles.variantStock}>
                        Stock: {variant.stock}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ),
          }))}
          expandedItems={expandedProducts}
          onToggleExpand={handleToggleExpand}
          emptyText="No products found"
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  searchBar: {
    marginBottom: 12,
  },
  resultsText: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 8,
  },
  listContainer: {
    flex: 1,
  },
  barcodeBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  barcodeText: {
    fontSize: 11,
    color: '#0369a1',
    fontWeight: '600',
  },
  variantsContainer: {
    padding: 12,
    gap: 8,
  },
  variantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  variantName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  variantDetails: {
    flexDirection: 'row',
    gap: 12,
  },
  variantPrice: {
    fontSize: 14,
    color: '#059669',
    fontWeight: '600',
  },
  variantStock: {
    fontSize: 14,
    color: '#6b7280',
  },
});
