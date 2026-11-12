# User Guide — PDF Stamp Studio

## 1. Upload Documents & Assets
1. Read and acknowledge the local-processing & legal notice banner (this tool performs visual PNG stamping, not cryptographic ЭЦҚ/EDS signing).
2. Drag and drop up to **50 PDF files** (or select via file picker / keyboard `Enter` or `Space`).
3. Upload three transparent **PNG** assets:
   - Person A Signature (`.png`)
   - Person B Signature (`.png`)
   - Organization Stamp (`.png`)
   - The preview displays alpha transparency and empty transparent margin percentages.

## 2. Configure Signatory Profiles
Enter full names, alternative spellings/initial formats (e.g., `А. Б. Серіков`, `Серіков А.Б.`, `Serikov A.B.`), and role titles in Kazakh, Russian, or Latin for **Person A** and **Person B**.
- If both profiles share a surname, the app warns you and disables auto-approval on surname-only matches.

## 3. Stamp Owner & Placement Policy
- **Stamp Owner**: Choose `PERSON_A`, `PERSON_B`, or `MANUAL_PER_DOCUMENT`. The stamp is never silently transferred to the other signatory if the chosen owner's block is missing.
- **Mode**: `ADAPTIVE` (geometry-based suggestion), `MANUAL`, or `CUSTOM`.
- **Relation**: `OVERLAP`, `BESIDE`, or `CUSTOM`.
- Adjust default width (`pt`), overlap ratio (`%`), and initial rotation (`°`).

## 4. Batch Analysis & Queue
Click **Start Analysis** to process documents in background Web Workers. Each PDF is classified as `DIGITAL_PDF`, `SCANNED_PDF`, or `MIXED_PDF`.
- Documents passing all checks become `AUTO_READY`.
- Ambiguous, missing, or cryptographically signed documents route to `REVIEW_REQUIRED` or `BLOCKED`.

## 5. Manual Review Center
- Filter by `REVIEW_REQUIRED`, `BLOCKED`, or `AUTO_READY`.
- Inspect evidence & 5-dimension heuristic score breakdown (`Name`, `Role`, `Context`, `Line`, `Geometry`).
- Drag-and-drop, click-to-place, or adjust numeric `X / Y / Width / Height / Rotation` for Person A, Person B, or Stamp.
- Toggle **Compare Original** to inspect before/after layout.
- If a PDF carries a cryptographic signature, you must explicitly check the acknowledgement box before approval.
- Confirm the document or use **Apply to All** (requires dialog confirmation).

## 6. Export & ZIP
1. Generate stamped PDFs (`pdf-lib`) for all `AUTO_READY` / confirmed documents.
2. Download individual PDFs or download all `COMPLETED` PDFs in a single **ZIP archive** (blocked/failed documents are excluded and listed separately).
3. Download audit reports in **JSON** or **CSV**.
4. Click **Release Temporary Object URLs** to free browser blob memory when finished.
