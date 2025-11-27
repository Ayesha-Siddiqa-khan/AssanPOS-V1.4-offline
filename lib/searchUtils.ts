import Fuse from 'fuse.js';

export interface SearchConfig<T> {
  /** Fields to search with optional weights */
  keys: Array<string | { name: string; weight: number }>;
  /** Fuzzy threshold (0.0 = exact, 1.0 = match anything) */
  threshold?: number;
  /** Maximum score for results to be included */
  maxScore?: number;
  /** Whether to use adaptive scoring based on query length */
  adaptiveScoring?: boolean;
}

/**
 * Perform fuzzy search using Fuse.js with smart scoring
 */
export function fuzzySearch<T>(
  data: T[],
  query: string,
  config: SearchConfig<T>
): T[] {
  if (!query.trim()) {
    return data;
  }

  const {
    keys,
    threshold = 0.3,
    maxScore,
    adaptiveScoring = true,
  } = config;

  // Create Fuse instance
  const fuse = new Fuse(data, {
    keys,
    threshold,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 1,
    distance: 100,
  });

  // Perform search
  const results = fuse.search(query);

  // Determine score threshold
  let scoreThreshold: number;
  if (maxScore !== undefined) {
    scoreThreshold = maxScore;
  } else if (adaptiveScoring) {
    // Stricter for specific queries, more lenient for short queries
    const isSpecificQuery = query.length > 3;
    scoreThreshold = isSpecificQuery ? 0.05 : 0.2;
  } else {
    scoreThreshold = 0.3;
  }

  // Filter by score and return items
  return results
    .filter((result) => (result.score ?? 1) <= scoreThreshold)
    .map((result) => result.item);
}

/**
 * Create searchable text from object fields
 */
export function createSearchText(obj: any, fields: string[]): string {
  return fields
    .map((field) => {
      const value = field.split('.').reduce((o, k) => o?.[k], obj);
      return value || '';
    })
    .filter(Boolean)
    .join(' ');
}
