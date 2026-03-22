# PDF Viewer Example

A minimal standalone PDF viewer demonstrating `@d-i-t-a/reader`'s PDF support via `PDFNavigator`.

## Running

```bash
npm run example:pdf
# Opens at http://localhost:3001
```

Loads [Alice's Adventures in Wonderland](https://alicepdf.dita.digital/alice.json) by default. Pass `?url=` to load a different PDF manifest.

## Features

- Navigation (prev/next page, keyboard arrows)
- Zoom (in/out, fit-to-page, fit-to-width)
- Scroll modes (paginated, vertical)
- Pan tool (grab-to-scroll)
- Page info display

## How it works

- Loads `reader.js` (IIFE build) and `pdf_viewer.css` from `dist/`
- Calls `D2Reader.load()` with a [Readium PDF manifest](https://readium.org/webpub-manifest/profiles/pdf.html)
- The reader auto-detects PDF from the manifest's `conformsTo` and uses `PDFNavigator` internally
- PDF rendering is handled by pdf.js via `pdf.worker.min.mjs`

## Full-featured PDF viewer

For the full PDF viewer with annotations, bookmarks, TOC, search, rotation, and spread modes, see `viewer/index_pdf.html` (available via `npm run examples`).
