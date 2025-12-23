import { useMemo, useState, useEffect } from 'react';
import Fuse from 'fuse.js';

export interface FuseSearchOptions<T> {
  /** Fields to search in. Can specify weights for ranking. */
  keys: Array<string | { name: string; weight: number }>;
  /** Threshold for fuzzy matching (0.0 = exact, 1.0 = match anything). Default: 0.4 */
  threshold?: number;
  /** Minimum characters required before searching. Default: 1 */
  minSearchLength?: number;
  /** Debounce delay in milliseconds. Default: 0 */
  debounceMs?: number;
  /** Include score and matches in results. Default: false */
  includeMatches?: boolean;
  /** Ignore location when searching. Default: true */
  ignoreLocation?: boolean;
}

export interface FuseSearchResult<T> {
  item: T;
  score?: number;
  matches?: Array<{
    indices: [number, number][];
    value?: string;
    key?: string;
  }>;
}

/**
 * Custom hook for fuzzy search using Fuse.js
 * 
 * @example
 * ```tsx
 * const { results, search, isSearching } = useFuseSearch(products, {
 *   keys: [
 *     { name: 'name', weight: 2 },
 *     { name: 'category', weight: 1 },
 *     'barcode',
 *   ],
 *   threshold: 0.4,
 *   debounceMs: 300,
 * });
 * 
 * // Search
 * search('query');
 * 
 * // Results are automatically filtered
 * results.forEach(result => console.log(result.item));
 * ```
 */
export function useFuseSearch<T>(
  data: T[],
  options: FuseSearchOptions<T>
) {
  const {
    keys,
    threshold = 0.4,
    minSearchLength = 1,
    debounceMs = 0,
    includeMatches = false,
    ignoreLocation = true,
  } = options;

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce the search query
  useEffect(() => {
    if (debounceMs === 0) {
      setDebouncedQuery(query);
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  // Create Fuse instance
  const fuse = useMemo(() => {
    return new Fuse(data, {
      keys,
      threshold,
      ignoreLocation,
      includeScore: true,
      includeMatches,
      useExtendedSearch: false,
      findAllMatches: false,
      minMatchCharLength: 1,
    });
  }, [data, keys, threshold, ignoreLocation, includeMatches]);

  // Perform search
  const results = useMemo(() => {
    const trimmedQuery = debouncedQuery.trim();
    
    if (!trimmedQuery || trimmedQuery.length < minSearchLength) {
      return data.map((item) => ({ item }));
    }

    return fuse.search(trimmedQuery);
  }, [fuse, debouncedQuery, minSearchLength, data]);

  return {
    /** Current search query (immediate, not debounced) */
    query,
    /** Debounced search query (used for actual filtering) */
    debouncedQuery,
    /** Search results with optional score and matches */
    results,
    /** Set the search query */
    search: setQuery,
    /** Whether currently searching (query exists) */
    isSearching: debouncedQuery.trim().length >= minSearchLength,
    /** Clear the search */
    clear: () => setQuery(''),
  };
}

/**
 * How to integrate Fuse.js for fuzzy search:
 * 
 * 1. **Install Fuse.js**
 *    ```bash
 *    npm install fuse.js
 *    ```
 * 
 * 2. **Import and configure**
 *    ```tsx
 *    import Fuse from 'fuse.js';
 *    
 *    const fuse = new Fuse(data, {
 *      keys: ['name', 'category'], // Fields to search
 *      threshold: 0.4,              // 0.0 = exact, 1.0 = anything
 *      ignoreLocation: true,        // Don't care where match is
 *    });
 *    ```
 * 
 * 3. **Search**
 *    ```tsx
 *    const results = fuse.search('query');
 *    results.forEach(result => {
 *      console.log(result.item); // Your original object
 *      console.log(result.score); // How good the match is
 *    });
 *    ```
 * 
 * 4. **Advanced: Weighted fields**
 *    ```tsx
 *    const fuse = new Fuse(data, {
 *      keys: [
 *        { name: 'title', weight: 2 },    // Title is 2x important
 *        { name: 'description', weight: 1 }, // Normal importance
 *      ],
 *    });
 *    ```
 * 
 * 5. **Advanced: Highlight matches**
 *    ```tsx
 *    const fuse = new Fuse(data, {
 *      includeMatches: true,
 *    });
 *    
 *    const results = fuse.search('query');
 *    results[0].matches.forEach(match => {
 *      console.log(match.indices); // [[0, 2], [5, 7]] - positions
 *      console.log(match.key);     // 'name' - which field matched
 *    });
 *    ```
 */
