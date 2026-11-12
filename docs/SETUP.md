# Environment & Setup Guide

## Prerequisites

- **Node.js**: v20+ (tested on v24.18.0)
- **npm**: v10+ (tested on v11.16.0)
- **Supported Browsers**: Chrome / Edge (Windows & macOS), Safari / WebKit (macOS)

## Installation

```bash
npm install
```

`postinstall` automatically runs `node scripts/copy-vendor.mjs` to copy PDF.js, Tesseract.js WASM cores, and OpenCV.js into `public/wasm/`.

## Optional Self-Hosted Tesseract Language Data (`tessdata`)

For fully offline OCR on scanned Kazakh/Russian PDFs without enabling the optional CDN fallback in **Settings**:
1. Download `kaz.traineddata.gz`, `rus.traineddata.gz`, and `eng.traineddata.gz` (Tesseract 4.0 traineddata).
2. Place them inside `public/tessdata/`.
3. Keep **"Allow traineddata fallback"** disabled in Settings for strict zero-external-network execution.

## Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start Vite development server |
| `npm run typecheck` | Run strict TypeScript checking (`tsc --noEmit`) |
| `npm run build` | Sync vendor WASM/workers, typecheck, and build `dist/` |
| `npm run preview` | Preview production `dist/` locally |
| `npm test` | Run all Vitest unit and integration tests |
| `npm run test:benchmark` | Run the 24-document annotated detection benchmark |
| `npm run test:e2e` | Run Playwright E2E tests (Chromium & WebKit) |
