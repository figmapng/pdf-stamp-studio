/**
 * =========================================================================
 * PDF Stamp Studio — Google Sheets Apps Script
 * ТОО «Ecology Expert» зертханалық хаттамалары үшін
 * 1 кликпен нақты қолдар мен мөрді қойып, біріктірілген PDF жасайды.
 * =========================================================================
 */

const CONFIG = {
  suffix: '_бекітілген',

  // 1-қол қоюшы: Инженер-химик Затыбек А. А.
  signer1: {
    name: 'Затыбек А. А.',
    enabled: true,
    keywords: ['Затыбек', 'Инженер-химик'],
    imageUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/sig_zatybek.png',
    offsetX: 130,
    offsetY: -15,
    width: 105,
    height: 65
  },

  // 2-қол қоюшы: Зертхана меңгерушісі Сатыбалдина З. С.
  signer2: {
    name: 'Сатыбалдина З. С.',
    enabled: true,
    keywords: ['Сатыбалдина', 'Заведующий лабораторией'],
    imageUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/sig_satybaldina.png',
    offsetX: 160,
    offsetY: -10,
    width: 115,
    height: 40
  },

  // Мекеме мөрі: ТОО «Ecology Expert» Аналитикалық зертхана хаттамалары үшін
  stamp: {
    name: 'ТОО Ecology Expert мөрі',
    enabled: true,
    anchorKeyword: 'Сатыбалдина',
    imageUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/stamp.png',
    offsetX: 110,
    offsetY: -35,
    width: 95,
    height: 95
  }
};

/**
 * Google Таблица ашылғанда жоғарғы мәзірге '📑 PDF Stamp' батырмасын қосады.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📑 PDF Stamp')
    .addItem('🚀 Қол қойып PDF жасау', 'exportPdfWithSignaturesAndStamp')
    .addToUi();
}

/**
 * Негізгі функция: қолдар мен мөрді орналастырып, таза PDF жасайды
 */
function exportPdfWithSignaturesAndStamp() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  ss.toast('Қолтаңбалар мен мөр жүктеліп, қойылуда...', 'PDF Stamp', 4);

  const addedImages = [];

  try {
    // 1. Инженер-химик Затыбек А. А. қолы
    if (CONFIG.signer1.enabled) {
      const cell1 = findCellByKeywords(ss, CONFIG.signer1.keywords);
      if (cell1) {
        const img1 = insertImageOverCell(cell1, CONFIG.signer1);
        if (img1) addedImages.push(img1);
      }
    }

    // 2. Зертхана меңгерушісі Сатыбалдина З. С. қолы
    if (CONFIG.signer2.enabled) {
      const cell2 = findCellByKeywords(ss, CONFIG.signer2.keywords);
      if (cell2) {
        const img2 = insertImageOverCell(cell2, CONFIG.signer2);
        if (img2) addedImages.push(img2);
      }
    }

    // 3. Зертхана мөрі
    if (CONFIG.stamp.enabled) {
      const cellStamp = findCellByKeywords(ss, [CONFIG.stamp.anchorKeyword]);
      if (cellStamp) {
        const imgStamp = insertImageOverCell(cellStamp, CONFIG.stamp);
        if (imgStamp) addedImages.push(imgStamp);
      }
    }

    // Кестеге толық салынып бекітілуі үшін күтеміз
    SpreadsheetApp.flush();
    Utilities.sleep(1200);

    // 4. Барлық беттерді біріктіріп PDF қылып жинау
    ss.toast('PDF құжаты жиналуда...', 'PDF Stamp', 5);
    const pdfBlob = fetchSpreadsheetPdfBlob(ss);
    const fileName = ss.getName() + CONFIG.suffix + '.pdf';
    pdfBlob.setName(fileName);
    const pdfFile = DriveApp.createFile(pdfBlob);

    // 5. Кесте бастапқы таза күйінде қалуы үшін уақытша қойылған суреттерді өшіреміз
    addedImages.forEach(img => {
      try { img.remove(); } catch (e) {}
    });
    SpreadsheetApp.flush();

    // 6. Дайын PDF жүктеу терезесі
    showDownloadDialog(ui, pdfFile.getUrl(), pdfFile.getDownloadUrl(), fileName);

  } catch (error) {
    // Қате болса да кестені тазалаймыз
    addedImages.forEach(img => {
      try { img.remove(); } catch (e) {}
    });
    SpreadsheetApp.flush();
    ui.alert('Қате туындады: ' + error.message);
  }
}

/**
 * Суретті (қол/мөр) желіден қауіпсіз әрі жеңіл түрде жүктеп ұяшық үстіне қою
 */
function insertImageOverCell(cell, itemConfig) {
  const sheet = cell.getSheet();
  const blob = getImageBlob(itemConfig);
  if (!blob) return null;

  const image = sheet.insertImage(blob, cell.getColumn(), cell.getRow(), itemConfig.offsetX, itemConfig.offsetY);
  image.setWidth(itemConfig.width);
  image.setHeight(itemConfig.height);
  return image;
}

/**
 * 2 МБ шектеуінен өтпейтін таза, ықшамдалған сурет блобын алу
 */
function getImageBlob(itemConfig) {
  // 1. Егер тікелей URL сілтемесі берілсе (Vercel CDN - 50 КБ)
  if (itemConfig.imageUrl && itemConfig.imageUrl.startsWith('http')) {
    const res = UrlFetchApp.fetch(itemConfig.imageUrl, { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      return res.getBlob();
    }
  }

  // 2. Егер Google Drive арқылы берілсе
  const driveId = itemConfig.fileId || extractDriveId(itemConfig.imageUrl);
  if (driveId) {
    try {
      const file = DriveApp.getFileById(driveId);
      return file.getBlob();
    } catch (e) {
      Logger.log('Drive қатесі: ' + e.message);
    }
  }

  return null;
}

/**
 * Google Drive сілтемесінен ID суырып алу
 */
function extractDriveId(url) {
  if (!url) return null;
  const match = url.match(/[-\w]{25,}/);
  return match ? match[0] : null;
}

/**
 * Кесте ішінен қажетті сөздерді іздеу
 */
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
 * Google Sheets-ті PDF етіп экспорттау (барлық беттері толық бірігеді)
 */
function fetchSpreadsheetPdfBlob(ss) {
  const url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?' +
    'format=pdf&size=A4&portrait=true&fitw=true&gridlines=false&printtitle=false&sheetnames=false&fzr=false';
  const res = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  return res.getBlob();
}

/**
 * Пайдаланушыға дайын құжатты жүктеу терезесін көрсету
 */
function showDownloadDialog(ui, viewUrl, downloadUrl, fileName) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 20px; background: #ffffff; color: #0f172a;">
        <div style="font-size: 38px; margin-bottom: 8px;">🎉</div>
        <h3 style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: #0f172a;">Құжат сәтті дайындалды!</h3>
        <p style="margin: 0 0 20px; font-size: 13px; color: #64748b; line-height: 1.4;">
          Қолтаңбалар мен мөр қойылып, барлық беттері толық біріктірілген PDF файлы әзір болды.
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
