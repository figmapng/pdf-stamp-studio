/**
 * =========================================================================
 * PDF Stamp Studio — Google Sheets Apps Script
 * Google Таблицалар үшін 1 кликпен қол мен мөр қойып, барлық беттерді PDF қылып шығару
 * =========================================================================
 */

// 1. БАПТАУЛАР (Қолтаңбалар мен мөр параметрлері)
const CONFIG = {
  // Файл атауының соңына қосылатын мәтін
  suffix: '_бекітілген',

  // 1-қол қоюшы (Мысалы: Инженер-химик Затыбек А. А.)
  signer1: {
    enabled: true,
    keywords: ['Затыбек', 'Инженер-химик'],
    // Сурет сілтемесі немесе Google Drive файлының ID-і:
    imageUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/sig_zatybek.png',
    offsetX: 70,   // оңға қарай ығысу (пиксель)
    offsetY: -15,  // жоғары қарай ығысу (пиксель)
    width: 110,
    height: 42
  },

  // 2-қол қоюшы (Мысалы: Зертхана меңгерушісі Сатыбалдина З. С.)
  signer2: {
    enabled: true,
    keywords: ['Сатыбалдина', 'Заведующий лабораторией'],
    imageUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/sig_satybaldina.png',
    offsetX: 90,
    offsetY: -15,
    width: 110,
    height: 42
  },

  // Мөр (Печать)
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

/**
 * Google Таблица ашылғанда жоғарғы мәзірге батырма қосу
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📑 PDF Stamp')
    .addItem('🚀 Қол қойып PDF жасау', 'exportPdfWithSignaturesAndStamp')
    .addToUi();
}

/**
 * Негізгі орындалатын функция
 */
function exportPdfWithSignaturesAndStamp() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  SpreadsheetApp.getActiveSpreadsheet().toast('Қолтаңбалар мен мөр орналастырылуда...', 'PDF Stamp', 3);

  const addedImages = [];

  try {
    // 1. Signer 1 қою
    if (CONFIG.signer1.enabled) {
      const cell1 = findCellByKeywords(ss, CONFIG.signer1.keywords);
      if (cell1) {
        const img1 = insertImageOverCell(cell1, CONFIG.signer1);
        if (img1) addedImages.push(img1);
      }
    }

    // 2. Signer 2 қою
    if (CONFIG.signer2.enabled) {
      const cell2 = findCellByKeywords(ss, CONFIG.signer2.keywords);
      if (cell2) {
        const img2 = insertImageOverCell(cell2, CONFIG.signer2);
        if (img2) addedImages.push(img2);
      }
    }

    // 3. Мөрді қою
    if (CONFIG.stamp.enabled) {
      const cellStamp = findCellByKeywords(ss, [CONFIG.stamp.anchorKeyword]);
      if (cellStamp) {
        const imgStamp = insertImageOverCell(cellStamp, CONFIG.stamp);
        if (imgStamp) addedImages.push(imgStamp);
      }
    }

    SpreadsheetApp.flush();
    Utilities.sleep(600); // Суреттер кестеге толық жатып үлгеруі үшін

    // 4. Барлық парақтарды бір PDF қылып экспорттау
    SpreadsheetApp.getActiveSpreadsheet().toast('PDF құжаты жиналуда...', 'PDF Stamp', 4);
    const pdfBlob = fetchSpreadsheetPdfBlob(ss);

    // 5. Google Drive-қа сақтау (негізгі немесе ағымдағы папкаға)
    const fileName = ss.getName() + CONFIG.suffix + '.pdf';
    pdfBlob.setName(fileName);
    const pdfFile = DriveApp.createFile(pdfBlob);

    // 6. Кестені тазалау (уақытша қойылған суреттерді өшіру)
    addedImages.forEach(img => {
      try {
        img.remove();
      } catch (e) {
        // елемеу
      }
    });
    SpreadsheetApp.flush();

    // 7. Қолданушыға дайын PDF-ті ашу / жүктеу терезесін көрсету
    showDownloadDialog(ui, pdfFile.getUrl(), pdfFile.getDownloadUrl(), fileName);

  } catch (error) {
    // Қате болған жағдайда да кестеде суреттер қалмауы үшін тазалаймыз
    addedImages.forEach(img => {
      try { img.remove(); } catch (e) {}
    });
    SpreadsheetApp.flush();
    ui.alert('Қате туындады: ' + error.message);
  }
}

