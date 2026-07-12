# react-scan-pro

## 0.1.5

### Patch Changes

- Fix Tree report metrics by aggregating descendant renders and subtree time through context nodes.
- Preserve sub-millisecond self and subtree timings instead of displaying positive values as zero.

## 0.1.4

### Patch Changes

- Export session reports as token-efficient TOON with AI-oriented prompts and bounded value previews.
- Add a collapsible, focusable component hierarchy view and preserve parent Fiber IDs in Raw reports.
- Make render logs structured, typed, bounded, and explicit about timings and render reasons.

## 0.1.3

### Patch Changes

- Improve session report component names with wrapper, React debug metadata, and owner fallbacks.
- Add independent notification and session report console logging with namespaces.

## 0.1.2

### Patch Changes

- Restore the session report toolbar entry and direct switching between reports and notifications.
- Highlight matching DOM elements when hovering session report rows.
- Add an action to clear the current session report.

## 0.1.1

### Patch Changes

- Fix Vercel deployment artifact caching for the monorepo website build.

## 0.1.0

### Minor Changes

- Fork release as `react-scan-pro` with Summary and Raw scan-session reports.
- Add component-name, Fiber ID, DOM and predicate subtree scopes.
- Add callable Script Tag and extension globals with report listeners and legacy aliases.
- Add a virtualized toolbar report panel with clipboard copy and JSON export.
- Reduce report hot-path allocations and release completed session working state promptly.

## 0.5.7

### Patch Changes

- fix

## 0.5.6

### Patch Changes

- fix

## 0.5.5

### Patch Changes

- fix

## 0.5.4

### Patch Changes

- lite

## 0.5.3

### Patch Changes

- fix

## 0.5.2

### Patch Changes

- fix

## 0.5.1

### Patch Changes

- fix: infinite mounting

## 0.5.0

### Minor Changes

- cleanup
- 9d38ffe: Remove monitoring module, replace Playwright CLI with interactive init command, clean up dead code
  - Removed the entire monitoring system (`packages/scan/src/core/monitor/`) and all related exports, types, and build entries
  - Replaced the Playwright-based proxy CLI (`npx react-scan-pro <url>`) with an interactive `npx react-scan-pro init` command that auto-detects your framework and sets up React Scan Pro
  - Removed unused code: old outline system, LRU cache, lazy refs, commented-out code blocks, and unused exports
  - Consolidated duplicate utilities (safeGetValue, RenderPhase types)
  - Simplified README to focus on the new init command
  - Added CLI quick-start command to the website homepage
