# Deployment Guide

PDF Stamp Studio is a pure static frontend application. No backend server, database, or API routes are required.

## Build Output

```bash
npm ci
npm run build
```

This generates `dist/` containing:
- Static HTML/CSS/JS bundles
- ES module Web Worker bundles
- Self-hosted `/wasm/pdfjs/`, `/wasm/tesseract/`, and `/wasm/opencv/` runtime assets

## Deploying to Cloudflare Pages

1. Build command: `npm run build`
2. Build output directory: `dist`
3. Recommended HTTP headers (`_headers` or Cloudflare Transform Rules):
   - `Cross-Origin-Opener-Policy: same-origin` (optional if enabling SharedArrayBuffer SIMD)
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: no-referrer`
   - Strict Content-Security-Policy disallowing external form/upload endpoints (`connect-src 'self'`, or include `https://tessdata.projectnaptha.com` only if optional CDN tessdata fallback is desired).

## Deploying to Vercel

1. Framework Preset: `Vite`
2. Build Command: `npm run build`
3. Output Directory: `dist`

## Self-Hosting Tesseract Language Models

Place `kaz.traineddata.gz`, `rus.traineddata.gz`, and `eng.traineddata.gz` under `public/tessdata/` prior to `npm run build` so `dist/tessdata/` serves OCR models from the same origin with zero external requests.
