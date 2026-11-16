/**
 * =========================================================================
 * PDF Stamp Studio — Google Sheets Apps Script (Қатесіз 2 қадамдық нұсқа)
 * ТОО «Ecology Expert» зертханалық хаттамалары үшін
 * =========================================================================
 */

const CONFIG = {
  suffix: '_бекітілген',

  // 1-қол қоюшы: Инженер-химик Затыбек А. А.
  signer1: {
    name: 'Затыбек А. А. (Инженер-химик)',
    enabled: true,
    keywords: ['Затыбек', 'Инженер-химик'],
    imageUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/sig_zatybek.png',
    rowOffset: -1,   // Мәтіннен 1 қатар жоғары
    offsetX: 130,    // Сызықтың тура ортасы
    offsetY: 6,      // Оң мән (сызықтың дәл үстіне)
    width: 105,
    height: 55
  },

  // 2-қол қоюшы: Зертхана меңгерушісі Сатыбалдина З. С.
  signer2: {
    name: 'Сатыбалдина З. С. (Заведующий лабораторией)',
    enabled: true,
    keywords: ['Сатыбалдина', 'Заведующий лабораторией'],
    imageUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/sig_satybaldina.png',
    rowOffset: -1,   // Мәтіннен 1 қатар жоғары
    offsetX: 160,    // Сызықтың тура ортасы
    offsetY: 12,     // Сызықтың үстінде
    width: 110,
    height: 38
  },

  // Мекеме мөрі: ТОО «Ecology Expert» Аналитикалық зертхана хаттамалары үшін
  stamp: {
    name: 'ТОО Ecology Expert мөрі',
    enabled: true,
    anchorKeyword: 'Сатыбалдина',
    imageUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/stamp.png',
    rowOffset: -2,   // 2 қатар жоғары
    offsetX: 160,    // Қолтаңбаны басып тұратындай оңға
    offsetY: 8,      // Мөрдің ортасы сызықты дәл кесіп өтеді
    width: 95,
    height: 95
  }
};

/**
 * Қарапайым 2 қадамдық мәзір
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📑 PDF Stamp')
    .addItem('1-қадам: ✍️ Қол мен мөрді қою', 'step1PlaceSignaturesAndStamp')
    .addItem('2-қадам: 🚀 PDF сақтау', 'step2ExportPdf')
    .addSeparator()
    .addItem('🗑️ Кестені тазалау (өшіру)', 'clearPlacedSignaturesAndStampsAlert')
    .addItem('🔄 Бастапқы орынға қайтару (Сброс)', 'resetToDefaultCoordsAlert')
    .addToUi();
}

/**
 * 1-ҚАДАМ: Қол мен мөрді кестеге қою
 */
function step1PlaceSignaturesAndStamp() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  try {
    ss.toast('Қолтаңбалар мен мөр қойылуда...', 'PDF Stamp', 2);
    const count = placeImagesOnSheet(ss);

    if (count === 0) {
      ui.alert('⚠️ Қате', 'Кестеден «Затыбек» немесе «Сатыбалдина» сөздері табылмады!\nБелсенді парақты ашып, қайта басыңыз.', ui.ButtonSet.OK);
      return;
    }

    // Экранды қолтаңбалар тұрған қатарға автоматты түрде апару
    const cell1 = findCellByKeywords(ss, CONFIG.signer1.keywords);
    if (cell1) {
      try {
        cell1.getSheet().activate();
        cell1.activate();
      } catch (e) {}
    }

    SpreadsheetApp.flush();
    ss.toast('✅ Қойылды! Қажет болса мышкамен жылжытыңыз да, 2-қадамды басыңыз.', 'PDF Stamp', 6);

  } catch (e) {
    ui.alert('Қате: ' + e.message);
  }
}

/**
 * 2-ҚАДАМ: PDF сақтау
 * Егер мышкамен жылжытылса, жаңа орынды автоматты есте сақтап алады
 */
