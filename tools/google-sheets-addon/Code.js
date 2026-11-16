/**
 * =========================================================================
 * PDF Stamp Studio — Google Sheets Apps Script (V5 Интерактивті баптау)
 * ТОО «Ecology Expert» зертханалық хаттамалары үшін
 * - Предварительный просмотр (көзбен көру және мышкамен жылжыту)
 * - Жаңа орындарды біржола есте сақтау (Сохранить координаты)
 * - 1 кликпен біріктірілген таза PDF экспорттау
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
    rowOffset: -1,   // Мәтіннен 1 қатар жоғары (сызықтың үстіне көтеру үшін)
    offsetX: 130,    // Солдан оңға қарай (сызықтың ортасы)
    offsetY: 4,      // Биіктік дәлдеуі
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
    offsetX: 160,    // Солдан оңға қарай
    offsetY: 14,     // Сызықтың тура үстінде
    width: 110,
    height: 36
  },

  // Мекеме мөрі: ТОО «Ecology Expert» Аналитикалық зертхана хаттамалары үшін
  stamp: {
    name: 'ТОО Ecology Expert мөрі',
    enabled: true,
    anchorKeyword: 'Сатыбалдина',
    imageUrl: 'https://pdf-stamp-studio.vercel.app/demo-assets/stamp.png',
    rowOffset: -2,   // 2 қатар жоғары (мөрдің ортасы сызықты қақ кесу үшін)
    offsetX: 165,    // Оңға қарай жылжытылған (қолтаңбаны басып тұру үшін)
    offsetY: 5,
    width: 95,
    height: 95
  }
};

/**
 * Google Таблица ашылғанда жоғарғы мәзірге ыңғайлы батырмаларды қосады.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📑 PDF Stamp')
    .addItem('👀 Алдын ала қарау / Орнын түзету (Предпросмотр)', 'previewAndAdjust')
    .addItem('💾 Жаңа орнын есте сақтау (Сохранить координаты)', 'saveCurrentPositionsAlert')
    .addSeparator()
    .addItem('🚀 Қол қойып PDF жасау', 'exportPdfWithSignaturesAndStamp')
    .addSeparator()
    .addItem('🗑️ Қолтаңбалар мен мөрді өшіру', 'clearPlacedSignaturesAndStampsAlert')
    .addItem('🔄 Бастапқы координаталарға қайтару (Сброс)', 'resetToDefaultCoords')
    .addToUi();
}

/**
 * 1. Предварительный просмотр:
 * Қолдар мен мөрді кестеге қояды, экранды сол жерге апарады және қолданушыға
 * оларды мышкамен қалаған жеріне жылжытуға мүмкіндік береді.
 */
function previewAndAdjust() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  try {
    const count = placeImagesOnSheet(ss);
    SpreadsheetApp.flush();

    // Экранды қолтаңбалар тұрған қатарға автоматты түрде жылжыту
    const cell1 = findCellByKeywords(ss, CONFIG.signer1.keywords);
    if (cell1) {
      cell1.activate();
    }

    const msg = 
      `✨ Қолдар мен мөр кестеге орнатылды (${count} дана)!\n\n` +
      `1. Қазір кестедегі қолдар мен мөрдің орнын көзбен тексеріңіз.\n` +
      `2. Егер орны дәл келмесе, ТЫШҚАНМЕН (мышкамен) ұстап, кәдімгі сурет сияқты қалаған жеріңізге сүйреп апарыңыз немесе өлшемін созыңыз.\n` +
      `3. Қалаған орныңызға қойған соң:\n` +
      `   • «💾 Жаңа орнын есте сақтау» бассаңыз — бұл орын келесі хаттамалар үшін біржола сақталады.\n` +
      `   • «🚀 Қол қойып PDF жасау» бассаңыз — дәл осы түзетілген күйінде PDF жасайды!`;

    ui.alert('👀 Предварительный просмотр', msg, ui.ButtonSet.OK);

  } catch (e) {
    ui.alert('Қате: ' + e.message);
  }
}

