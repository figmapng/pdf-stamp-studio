# PDF Stamp Studio

Local-first, browser-side PDF visual signature and stamp placement application built with React, TypeScript, Vite, Tailwind CSS, PDF.js, `pdf-lib`, Tesseract.js, OpenCV.js, and JSZip.

## Core Principles

- **100% Browser-Side Processing**: PDF and PNG files never leave the user's browser; there is no backend API and no document telemetry.
- **Visual Placement Only (Not Legal EDS / ЭЦҚ)**: Embeds transparent PNG signatures and a single stamp onto PDF pages. Does not create cryptographic signatures.
- **Per-Document Invariant**: Every exported PDF receives exactly **1 Person A signature**, **1 Person B signature**, and **1 Stamp** (configurable owner: `PERSON_A`, `PERSON_B`, or `MANUAL_PER_DOCUMENT`).
- **Safety-First Detection**: Ambiguous matches, surname-only collisions, conflicting anchors, missing stamp-owner zones, encrypted PDFs, and cryptographically signed PDFs never auto-export silently; they route to the **Manual Review Center** (`REVIEW_REQUIRED` / `BLOCKED`).
- **Bilingual UI**: Kazakh (`kk`) and Russian (`ru`) via `src/i18n/`.

## Quick Start

```bash
npm install
npm run dev
```

Build & test:

```bash
npm run build
npm test
npm run test:benchmark
npm run test:e2e
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Environment & Setup](docs/SETUP.md)
- [User Guide](docs/USER_GUIDE.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Detection Benchmark Report](docs/BENCHMARK_REPORT.md)
- [Known Limitations & Open Issues](docs/KNOWN_LIMITATIONS.md)

## Программа для Windows

Установщик `PdfStampStudioSetup.exe` собирается в GitHub Actions (PyInstaller + Inno Setup) и лежит в
[Releases](https://github.com/figmapng/pdf-stamp-studio/releases/tag/v1.0.0-addin). Он ставит программу для текущего
пользователя (права администратора не нужны), создаёт ярлыки и запись в «Параметры → Приложения». Иконка:
`tools/desktop-app/app.ico`; скрипт установщика: `installer/PdfStampStudio.iss`.