function step2ExportPdf() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  try {
    const existingCount = countPlacedImages(ss);

    if (existingCount === 0) {
      ss.toast('Қолдар мен мөр қойылуда...', 'PDF Stamp', 2);
      placeImagesOnSheet(ss);
      SpreadsheetApp.flush();
      Utilities.sleep(1200);
    } else {
      // Жаңа орындарды автоматты сақтау
      try {
        autoSaveCurrentPositions(ss);
      } catch (err) {}
      SpreadsheetApp.flush();
      Utilities.sleep(800);
    }

    ss.toast('PDF құжаты жиналуда...', 'PDF Stamp', 4);
    const pdfBlob = fetchSpreadsheetPdfBlob(ss);
    const fileName = ss.getName() + CONFIG.suffix + '.pdf';
    pdfBlob.setName(fileName);
    const pdfFile = DriveApp.createFile(pdfBlob);

    showDownloadDialog(ui, pdfFile.getUrl(), pdfFile.getDownloadUrl(), fileName);

  } catch (error) {
    ui.alert('Қате туындады: ' + error.message);
  }
}

/**
 * Суреттерді кестеге қою
 */
function placeImagesOnSheet(ss) {
  clearPlacedSignaturesAndStamps();
  let placedCount = 0;

  // 1. Затыбек А. А.
  if (CONFIG.signer1.enabled) {
    const cell1 = findCellByKeywords(ss, CONFIG.signer1.keywords);
    if (cell1) {
      const img1 = insertImageOverCell(cell1, 'signer1', CONFIG.signer1);
      if (img1) placedCount++;
    }
  }

  // 2. Сатыбалдина З. С.
  if (CONFIG.signer2.enabled) {
    const cell2 = findCellByKeywords(ss, CONFIG.signer2.keywords);
    if (cell2) {
      const img2 = insertImageOverCell(cell2, 'signer2', CONFIG.signer2);
      if (img2) placedCount++;
    }
  }

  // 3. Зертхана мөрі
  if (CONFIG.stamp.enabled) {
    const cellStamp = findCellByKeywords(ss, [CONFIG.stamp.anchorKeyword]);
    if (cellStamp) {
      const imgStamp = insertImageOverCell(cellStamp, 'stamp', CONFIG.stamp);
      if (imgStamp) placedCount++;
    }
  }

  return placedCount;
}

/**
 * Суретті жүктеп ұяшық үстіне қауіпсіз қою
 */
function insertImageOverCell(cell, itemKey, defaultCfg) {
  const sheet = cell.getSheet();
  const resp = UrlFetchApp.fetch(defaultCfg.imageUrl, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    throw new Error(defaultCfg.name + ' суреті жүктелмеді');
  }

  let targetRow = Math.max(1, cell.getRow() + defaultCfg.rowOffset);
  let targetCol = cell.getColumn();
  let offX = Math.max(0, defaultCfg.offsetX);
  let offY = Math.max(0, defaultCfg.offsetY);
  let width = defaultCfg.width;
  let height = defaultCfg.height;

  // Егер пайдаланушы бұрын мышкамен қойған жаңа орны сақталған болса:
  try {
    const savedProps = PropertiesService.getDocumentProperties().getProperty('SAVED_COORDS');
    if (savedProps) {
      const saved = JSON.parse(savedProps);
      if (saved && saved[itemKey]) {
        const s = saved[itemKey];
        targetRow = Math.max(1, cell.getRow() + (s.deltaRow || 0));
        targetCol = Math.max(1, cell.getColumn() + (s.deltaCol || 0));
        offX = Math.max(0, s.offsetX !== undefined ? s.offsetX : offX);
        offY = Math.max(0, s.offsetY !== undefined ? s.offsetY : offY);
        width = s.width || width;
        height = s.height || height;
      }
    }
  } catch (e) {}

  const image = sheet.insertImage(resp.getBlob(), targetCol, targetRow, offX, offY);
  image.setWidth(width);
  image.setHeight(height);
  image.setAltTextDescription('PDF_STAMP_STUDIO_ASSET');
  image.setAltTextTitle(itemKey);
  return image;
}

/**
 * Мышкамен жылжытылған орындарды есте сақтау
 */
function autoSaveCurrentPositions(ss) {
  const sheets = ss.getSheets();
  const saved = {};

  sheets.forEach(sheet => {
    sheet.getImages().forEach(img => {
      try {
        if (img.getAltTextDescription() === 'PDF_STAMP_STUDIO_ASSET') {
          const key = img.getAltTextTitle();
          if (key && CONFIG[key]) {
            const anchor = img.getAnchorCell();
            const keywordCell = findCellByKeywords(ss, CONFIG[key].keywords || [CONFIG[key].anchorKeyword]);
            let deltaRow = 0;
            let deltaCol = 0;
            if (keywordCell) {
              deltaRow = anchor.getRow() - keywordCell.getRow();
              deltaCol = anchor.getColumn() - keywordCell.getColumn();
            }
            saved[key] = {
              deltaRow: deltaRow,
              deltaCol: deltaCol,
              offsetX: Math.max(0, img.getAnchorCellXOffset() || 0),
              offsetY: Math.max(0, img.getAnchorCellYOffset() || 0),
              width: img.getWidth(),
              height: img.getHeight()
            };
          }
        }
      } catch (e) {}
    });
  });

  if (Object.keys(saved).length > 0) {
    PropertiesService.getDocumentProperties().setProperty('SAVED_COORDS', JSON.stringify(saved));
  }
}

