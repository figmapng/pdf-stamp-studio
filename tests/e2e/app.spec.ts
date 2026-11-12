import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { createCustomPdfFixture, createTestPngBytes } from '../fixtures/pdfFixtureFactory';

test.describe('PDF Stamp Studio — E2E Workflow & Network Privacy Audit', () => {
  test('completes full local-first upload, profile setup, analysis, review, and ZIP export with zero external network calls', async ({
    page,
  }) => {
    const externalRequests: string[] = [];
    const uploadMethodRequests: string[] = [];

    page.on('request', (req) => {
      const url = req.url();
      if (!url.startsWith('http://127.0.0.1:4173') && !url.startsWith('blob:') && !url.startsWith('data:')) {
        externalRequests.push(`${req.method()} ${url}`);
      }
      if (req.method() !== 'GET' && req.method() !== 'HEAD') {
        uploadMethodRequests.push(`${req.method()} ${url}`);
      }
    });

    const sigABytes = await createTestPngBytes({ width: 160, height: 60, color: [20, 40, 180, 230] });
    const sigBBytes = await createTestPngBytes({ width: 160, height: 60, color: [10, 120, 80, 230] });
    const stampBytes = await createTestPngBytes({ width: 120, height: 120, color: [40, 70, 210, 210] });

    const contractBytes1 = await createCustomPdfFixture({
      pageCount: 1,
      texts: [
        { text: 'ШАРТ № 101', x: 220, y: 760, size: 14 },
        { text: 'Бас директор', x: 60, y: 240, size: 11 },
        { text: 'А. Б. Серіков', x: 60, y: 175, size: 11 },
        { text: 'Главный бухгалтер', x: 340, y: 240, size: 11 },
        { text: 'И. И. Иванов', x: 340, y: 175, size: 11 },
      ],
      lines: [
        { x1: 60, y1: 200, x2: 200, y2: 200 },
        { x1: 340, y1: 200, x2: 480, y2: 200 },
      ],
    });

    const contractBytes2 = await createCustomPdfFixture({
      pageCount: 1,
      texts: [
        { text: 'ДОГОВОР № 102', x: 210, y: 760, size: 14 },
        { text: 'Генеральный директор', x: 60, y: 240, size: 11 },
        { text: 'Серіков А.Б.', x: 60, y: 175, size: 11 },
        { text: 'Орындаушы', x: 340, y: 240, size: 11 },
        { text: 'Иванов И.И.', x: 340, y: 175, size: 11 },
      ],
      lines: [
        { x1: 60, y1: 200, x2: 200, y2: 200 },
        { x1: 340, y1: 200, x2: 480, y2: 200 },
      ],
    });

    const badPdfBytes = new Uint8Array([0x4e, 0x4f, 0x54, 0x50, 0x44, 0x46, 0x00, 0x01, 0x02, 0x03]);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'PDF Stamp Studio' })).toBeVisible();

    // Language switch kk -> ru -> kk
    await page.getByRole('button', { name: 'ru', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await page.getByRole('button', { name: 'kk', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'kk');

    // Step 1: Upload PDFs ONLY (2 valid + 1 invalid; PNG inputs belong to Step 2)
    await expect(page.locator('input[type="file"][accept*="png"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Келесі: Қол мен мөр' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '2. Қол мен мөр' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '3. Тексеру' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '4. Экспорт' })).toBeDisabled();

    const pdfInput = page.locator('input[type="file"][accept*="pdf"]');
    await pdfInput.setInputFiles([
      { name: 'corrupted.pdf', mimeType: 'application/pdf', buffer: Buffer.from(badPdfBytes) },
    ]);
    await expect(page.getByText('corrupted.pdf')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Келесі: Қол мен мөр' })).toBeDisabled();

    await pdfInput.setInputFiles([
      { name: 'contract-101.pdf', mimeType: 'application/pdf', buffer: Buffer.from(contractBytes1) },
      { name: 'contract-102.pdf', mimeType: 'application/pdf', buffer: Buffer.from(contractBytes2) },
    ]);

    await expect(page.getByText('contract-101.pdf')).toBeVisible();
    await expect(page.getByText('contract-102.pdf')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Келесі: Қол мен мөр' })).toBeEnabled();
    await expect(page.getByRole('button', { name: '2. Қол мен мөр' })).toBeEnabled();

    // Step 2: Profile, Signatures, Stamp PNG & Placement Setup (empty by default)
    await page.getByRole('button', { name: 'Келесі: Қол мен мөр' }).click();
    await expect(page.getByText('Қол қоюшы немесе мөр қосылмаған')).toBeVisible();

    await page.getByRole('button', { name: 'Қол қоюшы қосу' }).first().click();
    await page.getByRole('button', { name: 'Қол қоюшы қосу' }).first().click();
    await page.getByRole('button', { name: 'Мөр қосу' }).first().click();

    await page.locator('input[name$="-fullName"]').nth(0).fill('Серіков Асылбек Бекболатұлы');
    await page.locator('input[name$="-roles"]').nth(0).fill('Бас директор, Генеральный директор');

    await page.locator('input[name$="-fullName"]').nth(1).fill('Иванов Иван Иванович');
    await page.locator('input[name$="-roles"]').nth(1).fill('Главный бухгалтер, Орындаушы');

    // Verify dynamic signatory names appear in the Stamp target selector
    await expect(page.locator('select option', { hasText: 'Серіков Асылбек Бекболатұлы' })).toBeAttached();
    await expect(page.locator('select option', { hasText: 'Иванов Иван Иванович' })).toBeAttached();

    // Upload Signature A, Signature B & Stamp PNGs in Step 2
    const pngInputs = page.locator('input[type="file"][accept*="png"]');
    await pngInputs.nth(0).setInputFiles({
      name: 'sig-a.png',
      mimeType: 'image/png',
      buffer: Buffer.from(sigABytes),
    });
    await pngInputs.nth(1).setInputFiles({
      name: 'sig-b.png',
      mimeType: 'image/png',
      buffer: Buffer.from(sigBBytes),
    });
    await pngInputs.nth(2).setInputFiles({
      name: 'stamp.png',
      mimeType: 'image/png',
      buffer: Buffer.from(stampBytes),
    });
    await expect(page.getByText('sig-a.png')).toBeVisible();
    await expect(page.getByText('sig-b.png')).toBeVisible();
    await expect(page.getByText('stamp.png')).toBeVisible();

    // Step 3: Start Analysis -> jumps directly to 3. Тексеру (Review Center)
    await page.getByRole('button', { name: 'Талдауды бастау' }).click();

    await expect(page.getByRole('heading', { name: 'Қолмен тексеру' })).toBeVisible();
    await expect(page.locator('aside button')).toHaveCount(3);
    await expect(page.locator('aside').getByText('Дайын').first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator('aside').getByText('Бұғатталған').first()).toBeVisible({ timeout: 20000 });

    // Select contract-101.pdf in Review Center & confirm
    await page.locator('aside button', { hasText: 'contract-101.pdf' }).click();
    await expect(page.locator('canvas')).toBeVisible();
    await page.getByRole('button', { name: 'Растау', exact: true }).click();

    // Step 4: Export & ZIP
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: '4. Экспорт' }).click();
    await page.getByRole('button', { name: /PDF өңдеу/ }).click();

    await expect(page.getByRole('button', { name: /ZIP жүктеу \(2\)/ })).toBeVisible({
      timeout: 15000,
    });

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /ZIP жүктеу \(2\)/ }).click();
    const download = await downloadPromise;
    const zipPath = await download.path();
    expect(zipPath).toBeTruthy();

    const zipBytes = readFileSync(zipPath!);
    const zip = await JSZip.loadAsync(zipBytes);
    const zipEntries = Object.keys(zip.files);
    expect(zipEntries).toContain('contract-101.pdf');
    expect(zipEntries).toContain('contract-102.pdf');
    expect(zipEntries).toContain('processing-report.json');
    expect(zipEntries).not.toContain('corrupted.pdf');

    // Technical JSON/CSV/Memory bar should not clutter Step 4 Export
    await expect(page.getByRole('button', { name: 'Жадыны тазалау' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Жүктеу' }).first()).toBeVisible();

    // Network Privacy Audit: strictly zero external requests and zero POST/PUT uploads
    expect(externalRequests).toEqual([]);
    expect(uploadMethodRequests).toEqual([]);
  });

  test('handles 100-PDF batch limit and Apply-to-All dialog', async ({
    page,
  }) => {
    const sigBytes = await createTestPngBytes({ width: 120, height: 50 });
    const stampBytes = await createTestPngBytes({ width: 100, height: 100 });
    const samplePdf = await createCustomPdfFixture({
      pageCount: 1,
      texts: [
        { text: 'Бас директор', x: 60, y: 240, size: 11 },
        { text: 'А. Б. Серіков', x: 60, y: 175, size: 11 },
        { text: 'Орындаушы', x: 340, y: 240, size: 11 },
        { text: 'И. И. Иванов', x: 340, y: 175, size: 11 },
      ],
      lines: [
        { x1: 60, y1: 200, x2: 200, y2: 200 },
        { x1: 340, y1: 200, x2: 480, y2: 200 },
      ],
    });

    await page.goto('/');

    // Upload 101 PDFs at once -> enforces 100-file batch limit with warning
    const batchFiles = Array.from({ length: 101 }, (_, idx) => ({
      name: `batch-${idx + 1}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from(samplePdf),
    }));
    await page.locator('input[type="file"][accept*="pdf"]').setInputFiles(batchFiles);
    await expect(page.locator('tbody tr')).toHaveCount(100);
    await expect(page.getByText(/макс\. 100 PDF/)).toBeVisible();

    // Setup profiles, signatures & stamp in Step 2
    await page.getByRole('button', { name: 'Келесі: Қол мен мөр' }).click();
    await page.getByRole('button', { name: 'Қол қоюшы қосу' }).first().click();
    await page.getByRole('button', { name: 'Қол қоюшы қосу' }).first().click();
    await page.getByRole('button', { name: 'Мөр қосу' }).first().click();
    await page.locator('input[name$="-fullName"]').nth(0).fill('Серіков Асылбек Бекболатұлы');
    await page.locator('input[name$="-roles"]').nth(0).fill('Бас директор');
    await page.locator('input[name$="-fullName"]').nth(1).fill('Иванов Иван Иванович');
    await page.locator('input[name$="-roles"]').nth(1).fill('Орындаушы');

    const pngInputs = page.locator('input[type="file"][accept*="png"]');
    await pngInputs.nth(0).setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(sigBytes) });
    await pngInputs.nth(1).setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: Buffer.from(sigBytes) });
    await pngInputs.nth(2).setInputFiles({ name: 'stamp.png', mimeType: 'image/png', buffer: Buffer.from(stampBytes) });

    await page.getByRole('button', { name: 'Талдауды бастау' }).click();
    await expect(page.locator('aside button')).toHaveCount(100);
    await expect(page.getByRole('button', { name: 'Келесі: Экспорт' })).toBeEnabled({ timeout: 45000 });
    await expect(page.locator('canvas')).toBeVisible({ timeout: 10000 });

    // Already on Review Center for first doc -> click page to reposition & test native <dialog> Apply-to-All
    await expect(page.getByText('Координаттар (pt)')).toHaveCount(0);
    await page.getByRole('button', { name: 'Барлығына қолдану' }).click();

    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Қолдану', exact: true }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('executes real local Tesseract OCR and CV line detection on a scanned image-only PDF with zero external requests', async ({
    page,
  }) => {
    const externalRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (!url.startsWith('http://127.0.0.1:4173') && !url.startsWith('blob:') && !url.startsWith('data:')) {
        externalRequests.push(`${req.method()} ${url}`);
      }
    });

    const sigBytes = await createTestPngBytes({ width: 120, height: 50 });
    const stampBytes = await createTestPngBytes({ width: 100, height: 100 });

    await page.goto('/');

    // Render a realistic 2x A4 scanned contract page onto browser canvas -> PNG -> image-only PDF
    const scannedPngBase64 = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 1190;
      c.height = 1684;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#111111';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('CONTRACT / ACT No 77', 420, 180);

      ctx.font = '26px sans-serif';
      ctx.fillText('Director', 140, 1140);
      ctx.fillRect(140, 1190, 280, 4);
      ctx.fillText('A. B. Serikov', 140, 1245);

      ctx.fillText('Accountant', 680, 1140);
      ctx.fillRect(680, 1190, 280, 4);
      ctx.fillText('I. I. Ivanov', 680, 1245);

      return c.toDataURL('image/png').split(',')[1]!;
    });

    const { PDFDocument } = await import('pdf-lib');
    const scannedDoc = await PDFDocument.create();
    const p = scannedDoc.addPage([595, 842]);
    const embeddedScan = await scannedDoc.embedPng(Buffer.from(scannedPngBase64, 'base64'));
    p.drawImage(embeddedScan, { x: 0, y: 0, width: 595, height: 842 });
    const scannedPdfBytes = await scannedDoc.save();

    await page.locator('input[type="file"][accept*="pdf"]').setInputFiles({
      name: 'scanned-contract.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(scannedPdfBytes),
    });

    await page.getByRole('button', { name: 'Келесі: Қол мен мөр' }).click();
    await page.getByRole('button', { name: 'Қол қоюшы қосу' }).first().click();
    await page.getByRole('button', { name: 'Қол қоюшы қосу' }).first().click();
    await page.getByRole('button', { name: 'Мөр қосу' }).first().click();
    await page.locator('input[name$="-fullName"]').nth(0).fill('A. B. Serikov');
    await page.locator('input[name$="-roles"]').nth(0).fill('Director');

    await page.locator('input[name$="-fullName"]').nth(1).fill('I. I. Ivanov');
    await page.locator('input[name$="-roles"]').nth(1).fill('Accountant');

    const pngInputs = page.locator('input[type="file"][accept*="png"]');
    await pngInputs.nth(0).setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(sigBytes) });
    await pngInputs.nth(1).setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: Buffer.from(sigBytes) });
    await pngInputs.nth(2).setInputFiles({ name: 'stamp.png', mimeType: 'image/png', buffer: Buffer.from(stampBytes) });

    // Switch OCR to English-only in Settings for fast real-OCR test on local /tessdata/eng.traineddata.gz
    await page.getByRole('button', { name: 'Баптаулар' }).click();
    await page.getByLabel('Қазақша (kaz)').uncheck();
    await page.getByLabel('Русский (rus)').uncheck();

    await page.getByRole('button', { name: '2. Қол мен мөр' }).click();
    await page.getByRole('button', { name: 'Талдауды бастау' }).click();

    await expect(page.locator('aside button')).toHaveCount(1);
    await expect(page.locator('aside').getByText('Сканер')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('aside').getByText('Дайын').first()).toBeVisible({ timeout: 30000 });
    expect(externalRequests).toEqual([]);
  });

  test('renders Design System Showcase with interactive Dialog, AlertDialog, Sheet, Tabs, and Toast', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Қосымша' }).click();
    await page.getByRole('menuitem', { name: 'UI жүйесі' }).click();
    await expect(
      page.getByRole('heading', { name: 'PDF Stamp Studio — Design System Showcase' }),
    ).toBeVisible();

    // Test Toast
    await page.getByRole('button', { name: 'Trigger Toast' }).click();
    await expect(page.getByText('Design System Ready')).toBeVisible();

    // Test Dialog
    await page.getByRole('button', { name: 'Open Dialog' }).click();
    const dlg = page.locator('dialog[open]');
    await expect(dlg).toBeVisible();
    await dlg.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dlg).not.toBeVisible();

    // Test AlertDialog
    await page.getByRole('button', { name: 'Open AlertDialog' }).click();
    const alertDlg = page.locator('dialog[open]');
    await expect(alertDlg).toBeVisible();
    await alertDlg.getByRole('button', { name: 'Cancel' }).click();
    await expect(alertDlg).not.toBeVisible();

    // Test Sheet
    await page.getByRole('button', { name: 'Open Sheet' }).click();
    const sheetDlg = page.locator('dialog[open]');
    await expect(sheetDlg).toBeVisible();
    await sheetDlg.getByRole('button', { name: 'Close panel' }).click();
    await expect(sheetDlg).not.toBeVisible();
  });

  test('automatically strips opaque paper background from JPEG/PNG signature & stamp assets and trims margins', async ({
    page,
  }) => {
    const dummyPdf = await createCustomPdfFixture({ pageCount: 1, texts: [], lines: [] });
    await page.goto('/');
    await page.locator('input[type="file"][accept*="pdf"]').setInputFiles({
      name: 'dummy.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(dummyPdf),
    });

    // Create an opaque white-background JPEG stamp (200x200 with blue ring centered, large white border)
    const opaqueJpgBytes = await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 200;
      c.height = 200;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#f8f8f6';
      ctx.fillRect(0, 0, 200, 200);
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(100, 100, 40, 0, Math.PI * 2);
      ctx.stroke();
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.92));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });

    await page.getByRole('button', { name: '2. Қол мен мөр' }).click();
    await page.getByRole('button', { name: 'Мөр қосу' }).first().click();
    const assetInputs = page.locator('input[type="file"][accept*="png"]');
    await assetInputs.nth(0).setInputFiles({
      name: 'photo-stamp.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from(opaqueJpgBytes),
    });

    await expect(page.getByText('photo-stamp.png')).toBeVisible();
    await expect(page.getByText('Мөлдір фон')).toBeVisible();
    // Should be tightly cropped down from 200x200 to around ~90x90
    const dimsText = await page.locator('text=/\\d+×\\d+/').first().innerText();
    const match = dimsText.match(/(\d+)×(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeLessThan(120);
    expect(Number(match![2])).toBeLessThan(120);

    // Toggle restore original and re-remove background
    await page.getByRole('button', { name: 'Түпнұсқасын қайтару' }).click();
    await expect(page.getByText('200×200')).toBeVisible();
    await page.getByRole('button', { name: 'Фонын өшіру' }).click();
    await expect(page.getByText('Мөлдір фон')).toBeVisible();
  });

  test('approves all eligible REVIEW_REQUIRED documents in one click from analysis queue', async ({
    page,
  }) => {
    const sigBytes = await createTestPngBytes({ width: 120, height: 50 });
    const stampBytes = await createTestPngBytes({ width: 100, height: 100 });
    // Two identical signature lines per person on a page triggers ambiguity -> REVIEW_REQUIRED
    const ambiguousPdf = await createCustomPdfFixture({
      pageCount: 1,
      texts: [
        { text: 'Директор', x: 60, y: 340, size: 11 },
        { text: 'А. Б. Серіков', x: 60, y: 275, size: 11 },
        { text: 'Орындаушы', x: 340, y: 340, size: 11 },
        { text: 'И. И. Иванов', x: 340, y: 275, size: 11 },
        { text: 'Директор', x: 60, y: 210, size: 11 },
        { text: 'А. Б. Серіков', x: 60, y: 145, size: 11 },
      ],
      lines: [
        { x1: 60, y1: 300, x2: 200, y2: 300 },
        { x1: 340, y1: 300, x2: 480, y2: 300 },
        { x1: 60, y1: 170, x2: 200, y2: 170 },
      ],
    });

    await page.goto('/');
    await page.locator('input[type="file"][accept*="pdf"]').setInputFiles([
      { name: 'ambig-1.pdf', mimeType: 'application/pdf', buffer: Buffer.from(ambiguousPdf) },
      { name: 'ambig-2.pdf', mimeType: 'application/pdf', buffer: Buffer.from(ambiguousPdf) },
    ]);

    await page.getByRole('button', { name: 'Келесі: Қол мен мөр' }).click();
    await page.getByRole('button', { name: 'Қол қоюшы қосу' }).first().click();
    await page.getByRole('button', { name: 'Қол қоюшы қосу' }).first().click();
    await page.getByRole('button', { name: 'Мөр қосу' }).first().click();
    await page.locator('input[name$="-fullName"]').nth(0).fill('Серіков Асылбек Бекболатұлы');
    await page.locator('input[name$="-roles"]').nth(0).fill('Директор');
    await page.locator('input[name$="-fullName"]').nth(1).fill('Иванов Иван Иванович');
    await page.locator('input[name$="-roles"]').nth(1).fill('Орындаушы');

    const pngInputs = page.locator('input[type="file"][accept*="png"]');
    await pngInputs.nth(0).setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(sigBytes) });
    await pngInputs.nth(1).setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: Buffer.from(sigBytes) });
    await pngInputs.nth(2).setInputFiles({ name: 'stamp.png', mimeType: 'image/png', buffer: Buffer.from(stampBytes) });

    await page.getByRole('button', { name: 'Талдауды бастау' }).click();
    await expect(page.locator('aside').getByText('Тексеру қажет')).toHaveCount(2, { timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Келесі: Экспорт' })).toBeDisabled();

    // One-click approve all eligible REVIEW_REQUIRED docs right in Step 3
    await page.getByRole('button', { name: 'Барлығын растау (2)' }).click();
    await expect(page.locator('aside').getByText('Дайын')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Келесі: Экспорт' })).toBeEnabled();
  });

  test('supports 3 signatories, 2 stamps, and skipping a missing signatory before export', async ({
    page,
  }) => {
    const sigBytes = await createTestPngBytes({ width: 120, height: 50 });
    const stampBytes = await createTestPngBytes({ width: 100, height: 100 });
    const twoSignerPdf = await createCustomPdfFixture({
      pageCount: 1,
      texts: [
        { text: 'Директор', x: 60, y: 240, size: 11 },
        { text: 'А. Б. Серіков', x: 60, y: 175, size: 11 },
        { text: 'Орындаушы', x: 340, y: 240, size: 11 },
        { text: 'И. И. Иванов', x: 340, y: 175, size: 11 },
      ],
      lines: [
        { x1: 60, y1: 200, x2: 200, y2: 200 },
        { x1: 340, y1: 200, x2: 480, y2: 200 },
      ],
    });

    await page.goto('/');
    await page.locator('input[type="file"][accept*="pdf"]').setInputFiles({
      name: 'two-of-three.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(twoSignerPdf),
    });

    await page.getByRole('button', { name: 'Келесі: Қол мен мөр' }).click();
    await page.getByRole('button', { name: 'Қол қоюшы қосу' }).first().click();
    await page.getByRole('button', { name: 'Қол қоюшы қосу' }).first().click();
    await page.getByRole('button', { name: 'Қол қоюшы қосу' }).first().click();
    await page.getByRole('button', { name: 'Мөр қосу' }).first().click();
    await page.getByRole('button', { name: 'Мөр қосу' }).first().click();

    await page.locator('input[name$="-fullName"]').nth(0).fill('Серіков Асылбек Бекболатұлы');
    await page.locator('input[name$="-roles"]').nth(0).fill('Директор');
    await page.locator('input[name$="-fullName"]').nth(1).fill('Иванов Иван Иванович');
    await page.locator('input[name$="-roles"]').nth(1).fill('Орындаушы');
    await page.locator('input[name$="-fullName"]').nth(2).fill('Алиева Дана');
    await page.locator('input[name$="-roles"]').nth(2).fill('Юрист');

    const pngInputs = page.locator('input[type="file"][accept*="png"]');
    await expect(pngInputs).toHaveCount(5);
    for (let i = 0; i < 3; i++) {
      await pngInputs.nth(i).setInputFiles({ name: `sig-${i + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(sigBytes) });
    }
    for (let i = 3; i < 5; i++) {
      await pngInputs.nth(i).setInputFiles({ name: `stamp-${i - 2}.png`, mimeType: 'image/png', buffer: Buffer.from(stampBytes) });
    }

    await page.getByRole('button', { name: 'Талдауды бастау' }).click();
    await expect(page.locator('aside').getByText('Тексеру қажет')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Табылмады').first()).toBeVisible();

    // Skip the missing 3rd signatory for this document
    await page.getByRole('button', { name: 'Осы құжатта өткізу' }).nth(2).click();
    await expect(page.getByText('Өткізілді').first()).toBeVisible();

    await page.getByRole('button', { name: 'Растау', exact: true }).click();
    await expect(page.locator('aside').getByText('Дайын')).toBeVisible();

    await page.getByRole('button', { name: 'Келесі: Экспорт' }).click();
    await page.getByRole('button', { name: /PDF өңдеу/ }).click();
    await expect(page.getByRole('button', { name: /ZIP жүктеу \(1\)/ })).toBeVisible({ timeout: 15000 });
  });

  test('persists signatories, stamps, and uploaded PNG assets locally across page reload', async ({
    page,
  }) => {
    const sigBytes = await createTestPngBytes({ width: 120, height: 50 });
    const stampBytes = await createTestPngBytes({ width: 100, height: 100 });
    const dummyPdf = await createCustomPdfFixture({ pageCount: 1, texts: [], lines: [] });

    await page.goto('/');
    await page.locator('input[type="file"][accept*="pdf"]').setInputFiles({
      name: 'persist-dummy.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(dummyPdf),
    });
    await page.getByRole('button', { name: '2. Қол мен мөр' }).click();
    await page.getByRole('button', { name: 'Қол қоюшы қосу' }).first().click();
    await page.getByRole('button', { name: 'Мөр қосу' }).first().click();

    await page.locator('input[name$="-fullName"]').nth(0).fill('Сатыбалдина З. С.');
    await page.locator('input[name$="-roles"]').nth(0).fill('Зертхана меңгерушісі');
    await page.getByRole('button', { name: 'Қолдың сол жағына (шетін басып)' }).click();

    const pngInputs = page.locator('input[type="file"][accept*="png"]');
    await pngInputs.nth(0).setInputFiles({ name: 'saved-sig.png', mimeType: 'image/png', buffer: Buffer.from(sigBytes) });
    await pngInputs.nth(1).setInputFiles({ name: 'saved-stamp.png', mimeType: 'image/png', buffer: Buffer.from(stampBytes) });

    await expect(page.getByText('saved-sig.png')).toBeVisible();
    await expect(page.getByText('saved-stamp.png')).toBeVisible();

    // Allow IndexedDB save to flush, then reload page, upload a PDF, and navigate back to Step 2
    await page.waitForTimeout(300);
    await page.reload();
    await page.locator('input[type="file"][accept*="pdf"]').setInputFiles({
      name: 'persist-dummy.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(dummyPdf),
    });
    await page.getByRole('button', { name: '2. Қол мен мөр' }).click();

    await expect(page.locator('input[name$="-fullName"]').nth(0)).toHaveValue('Сатыбалдина З. С.');
    await expect(page.locator('input[name$="-roles"]').nth(0)).toHaveValue('Зертхана меңгерушісі');
    await expect(page.getByText('saved-sig.png')).toBeVisible();
    await expect(page.getByText('saved-stamp.png')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Қолдың сол жағына (шетін басып)' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('displays all pages containing signatures or stamps together when spread across multiple pages', async ({
    page,
  }) => {
    const sigBytes = await createTestPngBytes({ width: 120, height: 50 });
    const stampBytes = await createTestPngBytes({ width: 100, height: 100 });
    const multiPagePdf = await createCustomPdfFixture({
      pageCount: 3,
      texts: [
        { pageIndex: 0, text: 'ТИТУЛ БЕТІ / ТИТУЛЬНЫЙ ЛИСТ', x: 160, y: 720, size: 13 },
        { pageIndex: 1, text: 'Бас директор', x: 60, y: 240, size: 11 },
        { pageIndex: 1, text: 'А. Б. Серіков', x: 60, y: 175, size: 11 },
        { pageIndex: 2, text: 'Орындаушы', x: 340, y: 240, size: 11 },
        { pageIndex: 2, text: 'И. И. Иванов', x: 340, y: 175, size: 11 },
      ],
      lines: [
        { pageIndex: 1, x1: 60, y1: 200, x2: 200, y2: 200 },
        { pageIndex: 2, x1: 340, y1: 200, x2: 480, y2: 200 },
      ],
    });

    await page.goto('/');
    await page.locator('input[type="file"][accept*="pdf"]').setInputFiles({
      name: 'split-signers.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(multiPagePdf),
    });

    await page.getByRole('button', { name: 'Келесі: Қол мен мөр' }).click();
    await page.getByRole('button', { name: 'Қол қоюшы қосу' }).first().click();
    await page.getByRole('button', { name: 'Қол қоюшы қосу' }).first().click();
    await page.getByRole('button', { name: 'Мөр қосу' }).first().click();

    await page.locator('input[name$="-fullName"]').nth(0).fill('Серіков Асылбек Бекболатұлы');
    await page.locator('input[name$="-roles"]').nth(0).fill('Бас директор');
    await page.locator('input[name$="-fullName"]').nth(1).fill('Иванов Иван Иванович');
    await page.locator('input[name$="-roles"]').nth(1).fill('Орындаушы');

    const pngInputs = page.locator('input[type="file"][accept*="png"]');
    await pngInputs.nth(0).setInputFiles({ name: 'sig1.png', mimeType: 'image/png', buffer: Buffer.from(sigBytes) });
    await pngInputs.nth(1).setInputFiles({ name: 'sig2.png', mimeType: 'image/png', buffer: Buffer.from(sigBytes) });
    await pngInputs.nth(2).setInputFiles({ name: 'stamp.png', mimeType: 'image/png', buffer: Buffer.from(stampBytes) });

    await page.getByRole('button', { name: 'Талдауды бастау' }).click();
    await expect(page.locator('aside').getByText('Дайын')).toBeVisible({ timeout: 15000 });

    // Both page 2 (signer 1) and page 3 (signer 2 + stamp) render simultaneously without flipping pages
    await expect(page.getByRole('button', { name: 'Қойылған беттер (2)' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-review-page="2"] canvas')).toBeVisible();
    await expect(page.locator('[data-review-page="3"] canvas')).toBeVisible();
    await expect(page.getByText('2-бет')).toBeVisible();
    await expect(page.getByText('3-бет')).toBeVisible();
    await expect(page.locator('[data-overlay-item]').first()).toBeInViewport();

    // User can still switch to single-page mode to inspect page 1
    await page.getByRole('button', { name: 'Бет бойынша' }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.getByText(/Бет \d+ \/ 3/)).toBeVisible();
  });

  test('renders mobile-responsive layout across all 4 steps with fitted PDF preview', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const sigBytes = await createTestPngBytes({ width: 120, height: 50 });
    const stampBytes = await createTestPngBytes({ width: 100, height: 100 });
    const samplePdf = await createCustomPdfFixture({
      pageCount: 1,
      texts: [
        { text: 'Бас директор', x: 60, y: 240, size: 11 },
        { text: 'А. Б. Серіков', x: 60, y: 175, size: 11 },
      ],
      lines: [{ x1: 60, y1: 200, x2: 200, y2: 200 }],
    });

    const assertNoPageHorizontalOverflow = async () => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(2);
    };

    await page.goto('/');
    const sixPdfs = Array.from({ length: 6 }, (_, i) => ({
      name: `mobile-contract-${i + 1}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from(samplePdf),
    }));
    await page.locator('input[type="file"][accept*="pdf"]').setInputFiles(sixPdfs);
    await assertNoPageHorizontalOverflow();

    await page.getByRole('button', { name: 'Келесі: Қол мен мөр' }).click();
    await page.getByRole('button', { name: 'Қол қоюшы қосу' }).first().click();
    await expect(page.locator('input[name$="-fullName"]').nth(0)).toBeFocused();
    await page.getByRole('button', { name: 'Қол қоюшы қосу' }).first().click();
    await expect(page.locator('input[name$="-fullName"]').nth(1)).toBeFocused();
    await expect(page.locator('input[name$="-fullName"]').nth(1)).toBeInViewport();
    await page.locator('[data-setup-card-id^="signer-"]').nth(1).getByRole('button').first().click();

    await page.getByRole('button', { name: 'Мөр қосу' }).first().click();
    await expect(page.locator('[data-setup-card-id^="stamp-"] select').first()).toBeFocused();
    await page.locator('input[name$="-fullName"]').nth(0).fill('Серіков Асылбек Бекболатұлы');
    await page.locator('input[name$="-roles"]').nth(0).fill('Бас директор');

    const pngInputs = page.locator('input[type="file"][accept*="png"]');
    await pngInputs.nth(0).setInputFiles({ name: 'sig.png', mimeType: 'image/png', buffer: Buffer.from(sigBytes) });
    await pngInputs.nth(1).setInputFiles({ name: 'stamp.png', mimeType: 'image/png', buffer: Buffer.from(stampBytes) });
    await assertNoPageHorizontalOverflow();

    await page.getByRole('button', { name: 'Талдауды бастау' }).click();
    await expect(page.locator('aside').getByText('Дайын').first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator('canvas')).toBeVisible();
    await assertNoPageHorizontalOverflow();

    // Verify grid columns (<aside>, PDF viewer overlay, ReviewPanel action buttons) stay inside 390px viewport
    const asideBox = await page.locator('aside').boundingBox();
    expect(asideBox).not.toBeNull();
    expect(asideBox!.x + asideBox!.width).toBeLessThanOrEqual(390);

    const canvasBox = await page.locator('canvas').boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(canvasBox!.width).toBeLessThanOrEqual(370);
    expect(canvasBox!.x).toBeGreaterThanOrEqual(0);
    expect(canvasBox!.x + canvasBox!.width).toBeLessThanOrEqual(390);

    const overlayBox = await page.locator('[data-overlay-item]').first().boundingBox();
    expect(overlayBox).not.toBeNull();
    expect(overlayBox!.x + overlayBox!.width).toBeLessThanOrEqual(390);

    for (const label of ['Растау', 'Барлығына қолдану', 'Бұғаттау']) {
      const btnBox = await page.getByRole('button', { name: label }).boundingBox();
      expect(btnBox).not.toBeNull();
      expect(btnBox!.x + btnBox!.width).toBeLessThanOrEqual(390);
    }

    await page.getByRole('button', { name: 'Келесі: Экспорт' }).click();
    await expect(page.getByText('mobile-contract-1.pdf')).toBeVisible();
    await assertNoPageHorizontalOverflow();

    await page.getByRole('button', { name: /PDF өңдеу/ }).click();
    const downloadBtn = page.getByRole('button', { name: 'Жүктеу' }).first();
    await expect(downloadBtn).toBeVisible({ timeout: 20000 });
    const downloadBtnBox = await downloadBtn.boundingBox();
    expect(downloadBtnBox).not.toBeNull();
    expect(downloadBtnBox!.x + downloadBtnBox!.width).toBeLessThanOrEqual(390);
    await assertNoPageHorizontalOverflow();
  });
});