/**
 * 2. Жаңа орнын есте сақтау:
 * Қолданушы тышқанмен жылжытқан жаңа координаталарды (X, Y, ені, биіктігін) сақтайды.
 */
function saveCurrentPositionsAlert() {
  saveCurrentPositions(true);
}

function saveCurrentPositions(showAlert) {
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
    if (showAlert) {
      SpreadsheetApp.getUi().alert('💾 Орны сәтті сақталды!', 'Сіз тышқанмен жылжытқан жаңа орындар мен өлшемдер есте сақталды.\nЕнді барлық PDF осы орын бойынша жасалады.', SpreadsheetApp.getUi().ButtonSet.OK);
    }
  } else if (showAlert) {
    SpreadsheetApp.getUi().alert('Ескерту', 'Кестеден сақтайтын қолдар мен мөр табылмады. Алдымен «Алдын ала қарау» батырмасын басыңыз.', SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * 3. Негізгі PDF жасау командасы
 */
function exportPdfWithSignaturesAndStamp() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  try {
    const existingCount = countPlacedImages(ss);

    if (existingCount === 0) {
      ss.toast('Қолтаңбалар мен мөр орналастырылуда...', 'PDF Stamp', 3);
      const placedCount = placeImagesOnSheet(ss);
      if (placedCount === 0) {
        ui.alert('⚠️ Қате: Кестеден қол қоюшылар («Затыбек», «Сатыбалдина») табылмады!');
        return;
      }
      SpreadsheetApp.flush();
      Utilities.sleep(2000);
    } else {
      // Егер қолданушы мышкамен жылжытқан болса, жаңа орнын автоматты түрде есте сақтаймыз:
      saveCurrentPositions(false);
      SpreadsheetApp.flush();
      Utilities.sleep(1000);
    }

    ss.toast('Барлық беттер PDF болып жиналуда...', 'PDF Stamp', 4);
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
 * Қолдар мен мөрді ұяшықтарға орналастыру (сақталған орындарды ескереді)
 */
function placeImagesOnSheet(ss) {
  clearPlacedSignaturesAndStamps(false);
  let placedCount = 0;

  // 1. Затыбек А. А. қолы
  if (CONFIG.signer1.enabled) {
    const cell1 = findCellByKeywords(ss, CONFIG.signer1.keywords);
    if (cell1) {
      const img1 = insertImageOverCell(cell1, 'signer1', CONFIG.signer1);
      if (img1) placedCount++;
    }
  }

  // 2. Сатыбалдина З. С. қолы
  if (CONFIG.signer2.enabled) {
    const cell2 = findCellByKeywords(ss, CONFIG.signer2.keywords);
    if (cell2) {
      const img2 = insertImageOverCell(cell2, 'signer2', CONFIG.signer2);
      if (img2) placedCount++;
    }
  }

  // 3. ТОО «Ecology Expert» мөрі
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
 * Суретті жүктеп ұяшық үстіне қою (қолданушы сақтаған координаталарды тексереді)
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
 * Қолданушы сақтаған жеке координаталар болса соны алады, болмаса CONFIG мәнін алады
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
 * Бастапқы стандартты координаталарға қайтару (Сброс)
 */
function resetToDefaultCoords() {
  PropertiesService.getDocumentProperties().deleteProperty('CUSTOM_COORDS');
  clearPlacedSignaturesAndStamps(false);
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
      if (img.getAltTextDescription() === 'PDF_STAMP_STUDIO_ASSET') count++;
    });
  });
  return count;
}

/**
 * Қойылған қолдар мен мөрлерді өшіру
 */
function clearPlacedSignaturesAndStampsAlert() {
  clearPlacedSignaturesAndStamps(true);
}

function clearPlacedSignaturesAndStamps(showAlert) {
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
 * Кесте ішінен сөздерді табу (алдымен ашық тұрған парақтан іздейді)
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
          Қолтаңбалар мен мөр нақты орнымен қойылып, PDF әзір болды.
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
