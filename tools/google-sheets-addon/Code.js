/**
 * =========================================================================
 * PDF Stamp Studio — Google Sheets Apps Script (V3 Толық нұсқа)
 * ТОО «Ecology Expert» зертханалық хаттамалары үшін
 * 1 кликпен нақты қолдар мен мөрді қойып, біріктірілген PDF жасайды.
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
    offsetX: 130,
    offsetY: 0,
    width: 105,
    height: 55
  },

  // 2-қол қоюшы: Зертхана меңгерушісі Сатыбалдина З. С.
  signer2: {
    name: 'Сатыбалдина З. С. (Заведующий лабораторией)',
    enabled: true,
    keywords: ['Сатыбалдина', 'Заведующий лабораторией'],
    imageUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/sig_satybaldina.png',
    offsetX: 160,
    offsetY: 0,
    width: 110,
    height: 36
  },

  // Мекеме мөрі: ТОО «Ecology Expert» Аналитикалық зертхана хаттамалары үшін
  stamp: {
    name: 'ТОО Ecology Expert мөрі',
    enabled: true,
    anchorKeyword: 'Сатыбалдина',
    imageUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/stamp.png',
    offsetX: 110,
    offsetY: 0,
    width: 90,
    height: 90
  }
};

/**
 * Google Таблица ашылғанда жоғарғы мәзірге '📑 PDF Stamp' батырмасын қосады.
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
 * Негізгі команда: Қолдар мен мөрді кестеге қояды және PDF жасап береді
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

    // Google бұлттық жүйесі суреттерді толық сақтап үлгеруі үшін күтеміз
    SpreadsheetApp.flush();
    Utilities.sleep(2000);

    // 2. Барлық беттері біріктірілген PDF жасаймыз
    ss.toast('Барлық беттер PDF болып жиналуда...', 'PDF Stamp', 4);
    const pdfBlob = fetchSpreadsheetPdfBlob(ss);
    const fileName = ss.getName() + CONFIG.suffix + '.pdf';
    pdfBlob.setName(fileName);
    const pdfFile = DriveApp.createFile(pdfBlob);

    // 3. Жүктеу терезесін ашамыз
    showDownloadDialog(ui, pdfFile.getUrl(), pdfFile.getDownloadUrl(), fileName);

  } catch (error) {
    ui.alert('Қате туындады: ' + error.message);
  }
}

/**
 * Тек қолдар мен мөрді кестеге орналастыру (PDF жасамай, кестеде көру үшін)
 */
function placeSignaturesAndStampOnly() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  try {
    const count = placeImagesOnSheet(ss);
    SpreadsheetApp.flush();
    if (count > 0) {
      ui.alert('✅ Сәтті орнатылды!', count + ' сурет (қолтаңбалар мен мөр) кестедегі сызықтардың үстіне қойылды.', ui.ButtonSet.OK);
    } else {
      ui.alert('⚠️ Қате: Кестеден «Затыбек» немесе «Сатыбалдина» табылмады.');
    }
  } catch (e) {
    ui.alert('Қате: ' + e.message);
  }
}

/**
 * Қолдар мен мөрді ұяшықтарға қою функциясы
 */
function placeImagesOnSheet(ss) {
  // Алдымен бұрын қойылған ескі қол/мөрлерді тазалаймыз (қайталанбауы үшін):
  clearPlacedSignaturesAndStamps(false);

  let placedCount = 0;

  // 1. Инженер-химик Затыбек А. А.
  if (CONFIG.signer1.enabled) {
    const cell1 = findCellByKeywords(ss, CONFIG.signer1.keywords);
    if (cell1) {
      const img1 = insertImageOverCell(cell1, CONFIG.signer1);
      if (img1) placedCount++;
    } else {
      Logger.log('Табылмады: ' + CONFIG.signer1.name);
    }
  }

  // 2. Зертхана меңгерушісі Сатыбалдина З. С.
  if (CONFIG.signer2.enabled) {
    const cell2 = findCellByKeywords(ss, CONFIG.signer2.keywords);
    if (cell2) {
      const img2 = insertImageOverCell(cell2, CONFIG.signer2);
      if (img2) placedCount++;
    } else {
      Logger.log('Табылмады: ' + CONFIG.signer2.name);
    }
  }

  // 3. Зертхана мөрі (Сатыбалдина ұяшығының тұсына қойылады)
  if (CONFIG.stamp.enabled) {
    const cellStamp = findCellByKeywords(ss, [CONFIG.stamp.anchorKeyword]);
    if (cellStamp) {
      const imgStamp = insertImageOverCell(cellStamp, CONFIG.stamp);
      if (imgStamp) placedCount++;
    } else {
      Logger.log('Табылмады: ' + CONFIG.stamp.name);
    }
  }

  return placedCount;
}

/**
 * Суретті желіден жүктеп ұяшық үстіне дұрыс координатамен қою
 */
function insertImageOverCell(cell, itemConfig) {
  const sheet = cell.getSheet();
  const resp = UrlFetchApp.fetch(itemConfig.imageUrl, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    throw new Error(itemConfig.name + ' суреті жүктелмеді (HTTP ' + resp.getResponseCode() + ')');
  }

  // Офсеттер тек оң (>= 0) сан болуы тиіс:
  const offX = Math.max(0, itemConfig.offsetX || 0);
  const offY = Math.max(0, itemConfig.offsetY || 0);

  const image = sheet.insertImage(resp.getBlob(), cell.getColumn(), cell.getRow(), offX, offY);
  image.setWidth(itemConfig.width);
  image.setHeight(itemConfig.height);
  image.setAltTextDescription('PDF_STAMP_STUDIO_ASSET');
  return image;
}

/**
 * Бұрын осы скрипт қойған қолдар мен мөрлерді өшіру
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
 * Кесте ішінен қажетті сөздерді іздеу (Алдымен белсенді парақтан қарайды)
 */
function findCellByKeywords(ss, keywords) {
  // 1. Белсенді парақтан (қазір ашылып тұрған парақтан) іздейміз:
  const activeSheet = ss.getActiveSheet();
  for (let k = 0; k < keywords.length; k++) {
    const kw = keywords[k].trim();
    if (!kw) continue;
    const match = activeSheet.createTextFinder(kw).matchEntireCell(false).matchCase(false).findNext();
    if (match) return match;
  }

  // 2. Басқа барлық парақтардан іздейміз:
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
 * Google Sheets-ті PDF етіп экспорттау (барлық парақтары бірігеді)
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
