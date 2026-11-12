# Known Limitations & Open Items

1. **Synthetic vs. Real-World Annotated Corpus**: The current 24-document benchmark verifies digital, scanned, mixed, and adversarial layouts on synthetically generated fixtures. Before guaranteeing high auto-approval rates on arbitrary real-world enterprise scans, thresholds should be recalibrated against 100–200 manually annotated production PDFs.
2. **Tesseract Language Models (`traineddata`)**: `kaz.traineddata.gz`, `rus.traineddata.gz`, and `eng.traineddata.gz` are placed in `public/tessdata/` (excluded from git via `.gitignore`, copied into `dist/tessdata/` during build) so offline OCR runs locally without CDN requests. On a fresh clone, re-download or copy those three `.traineddata.gz` files into `public/tessdata/` (see [Setup Guide](SETUP.md)).
3. **Batch Scale**: Tested and bounded for the MVP limit of **50 PDFs**. Scaling to 500+ large scanned PDFs requires further memory profiling and streaming ZIP generation.
4. **Cross-Browser Coverage**: Automated E2E verification in this workspace covers **Chromium** and **WebKit (Safari)** on macOS. Windows Chrome and Windows Edge were not executed directly in this macOS environment.
5. **Visual Stamping vs. Legal EDS**: Embedded PNG signatures and stamps are visual graphics only and will invalidate existing cryptographic `/Sig` signatures if applied.
6. **Complex / Skewed Scans**: Severe skew (`> ±5°`), stamped/noisy backgrounds overlapping signature lines, or handwritten-only cursive labels without printed text require manual adjustment in **Manual Review Center**.
