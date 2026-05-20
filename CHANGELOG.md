# CHANGELOG

## 2.5.0

### New Features
- **6 new ReadiumCSS properties wired** — `bodyHyphens`, `paraSpacing`, `paraIndent`, `typeScale`, `backgroundColor`, `textColor` are now fully functional end-to-end (ReadiumCSS.ts, UserProperties.ts, UserSettings.ts)
- **CitationModule stubs implemented** — `contributorsFormatted` (editors/translators), `eBookVersionFormatted` (from Modified date), `seriesFormatted` (from BelongsTo.Series). Multi-author formatting follows Chicago, MLA 9th, and APA 7th standards
- **Search progression** — navigating to a search result in another chapter now carries correct `totalProgression` and `position` instead of 0
- **Search highlight default colors** — all results show yellow, selected result shows orange, no configuration required
- **Chapter title on currentLocator** — `currentLocator()` now populates `title` from `currentChapterLink`, so consumers get chapter name without TOC lookup

### ReadiumCSS
- Upgraded bundled ReadiumCSS from v1.x to v1.1.1 (CJK Latin/Cyrillic script fix)
- Custom patches preserved: image no-stretch and line-height compensation formula
- Added `ReadiumCSS-ebpaj_fonts_patch.css`

### Security
- **Popup.ts XSS** — 3 gaps closed: `showPopup`, `showPopover`, and `handleFootnote` now sanitize HTML via `sanitize-html`
- **ContentProtectionModule** — replaced deprecated `document.execCommand('copy')` with async Clipboard API + fallback. Removed IE/Netscape dead code. Eliminated all 5 `@ts-ignore` suppressions

### UI
- **index_dita.html** — compact modern settings panel: segmented controls, toggle switch, color swatches, value readout sliders, proper reset. Controls for all 6 new CSS properties
- **React example** — full rewrite: toolbar with page info, sidebar with TOC/settings/bookmarks/search tabs, React 18 createRoot, keyboard navigation, IE11 polyfills removed

### Tests
- 50 unit tests across 5 files: LocalAnnotator (21), MemoryStore (7), CitationModule (15), ReadiumCSS (3), Locator (4)
- Added vitest config and test tsconfig

### Bug Fixes
- **Definitions popup** — read `dataset.definition` and `dataset.order` from parent container element instead of clicked child area div
- **`LocalAnnotator` sort comparators** — `getBookmarks`, `getAnnotations`, `getAnnotationsByChapter` all returned `undefined` from their sort callbacks when entries had no progression value. Sort comparators must return a number; `undefined` produces unstable/undefined sort order. Fixed to return `0` (equal) instead.
- **`hasChildNodes` called as property** — `getAnnotationPosition` and `getAnnotationElement` checked `if (foundElement.hasChildNodes)` (always true — it's a function reference) instead of `if (foundElement.hasChildNodes())`. Fixed to call the method.
- **Duplicate `TTSModule2` `instanceof` check** — the module registration loop in `IFrameNavigator` checked `instanceof TTSModule2` twice in a row. Removed the dead duplicate.
- **`for...in` on array** — the module registration loop used `for (const index in modules)` which is an anti-pattern for arrays (iterates string keys, can pick up prototype properties). Replaced with `for...of` with an early `continue` guard for undefined entries.
- **`modules` array typed as non-nullable** — `IFrameNavigatorConfig.modules` was `ReaderModule[]` but the array passed from `reader.ts` contained `undefined` entries for disabled modules. Corrected type to `Array<ReaderModule | undefined>`.
- **`getTemporarySelectionInfo` null-safety** — callers passing `iframes[0].contentDocument` (which is `Document | null`) now handled correctly. `LocalAnnotator` returns `null` when `doc` is null; all call sites coerce `null` to `undefined` via `?? undefined`.
- **`element?.scrollIntoView`** — `AnnotationModule.scrollToHighlight` called `.scrollIntoView()` unconditionally on a potentially null element returned by `getAnnotationElement`. Added optional chaining.
- **`TTSModule2` — guard `selectionInfo` before `addRange`** — `selectionInfo.range` was accessed without a null check after the result of `getTemporarySelectionInfo`. Added `if (selectionInfo?.range)` guard.
- **`saveTemporarySelectionInfo` called with undefined** — `TextHighlighter` could call `saveTemporarySelectionInfo(selectionInfo)` when `selectionInfo` is `undefined`. Added explicit guard.
- **Viewport meta parsing `@ts-ignore`** — replaced `@ts-ignore` in fixed-layout viewport dimension parsing with a proper typed `Record<string, number | string>` approach and null-safe destructuring.

### Improvements
- Bumped version to 2.5.0 as the baseline for the v2.5 milestone
- Fixed `package.json` dependency classification:
  - Moved `@types/sass`, `@types/pdfjs-dist`, `sass`, `@babel/plugin-proposal-private-property-in-object` from `dependencies` → `devDependencies` (build-time only)
  - Moved `ta-json-x` from `devDependencies` → `dependencies` (used in production code: `Publication`, `Link`, `JsonUtil`)
- Updated esbuild browser targets from 2021-era (`chrome89/firefox88/safari14/edge90`) to 2025 baseline (`chrome109/firefox115/safari16/edge109`)
- Replaced `arguments[0], arguments[1]` anti-pattern in `D2Reader.addEventListener()` with typed parameters
- Removed jQuery type dependency from `IFrameNavigator` — replaced `JQuery.KeyDownEvent` with standard DOM `KeyboardEvent`
- Improved `Navigator` interface: replaced all `any` types with proper TypeScript types
- Improved `NavigatorAPI` interface: all fields now have proper callback signatures; `updateSettings` and `updateCurrentLocation` correctly typed as returning `Promise<void>`
- Improved `ReaderConfig` interface: `publication`, `userSettings`, `initialAnnotations`, `lastReadingPosition` now properly typed; new `InitialAnnotations` interface exported
- Added `stop(): void` to `ReaderModule` interface — enforced what all 14 modules already implemented
- `UserSettingsConfig.initialUserSettings` made optional (it was already handled as optional at runtime)
- `LocalStorageStoreConfig.prefix` now accepts `string | URL` (URL is coerced via `.toString()`)
- `Annotator` interface: all `any` types replaced with proper `Bookmark`, `Annotation`, `ISelectionInfo`, `Window`, `Document` types
- `positions()` return type in `IFrameNavigator` changed from `any` to `Locator[]`
- Expanded `index.ts` public API exports: added `Bookmark`, `Annotation`, `AnnotationMarker`, `Locations`, `LocatorText`, `ReaderConfig`, `ReaderRights`, `NavigatorAPI`, `IFrameAttributes`, `Injectable`, `RequestConfig`, `SampleRead`, `PublicationServices`, `InitialAnnotations`, `InitialUserSettings`, `LocalStorageStoreConfig`

## 2.4.x

### 2.4.10
- Removed polyfill.io script from sample viewer (`viewer/index_dita.html`) — replaced with direct MathJax 3 CDN inclusion

### 2.4.x (prior)
- Dependency updates via Dependabot (sass, @babel/helpers, image-size, base-x)

## 2.0.0

- `currentSettings` is now a property, so you don't call it as a function.
- The default export is now a class which you instantiate with `.build`, and then call all API methods on the returned instance