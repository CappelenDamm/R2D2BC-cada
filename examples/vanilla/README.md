# Vanilla JS Integration Example

A single `index.html` file — no framework, no build tools, no bundler. The simplest possible integration of `@d-i-t-a/reader`.

## Running

```bash
npm run example:vanilla
# Builds the library first, then serves on http://localhost:3000
# Navigate to http://localhost:3000/examples/vanilla/
```

> This example requires the built library in `dist/` because it uses ESM imports from `../../dist/esm/index.js`. The npm script runs `npm run build` automatically before serving.

## Features

- Toolbar with navigation, scroll/paginate toggle, bookmark toggle, settings gear
- TOC sidebar (slide-in from left)
- Settings panel (slide-in from right) with font size slider, font family select, Day/Sepia/Night appearance
- Appearance theme sync — toolbar, sidebars, and container follow the reader's theme
- Page info display (chapter title, page X of Y, book %)
- Keyboard navigation (arrow keys)
- Bookmark add/remove with star indicator
- Position persistence via `useLocalStorage: true`

## Key patterns

- ESM `<script type="module">` import from `../../dist/esm/index.js`
- ReadiumCSS injectables resolved as absolute URLs via `new URL(..., window.location.href)`
- `api.updateCurrentLocation` must return a Promise (`async`) — otherwise `saveLastReadingPosition` is never called
- `api.updateSettings` callback to sync appearance theme
- Theme colors applied via JS (`applyTheme()` function sets `style.background`/`style.color` on toolbar, panels, container)
- All CSS uses `color: inherit`, `rgba()` borders, and `currentColor` for theme compatibility

## File structure

```
examples/vanilla/
  index.html    — Everything in one file (HTML + CSS + JS)
```
