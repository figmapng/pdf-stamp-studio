# Architecture — PDF Stamp Studio

## 1. High-Level Design

PDF Stamp Studio runs completely inside the browser as a static SPA with Web Worker offloading. No server API receives document bytes, OCR text, names, or coordinates.

```text
src/
├── app/                   # Top-level application state, navigation, i18n & live announcer
├── components/            # Presentation & interactive UI (Uploader, Profiles, Stamp, Queue, Review, Export, Settings)
├── engine/                # Pure, framework-agnostic processing modules
│   ├── pdf-parser/        # PDF integrity audit (pdf-lib) + PDF.js text/vector extraction & page classification
│   ├── image-processing/  # Pure-TS PNG alpha/margin inspection + scanned grayscale/Otsu/deskew preprocessing
│   ├── line-detection/    # OpenCV.js adapter + pure-TS horizontal run-length detector + table-grid filter
│   ├── ocr/               # Tesseract.js worker wrapper + pixel-to-point coordinate mapping
│   ├── text-normalizer/   # Kazakh/Russian/Latin Unicode normalization, OCR homoglyphs & surname-collision guard
│   ├── person-matching/   # Multi-script name & role matching across pages
│   ├── anchor-detection/  # Context-aware signature line & placement scoring + cross-person conflict resolution
│   ├── stamp-policy/      # Single-stamp invariant, owner resolution (no cross-person fallback), adaptive/manual/custom
│   ├── confidence/        # Multi-score evaluation -> AUTO_READY / REVIEW_REQUIRED / BLOCKED
│   ├── validation/        # Pre-export hard gate & collision-safe filename utilities
│   ├── placement/         # Exact visual-to-PDF coordinate math (0/90/180/270 + CropBox) + pdf-lib & JSZip export
│   └── pipeline.ts        # End-to-end document orchestration & review revalidation
├── workers/
│   ├── pdfAnalyzer.worker.ts  # Off-main-thread Web Worker running PDF.js, OpenCV, Tesseract, & Detection
│   └── batchRunner.ts         # Bounded-concurrency queue with cancellation & progress updates
├── store/
│   └── preferencesDb.ts   # IndexedDB file-less preferences store (optional opt-in text-only profiles)
├── i18n/                  # Kazakh (kk) and Russian (ru) translation dictionaries
└── types/                 # Shared strict TypeScript contracts
```

## 2. Canonical Coordinate System

All analysis, detection, and UI overlay editing share one standard coordinate system:
- **Visual Page Space**: PDF points (`1/72"`), top-left origin `(0, 0)` where `+x` points right and `+y` points down, relative to the visible page **after** applying `CropBox` and PDF `/Rotate` (`0`, `90`, `180`, `270`).
- Only at PDF export (`src/engine/placement/coordinates.ts`) are visual rectangles and center-based clockwise rotations converted into `pdf-lib` unrotated bottom-left MediaBox coordinates and counter-clockwise `drawImage` angles.

## 3. Worker & Vendor Asset Serving

`scripts/copy-vendor.mjs` copies `pdf.worker.min.mjs`, PDF.js `cmaps`/`standard_fonts`, Tesseract.js `worker.min.js` + WASM cores, and `opencv.js` into `public/wasm/` so runtime dependencies are served from same-origin static assets rather than third-party CDNs.

## 4. Document Integrity & Privacy Safeguards

- Original uploaded PDF `Uint8Array` buffers are never mutated (`pdf-lib` loads fresh copies during export).
- Encrypted PDFs are rejected cleanly with `ENCRYPTED_PDF`.
- Cryptographic `/Sig` / `/ByteRange` PDFs trigger `CRYPTOGRAPHIC_SIGNATURE_DETECTED` and block silent export until acknowledged in Manual Review Center.
- Embedded PDF `/JavaScript`, `/OpenAction`, and `/AA` entries are detected for user warning and never executed (`isEvalSupported: false`).
- PNG/PDF files are kept strictly in session memory and never persisted to IndexedDB.
