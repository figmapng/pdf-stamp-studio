/**
 * =========================================================================
 * PDF Stamp Studio — Google Sheets Apps Script (V4 Минметриялық бапталған)
 * ТОО «Ecology Expert» зертханалық хаттамалары үшін
 * Қолдар мен мөрді сызықтың қақ ортасына дәл орналастырады.
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
    rowOffset: -1,   // Мәтіннен 1 қатар жоғары (қолды сызық үстіне көтеру үшін)
    offsetX: 130,    // Солдан оңға қарай ығысу (сызықтың ортасы)
    offsetY: 4,      // Пиксель бойынша биіктік
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
    offsetX: 160,    // Солдан оңға қарай ығысу
    offsetY: 14,     // Сызықтың тура үстінде тұруы үшін
    width: 110,
    height: 36
  },

  // Мекеме мөрі: ТОО «Ecology Expert» Аналитикалық зертхана хаттамалары үшін
  stamp: {
    name: 'ТОО Ecology Expert мөрі',
    enabled: true,
    anchorKeyword: 'Сатыбалдина',
    imageUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/stamp.png',
    rowOffset: -2,   // 2 қатар жоғары (мөрдің ортасы сызықты дәл кесіп өтуі үшін)
    offsetX: 165,    // Қолтаңбаны басып, сызықтың үстінде тұратындай оңға жылжытылды
    offsetY: 5,
    width: 95,
    height: 95
  }
};

/**
 * Google Таблица ашылғанда жоғарғы мәзірге батырмаларды қосады.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📑 PDF Stamp')
    .addItem('🚀 Қол қойып PDF жасау', 'exportPdfWithSignaturesAndStamp')
    .addItem('✍️ Тек қол мен мөрді қою (PDF-сіз)', 'placeSignaturesAndStampOnly')
    .addItem('🗑️ Қолтаңбалар мен мөрді өшіру', 'clearPlacedSignaturesAndStamps')
    .addToUi();
}

/**
 * Негізгі команда: Қолдар мен мөрді қойып, біріктірілген PDF жасап береді
 */
function exportPdfWithSignaturesAndStamp() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  try {
    ss.toast('Қолтаңбалар мен мөр кестеге орналастырылуда...', 'PDF Stamp', 3);

    // 1. Кестеге қолдар мен мөрді орналастырамыз
    const placedCount = placeImagesOnSheet(ss);
    if (placedCount === 0) {
      ui.alert('⚠️ Қате: Кестеден қол қоюшылар («Затыбек», «Сатыбалдина») табылмады!\nБелсенді парақты тексеріңіз.');
      return;
    }

    SpreadsheetApp.flush();
    Utilities.sleep(2000);

    // 2. Барлық беттері біріктірілген PDF жасаймыз
    ss.toast('Барлық беттер PDF болып жиналуда...', 'PDF Stamp', 4);
    const pdfBlob = fetchSpreadsheetPdfBlob(ss);
    const fileName = ss.getName() + CONFIG.suffix + '.pdf';
    pdfBlob.setName(fileName);
    const pdfFile = DriveApp.createFile(pdfBlob);

    // 3. Жүктеу терезесі
    showDownloadDialog(ui, pdfFile.getUrl(), pdfFile.getDownloadUrl(), fileName);

  } catch (error) {
    ui.alert('Қате туындады: ' + error.message);
  }
}

/**
 * Тек қолдар мен мөрді кестеге орналастыру (кестеде көзбен тексеру үшін)
 */
function placeSignaturesAndStampOnly() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  try {
    const count = placeImagesOnSheet(ss);
    SpreadsheetApp.flush();
    if (count > 0) {
      ui.alert('✅ Сәтті орнатылды!', count + ' сурет (қолтаңбалар мен мөр) кестедегі сызықтардың дәл үстіне қойылды.', ui.ButtonSet.OK);
    } else {
      ui.alert('⚠️ Қате: Кестеден «Затыбек» немесе «Сатыбалдина» табылмады.');
    }
  } catch (e) {
    ui.alert('Қате: ' + e.message);
  }
}

/**
 * Қолдар мен мөрді ұяшықтарға орналастыру
 */
function placeImagesOnSheet(ss) {
  clearPlacedSignaturesAndStamps(false);
  let placedCount = 0;

  // 1. Затыбек А. А. қолы
  if (CONFIG.signer1.enabled) {
    const cell1 = findCellByKeywords(ss, CONFIG.signer1.keywords);
    if (cell1) {
      const img1 = insertImageOverCell(cell1, CONFIG.signer1);
      if (img1) placedCount++;
    }
  }

  // 2. Сатыбалдина З. С. қолы
  if (CONFIG.signer2.enabled) {
    const cell2 = findCellByKeywords(ss, CONFIG.signer2.keywords);
    if (cell2) {
      const img2 = insertImageOverCell(cell2, CONFIG.signer2);
      if (img2) placedCount++;
    }
  }

  // 3. ТОО «Ecology Expert» мөрі
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
 * Суретті жүктеп ұяшық үстіне нақты қатар бойынша қою
 */
function insertImageOverCell(cell, itemConfig) {
  const sheet = cell.getSheet();
  const resp = UrlFetchApp.fetch(itemConfig.imageUrl, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    throw new Error(itemConfig.name + ' суреті жүктелмеді (HTTP ' + resp.getResponseCode() + ')');
  }

  // rowOffset арқылы қажетті қатарды таңдаймыз:
  const rOffset = itemConfig.rowOffset || 0;
  const targetRow = Math.max(1, cell.getRow() + rOffset);

  const offX = Math.max(0, itemConfig.offsetX || 0);
  const offY = Math.max(0, itemConfig.offsetY || 0);

  const image = sheet.insertImage(resp.getBlob(), cell.getColumn(), targetRow, offX, offY);
  image.setWidth(itemConfig.width);
  image.setHeight(itemConfig.height);
  image.setAltTextDescription('PDF_STAMP_STUDIO_ASSET');
  return image;
}

/**
 * Қойылған қолдар мен мөрлерді өшіру
 */
function clearPlacedSignaturesAndStamps(showAlert = true) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  let removedCount = 0;

  sheets.forEach(sheet => {
    const images = sheet.getImages();
    images.forEach(img => {
      try {
        if (img.getAltTextDescription() === 'PDF_STAMP_STUDIO_ASSET') {
          img.remove();
          removedCount++;
        }
      } catch (e) {}
    });
  });

  SpreadsheetApp.flush();
  if (showAlert) {
    SpreadsheetApp.getUi().alert('Тазартылды', removedCount + ' қолтаңба/мөр кестеден өшірілді.', SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Кесте ішінен сөздерді табу
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
 * Google Sheets-ті толық PDF қылып экспорттау
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
        <h3 style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: #0f172a;">Құжат сәтті дайындалды!</h3>
        <p style="margin: 0 0 20px; font-size: 13px; color: #64748b; line-height: 1.4;">
          Қолтаңбалар мен мөр кестеге қойылды және барлық беттері PDF болып жасалды.
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
