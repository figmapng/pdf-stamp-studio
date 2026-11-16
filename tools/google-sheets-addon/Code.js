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
    rowOffset: -1,
    offsetX: 130,
    offsetY: 4,
    width: 105,
    height: 55
  },

  // 2-қол қоюшы: Зертхана меңгерушісі Сатыбалдина З. С.
  signer2: {
    name: 'Сатыбалдина З. С. (Заведующий лабораторией)',
    enabled: true,
    keywords: ['Сатыбалдина', 'Заведующий лабораторией'],
    imageUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/sig_satybaldina.png',
    rowOffset: -1,
    offsetX: 160,
    offsetY: 14,
    width: 110,
    height: 36
  },

  // Мекеме мөрі: ТОО «Ecology Expert» Аналитикалық зертхана хаттамалары үшін
  stamp: {
    name: 'ТОО Ecology Expert мөрі',
    enabled: true,
    anchorKeyword: 'Сатыбалдина',
    imageUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/stamp.png',
    rowOffset: -2,
    offsetX: 165,
    offsetY: 5,
    width: 95,
    height: 95
  }
};

/**
 * Қарапайым әрі түсінікті 2 қадамдық мәзір
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📑 PDF Stamp')
    .addItem('1-қадам: ✍️ Қол мен мөрді қою', 'step1PlaceSignaturesAndStamp')
    .addItem('2-қадам: 🚀 PDF сақтау', 'step2ExportPdf')
    .addSeparator()
    .addItem('🗑️ Кестені тазалау (қолдарды өшіру)', 'clearPlacedSignaturesAndStampsAlert')
    .addToUi();
}

/**
 * 1-ҚАДАМ: Қол мен мөрді кестеге қою
 * Экранды автоматты түрде қолдар тұрған жерге апарады.
 * Пайдаланушы қажет болса тышқанмен жылжыта алады.
 */
function step1PlaceSignaturesAndStamp() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  try {
    ss.toast('Қолтаңбалар мен мөр кестеге қойылуда...', 'PDF Stamp', 3);
    const count = placeImagesOnSheet(ss);
    SpreadsheetApp.flush();

    if (count === 0) {
      ui.alert('⚠️ Қате', 'Кестеден «Затыбек» немесе «Сатыбалдина» сөздері табылмады!\nБелсенді парақты ашып қайта басыңыз.', ui.ButtonSet.OK);
      return;
    }

    // Экранды қолтаңбалар тұрған жерге жылжытамыз
    const cell1 = findCellByKeywords(ss, CONFIG.signer1.keywords);
    if (cell1) {
      cell1.activate();
    }

    ss.toast('✅ Қолдар мен мөр қойылды! Тексеріп, 2-қадамды басыңыз.', 'PDF Stamp', 6);

  } catch (e) {
    ui.alert('Қате: ' + e.message);
  }
}

/**
 * 2-ҚАДАМ: PDF сақтау
 * Егер пайдаланушы суреттерді мышкамен сәл жылжытса, жаңа орнын автоматты түрде сақтайды.
 * Біріктірілген таза PDF құжатын жүктеп береді.
 */
function step2ExportPdf() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  try {
    const existingCount = countPlacedImages(ss);

    // Егер 1-қадам басылмаған болса, өзі автоматты түрде қойып береді
    if (existingCount === 0) {
      ss.toast('Қолдар мен мөр қойылуда...', 'PDF Stamp', 3);
      const placed = placeImagesOnSheet(ss);
      if (placed === 0) {
        ui.alert('⚠️ Қате: Кестеден қол қоюшылар табылмады!');
        return;
      }
      SpreadsheetApp.flush();
      Utilities.sleep(1500);
    } else {
      // Пайдаланушы тышқанмен жылжытқан жаңа орынды автоматты сақтаймыз
      saveCurrentPositions();
      SpreadsheetApp.flush();
      Utilities.sleep(1000);
    }

    ss.toast('PDF құжаты дайындалуда...', 'PDF Stamp', 4);
    const pdfBlob = fetchSpreadsheetPdfBlob(ss);
    const fileName = ss.getName() + CONFIG.suffix + '.pdf';
    pdfBlob.setName(fileName);
    const pdfFile = DriveApp.createFile(pdfBlob);

    // Жүктеу терезесі
    showDownloadDialog(ui, pdfFile.getUrl(), pdfFile.getDownloadUrl(), fileName);

  } catch (error) {
    ui.alert('Қате туындады: ' + error.message);
  }
}

/**
 * Суреттерді кестеге орналастыру (сақталған орындарды ескереді)
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
 * Суретті жүктеп ұяшық үстіне қою
 */
function insertImageOverCell(cell, itemKey, defaultCfg) {
  const cfg = getEffectiveConfig(itemKey, defaultCfg);
  const sheet = cell.getSheet();
  const resp = UrlFetchApp.fetch(cfg.imageUrl, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    throw new Error(cfg.name + ' суреті жүктелмеді (HTTP ' + resp.getResponseCode() + ')');
  }

  const rOffset = cfg.rowOffset || 0;
  const targetRow = Math.max(1, cell.getRow() + rOffset);

  const offX = Math.max(0, cfg.offsetX || 0);
  const offY = Math.max(0, cfg.offsetY || 0);

  const image = sheet.insertImage(resp.getBlob(), cell.getColumn(), targetRow, offX, offY);
  image.setWidth(cfg.width);
  image.setHeight(cfg.height);
  image.setAltTextDescription('PDF_STAMP_STUDIO_ASSET');
  image.setAltTextTitle(itemKey);
  return image;
}

/**
 * Пайдаланушы мышкамен жылжытқан жаңа орынды жадыға автоматты сақтау
 */
function saveCurrentPositions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const saved = {};

  sheets.forEach(sheet => {
    sheet.getImages().forEach(img => {
      if (img.getAltTextDescription() === 'PDF_STAMP_STUDIO_ASSET') {
        const key = img.getAltTextTitle();
        if (key && CONFIG[key]) {
          const anchor = img.getAnchorCell();
          const keywordCell = findCellByKeywords(ss, CONFIG[key].keywords || [CONFIG[key].anchorKeyword]);
          let rOffset = 0;
          if (keywordCell) {
            rOffset = anchor.getRow() - keywordCell.getRow();
          }
          saved[key] = {
            rowOffset: rOffset,
            offsetX: img.getAnchorCellXOffset(),
            offsetY: img.getAnchorCellYOffset(),
            width: img.getWidth(),
            height: img.getHeight()
          };
        }
      }
    });
  });

  if (Object.keys(saved).length > 0) {
    PropertiesService.getDocumentProperties().setProperty('CUSTOM_COORDS', JSON.stringify(saved));
  }
}

/**
 * Сақталған баптауды алу
 */
function getEffectiveConfig(itemKey, defaultCfg) {
  const savedProps = PropertiesService.getDocumentProperties().getProperty('CUSTOM_COORDS');
  if (savedProps) {
    try {
      const custom = JSON.parse(savedProps);
      if (custom && custom[itemKey]) {
        return Object.assign({}, defaultCfg, {
          offsetX: custom[itemKey].offsetX,
          offsetY: custom[itemKey].offsetY,
          width: custom[itemKey].width,
          height: custom[itemKey].height,
          rowOffset: custom[itemKey].rowOffset !== undefined ? custom[itemKey].rowOffset : defaultCfg.rowOffset
        });
      }
    } catch (e) {}
  }
  return defaultCfg;
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
 * Кестеден іздеу
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