/**
 * Ұяшықты мәтін кілтсөздері бойынша іздеу (соңғы беттерден бастап)
 */
function findCellByKeywords(ss, keywords) {
  const sheets = ss.getSheets();
  for (let i = sheets.length - 1; i >= 0; i--) {
    const sheet = sheets[i];
    if (sheet.isSheetHidden()) continue;

    for (let k = 0; k < keywords.length; k++) {
      const kw = keywords[k].trim();
      if (!kw) continue;
      const finder = sheet.createTextFinder(kw).matchEntireCell(false);
      const match = finder.findNext();
      if (match) {
        return match;
      }
    }
  }
  return null;
}

/**
 * Ұяшықтың үстіне суретті қою
 */
function insertImageOverCell(cell, itemConfig) {
  const sheet = cell.getSheet();
  const row = cell.getRow();
  const col = cell.getColumn();

  let imgBlob;
  if (itemConfig.imageUrl.startsWith('http://') || itemConfig.imageUrl.startsWith('https://')) {
    const resp = UrlFetchApp.fetch(itemConfig.imageUrl, { muteHttpExceptions: true });
    if (resp.getResponseCode() === 200) {
      imgBlob = resp.getBlob();
    }
  } else {
    // Google Drive File ID ретінде қарастыру
    imgBlob = DriveApp.getFileById(itemConfig.imageUrl).getBlob();
  }

  if (!imgBlob) return null;

  const image = sheet.insertImage(imgBlob, col, row, itemConfig.offsetX, itemConfig.offsetY);
  image.setWidth(itemConfig.width);
  image.setHeight(itemConfig.height);
  return image;
}

/**
 * Google Sheets кестесін біртұтас PDF Blob ретінде алу
 */
function fetchSpreadsheetPdfBlob(ss) {
  const id = ss.getId();
  const url = 'https://docs.google.com/spreadsheets/d/' + id + '/export?' +
    'format=pdf' +
    '&size=A4' +
    '&portrait=true' +
    '&fitw=true' +
    '&gridlines=false' +
    '&printtitle=false' +
    '&sheetnames=false' +
    '&fzr=false' +
    '&horizontal_alignment=CENTER';

  const res = UrlFetchApp.fetch(url, {
    headers: {
      'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
    },
    muteHttpExceptions: true
  });

  return res.getBlob();
}

/**
 * Дайын PDF-ті жүктеп алу немесе қарау үшін сұхбат терезесі
 */
function showDownloadDialog(ui, viewUrl, downloadUrl, fileName) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_blank">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            padding: 16px;
            color: #1e293b;
            text-align: center;
          }
          h3 { margin-top: 0; color: #0f172a; font-size: 16px; }
          p { font-size: 13px; color: #64748b; margin-bottom: 20px; }
          .btn {
            display: block;
            padding: 12px 20px;
            margin: 8px 0;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            font-size: 14px;
            text-align: center;
          }
          .btn-primary {
            background-color: #10b981;
            color: white;
          }
          .btn-secondary {
            background-color: #f1f5f9;
            color: #334155;
          }
        </style>
      </head>
      <body>
        <h3>🎉 Құжат дайын!</h3>
        <p>Қол мен мөр қойылып, PDF сәтті жасалды:</p>
        <a href="${downloadUrl}" class="btn btn-primary">⬇️ PDF Жүктеп алу</a>
        <a href="${viewUrl}" class="btn btn-secondary">👁️ Google Drive-тан ашу</a>
      </body>
    </html>
  `;

  const htmlOutput = HtmlService.createHtmlOutput(html)
    .setWidth(360)
    .setHeight(220);

  ui.showModalDialog(htmlOutput, 'PDF Stamp Studio');
}
