# Common React Native Search Errors and Fixes

## Error 1: "Cannot read property 'name' of undefined"

**Problem:** Trying to access a property on an object that might be null/undefined.

**Fix:**
```tsx
// ❌ Bad
<Text>{product.name}</Text>

// ✅ Good
<Text>{product?.name || 'N/A'}</Text>

// ✅ Also good
{product && <Text>{product.name}</Text>}
```

## Error 2: "Each child in a list should have a unique 'key' prop"

**Problem:** Missing or duplicate keys in mapped lists.

**Fix:**
```tsx
// ❌ Bad
{products.map(product => (
  <View>
    <Text>{product.name}</Text>
  </View>
))}

// ✅ Good
{products.map(product => (
  <View key={product.id}>
    <Text>{product.name}</Text>
  </View>
))}
```

## Error 3: "Objects are not valid as a React child"

**Problem:** Trying to render an object directly.

**Fix:**
```tsx
// ❌ Bad
<Text>{product}</Text>

// ✅ Good
<Text>{product.name}</Text>
<Text>{JSON.stringify(product)}</Text>
```

## Error 4: Fuse.js "threshold must be between 0 and 1"

**Problem:** Invalid threshold value.

**Fix:**
```tsx
// ❌ Bad
const fuse = new Fuse(data, {
  threshold: 5, // Must be 0.0 - 1.0
});

// ✅ Good
const fuse = new Fuse(data, {
  threshold: 0.4, // 0.0 = exact, 1.0 = fuzzy
});
```

## Error 5: "Maximum update depth exceeded"

**Problem:** Infinite loop in useEffect or state updates.

**Fix:**
```tsx
// ❌ Bad - Missing dependency array
useEffect(() => {
  setResults(fuse.search(query));
});

// ❌ Bad - Updates state that's in dependency
useEffect(() => {
  setResults(fuse.search(query));
}, [results]);

// ✅ Good
useEffect(() => {
  setResults(fuse.search(query));
}, [query, fuse]);
```

## Error 6: "Text strings must be rendered within a <Text> component"

**Problem:** Rendering text directly in View.

**Fix:**
```tsx
// ❌ Bad
<View>Hello World</View>

// ✅ Good
<View>
  <Text>Hello World</Text>
</View>
```

## Error 7: Search results not updating

**Problem:** Not using debounced query or missing dependencies.

**Fix:**
```tsx
// ❌ Bad
const results = useMemo(() => {
  return fuse.search(query);
}, []); // Empty deps - never updates!

// ✅ Good
const results = useMemo(() => {
  return fuse.search(debouncedQuery);
}, [fuse, debouncedQuery]);
```

## Error 8: "Cannot find module 'fuse.js'"

**Problem:** Fuse.js not installed.

**Fix:**
```bash
# Install fuse.js
npm install fuse.js

# Or with yarn
yarn add fuse.js
```

## Error 9: Typescript error - "Property 'name' does not exist"

**Problem:** Type definition missing or incorrect.

**Fix:**
```tsx
// ❌ Bad
const results = fuse.search(query);
results.map(r => r.item.name); // TS doesn't know item type

// ✅ Good
interface Product {
  id: number;
  name: string;
}

const fuse = new Fuse<Product>(products, { keys: ['name'] });
const results = fuse.search(query);
results.map(r => r.item.name); // TS knows this is Product
```

## Error 10: "Invalid hook call"

**Problem:** Using hooks outside of a component or in wrong order.

**Fix:**
```tsx
// ❌ Bad
const MyComponent = () => {
  if (condition) {
    const [state, setState] = useState(''); // Conditional hook!
  }
  
  return <View />;
};

// ✅ Good
const MyComponent = () => {
  const [state, setState] = useState('');
  
  if (condition) {
    // Use state here
  }
  
  return <View />;
};
```

## Error 11: Debounce not working

**Problem:** Creating new timeout on every render.

**Fix:**
```tsx
// ❌ Bad
const handleSearch = (text) => {
  setTimeout(() => {
    setDebouncedQuery(text);
  }, 300);
};

// ✅ Good
useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedQuery(query);
  }, 300);
  
  return () => clearTimeout(timer); // Cleanup!
}, [query]);
```

## Error 12: Expand/collapse not working

**Problem:** Not using controlled state properly.

**Fix:**
```tsx
// ❌ Bad
<ExpandableList
  items={items}
  // No expandedItems prop - component can't track state
/>

// ✅ Good
const [expanded, setExpanded] = useState({});

<ExpandableList
  items={items}
  expandedItems={expanded}
  onToggleExpand={(id) => setExpanded(prev => ({
    ...prev,
    [id]: !prev[id]
  }))}
/>
```

## Error 13: "Cannot update a component while rendering a different component"

**Problem:** Calling setState during render.

**Fix:**
```tsx
// ❌ Bad
const Component = () => {
  if (condition) {
    setState(value); // Can't do this during render!
  }
  return <View />;
};

// ✅ Good
const Component = () => {
  useEffect(() => {
    if (condition) {
      setState(value);
    }
  }, [condition]);
  
  return <View />;
};
```

## Debugging Tips

### 1. Add console logs
```tsx
const results = useMemo(() => {
  console.log('🔍 Searching for:', query);
  const searchResults = fuse.search(query);
  console.log('✅ Found:', searchResults.length, 'results');
  return searchResults;
}, [query, fuse]);
```

### 2. Check Fuse.js configuration
```tsx
console.log('Fuse config:', fuse.options);
console.log('Data length:', data.length);
```

### 3. Verify dependencies
```tsx
useEffect(() => {
  console.log('Query changed:', query);
}, [query]);
```

### 4. Use React DevTools
- Install React Native Debugger
- Inspect component state and props
- Check useEffect dependencies

### 5. Test Fuse.js separately
```tsx
// Test in isolation
const testFuse = new Fuse([
  { name: 'Apple' },
  { name: 'Banana' },
], { keys: ['name'] });

console.log(testFuse.search('app')); // Should find Apple
```
