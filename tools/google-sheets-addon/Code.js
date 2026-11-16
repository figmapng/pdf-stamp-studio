/**
 * =========================================================================
 * PDF Stamp Studio — Google Sheets Apps Script
 * 1 кликпен қол мен мөр қойып, барлық беттерді PDF қылып шығару
 * =========================================================================
 */

// 1. БАПТАУЛАР
// Мұнда Google Drive файлының сілтемесін (немесе ID-ін) қоясыз
const CONFIG = {
  suffix: '_бекітілген',

  // 1-қол қоюшы (Инженер-химик Затыбек А. А.)
  signer1: {
    enabled: true,
    keywords: ['Затыбек', 'Инженер-химик'],
    // Өз қолтаңбаңыздың Google Drive сілтемесін немесе ID-ін қойыңыз:
    imageUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/sig_zatybek.png',
    offsetX: 70,
    offsetY: -15,
    width: 110,
    height: 42
  },

  // 2-қол қоюшы (Зертхана меңгерушісі Сатыбалдина З. С.)
  signer2: {
    enabled: true,
    keywords: ['Сатыбалдина', 'Заведующий лабораторией'],
    imageUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/sig_satybaldina.png',
    offsetX: 90,
    offsetY: -15,
    width: 110,
    height: 42
  },

  // Мекеме мөрі
  stamp: {
    enabled: true,
    anchorKeyword: 'Сатыбалдина',
    imageUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/stamp.png',
    offsetX: 35,
    offsetY: -35,
    width: 95,
    height: 95
  }
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📑 PDF Stamp')
    .addItem('🚀 Қол қойып PDF жасау', 'exportPdfWithSignaturesAndStamp')
    .addToUi();
}

function exportPdfWithSignaturesAndStamp() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  ss.toast('Қолтаңбалар мен мөр орналастырылуда...', 'PDF Stamp', 3);

  const addedImages = [];

  try {
    if (CONFIG.signer1.enabled) {
      const cell1 = findCellByKeywords(ss, CONFIG.signer1.keywords);
      if (cell1) {
        const img1 = insertImageOverCell(cell1, CONFIG.signer1);
        if (img1) addedImages.push(img1);
      }
    }

    if (CONFIG.signer2.enabled) {
      const cell2 = findCellByKeywords(ss, CONFIG.signer2.keywords);
      if (cell2) {
        const img2 = insertImageOverCell(cell2, CONFIG.signer2);
        if (img2) addedImages.push(img2);
      }
    }

    if (CONFIG.stamp.enabled) {
      const cellStamp = findCellByKeywords(ss, [CONFIG.stamp.anchorKeyword]);
      if (cellStamp) {
        const imgStamp = insertImageOverCell(cellStamp, CONFIG.stamp);
        if (imgStamp) addedImages.push(imgStamp);
      }
    }

    SpreadsheetApp.flush();
    Utilities.sleep(600);

    ss.toast('PDF құжаты жиналуда...', 'PDF Stamp', 4);
    const pdfBlob = fetchSpreadsheetPdfBlob(ss);
    const fileName = ss.getName() + CONFIG.suffix + '.pdf';
    pdfBlob.setName(fileName);
    const pdfFile = DriveApp.createFile(pdfBlob);

    // Таблица таза қалуы үшін қойылған уақытша суреттерді өшіреміз
    addedImages.forEach(img => {
      try { img.remove(); } catch (e) {}
    });
    SpreadsheetApp.flush();

    showDownloadDialog(ui, pdfFile.getUrl(), pdfFile.getDownloadUrl(), fileName);

  } catch (error) {
    addedImages.forEach(img => {
      try { img.remove(); } catch (e) {}
    });
    SpreadsheetApp.flush();
    ui.alert('Қате туындады: ' + error.message);
  }
}

function findCellByKeywords(ss, keywords) {
  const sheets = ss.getSheets();
  for (let i = sheets.length - 1; i >= 0; i--) {
    const sheet = sheets[i];
    if (sheet.isSheetHidden()) continue;
    for (let k = 0; k < keywords.length; k++) {
      const kw = keywords[k].trim();
      if (!kw) continue;
      const match = sheet.createTextFinder(kw).matchEntireCell(false).findNext();
      if (match) return match;
    }
  }
  return null;
}

/**
 * Google Drive сілтемесінен немесе ID-ден Blob алу
 */
function getImageBlob(urlOrId) {
  if (!urlOrId) return null;
  const str = urlOrId.trim();

  // 1. Google Drive файлының сілтемесі немесе ID-і болса
  if (str.includes('drive.google.com') || (!str.startsWith('http://') && !str.startsWith('https://'))) {
    const match = str.match(/[-\w]{25,}/);
    const fileId = match ? match[0] : str;
    try {
      return DriveApp.getFileById(fileId).getBlob();
    } catch (e) {
      // Drive-тан табылмаса
    }
  }

  // 2. Кәдімгі веб-сілтеме болса
  try {
    const resp = UrlFetchApp.fetch(str, { muteHttpExceptions: true });
    if (resp.getResponseCode() === 200) {
      return resp.getBlob();
    }
  } catch (e) {}

  return null;
}

function insertImageOverCell(cell, itemConfig) {
  const sheet = cell.getSheet();
  const imgBlob = getImageBlob(itemConfig.imageUrl);
  if (!imgBlob) return null;

  const image = sheet.insertImage(imgBlob, cell.getColumn(), cell.getRow(), itemConfig.offsetX, itemConfig.offsetY);
  image.setWidth(itemConfig.width);
  image.setHeight(itemConfig.height);
  return image;
}

function fetchSpreadsheetPdfBlob(ss) {
  const url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?' +
    'format=pdf&size=A4&portrait=true&fitw=true&gridlines=false&printtitle=false&sheetnames=false&fzr=false';
  const res = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  return res.getBlob();
}

function showDownloadDialog(ui, viewUrl, downloadUrl, fileName) {
  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family:sans-serif; text-align:center; padding:15px;">
        <h3 style="color:#0f172a; margin-top:0;">🎉 Құжат дайын!</h3>
        <p style="color:#64748b; font-size:13px;">Қол мен мөр қойылып, PDF сәтті жасалды:</p>
        <a href="${downloadUrl}" target="_blank" style="display:block; background:#10b981; color:white; padding:12px; border-radius:8px; text-decoration:none; font-weight:bold; margin-bottom:8px;">⬇️ PDF Жүктеп алу</a>
        <a href="${viewUrl}" target="_blank" style="display:block; background:#f1f5f9; color:#334155; padding:10px; border-radius:8px; text-decoration:none; font-size:13px;">👁️ Google Drive-тан қарау</a>
      </body>
    </html>
  `;
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(360).setHeight(210), 'PDF Stamp Studio');
}
