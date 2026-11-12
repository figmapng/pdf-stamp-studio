# Detection Benchmark Report

## Methodology

Evaluated using `tests/integration/benchmark.test.ts` (`npm run test:benchmark`) across **24 annotated synthetic PDF documents**:
- **6** two-column digital Kazakh/Russian contracts (varied Y positions, roles, and initial formats)
- **4** multi-page contracts (`2–5` pages) with body-text mentions on page 1 and inline signature rows on the final page
- **3** digital documents using underscore text placeholders (`________________`) without vector lines
- **3** scanned raster PDFs using pure-TS morphological horizontal line detection + OCR word boxes
- **2** mixed PDFs (digital page 1 + scanned page 2)
- **6** adversarial / safety documents:
  1. Shared-surname collision (both signatories share surname, document contains surname only)
  2. Missing Person B signature block
  3. Duplicate identical candidate blocks across 2 pages
  4. Single shared signature line claimed by both signatories
  5. Cryptographically signed PDF (`/Type /Sig` + `/ByteRange`)
  6. Corrupted non-PDF byte stream

## Measured Results (`npm run test:benchmark`)

| Metric | Observed Result |
| :--- | :--- |
| Total Annotated Documents | **24** |
| Person Matching Precision | **1.0000 (100%)** |
| Person Matching Recall | **1.0000 (100%)** |
| Signature Anchor Precision (within 45pt) | **1.0000 (100%)** |
| Signature Anchor Recall | **1.0000 (100%)** |
| Wrong-Person Assignment Rate | **0 / 24 (0.0%)** |
| False Auto-Approval Rate | **0 / 6 adversarial (0.0%)** |
| Stamp Placement Accuracy (valid docs) | **18 / 18 (100%)** |
| Safely Routed to `REVIEW_REQUIRED` | **4 / 6 adversarial** |
| Safely Routed to `BLOCKED` | **2 / 6 adversarial** |
| Unexpected Processing Failures | **0** |

## Notes on Calibration

- Heuristic scores (`confidence` in `SignatureAnchor`) are composite weighted scores (`Name 35%`, `Role 25%`, `Context 15%`, `Line 15%`, `Geometry 10%`), **not** calibrated statistical probabilities.
- Production thresholds (`autoReadyMinScore = 0.78`, `ambiguityMargin = 0.08`) should be recalibrated if expanding to a 100–200 real scanned enterprise document benchmark.
