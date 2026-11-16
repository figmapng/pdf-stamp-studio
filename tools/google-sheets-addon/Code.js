/**
 * =========================================================================
 * PDF Stamp Studio — Google Sheets Apps Script (Қарапайым 2 қадамдық нұсқа)
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
    offsetX: 130,   // Сызықтың тура ортасы
    offsetY: -22,   // Сызықтың үстіне дәл көтеру
    width: 105,
    height: 60
  },

  // 2-қол қоюшы: Зертхана меңгерушісі Сатыбалдина З. С.
  signer2: {
    name: 'Сатыбалдина З. С. (Заведующий лабораторией)',
    enabled: true,
    keywords: ['Сатыбалдина', 'Заведующий лабораторией'],
    imageUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/sig_satybaldina.png',
    offsetX: 160,   // Сызықтың тура ортасы
    offsetY: -15,   // Сызықтың үстінде
    width: 110,
    height: 38
  },

  // Мекеме мөрі: ТОО «Ecology Expert» Аналитикалық зертхана хаттамалары үшін
  stamp: {
    name: 'ТОО Ecology Expert мөрі',
    enabled: true,
    anchorKeyword: 'Сатыбалдина',
    imageUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/stamp.png',
    offsetX: 160,   // Қолтаңбаны басып тұратындай оңға қойылды
    offsetY: -48,   // Мөрдің ортасы сызықты дәл кесіп өтеді
    width: 95,
    height: 95
  }
};

/**
 * 2 қадамдық қарапайым мәзір
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📑 PDF Stamp')
    .addItem('1-қадам: ✍️ Қол мен мөрді қою', 'step1PlaceSignaturesAndStamp')
    .addItem('2-қадам: 🚀 PDF сақтау', 'step2ExportPdf')
    .addSeparator()
    .addItem('🗑️ Кестені тазалау (өшіру)', 'clearPlacedSignaturesAndStampsAlert')
    .addToUi();
}

/**
 * 1-ҚАДАМ: Қол мен мөрді кестеге қою
 * Экранды автоматты жаңартады (басқа листке өтіп-қайтуды скрипт өзі лезде жасайды)
 */
function step1PlaceSignaturesAndStamp() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  try {
    // Ескі сақталған қате координаталар болса өшіреміз:
    PropertiesService.getDocumentProperties().deleteAllProperties();

    ss.toast('Қолтаңбалар мен мөр қойылуда...', 'PDF Stamp', 2);
    const count = placeImagesOnSheet(ss);

    if (count === 0) {
      ui.alert('⚠️ Қате', 'Кестеден «Затыбек» немесе «Сатыбалдина» сөздері табылмады!\nБелсенді парақты ашып қайта басыңыз.', ui.ButtonSet.OK);
      return;
    }

    const currentSheet = ss.getActiveSheet();
    const cell1 = findCellByKeywords(ss, CONFIG.signer1.keywords);

    // Браузер суреттерді бірден көрсетуі үшін парақты 0.1 секундқа жаңартамыз (redraw):
    refreshSheetCanvas(ss, currentSheet, cell1);

    ss.toast('✅ Қолдар мен мөр сызыққа қойылды! Енді 2-қадамды басыңыз.', 'PDF Stamp', 5);

  } catch (e) {
    ui.alert('Қате: ' + e.message);
  }
}

/**
 * 2-ҚАДАМ: Дайын PDF файлын жасап, жүктеп алу
 */
function step2ExportPdf() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  try {
    const existingCount = countPlacedImages(ss);

    // Егер 1-қадам басылмаған болса, өзі қойып алады
    if (existingCount === 0) {
      ss.toast('Қолдар мен мөр қойылуда...', 'PDF Stamp', 2);
      const placed = placeImagesOnSheet(ss);
      if (placed === 0) {
        ui.alert('⚠️ Қате: Кестеден қол қоюшылар табылмады!');
        return;
      }
      SpreadsheetApp.flush();
      Utilities.sleep(1200);
    } else {
      SpreadsheetApp.flush();
      Utilities.sleep(800);
    }

    ss.toast('PDF құжаты дайындалуда...', 'PDF Stamp', 4);
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
      const img1 = insertImageOverCell(cell1, CONFIG.signer1);
      if (img1) placedCount++;
    }
  }

  // 2. Сатыбалдина З. С.
  if (CONFIG.signer2.enabled) {
    const cell2 = findCellByKeywords(ss, CONFIG.signer2.keywords);
    if (cell2) {
      const img2 = insertImageOverCell(cell2, CONFIG.signer2);
      if (img2) placedCount++;
    }
  }

  // 3. Зертхана мөрі
  if (CONFIG.stamp.enabled) {
    const cellStamp = findCellByKeywords(ss, [CONFIG.stamp.anchorKeyword]);
    if (cellStamp) {
      const imgStamp = insertImageOverCell(cellStamp, CONFIG.stamp);
      if (imgStamp) placedCount++;
    }
  }

  return placedCount;
}

/**
 * Ұяшық үстіне сурет қою
 */
function insertImageOverCell(cell, itemConfig) {
  const sheet = cell.getSheet();
  const resp = UrlFetchApp.fetch(itemConfig.imageUrl, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    throw new Error(itemConfig.name + ' суреті жүктелмеді');
  }

  const image = sheet.insertImage(resp.getBlob(), cell.getColumn(), cell.getRow(), itemConfig.offsetX, itemConfig.offsetY);
  image.setWidth(itemConfig.width);
  image.setHeight(itemConfig.height);
  image.setAltTextDescription('PDF_STAMP_STUDIO_ASSET');
  return image;
}

/**
 * Браузер суреттерді бірден көрсетуі үшін (экранды автоматты жаңарту)
 */
function refreshSheetCanvas(ss, currentSheet, focusCell) {
  SpreadsheetApp.flush();
  const sheets = ss.getSheets();
  const otherSheet = sheets.find(s => s.getSheetId() !== currentSheet.getSheetId() && !s.isSheetHidden());
  if (otherSheet) {
    ss.setActiveSheet(otherSheet);
    SpreadsheetApp.flush();
    Utilities.sleep(100);
    ss.setActiveSheet(currentSheet);
    if (focusCell) {
      currentSheet.setActiveRange(focusCell);
    }
    SpreadsheetApp.flush();
  } else if (focusCell) {
    currentSheet.setActiveRange(focusCell);
    SpreadsheetApp.flush();
  }
}

/**
 * Кестедегі барлық қойылған суреттерді санау
 */
function countPlacedImages(ss) {
  let count = 0;
  ss.getSheets().forEach(sheet => {
    sheet.getImages().forEach(img => {
      if (img.getAltTextDescription() === 'PDF_STAMP_STUDIO_ASSET') count++;
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
 * Дайын PDF жүктеу терезесі
 */
function showDownloadDialog(ui, viewUrl, downloadUrl, fileName) {
  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 20px; background: #ffffff; color: #0f172a;">
        <div style="font-size: 38px; margin-bottom: 8px;">🎉</div>
        <h3 style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: #0f172a;">Құжат дайын!</h3>
        <p style="margin: 0 0 20px; font-size: 13px; color: #64748b; line-height: 1.4;">
          Қолтаңбалар мен мөр қойылып, PDF файлы сәтті жасалды.
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
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(380).setHeight(240), 'PDF Stamp Studio');
}