/**
 * Бастапқы орынға қайтару (Сброс)
 */
function resetToDefaultCoordsAlert() {
  PropertiesService.getDocumentProperties().deleteProperty('SAVED_COORDS');
  placeImagesOnSheet(SpreadsheetApp.getActiveSpreadsheet());
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert('🔄 Қайтарылды', 'Координаталар бастапқы стандартты күйіне қайтарылды.', SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Қойылған суреттерді санау
 */
function countPlacedImages(ss) {
  let count = 0;
  ss.getSheets().forEach(sheet => {
    sheet.getImages().forEach(img => {
      try {
        if (img.getAltTextDescription() === 'PDF_STAMP_STUDIO_ASSET') count++;
      } catch (e) {}
    });
  });
  return count;
}

/**
 * Кестені тазалау
 */
function clearPlacedSignaturesAndStampsAlert() {
  clearPlacedSignaturesAndStamps();
  SpreadsheetApp.getUi().alert('Тазартылды', 'Кестеден қолдар мен мөр өшірілді.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function clearPlacedSignaturesAndStamps() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  sheets.forEach(sheet => {
    sheet.getImages().forEach(img => {
      try {
        if (img.getAltTextDescription() === 'PDF_STAMP_STUDIO_ASSET') {
          img.remove();
        }
      } catch (e) {}
    });
  });
  SpreadsheetApp.flush();
}

/**
 * Кестеден сөздер бойынша іздеу
 */
function findCellByKeywords(ss, keywords) {
  const activeSheet = ss.getActiveSheet();
  for (let k = 0; k < keywords.length; k++) {
    const kw = keywords[k].trim();
    if (!kw) continue;
    const match = activeSheet.createTextFinder(kw).matchEntireCell(false).matchCase(false).findNext();
    if (match) return match;
  }

  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    if (sheet.getSheetId() === activeSheet.getSheetId() || sheet.isSheetHidden()) continue;
    for (let k = 0; k < keywords.length; k++) {
      const kw = keywords[k].trim();
      if (!kw) continue;
      const match = sheet.createTextFinder(kw).matchEntireCell(false).matchCase(false).findNext();
      if (match) return match;
    }
  }

  return null;
}

/**
 * PDF экспорттау
 */
function fetchSpreadsheetPdfBlob(ss) {
  const url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?' +
    'format=pdf&size=A4&portrait=true&fitw=true&gridlines=false&printtitle=false&sheetnames=false&fzr=false';
  const res = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('PDF экспорттау мүмкін болмады (HTTP ' + res.getResponseCode() + ')');
  }
  return res.getBlob();
}

/**
 * Жүктеу терезесі
 */
function showDownloadDialog(ui, viewUrl, downloadUrl, fileName) {
  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 20px; background: #ffffff; color: #0f172a;">
        <div style="font-size: 38px; margin-bottom: 8px;">🎉</div>
        <h3 style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: #0f172a;">Құжат дайын!</h3>
        <p style="margin: 0 0 20px; font-size: 13px; color: #64748b; line-height: 1.4;">
          Қолтаңбалар мен мөр нақты орнымен қойылып, PDF әзір болды.<br>
          <span style="color: #10b981; font-weight: 600;">✨ Сіз қойған жаңа орындар келесі хаттамалар үшін есте сақталды!</span>
        </p>
        <a href="${downloadUrl}" target="_blank"
           style="display: block; background: #2563eb; color: #ffffff; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600; box-shadow: 0 4px 12px rgba(37,99,235,0.25); margin-bottom: 10px;">
          ⬇️ PDF Жүктеп алу
        </a>
        <a href="${viewUrl}" target="_blank"
           style="display: block; background: #f8fafc; color: #475569; border: 1px solid #e2e8f0; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 500;">
          👁️ Google Drive арқылы қарау
        </a>
      </body>
    </html>
  `;
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(380).setHeight(250), 'PDF Stamp Studio');
}
