# R2D2BC Examples

Two example implementations are included to demonstrate how to integrate `@d-i-t-a/reader`.

---

## Running the examples

From the project root:

```bash
# Install dependencies
npm install

# Run the DITA viewer (vanilla JS)
npm run dev

# Run the React example
npm run example:react
```

---

## DITA Viewer (`viewer/index_dita.html`)

A full-featured vanilla JS/HTML viewer that exercises every reader capability. This is the primary test harness for development.

### What it demonstrates

- **Reader Settings panel** with controls for all user settings:
  - Font size (slider, 100%–300%)
  - Font family (select: Publisher, Serif, Sans-serif, Open Dyslexic)
  - Appearance (Day / Sepia / Night segmented control)
  - Layout (Scroll / Paginated)
  - Text alignment (Auto / Justify / Start)
  - Column count (Auto / Single / Double)
  - Text direction (Auto / LTR / RTL)
  - Word spacing, letter spacing, page margins, line height (sliders with value readout)
  - Paragraph spacing and paragraph indent (sliders, 0–3, step 0.5)
  - Type scale (slider, 1.0–1.5)
  - Hyphenation (toggle switch)
  - Background color and text color (color pickers)
  - Reset button that restores all controls to defaults
- **TTS** with rate, pitch, and volume sliders
- **Layers panel** for toggling highlights, definitions, search, and page breaks
- **Built-in header menu** for search, bookmarks, annotations, and TOC (when `headerMenu` is provided)
- **Page info** via navigator-managed DOM elements (`.book-title`, `.chapter-title`, `.chapter-position`)
- **Position slider** for scrubbing through the publication
- **NavigatorAPI callbacks** for all lifecycle events

### Configuration highlights

```javascript
D2Reader.load({
    url: new URL(defined_defined),
    injectables: [...],
    injectablesFixed: [...],
    attributes: {
        margin: 5,
        navHeight: 65,
        iframePaddingTop: 0,
        bottomInfoHeight: 75,
    },
    rights: {
        enableBookmarks: false,
        enableAnnotations: false,
        enableTTS: false,
        enableSearch: false,
        enableDefinitions: true,
        enableContentProtection: false,
        enableTimeline: false,
        enableMediaOverlays: false,
        enablePageBreaks: false,
        enableLineFocus: false,
        autoGeneratePositions: true,
    },
    // userSettings can override defaults:
    userSettings: {
        // fontSize: 120,
        // bodyHyphens: true,
        // paraSpacing: 1.0,
        // paraIndent: 1.0,
        // typeScale: 1.2,
        // backgroundColor: "#fefefe",
        // textColor: "#333333",
    },
    api: {
        updateCurrentLocation: function(location) { ... },
        resourceReady: function() { ... },
        resourceAtStart: function() { ... },
        resourceAtEnd: function() { ... },
        onError: function(e) { ... },
    },
});
```

### Required DOM structure

```html
<main id="iframe-wrapper">
    <div id="reader-loading" class="loading"></div>
    <div id="reader-error" class="error"></div>
    <div id="reader-info-top" class="info top">
        <span class="book-title"></span>
    </div>
    <div id="reader-info-bottom" class="info bottom">
        <span class="chapter-position"></span>
        <span class="chapter-title"></span>
        <input type="range" id="positionSlider" />
    </div>
</main>
```

The navigator automatically populates `.book-title`, `.chapter-title`, and `.chapter-position` when these elements exist.

---

## React Example (`examples/react/`)

A modern React 18 single-page reader app with a complete UI.

### What it demonstrates

- **React 18** with `createRoot` (no legacy `ReactDOM.render`)
- **Toolbar** with navigation arrows, scroll/paginate toggle, bookmark button, and live page info (chapter title, page X of Y, book progress %)
- **Sliding sidebar** with four tabs:
  - **TOC** — clickable table of contents from `reader.tableOfContents`
  - **Settings** — all user settings as compact controls (sliders, selects, segmented buttons)
  - **Bookmarks** — add/delete/navigate bookmarks via `reader.saveBookmark()` / `reader.deleteBookmark()`
  - **Search** — text input with results list, navigate via `reader.goToSearchID()`
- **Keyboard navigation** — arrow keys for page turns
- **Event-driven page info** — listens to `resource.ready` and `click` events to update position display from `reader.currentLocator`
- **Rights configuration** — enables bookmarks, annotations, search, and auto position generation

### Running

```bash
npm run example:react
# Opens at http://localhost:1234
```

### Key code patterns

**Initialization with rights:**

```tsx
D2Reader.load({
  url: new URL("https://alice.dita.digital/manifest.json"),
  injectables,
  injectablesFixed: [],
  rights: {
    enableBookmarks: true,
    enableAnnotations: true,
    enableSearch: true,
    autoGeneratePositions: true,
    // ... other flags false
  },
}).then(setReader);
```

**Reading page info from currentLocator:**

```tsx
const locator = reader.currentLocator;
// locator.title          — chapter title
// locator.displayInfo.resourceScreenIndex — page number in chapter
// locator.displayInfo.resourceScreenCount — total pages in chapter
// locator.locations.totalProgression      — 0.0–1.0 book progress
```

**Listening for navigation events:**

```tsx
reader.addEventListener("resource.ready", () => {
  // Update UI with new position info
  const locator = reader.currentLocator;
  setPageInfo({ ... });
});
```

**TOC navigation** (properties are camelCase via `convertAndCamel`):

```tsx
const toc = reader.tableOfContents;
// toc[i].href  (not .Href)
// toc[i].title (not .Title)
reader.goTo({ href: item.href, locations: {}, title: item.title });
```

**Search:**

```tsx
const results = await reader.search("alice", false);
// results[i].textBefore, .textMatch, .textAfter, .href, .uuid
await reader.goToSearchID(result.href, result.uuid, false);
await reader.clearSearch();
```

### File structure

```
examples/react/
  index.html       — Entry point with #root div
  index.tsx         — Full React app (single file)
  tsconfig.json     — Extends root tsconfig
  readium-css/      — Bundled ReadiumCSS files
    ReadiumCSS-before.css
    ReadiumCSS-default.css
    ReadiumCSS-after.css
```

---

## Differences between the examples

| Feature | DITA Viewer | React Example |
|---------|------------|---------------|
| Framework | Vanilla JS/HTML | React 18 |
| Settings UI | Built-in (navigator manages DOM) | External (reads `currentSettings`) |
| Page info | Navigator writes to `.chapter-title` etc. | Reads from `currentLocator` |
| Search | Built-in headerMenu UI | Programmatic via `search()` API |
| TTS | Yes (with settings sliders) | Not included |
| Media overlays | Yes | Not included |
| Definitions | Yes | Not included |
| Content protection | Configurable | Not included |

The DITA viewer shows the full feature set. The React example shows the minimal integration pattern for building your own UI on top of the reader API.
