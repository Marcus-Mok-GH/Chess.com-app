# Bolt's Journal - Critical Learnings

## 2025-05-18 - Unmemoized Engine Parsing in Component Render
**Learning:** Functions that parse or replay move history using `chess.js` (like `toSanHistory`) instantiate engine objects and perform O(N) operations. Called directly in React render without `useMemo`, they return new array references every render, forcing downstream `useEffect` hooks (e.g. scroll manipulation) to fire unnecessarily on every parent state update.
**Action:** Always memoize derived move history data with `useMemo` and wrap move history components with `React.memo`.
